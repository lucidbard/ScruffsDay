#!/usr/bin/env python3
"""
Perch Detection Prototype using SAM (Segment Anything Model).

Uses SAM to segment a scene background image and identify potential
perch points where a bird character could land.

Usage:
    python tools/detect_perches.py public/assets/backgrounds/scrub-thicket-bg.png
"""

import argparse
import json
import os
import sys
from pathlib import Path

import numpy as np
import torch
from PIL import Image, ImageDraw, ImageFont
from transformers import SamModel, SamProcessor


def generate_masks(image: Image.Image) -> tuple[list, list]:
    """
    Use SAM with a grid of point prompts to generate masks.
    Workaround: the HF pipeline has a batched_nms bug, so we drive SAM directly.
    """
    print("Loading SAM model (facebook/sam-vit-base)...")
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = SamModel.from_pretrained("facebook/sam-vit-base").to(device)
    processor = SamProcessor.from_pretrained("facebook/sam-vit-base")

    img_w, img_h = image.size
    print(f"Generating masks for image ({img_w}x{img_h})...")

    # Create a grid of prompt points across the image
    grid_spacing = 64
    xs = list(range(grid_spacing // 2, img_w, grid_spacing))
    ys = list(range(grid_spacing // 2, img_h, grid_spacing))
    grid_points = [[x, y] for y in ys for x in xs]
    print(f"Using {len(grid_points)} grid points...")

    all_masks = []
    all_scores = []

    # Process in batches of points
    batch_size = 64
    for batch_start in range(0, len(grid_points), batch_size):
        batch_points = grid_points[batch_start:batch_start + batch_size]

        # SAM expects points as [[[x, y]]] per image — we send one point at a time
        # but batch multiple single-point prompts
        for pt in batch_points:
            inputs = processor(
                image,
                input_points=[[[pt]]],  # One point prompt
                return_tensors="pt",
            ).to(device)

            with torch.no_grad():
                outputs = model(**inputs)

            # Post-process: get masks and scores
            pred_masks = processor.image_processor.post_process_masks(
                outputs.pred_masks.cpu(),
                inputs["original_sizes"].cpu(),
                inputs["reshaped_input_sizes"].cpu(),
            )

            iou_scores = outputs.iou_scores.cpu().squeeze()  # shape: (3,) — 3 masks per point

            # SAM returns 3 mask candidates per point; take the best one
            best_idx = iou_scores.argmax().item()
            best_score = iou_scores[best_idx].item()

            if best_score < 0.80:
                continue

            mask = pred_masks[0][0, best_idx].numpy().astype(bool)  # H x W
            all_masks.append(mask)
            all_scores.append(best_score)

        if batch_start % (batch_size * 4) == 0 and batch_start > 0:
            print(f"  Processed {batch_start}/{len(grid_points)} points, {len(all_masks)} masks so far...")

    print(f"  Raw masks: {len(all_masks)}")

    # Deduplicate masks by IoU
    masks, scores = deduplicate_masks(all_masks, all_scores, iou_threshold=0.8)
    print(f"  After dedup: {len(masks)} masks")
    return masks, scores


def deduplicate_masks(masks: list, scores: list, iou_threshold: float = 0.8):
    """Remove near-duplicate masks using IoU."""
    if not masks:
        return [], []

    # Sort by score descending
    order = sorted(range(len(masks)), key=lambda i: scores[i], reverse=True)
    keep = []

    for i in order:
        is_dup = False
        for j in keep:
            # Compute IoU
            intersection = (masks[i] & masks[j]).sum()
            union = (masks[i] | masks[j]).sum()
            if union > 0 and intersection / union > iou_threshold:
                is_dup = True
                break
        if not is_dup:
            keep.append(i)

    return [masks[i] for i in keep], [scores[i] for i in keep]


def analyze_mask(mask_array: np.ndarray, img_w: int, img_h: int) -> dict:
    """Analyze a single mask to extract shape properties."""
    # mask_array is a 2D boolean/uint8 array
    if isinstance(mask_array, Image.Image):
        mask_array = np.array(mask_array)

    mask = mask_array.astype(bool)
    if not mask.any():
        return None

    ys, xs = np.where(mask)
    x_min, x_max = xs.min(), xs.max()
    y_min, y_max = ys.min(), ys.max()
    w = x_max - x_min + 1
    h = y_max - y_min + 1
    area = mask.sum()
    bbox_area = w * h
    fill_ratio = area / bbox_area if bbox_area > 0 else 0

    # Aspect ratio (width / height)
    aspect = w / h if h > 0 else 1

    # Centroid
    cx = xs.mean()
    cy = ys.mean()

    # Top edge: average y of the top 5% of pixels
    top_threshold = y_min + max(1, int(h * 0.05))
    top_xs = xs[ys <= top_threshold]
    top_cx = top_xs.mean() if len(top_xs) > 0 else cx
    top_cy = y_min  # Use the very top edge

    # Relative position in image
    rel_x = cx / img_w
    rel_y = cy / img_h
    rel_area = area / (img_w * img_h)

    return {
        "bbox": [int(x_min), int(y_min), int(w), int(h)],
        "area": int(area),
        "rel_area": float(rel_area),
        "aspect": float(aspect),
        "fill_ratio": float(fill_ratio),
        "centroid": (float(cx), float(cy)),
        "top_edge": (float(top_cx), float(top_cy)),
        "rel_x": float(rel_x),
        "rel_y": float(rel_y),
        "mask": mask,
    }


def classify_perch(info: dict, img_w: int, img_h: int) -> str | None:
    """
    Classify a mask as a perch type or None.

    Returns: 'branch', 'rock', 'post', 'ground', or None
    """
    if info is None:
        return None

    area = info["rel_area"]
    aspect = info["aspect"]
    rel_y = info["rel_y"]
    fill = info["fill_ratio"]
    bbox_w = info["bbox"][2]
    bbox_h = info["bbox"][3]

    # Skip tiny noise or huge background segments
    if area < 0.001 or area > 0.35:
        return None

    # Ground: large segments in the lower 40% of image
    if rel_y > 0.65 and area > 0.02:
        return "ground"

    # Branch: elongated horizontal segments (aspect > 2), upper 70% of image
    # Not too large (not the sky/background)
    if aspect > 2.0 and rel_y < 0.75 and 0.002 < area < 0.1:
        return "branch"

    # Rock/boulder: roughly square-ish, medium size, lower half
    if rel_y > 0.4 and 0.005 < area < 0.08 and 0.3 < aspect < 3.0:
        return "rock"

    # Post/sign: tall vertical objects (aspect < 0.7), not too large
    if aspect < 0.7 and 0.003 < area < 0.05 and rel_y < 0.7:
        return "post"

    # Smaller branch-like things
    if aspect > 1.5 and rel_y < 0.6 and 0.001 < area < 0.05:
        return "branch"

    return None


def extract_ground_polygon(ground_masks: list[np.ndarray], img_w: int, img_h: int) -> list[list[int]]:
    """Extract a simplified ground polygon from ground masks."""
    if not ground_masks:
        return []

    # Combine all ground masks
    combined = np.zeros((img_h, img_w), dtype=bool)
    for m in ground_masks:
        combined |= m

    if not combined.any():
        return []

    # Sample the top edge of the ground at regular x intervals
    polygon = []
    step = max(1, img_w // 30)
    for x in range(0, img_w, step):
        col = combined[:, x]
        if col.any():
            top_y = np.where(col)[0].min()
            polygon.append([int(x), int(top_y)])

    # Close the polygon along the bottom
    if polygon:
        polygon.append([img_w - 1, polygon[-1][1]])
        polygon.append([img_w - 1, img_h - 1])
        polygon.append([0, img_h - 1])
        polygon.append([0, polygon[0][1]])

    return polygon


def create_debug_image(
    image: Image.Image,
    masks_info: list[dict],
    perches: list[dict],
    ground_polygon: list[list[int]],
    output_path: str,
):
    """Create a debug visualization showing masks and perch points."""
    img = image.copy().convert("RGBA")
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw_overlay = ImageDraw.Draw(overlay)
    draw_main = ImageDraw.Draw(img)

    # Color map for perch types
    colors = {
        "branch": (255, 165, 0, 80),   # Orange
        "rock": (139, 69, 19, 80),     # Brown
        "post": (128, 0, 128, 80),     # Purple
        "ground": (34, 139, 34, 60),   # Green
    }
    point_colors = {
        "branch": (255, 165, 0),
        "rock": (139, 69, 19),
        "post": (128, 0, 128),
        "ground": (34, 139, 34),
    }

    # Draw masks as colored overlays
    for info in masks_info:
        if info.get("perch_type") is None:
            continue
        color = colors.get(info["perch_type"], (128, 128, 128, 40))
        mask = info["mask"]
        mask_overlay = np.zeros((*mask.shape, 4), dtype=np.uint8)
        mask_overlay[mask] = color
        mask_img = Image.fromarray(mask_overlay, "RGBA")
        overlay = Image.alpha_composite(overlay, mask_img)

    img = Image.alpha_composite(img, overlay)
    draw = ImageDraw.Draw(img.convert("RGB"))
    img_rgb = img.convert("RGB")
    draw = ImageDraw.Draw(img_rgb)

    # Draw ground polygon
    if ground_polygon and len(ground_polygon) > 2:
        flat = [(p[0], p[1]) for p in ground_polygon]
        draw.line(flat + [flat[0]], fill=(0, 255, 0), width=2)

    # Draw perch points
    r = 8
    for p in perches:
        x, y = p["x"], p["y"]
        color = point_colors.get(p["type"], (255, 255, 255))
        draw.ellipse([x - r, y - r, x + r, y + r], fill=color, outline=(255, 255, 255))
        label = f"{p['name']} ({p['type']})"
        draw.text((x + r + 4, y - 6), label, fill=(255, 255, 255))

    # Legend
    ly = 10
    for ptype, color in point_colors.items():
        draw.rectangle([10, ly, 24, ly + 14], fill=color, outline=(255, 255, 255))
        draw.text((30, ly), ptype, fill=(255, 255, 255))
        ly += 20

    img_rgb.save(output_path)
    print(f"Debug image saved to {output_path}")


def main():
    parser = argparse.ArgumentParser(description="Detect perch points in a scene background")
    parser.add_argument("image_path", help="Path to background image")
    parser.add_argument("--output-dir", default="tools/_perch_detection", help="Output directory")
    parser.add_argument("--scene-name", default=None, help="Scene name (auto-detected from filename)")
    args = parser.parse_args()

    image_path = Path(args.image_path)
    if not image_path.exists():
        print(f"Error: {image_path} not found")
        sys.exit(1)

    # Auto-detect scene name
    scene_name = args.scene_name or image_path.stem.replace("-bg", "").replace("-", "_")
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Load image
    image = Image.open(image_path).convert("RGB")
    img_w, img_h = image.size

    # Generate SAM masks
    masks, scores = generate_masks(image)

    # Analyze each mask
    masks_info = []
    for i, mask in enumerate(masks):
        info = analyze_mask(mask, img_w, img_h)
        if info is None:
            continue
        perch_type = classify_perch(info, img_w, img_h)
        info["perch_type"] = perch_type
        info["score"] = float(scores[i]) if i < len(scores) else 1.0
        info["index"] = i
        masks_info.append(info)

    # Count by type
    type_counts = {}
    perches = []
    ground_masks = []

    for info in masks_info:
        ptype = info["perch_type"]
        if ptype is None:
            continue

        if ptype == "ground":
            ground_masks.append(info["mask"])
            # Add a few ground perch points spread across the ground area
            continue

        type_counts[ptype] = type_counts.get(ptype, 0) + 1
        count = type_counts[ptype]
        top_x, top_y = info["top_edge"]

        perches.append({
            "name": f"{ptype}_{count}",
            "x": int(top_x),
            "y": int(top_y),
            "type": ptype,
            "_area": info["rel_area"],
            "_aspect": info["aspect"],
        })

    # Add ground perch points from the ground polygon
    ground_polygon = extract_ground_polygon(ground_masks, img_w, img_h)

    if ground_polygon:
        # Sample a few walkable ground points
        ground_top_points = [(p[0], p[1]) for p in ground_polygon if p[1] < img_h - 20]
        if ground_top_points:
            # Pick ~5 evenly spaced ground points
            step = max(1, len(ground_top_points) // 5)
            for i, (gx, gy) in enumerate(ground_top_points[::step]):
                perches.append({
                    "name": f"ground_{i + 1}",
                    "x": int(gx),
                    "y": int(gy),
                    "type": "ground",
                })

    # Filter out false positives:
    # - y<=5: sky/edge artifacts
    # - branches in top 15% of image: likely background trees or clouds
    # - anything in top 5%: definitely not playable
    min_playable_y = int(img_h * 0.05)
    min_branch_y = int(img_h * 0.20)
    perches = [p for p in perches if p["y"] > min_playable_y]
    perches = [p for p in perches if not (p["type"] == "branch" and p["y"] < min_branch_y)]
    perches = [p for p in perches if not (p["type"] == "post" and p["y"] < min_branch_y)]

    # Prune: remove perches too close together (within 60px)
    MIN_DIST = 60
    pruned = []
    for p in sorted(perches, key=lambda p: -p.get("_area", 0)):
        too_close = False
        for kept in pruned:
            dx = p["x"] - kept["x"]
            dy = p["y"] - kept["y"]
            if (dx * dx + dy * dy) < MIN_DIST * MIN_DIST:
                too_close = True
                break
        if not too_close:
            pruned.append(p)
    perches = pruned

    # Keep at most 5 branches, 3 ground, 2 rocks/posts
    MAX_PER_TYPE = {"branch": 5, "ground": 3, "rock": 2, "post": 1}
    type_seen = {}
    capped = []
    # Sort branches by y ascending (prefer higher perches), ground by x spread
    perches.sort(key=lambda p: p["y"] if p["type"] == "branch" else p["x"])
    for p in perches:
        t = p["type"]
        type_seen[t] = type_seen.get(t, 0) + 1
        if type_seen[t] <= MAX_PER_TYPE.get(t, 2):
            capped.append(p)
    perches = capped

    # Sort perches by x position
    perches.sort(key=lambda p: p["x"])

    # Rename sequentially after sorting
    type_counters = {}
    for p in perches:
        t = p["type"]
        type_counters[t] = type_counters.get(t, 0) + 1
        p["name"] = f"{t}_{type_counters[t]}"

    # Remove debug fields
    clean_perches = [{k: v for k, v in p.items() if not k.startswith("_")} for p in perches]

    print(f"\nFound {len(clean_perches)} perch points:")
    for p in clean_perches:
        print(f"  {p['name']:15s} @ ({p['x']:4d}, {p['y']:4d})  type={p['type']}")

    # Build output JSON
    output = {
        "scene": scene_name,
        "image_size": [img_w, img_h],
        "perches": clean_perches,
        "ground_polygon": ground_polygon,
    }

    json_path = output_dir / f"{scene_name.replace('_', '-')}-perches.json"
    with open(json_path, "w") as f:
        json.dump(output, f, indent=2)
    print(f"\nJSON saved to {json_path}")

    # Debug visualization
    debug_path = output_dir / f"{scene_name.replace('_', '-')}-debug.png"
    # Remove mask arrays before visualization to avoid issues
    create_debug_image(image, masks_info, clean_perches, ground_polygon, str(debug_path))

    print(f"\nDone! {len(clean_perches)} perches detected in '{scene_name}'")


if __name__ == "__main__":
    main()
