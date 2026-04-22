"""Render item-inspect voice descriptions via Qwen3-TTS-VoiceDesign.

Reads src/data/items.json, generates one WAV per item into
public/assets/sounds/items/<itemId>.wav. Skips files that already exist.
"""
from __future__ import annotations
import json, sys, time
from pathlib import Path

import torch
import soundfile as sf
from qwen_tts import Qwen3TTSModel

REPO = Path(__file__).resolve().parents[1]
ITEMS_PATH = REPO / "src/data/items.json"
OUT_DIR = REPO / "public/assets/sounds/items"
MODEL_ID = "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign"
SEED = 77

NARRATOR_PROMPT = (
    "warm friendly female nature-documentary narrator, "
    "clear articulate storybook cadence, "
    "gentle enthusiastic educator tone for children ages 8-12, "
    "not too slow, engaging"
)


def main() -> int:
    if not ITEMS_PATH.exists():
        print(f"missing {ITEMS_PATH}", file=sys.stderr); return 1
    items = json.loads(ITEMS_PATH.read_text())
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    todo = [(iid, meta["description"]) for iid, meta in items.items()
            if "description" in meta and not (OUT_DIR / f"{iid}.wav").exists()]
    print(f"{len(items)} total items, {len(todo)} to render", flush=True)
    if not todo:
        print("nothing to do"); return 0

    print(f"loading {MODEL_ID} ...", flush=True)
    t0 = time.time()
    model = Qwen3TTSModel.from_pretrained(
        MODEL_ID,
        device_map="cuda:0",
        dtype=torch.bfloat16,
        attn_implementation="sdpa",
    )
    print(f"loaded in {time.time()-t0:.1f}s", flush=True)
    torch.manual_seed(SEED)

    for iid, text in todo:
        print(f"-> {iid}.wav  '{text[:60]}...'", flush=True)
        t1 = time.time()
        wavs, sr = model.generate_voice_design(text=text, language="English", instruct=NARRATOR_PROMPT)
        out = OUT_DIR / f"{iid}.wav"
        sf.write(out, wavs[0], sr)
        print(f"   {len(wavs[0])/sr:.2f}s audio in {time.time()-t1:.1f}s wall", flush=True)

    print(f"done → {OUT_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
