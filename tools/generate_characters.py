"""
Generate character pose sheets and game assets via OpenAI gpt-image-1.
Run on Pepper where the OPENAI_API_KEY is configured.

Usage:
  python3 tools/generate_characters.py                    # Generate all
  python3 tools/generate_characters.py --asset scruff     # One character
  python3 tools/generate_characters.py --asset tree       # Just the tree
  python3 tools/generate_characters.py --list             # List targets
"""

import argparse
import base64
import json
import os
import sys
from pathlib import Path

try:
    from openai import OpenAI
except ImportError:
    print("ERROR: pip install openai")
    sys.exit(1)

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).parent.parent
load_dotenv(PROJECT_ROOT / ".env")

client = OpenAI()
ASSETS_DIR = PROJECT_ROOT / "public" / "assets"

# Style reference for consistency across all characters
STYLE_REF = (
    "Children's educational game art style, clean cartoon illustration with bold outlines, "
    "friendly and approachable, similar to PBS Kids or educational nature apps. "
    "Transparent background (PNG). Consistent with a Florida scrub habitat nature game."
)

ASSETS = [
    # Scruff - protagonist Florida scrub jay
    {
        "name": "scruff-idle-front",
        "output": "characters/scruff-idle-front.png",
        "prompt": f"A cute female Florida scrub jay bird, front-facing view, standing upright, "
                  f"blue and gray plumage, white eyebrow stripe and throat, small black beak, "
                  f"bright curious eyes, wings at sides, full body visible with orange feet. "
                  f"Idle relaxed pose. {STYLE_REF}",
        "size": "1024x1024",
    },
    {
        "name": "scruff-idle-side",
        "output": "characters/scruff-idle-side.png",
        "prompt": f"A cute female Florida scrub jay bird, side profile view facing right, "
                  f"perched position, blue and gray plumage, white eyebrow stripe, "
                  f"small black beak, tail visible. Full body. {STYLE_REF}",
        "size": "1024x1024",
    },
    {
        "name": "scruff-flying",
        "output": "characters/scruff-flying.png",
        "prompt": f"A cute female Florida scrub jay bird in flight, wings spread wide, "
                  f"seen from the side, blue and gray plumage, dynamic flying pose, "
                  f"looking forward with determined expression. Full body. {STYLE_REF}",
        "size": "1024x1024",
    },
    {
        "name": "scruff-pickup",
        "output": "characters/scruff-pickup.png",
        "prompt": f"A cute female Florida scrub jay bird bending down to pick something up, "
                  f"beak pointing downward, body tilted forward, one wing slightly raised "
                  f"for balance, blue and gray plumage. Full body. {STYLE_REF}",
        "size": "1024x1024",
    },
    {
        "name": "scruff-talking",
        "output": "characters/scruff-talking.png",
        "prompt": f"A cute female Florida scrub jay bird with beak open as if talking or chirping, "
                  f"front-facing, friendly expression, one wing slightly raised in a gesture, "
                  f"blue and gray plumage. Full body. {STYLE_REF}",
        "size": "1024x1024",
    },
    {
        "name": "scruff-happy",
        "output": "characters/scruff-happy.png",
        "prompt": f"A cute female Florida scrub jay bird looking very happy and excited, "
                  f"both wings raised in celebration, big smile with open beak, "
                  f"blue and gray plumage, joyful pose. Full body. {STYLE_REF}",
        "size": "1024x1024",
    },
    # Pip - small robin
    {
        "name": "pip-idle",
        "output": "characters/pip-new.png",
        "prompt": f"A cute small American robin bird, front-facing, standing upright, "
                  f"red-orange breast, dark gray back, bright friendly eyes, small yellow beak, "
                  f"young and small-looking. Full body. {STYLE_REF}",
        "size": "1024x1024",
    },
    # Flicker - woodpecker
    {
        "name": "flicker-idle",
        "output": "characters/flicker-new.png",
        "prompt": f"A cute Northern flicker woodpecker bird, side view facing right, "
                  f"clinging to a small branch, spotted belly, red patch on nape, "
                  f"long pointed beak, brown and black barred pattern on back. "
                  f"Full body. {STYLE_REF}",
        "size": "1024x1024",
    },
    # Sage - wise owl
    {
        "name": "sage-idle",
        "output": "characters/sage-new.png",
        "prompt": f"A cute wise-looking Florida burrowing owl, front-facing, standing on ground, "
                  f"large round yellow eyes, brown and white spotted plumage, "
                  f"long legs visible, small ear tufts, calm wise expression. "
                  f"Full body. {STYLE_REF}",
        "size": "1024x1024",
    },
    # Shelly - gopher tortoise
    {
        "name": "shelly-idle",
        "output": "characters/shelly-new.png",
        "prompt": f"A cute friendly gopher tortoise, front-facing view slightly from above, "
                  f"dome-shaped brown shell with scute pattern, stumpy elephant-like front legs, "
                  f"gentle smile, small dark eyes, yellowish-brown skin. "
                  f"Full body. {STYLE_REF}",
        "size": "1024x1024",
    },
    # Sunny - eastern indigo snake
    {
        "name": "sunny-idle",
        "output": "characters/sunny-new.png",
        "prompt": f"A cute friendly eastern indigo snake, coiled in a relaxed S-shape, "
                  f"iridescent dark blue-black scales, smooth shiny body, "
                  f"small friendly face with reddish-orange chin, tongue slightly out, "
                  f"bright kind eyes. Full body. {STYLE_REF}",
        "size": "1024x1024",
    },
    # Sand pine tree for Vine Buster minigame
    {
        "name": "sand-pine-tree",
        "output": "minigames/sand-pine-tree.png",
        "prompt": f"A tall Florida sand pine tree, full tree view from trunk base to crown, "
                  f"rough brown bark trunk, asymmetrical pine canopy with sparse needle clusters, "
                  f"characteristic leaning shape of sand pines, some pine cones visible. "
                  f"Centered composition, tall vertical format. {STYLE_REF}",
        "size": "1024x1536",
    },
    # Dialogue bubble background
    {
        "name": "dialogue-bubble",
        "output": "ui/dialogue-bubble-bg.png",
        "prompt": f"A speech bubble background for a nature-themed children's game, "
                  f"weathered parchment or bark texture, soft rounded rectangle shape, "
                  f"warm natural brown tones with subtle leaf pattern border, "
                  f"plenty of empty space in the center for text. "
                  f"Clean design, no text. {STYLE_REF}",
        "size": "1536x1024",
    },
]


def generate_image(asset: dict) -> Path:
    """Generate a single image via OpenAI gpt-image-1."""
    output_path = ASSETS_DIR / asset["output"]
    output_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"  Generating {asset['name']}...")
    print(f"    Prompt: {asset['prompt'][:80]}...")

    response = client.images.generate(
        model="gpt-image-1",
        prompt=asset["prompt"],
        n=1,
        size=asset.get("size", "1024x1024"),
        quality="high",
    )

    # gpt-image-1 returns base64
    image_data = response.data[0].b64_json
    if image_data:
        with open(output_path, "wb") as f:
            f.write(base64.b64decode(image_data))
    else:
        # dall-e-3 returns URL
        import urllib.request
        url = response.data[0].url
        urllib.request.urlretrieve(url, output_path)

    print(f"    Saved: {output_path}")
    return output_path


def main():
    parser = argparse.ArgumentParser(description="Generate ScruffsDay character assets via OpenAI")
    parser.add_argument("--asset", type=str, help="Generate single asset by name")
    parser.add_argument("--list", action="store_true", help="List all targets")
    args = parser.parse_args()

    if args.list:
        print(f"\nAsset targets ({len(ASSETS)}):\n")
        for a in ASSETS:
            exists = "EXISTS" if (ASSETS_DIR / a["output"]).exists() else "NEW"
            print(f"  [{exists:6s}] {a['name']:25s} -> {a['output']}")
        return

    targets = ASSETS
    if args.asset:
        targets = [a for a in ASSETS if a["name"].startswith(args.asset)]
        if not targets:
            print(f"ERROR: No asset matching '{args.asset}'")
            print(f"Available: {', '.join(a['name'] for a in ASSETS)}")
            sys.exit(1)

    print(f"Generating {len(targets)} assets via OpenAI gpt-image-1\n")

    results = []
    for asset in targets:
        try:
            path = generate_image(asset)
            results.append({"name": asset["name"], "path": str(path)})
        except Exception as e:
            print(f"  FAILED: {asset['name']}: {e}")

    print(f"\nCompleted {len(results)}/{len(targets)} assets")


if __name__ == "__main__":
    main()
