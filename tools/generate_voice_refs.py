"""Render one canonical reference line per character via Qwen3-TTS-VoiceDesign.

Used as the voice anchor for Voice Clone in generate_voice.py. Deterministic
per-speaker seed so the reference voice is stable across runs — re-running
this script overwrites but produces the same voice.

Output:
  public/assets/sounds/refs/<speaker>.wav
  public/assets/sounds/refs/<speaker>.txt   (transcript)
"""
from __future__ import annotations
import hashlib, sys, time
from pathlib import Path

import torch
import soundfile as sf
from qwen_tts import Qwen3TTSModel

REPO = Path(__file__).resolve().parents[1]
OUT_DIR = REPO / "public/assets/sounds/refs"
MODEL_ID = "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign"
BASE_SEED = 42

# Each speaker: (reference-line-text, voice-design-prompt).
# Keep ref lines 4–8 seconds and on-character so the cloned voice carries
# natural prosody / energy.
REFERENCES: dict[str, tuple[str, str]] = {
    "Scruff":  (
        "Hi there! I'm Scruff, a Florida scrub jay, and I love exploring the preserve!",
        "young, bright, slightly mischievous male — energetic kid Florida scrub jay, cheerful and curious, light playful cadence",
    ),
    "Sage":    (
        "Greetings, young one. I have watched over this scrub for many seasons.",
        "wise old male great horned owl, deep resonant chest voice, slow deliberate cadence with measured pauses",
    ),
    "Shelly":  (
        "Hello there, young jay. I've dug burrows in this sand for decades now.",
        "very old male gopher tortoise grandfather, gravelly deep slow voice, warm patient kindly old man tone, low chest resonance, wise elderly gentleman cadence with long deliberate pauses",
    ),
    "Pip":     (
        "Eek! Oh, hello! I'm Pip, a little mouse, and I live down here in the burrow!",
        "tiny hyperactive young female mouse, high pitched, fast cadence, cartoonishly excitable, breathless",
    ),
    "Flicker": (
        "Tap-tap-tap! Hey there, blue jay! Want to help me with these pesky vines?",
        "peppy young male woodpecker, percussive consonants, drum-like rhythmic delivery, upbeat",
    ),
    "Sunny":   (
        "Oh... hello there, little bird. I'm just... warming up in the sun...",
        "sleepy sand skink, languid southern drawl, drowsy basking-in-sun energy, slow",
    ),
}


def speaker_seed(speaker: str) -> int:
    return (BASE_SEED + int(hashlib.md5(speaker.encode()).hexdigest()[:8], 16)) & 0x7FFFFFFF


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    todo = [(s, t, p) for s, (t, p) in REFERENCES.items()
            if not (OUT_DIR / f"{s}.wav").exists()]
    print(f"{len(REFERENCES)} speakers, {len(todo)} refs to render", flush=True)
    if not todo:
        print("all refs present; delete any to regenerate")
        return 0

    print(f"loading {MODEL_ID} ...", flush=True)
    t0 = time.time()
    model = Qwen3TTSModel.from_pretrained(
        MODEL_ID, device_map="cuda:0", dtype=torch.bfloat16, attn_implementation="sdpa",
    )
    print(f"loaded in {time.time()-t0:.1f}s", flush=True)

    for speaker, text, prompt in todo:
        seed = speaker_seed(speaker)
        torch.manual_seed(seed)
        print(f"\n-> {speaker}  (seed={seed})", flush=True)
        print(f"   text: {text}", flush=True)
        t1 = time.time()
        wavs, sr = model.generate_voice_design(text=text, language="English", instruct=prompt)
        out_wav = OUT_DIR / f"{speaker}.wav"
        out_txt = OUT_DIR / f"{speaker}.txt"
        sf.write(out_wav, wavs[0], sr)
        out_txt.write_text(text)
        dur = len(wavs[0]) / sr
        print(f"   {dur:.2f}s audio in {time.time()-t1:.1f}s → {out_wav}", flush=True)

    print(f"\ndone → {OUT_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
