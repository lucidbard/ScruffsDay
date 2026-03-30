#!/usr/bin/env python3
"""
Extract foreground vegetation layers from scene backgrounds using SAM.

For each scene, identifies vegetation/objects in the lower portion of the image
that should overlap the player character, and extracts them as transparent PNGs.

Usage:
    python tools/extract_foregrounds.py public/assets/backgrounds/scrub-thicket-bg.png
"""

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import torch
from PIL import Image, ImageDraw
from transformers import SamModel, SamProcessor


def generate_foreground_masks(image: Image.Image):
    """Use SAM to find foreground elements in the lower portion of the image."""
    print("Loading SAM model...")
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = SamModel.from_pretrained("facebook/sam-vit-base").to(device)
    processor = SamProcessor.from_pretrained("facebook/sam-vit-base")

    img_w, img_h = image.size
    print(f"Image: {img_w}x{img_h}")

    # Focus on the bottom 25% of the image where true foreground vegetation lives
    fg_y_start = int(img_h * 0.72)

    # Grid of points in the foreground zone
    grid_spacing = 48
    xs = list(range(grid_spacing // 2, img_w, grid_spacing))
    ys = list(range(fg_y_start, img_h, grid_spacing))
    points = [[x, y] for y in ys for x in xs]
    print(f"Sampling {len(points)} points in foreground zone (y > {fg_y_start})...")

    all_masks = []
    all_scores = []

    for pt in points:
        inputs = processor(
            image,
            input_points=[[[pt]]],
            return_tensors="pt",
        ).to(device)

        with torch.no_grad():
            outputs = model(**inputs)

        pred_masks = processor.image_processor.post_process_masks(
            outputs.pred_masks.cpu(),
            inputs["original_sizes"].cpu(),
            inputs["reshaped_input_sizes"].cpu(),
        )

        iou_scores = outputs.iou_scores.cpu().squeeze()
        best_idx = iou_scores.argmax().item()
        best_score = iou_scores[best_idx].item()

        if best_score < 0.80:
            continue

        mask = pred_masks[0][0, best_idx].numpy().astype(bool)
        all_masks.append(mask)
        all_scores.append(best_score)

    print(f"  Raw masks: {len(all_masks)}")

    # Deduplicate
    masks = deduplicate_masks(all_masks, all_scores)
    print(f"  After dedup: {len(masks)}")

    # Filter to foreground candidates
    fg_masks = []
    for mask in masks:
        ys_mask, xs_mask = np.where(mask)
        if len(ys_mask) == 0:
            continue

        area = mask.sum()
        rel_area = area / (img_w * img_h)
        centroid_y = ys_mask.mean()
        y_min = ys_mask.min()
        y_max = ys_mask.max()
        height = y_max - y_min

        # Foreground criteria:
        # - Centroid in the lower 45% of the image
        # - Not too small (noise) or too large (entire ground)
        # - Has significant height (not a flat ground strip)
        # - Extends to or near the bottom of the image
        if (centroid_y > img_h * 0.55
            and 0.005 < rel_area < 0.25
            and height > 30
            and y_max > img_h * 0.75):
            fg_masks.append(mask)
            print(f"    Foreground segment: area={rel_area:.3f}, cy={centroid_y:.0f}, h={height}")

    return fg_masks


def deduplicate_masks(masks, scores, iou_threshold=0.7):
    if not masks:
        return []
    order = sorted(range(len(masks)), key=lambda i: scores[i], reverse=True)
    keep = []
    for i in order:
        is_dup = False
        for j in keep:
            intersection = (masks[i] & masks[j]).sum()
            union = (masks[i] | masks[j]).sum()
            if union > 0 and intersection / union > iou_threshold:
                is_dup = True
                break
        if not is_dup:
            keep.append(i)
    return [masks[i] for i in keep]


def extract_foreground_layer(image: Image.Image, masks: list, output_path: str):
    """Combine foreground masks and extract as transparent PNG."""
    img_array = np.array(image.convert("RGBA"))
    img_h, img_w = img_array.shape[:2]

    combined_mask = np.zeros((img_h, img_w), dtype=bool)
    for mask in masks:
        combined_mask |= mask

    # Create foreground layer: original pixels where mask is true, transparent elsewhere
    fg_layer = np.zeros_like(img_array)
    fg_layer[combined_mask] = img_array[combined_mask]
    fg_layer[~combined_mask] = [0, 0, 0, 0]

    fg_image = Image.fromarray(fg_layer, "RGBA")
    fg_image.save(output_path)
    print(f"Foreground layer saved: {output_path}")

    return combined_mask


def create_debug_image(image: Image.Image, masks: list, output_path: str):
    """Create debug visualization showing foreground segments."""
    img = image.copy().convert("RGBA")
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))

    colors = [(255, 0, 0, 80), (0, 255, 0, 80), (0, 0, 255, 80),
              (255, 255, 0, 80), (255, 0, 255, 80), (0, 255, 255, 80)]

    for i, mask in enumerate(masks):
        color = colors[i % len(colors)]
        mask_overlay = np.zeros((*mask.shape, 4), dtype=np.uint8)
        mask_overlay[mask] = color
        mask_img = Image.fromarray(mask_overlay, "RGBA")
        overlay = Image.alpha_composite(overlay, mask_img)

    result = Image.alpha_composite(img, overlay)
    result.convert("RGB").save(output_path)
    print(f"Debug image saved: {output_path}")


def main():
    parser = argparse.ArgumentParser(description="Extract foreground layers from scene backgrounds")
    parser.add_argument("image_path", help="Path to background image")
    parser.add_argument("--output-dir", default=None, help="Output directory (default: public/assets/foregrounds/)")
    args = parser.parse_args()

    image_path = Path(args.image_path)
    if not image_path.exists():
        print(f"Error: {image_path} not found")
        sys.exit(1)

    scene_name = image_path.stem.replace("-bg", "").replace("-", "_")
    scene_slug = scene_name.replace("_", "-")

    output_dir = Path(args.output_dir) if args.output_dir else Path("public/assets/foregrounds")
    output_dir.mkdir(parents=True, exist_ok=True)

    debug_dir = Path("tools/_foreground_detection")
    debug_dir.mkdir(parents=True, exist_ok=True)

    image = Image.open(image_path).convert("RGB")

    # Generate masks
    masks = generate_foreground_masks(image)

    if not masks:
        print(f"No foreground segments found for {scene_name}")
        sys.exit(0)

    # Extract foreground layer
    fg_path = output_dir / f"{scene_slug}-fg.png"
    extract_foreground_layer(image, masks, str(fg_path))

    # Debug visualization
    debug_path = debug_dir / f"{scene_slug}-fg-debug.png"
    create_debug_image(image, masks, str(debug_path))

    print(f"\nDone! Foreground layer for '{scene_name}': {fg_path}")
    print(f"Load this as a sprite above the character layer in the scene.")


if __name__ == "__main__":
    main()
