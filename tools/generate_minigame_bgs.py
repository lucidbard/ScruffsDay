#!/usr/bin/env python3
"""Generate illustrated backgrounds for minigames and underground via OpenAI."""

import base64
import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
OUTPUT_DIR = PROJECT_ROOT / "public" / "assets" / "backgrounds"

STYLE = (
    "Children's educational game art style, clean cartoon illustration with bold outlines, "
    "friendly and approachable, similar to PBS Kids or educational nature apps. "
    "Florida scrub habitat. 1280x720 landscape format, filling the entire frame edge to edge."
)

BACKGROUNDS = [
    {
        "name": "vine-buster-bg",
        "prompt": f"A sandy clearing in a Florida scrub forest with a large sand pine tree in the center. "
                  f"The tree is being strangled by invasive air potato vines with heart-shaped leaves. "
                  f"Blue sky above, sandy ground below. {STYLE}",
    },
    {
        "name": "seed-scatter-bg",
        "prompt": f"An aerial view looking down at a sandy Florida scrub landscape from above, as if a bird is flying over it. "
                  f"Sandy white patches mixed with low green scrub vegetation and some invasive dark green patches. "
                  f"Bright sunny day. {STYLE}",
    },
    {
        "name": "night-watch-bg",
        "prompt": f"A nighttime Florida scrub landscape under a starry sky with a crescent moon. "
                  f"Dark silhouettes of scrub oaks, sand pines, and saw palmettos along the horizon. "
                  f"Deep purple-blue sky with scattered stars. Peaceful and mysterious atmosphere. {STYLE}",
    },
    {
        "name": "underground-bg",
        "prompt": f"Inside an underground gopher tortoise burrow. Earthy brown walls with visible roots hanging from the ceiling. "
                  f"A warm glow from the burrow entrance to the left. Sandy floor with small pebbles. "
                  f"Cozy and safe feeling. {STYLE}",
    },
]


def generate_bg(client, bg_def):
    name = bg_def["name"]
    prompt = bg_def["prompt"]
    output_path = OUTPUT_DIR / f"{name}.png"

    print(f"\nGenerating: {name}")
    print(f"  Prompt: {prompt[:80]}...")

    result = client.images.generate(
        model="gpt-image-1",
        prompt=prompt,
        n=1,
        size="1536x1024",
        quality="high",
    )

    image_b64 = result.data[0].b64_json
    image_bytes = base64.b64decode(image_b64)

    with open(output_path, "wb") as f:
        f.write(image_bytes)

    print(f"  Saved: {output_path} ({len(image_bytes) / 1024:.0f}KB)")
    return output_path


def main():
    try:
        from openai import OpenAI
    except ImportError:
        print("openai package not installed. Run: pip install openai")
        sys.exit(1)

    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass

    client = OpenAI()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    for bg in BACKGROUNDS:
        try:
            generate_bg(client, bg)
        except Exception as e:
            print(f"  ERROR: {e}")

    print("\n=== All backgrounds generated! ===")


if __name__ == "__main__":
    main()
