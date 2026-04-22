"""Batch-render NPC dialogue lines via Qwen3-TTS Voice Clone (Base).

Each speaker has a canonical reference in public/assets/sounds/refs/<speaker>.wav
(+ .txt transcript), created by tools/generate_voice_refs.py. Every dialogue
line is cloned from that reference, producing a consistent per-character voice.

Output: public/assets/sounds/dialogue/<dialogue_id>__<line_index>.wav
Skips files that already exist.
"""
from __future__ import annotations
import json, sys, time
from pathlib import Path

import torch
import soundfile as sf
from qwen_tts import Qwen3TTSModel

REPO = Path(__file__).resolve().parents[1]
DIALOGUE_PATH = REPO / "src/data/dialogue.json"
OUT_DIR = REPO / "public/assets/sounds/dialogue"
REFS_DIR = REPO / "public/assets/sounds/refs"
MODEL_ID = "Qwen/Qwen3-TTS-12Hz-1.7B-Base"


def load_refs() -> dict[str, tuple[Path, str]]:
    refs: dict[str, tuple[Path, str]] = {}
    if not REFS_DIR.exists():
        return refs
    for wav in REFS_DIR.glob("*.wav"):
        speaker = wav.stem
        txt = wav.with_suffix(".txt")
        if not txt.exists():
            print(f"!! missing transcript for {speaker}, skipping", file=sys.stderr); continue
        refs[speaker] = (wav, txt.read_text().strip())
    return refs


def main() -> int:
    if not DIALOGUE_PATH.exists():
        print(f"missing {DIALOGUE_PATH}", file=sys.stderr); return 1
    refs = load_refs()
    if not refs:
        print(f"no refs found in {REFS_DIR}. run tools/generate_voice_refs.py first.", file=sys.stderr)
        return 1
    print(f"loaded refs for: {', '.join(sorted(refs))}", flush=True)

    dialogue = json.loads(DIALOGUE_PATH.read_text())
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    jobs: list[tuple[Path, str, str]] = []
    for dlg_id, dlg in dialogue.items():
        speaker = dlg.get("speaker")
        if speaker not in refs:
            print(f"!! no ref for {speaker!r} in {dlg_id}, skipping", file=sys.stderr); continue
        for i, line in enumerate(dlg["lines"]):
            out = OUT_DIR / f"{dlg_id}__{i:02d}.wav"
            jobs.append((out, speaker, line["text"]))

    todo = [j for j in jobs if not j[0].exists()]
    print(f"{len(jobs)} total lines, {len(jobs)-len(todo)} cached, {len(todo)} to render", flush=True)
    if not todo:
        print("nothing to do"); return 0

    print(f"loading {MODEL_ID} ...", flush=True)
    t0 = time.time()
    model = Qwen3TTSModel.from_pretrained(
        MODEL_ID, device_map="cuda:0", dtype=torch.bfloat16, attn_implementation="sdpa",
    )
    print(f"loaded in {time.time()-t0:.1f}s", flush=True)

    total_audio = 0.0
    total_wall = 0.0
    for out, speaker, text in todo:
        ref_wav, ref_text = refs[speaker]
        t1 = time.time()
        wavs, sr = model.generate_voice_clone(
            text=text,
            ref_audio=str(ref_wav),
            ref_text=ref_text,
        )
        dt = time.time() - t1
        sf.write(str(out), wavs[0], sr)
        dur = len(wavs[0]) / sr
        total_audio += dur
        total_wall += dt
        print(f"  {out.name}  {dur:5.2f}s  '{text[:60]}'  ({dt:.1f}s wall)", flush=True)

    print(f"\nTOTAL: {total_audio:.1f}s audio in {total_wall:.1f}s wall (RTF {total_wall/max(total_audio,1e-6):.2f})")
    print(f"output: {OUT_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
