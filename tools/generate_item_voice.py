"""Render item-inspect voice descriptions in Scruff's voice via Qwen3-TTS Voice Clone.

Reads src/data/items.json descriptions and clones them using the
Scruff reference in public/assets/sounds/refs/Scruff.wav. Skips files that
already exist — delete a wav to regenerate.
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
REFS_DIR = REPO / "public/assets/sounds/refs"
MODEL_ID = "Qwen/Qwen3-TTS-12Hz-1.7B-Base"
REF_SPEAKER = "Scruff"


def main() -> int:
    if not ITEMS_PATH.exists():
        print(f"missing {ITEMS_PATH}", file=sys.stderr); return 1
    ref_wav = REFS_DIR / f"{REF_SPEAKER}.wav"
    ref_txt = REFS_DIR / f"{REF_SPEAKER}.txt"
    if not ref_wav.exists() or not ref_txt.exists():
        print(f"missing Scruff ref. run tools/generate_voice_refs.py first.", file=sys.stderr)
        return 1
    ref_text = ref_txt.read_text().strip()

    items = json.loads(ITEMS_PATH.read_text())
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    todo = [(iid, meta["description"]) for iid, meta in items.items()
            if "description" in meta and not (OUT_DIR / f"{iid}.wav").exists()]
    print(f"{len(items)} items, {len(todo)} to render from Scruff ref", flush=True)
    if not todo:
        print("nothing to do"); return 0

    print(f"loading {MODEL_ID} ...", flush=True)
    t0 = time.time()
    model = Qwen3TTSModel.from_pretrained(
        MODEL_ID, device_map="cuda:0", dtype=torch.bfloat16, attn_implementation="sdpa",
    )
    print(f"loaded in {time.time()-t0:.1f}s", flush=True)

    for iid, text in todo:
        t1 = time.time()
        wavs, sr = model.generate_voice_clone(
            text=text, ref_audio=str(ref_wav), ref_text=ref_text,
        )
        out = OUT_DIR / f"{iid}.wav"
        sf.write(out, wavs[0], sr)
        print(f"-> {iid}.wav  {len(wavs[0])/sr:.2f}s  ({time.time()-t1:.1f}s wall)", flush=True)

    print(f"done → {OUT_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
