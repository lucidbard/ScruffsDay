"""
Generate a spritesheet of Scruff's idle animation using OpenAI's gpt-image-1 API.

Requests a 4x4 grid (16 frames) but gpt-image-1 typically produces 3x4 (12 frames).
The resulting spritesheet is still suitable for idle animation loops.

Run on Pepper where the OPENAI_API_KEY is configured:
  python3 tools/generate_spritesheet.py
"""

import base64
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

STYLE_REF = (
    "Children's educational game art style, clean cartoon illustration with bold outlines, "
    "friendly and approachable, similar to PBS Kids or educational nature apps. "
    "Transparent background (PNG). Consistent with a Florida scrub habitat nature game."
)

SPRITESHEET_PROMPT = (
    "A 4x4 sprite sheet for a video game, showing 16 animation frames arranged in a uniform grid. "
    "4 columns across, 4 rows down. Each cell is 256x256 pixels. "
    "Every cell contains the same cute cartoon Florida scrub jay character: "
    "blue head, blue wings, blue tail, gray back, white chest and throat, white eyebrow stripe, "
    "small black beak, big round expressive eyes, orange feet. Front-facing standing pose. "
    "\n\n"
    "Subtle idle animation variations between frames - barely noticeable differences: "
    "Row 1: head center, head tilts slightly left, head tilts more left, head returns center. "
    "Row 2: body shifts up slightly, chest puffs slightly, peak breathing in, starting to exhale. "
    "Row 3: head tilts slightly right, tilts more right, head returns center, body neutral. "
    "Row 4: body lowers slightly, lowest point, rising back up, return to starting pose. "
    "\n\n"
    "IMPORTANT: Exactly 4 birds in each row. Exactly 4 rows. 16 total frames in the grid. "
    "Clean transparent background, no overlap between frames. "
    f"{STYLE_REF}"
)


def main():
    output_path = ASSETS_DIR / "characters" / "scruff-idle-spritesheet-ai.png"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    print("Generating Scruff idle spritesheet (4x4, 16 frames)...")
    print(f"  Output: {output_path}")
    print(f"  Prompt length: {len(SPRITESHEET_PROMPT)} chars")
    print()

    response = client.images.generate(
        model="gpt-image-1",
        prompt=SPRITESHEET_PROMPT,
        n=1,
        size="1024x1024",
        quality="high",
    )

    image_data = response.data[0].b64_json
    if image_data:
        with open(output_path, "wb") as f:
            f.write(base64.b64decode(image_data))
        print(f"  Saved: {output_path}")
        file_size = output_path.stat().st_size
        print(f"  File size: {file_size / 1024:.1f} KB")
    else:
        import urllib.request
        url = response.data[0].url
        urllib.request.urlretrieve(url, output_path)
        print(f"  Saved from URL: {output_path}")

    print("\nDone!")


if __name__ == "__main__":
    main()
