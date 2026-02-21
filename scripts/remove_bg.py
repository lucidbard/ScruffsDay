#!/usr/bin/env python3
"""Remove solid-colored backgrounds from generated game art images.

Usage:
    python scripts/remove_bg.py input.png output.png [--color FF00FF] [--tolerance 30]

The script detects the background color from the corners by default,
or you can specify a hex color. It replaces matching pixels with transparency.
"""

import sys
from PIL import Image
import argparse


def get_corner_colors(img):
    """Sample colors from the 4 corners of the image."""
    w, h = img.size
    corners = [
        img.getpixel((0, 0)),
        img.getpixel((w - 1, 0)),
        img.getpixel((0, h - 1)),
        img.getpixel((w - 1, h - 1)),
    ]
    return corners


def color_distance(c1, c2):
    """Euclidean distance between two RGB colors."""
    return sum((a - b) ** 2 for a, b in zip(c1[:3], c2[:3])) ** 0.5


def detect_bg_color(img):
    """Detect background color by finding the most common corner color."""
    corners = get_corner_colors(img)
    # Use the most common corner color
    rgb_corners = [c[:3] for c in corners]
    from collections import Counter
    counter = Counter(rgb_corners)
    bg_color = counter.most_common(1)[0][0]
    return bg_color


def remove_background(input_path, output_path, bg_color=None, tolerance=30):
    """Remove background color from image, replacing with transparency."""
    img = Image.open(input_path).convert("RGBA")

    if bg_color is None:
        bg_color = detect_bg_color(img)
        print(f"Detected background color: #{bg_color[0]:02X}{bg_color[1]:02X}{bg_color[2]:02X}")

    pixels = img.load()
    w, h = img.size
    removed = 0

    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            dist = color_distance((r, g, b), bg_color)
            if dist <= tolerance:
                pixels[x, y] = (0, 0, 0, 0)
                removed += 1
            elif dist <= tolerance * 2:
                # Semi-transparent edge blending
                blend = (dist - tolerance) / tolerance
                new_a = int(a * blend)
                pixels[x, y] = (r, g, b, new_a)

    total = w * h
    print(f"Removed {removed}/{total} pixels ({100*removed/total:.1f}%)")

    img.save(output_path, "PNG")
    print(f"Saved: {output_path}")


def hex_to_rgb(hex_str):
    """Convert hex color string to RGB tuple."""
    hex_str = hex_str.lstrip('#')
    return tuple(int(hex_str[i:i+2], 16) for i in (0, 2, 4))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Remove solid background from images")
    parser.add_argument("input", help="Input image path")
    parser.add_argument("output", help="Output image path")
    parser.add_argument("--color", help="Background color as hex (e.g., FF00FF). Auto-detected if not specified.")
    parser.add_argument("--tolerance", type=int, default=30, help="Color matching tolerance (default: 30)")

    args = parser.parse_args()

    bg_color = hex_to_rgb(args.color) if args.color else None
    remove_background(args.input, args.output, bg_color, args.tolerance)
