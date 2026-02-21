#!/bin/bash
# Generate a game asset via Gemini API, extract image, remove background
# Usage: ./scripts/generate_asset.sh "prompt text" output_name
# Output goes to public/assets/items/output_name.png (or other subdirectory)

set -e

PROMPT="$1"
OUTPUT_NAME="$2"
OUTPUT_DIR="$3"  # e.g., items, characters, backgrounds
TOLERANCE="${4:-30}"

PROJDIR="C:/Users/anast/Documents/GitHub/ScruffsDay"
TMPDIR="$PROJDIR/scripts/tmp"

if [ -z "$GEMINI_API_KEY" ]; then
  echo "ERROR: GEMINI_API_KEY is not set"
  exit 1
fi

if [ -z "$PROMPT" ] || [ -z "$OUTPUT_NAME" ] || [ -z "$OUTPUT_DIR" ]; then
  echo "Usage: $0 'prompt' output_name output_dir [tolerance]"
  exit 1
fi

echo "=== Generating: $OUTPUT_NAME ==="
echo "Prompt: ${PROMPT:0:80}..."

# Step 1: Generate via Gemini
curl -s -X POST \
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$(cat <<JSONEOF
{
  "contents": [{"parts": [{"text": "$PROMPT"}]}],
  "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]}
}
JSONEOF
)" > "$TMPDIR/${OUTPUT_NAME}_response.json"

RESP_SIZE=$(wc -c < "$TMPDIR/${OUTPUT_NAME}_response.json")
echo "Response: $RESP_SIZE bytes"

if [ "$RESP_SIZE" -lt 1000 ]; then
  echo "ERROR: Response too small, likely an error:"
  cat "$TMPDIR/${OUTPUT_NAME}_response.json"
  exit 1
fi

# Step 2: Extract image
python3 -c "
import json, base64
with open('$TMPDIR/${OUTPUT_NAME}_response.json') as f:
    data = json.load(f)
for part in data['candidates'][0]['content']['parts']:
    if 'inlineData' in part:
        img_data = part['inlineData']['data']
        with open('$TMPDIR/${OUTPUT_NAME}_raw.png', 'wb') as out:
            out.write(base64.b64decode(img_data))
        print('Extracted raw image')
    elif 'text' in part:
        print('Model text:', part['text'][:100])
"

# Step 3: Remove background (skip for backgrounds dir)
if [ "$OUTPUT_DIR" = "backgrounds" ]; then
  cp "$TMPDIR/${OUTPUT_NAME}_raw.png" "$PROJDIR/public/assets/$OUTPUT_DIR/${OUTPUT_NAME}.png"
  echo "Copied background (no bg removal needed)"
else
  python3 "$PROJDIR/scripts/remove_bg.py" \
    "$TMPDIR/${OUTPUT_NAME}_raw.png" \
    "$PROJDIR/public/assets/$OUTPUT_DIR/${OUTPUT_NAME}.png" \
    --tolerance "$TOLERANCE"
fi

echo "=== Done: public/assets/$OUTPUT_DIR/${OUTPUT_NAME}.png ==="
