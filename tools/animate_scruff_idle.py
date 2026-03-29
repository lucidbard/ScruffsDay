"""
Animate scruff-idle-front.png into a looping spritesheet using ComfyUI Wan 2.2 FLF2V.

Steps:
1. Composite transparent PNG onto green (#00FF00) background
2. Upload to ComfyUI
3. Run FLF2V with same start+end image for seamless loop
4. Download output frames
5. Chroma key green back to transparent
6. Assemble horizontal spritesheet
"""

import aiohttp
import asyncio
import json
import os
import subprocess
import sys
import time
import tempfile
from pathlib import Path

COMFYUI_URL = "http://localhost:8188"
PROJECT_ROOT = Path(__file__).parent.parent
SOURCE_PNG = PROJECT_ROOT / "public" / "assets" / "characters" / "scruff-idle-front.png"
OUTPUT_SHEET = PROJECT_ROOT / "public" / "assets" / "characters" / "scruff-idle-sheet.png"
WORK_DIR = PROJECT_ROOT / "tools" / "_scruff_idle_work"
FRAMES_PER_PASS = 25
SEED = 123

# Character dimensions - will be scaled up for Wan (needs min ~480px)
CHAR_W = 232
CHAR_H = 256
# Wan works better at larger sizes; scale up to nearest multiple of 16
WAN_W = 480  # ~2x width, multiple of 16
WAN_H = 528  # ~2x height, multiple of 16 -> actually 512 is closer. Let's use 480x544
# Wan requires dimensions divisible by 16
WAN_W = 480
WAN_H = 544

PROMPT = "still cartoon bird on green screen, perfectly still, barely perceptible chest breathing, static pose, no wing movement, no head movement, no mouth movement, minimal motion"
NEGATIVE = "wing movement, mouth opening, head turning, walking, flying, hopping, deformation, morphing, fast motion, large movement, extra limbs, text, watermark, blurry, new objects, arm raising"


def make_flf2v_workflow(start_image: str, end_image: str, prompt: str, negative: str,
                        width: int, height: int, length: int, seed: int) -> dict:
    """FLF2V workflow - same as animate_assets.py"""
    return {
        "1": {
            "inputs": {
                "unet_name": "WanVideo/2_2/Wan2_2-I2V-A14B-HIGH_fp8_e4m3fn_scaled_KJ.safetensors",
                "weight_dtype": "default"
            },
            "class_type": "UNETLoader",
        },
        "2": {
            "inputs": {
                "unet_name": "WanVideo/2_2/Wan2_2-I2V-A14B-LOW_fp8_e4m3fn_scaled_KJ.safetensors",
                "weight_dtype": "default"
            },
            "class_type": "UNETLoader",
        },
        "3": {
            "inputs": {
                "clip_name": "umt5_xxl_fp8_e4m3fn_scaled.safetensors",
                "type": "wan",
                "device": "default"
            },
            "class_type": "CLIPLoader",
        },
        "4": {
            "inputs": {"vae_name": "wan_2.1_vae.safetensors"},
            "class_type": "VAELoader",
        },
        "5": {
            "inputs": {"image": start_image},
            "class_type": "LoadImage",
        },
        "6": {
            "inputs": {"image": end_image},
            "class_type": "LoadImage",
        },
        "7": {
            "inputs": {"text": prompt, "clip": ["3", 0]},
            "class_type": "CLIPTextEncode",
        },
        "8": {
            "inputs": {"text": negative, "clip": ["3", 0]},
            "class_type": "CLIPTextEncode",
        },
        "11": {
            "inputs": {
                "positive": ["7", 0],
                "negative": ["8", 0],
                "vae": ["4", 0],
                "start_image": ["5", 0],
                "end_image": ["6", 0],
                "width": width,
                "height": height,
                "length": length,
                "batch_size": 1
            },
            "class_type": "WanFirstLastFrameToVideo",
        },
        "101": {
            "inputs": {
                "lora_name": "wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors",
                "strength_model": 1.0,
                "model": ["1", 0]
            },
            "class_type": "LoraLoaderModelOnly",
        },
        "102": {
            "inputs": {
                "lora_name": "wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors",
                "strength_model": 1.0,
                "model": ["2", 0]
            },
            "class_type": "LoraLoaderModelOnly",
        },
        "9": {
            "inputs": {"shift": 5.0, "model": ["101", 0]},
            "class_type": "ModelSamplingSD3",
        },
        "10": {
            "inputs": {"shift": 5.0, "model": ["102", 0]},
            "class_type": "ModelSamplingSD3",
        },
        "12": {
            "inputs": {
                "model": ["9", 0],
                "positive": ["11", 0],
                "negative": ["11", 1],
                "latent_image": ["11", 2],
                "add_noise": "enable",
                "noise_seed": seed,
                "steps": 4,
                "cfg": 1.0,
                "sampler_name": "euler",
                "scheduler": "simple",
                "start_at_step": 0,
                "end_at_step": 2,
                "return_with_leftover_noise": "enable"
            },
            "class_type": "KSamplerAdvanced",
        },
        "13": {
            "inputs": {
                "model": ["10", 0],
                "positive": ["11", 0],
                "negative": ["11", 1],
                "latent_image": ["12", 0],
                "add_noise": "disable",
                "noise_seed": seed,
                "steps": 4,
                "cfg": 1.0,
                "sampler_name": "euler",
                "scheduler": "simple",
                "start_at_step": 2,
                "end_at_step": 10000,
                "return_with_leftover_noise": "disable"
            },
            "class_type": "KSamplerAdvanced",
        },
        "14": {
            "inputs": {"samples": ["13", 0], "vae": ["4", 0]},
            "class_type": "VAEDecode",
        },
        "15": {
            "inputs": {
                "filename_prefix": "scruff_idle",
                "images": ["14", 0]
            },
            "class_type": "SaveImage",
        },
    }


async def upload_image(session, base_url, image_path):
    """Upload an image to ComfyUI."""
    with open(image_path, 'rb') as f:
        data = aiohttp.FormData()
        data.add_field('image', f, filename=image_path.name, content_type='image/png')
        async with session.post(f"{base_url}/upload/image", data=data) as resp:
            if resp.status != 200:
                raise Exception(f"Upload failed: {resp.status} - {await resp.text()}")
            result = await resp.json()
            return result.get("name", image_path.name)


async def queue_prompt(session, base_url, workflow):
    """Submit workflow and return prompt_id."""
    payload = {"prompt": workflow, "client_id": "scruff-idle-animator"}
    async with session.post(f"{base_url}/prompt", json=payload) as resp:
        if resp.status != 200:
            text = await resp.text()
            raise Exception(f"Queue failed: {resp.status} - {text}")
        result = await resp.json()
        return result["prompt_id"]


async def wait_for_completion(session, base_url, prompt_id, timeout=600):
    """Poll until workflow completes."""
    start = time.time()
    last_print = 0
    while time.time() - start < timeout:
        elapsed = time.time() - start
        if elapsed - last_print >= 15:
            print(f"    ... waiting ({elapsed:.0f}s elapsed)")
            last_print = elapsed
        async with session.get(f"{base_url}/history/{prompt_id}") as resp:
            if resp.status == 200:
                history = await resp.json()
                if prompt_id in history:
                    entry = history[prompt_id]
                    status = entry.get("status", {})
                    if status.get("completed"):
                        return entry
                    for msg in entry.get("messages", []):
                        if msg[0] == "execution_error":
                            raise Exception(f"Workflow failed: {msg}")
        await asyncio.sleep(3)
    raise TimeoutError(f"Workflow timed out after {timeout}s")


async def download_output_frames(session, base_url, entry, dest_dir, prefix):
    """Download all output frames."""
    paths = []
    frame_idx = 0
    for node_id, node_output in entry.get("outputs", {}).items():
        for img in node_output.get("images", []):
            filename = img.get("filename")
            subfolder = img.get("subfolder", "")
            if filename:
                dest = dest_dir / f"{prefix}_{frame_idx:04d}.png"
                params = {"filename": filename, "type": "output"}
                if subfolder:
                    params["subfolder"] = subfolder
                async with session.get(f"{base_url}/view", params=params) as resp:
                    if resp.status != 200:
                        raise Exception(f"Download failed for {filename}: {resp.status}")
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    with open(dest, 'wb') as f:
                        f.write(await resp.read())
                paths.append(dest)
                frame_idx += 1
    return sorted(paths)


async def main():
    print("=== Scruff Idle Animation Pipeline ===\n")

    # Setup work directory
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    greenscreen_dir = WORK_DIR / "greenscreen"
    greenscreen_dir.mkdir(exist_ok=True)
    frames_dir = WORK_DIR / "frames"
    frames_dir.mkdir(exist_ok=True)
    keyed_dir = WORK_DIR / "keyed"
    keyed_dir.mkdir(exist_ok=True)

    # Step 1: Composite onto green background at Wan-compatible size
    print(f"[1] Compositing {SOURCE_PNG.name} onto green background ({WAN_W}x{WAN_H})...")
    greenscreen_path = greenscreen_dir / "scruff-idle-green.png"
    subprocess.run([
        "convert",
        "-size", f"{WAN_W}x{WAN_H}", "xc:#00FF00",
        str(SOURCE_PNG),
        "-gravity", "center",
        "-resize", f"{WAN_W}x{WAN_H}",
        "-composite",
        str(greenscreen_path)
    ], check=True)
    print(f"    Saved: {greenscreen_path}")

    # Step 2-4: Upload, run FLF2V, download frames
    async with aiohttp.ClientSession() as session:
        print(f"\n[2] Uploading green-screen image to ComfyUI...")
        uploaded_name = await upload_image(session, COMFYUI_URL, greenscreen_path)
        print(f"    Uploaded as: {uploaded_name}")

        print(f"\n[3] Queuing FLF2V workflow (same start+end for seamless loop)...")
        print(f"    Dimensions: {WAN_W}x{WAN_H}, Frames: {FRAMES_PER_PASS}")
        print(f"    Prompt: {PROMPT}")
        workflow = make_flf2v_workflow(
            start_image=uploaded_name,
            end_image=uploaded_name,
            prompt=PROMPT,
            negative=NEGATIVE,
            width=WAN_W,
            height=WAN_H,
            length=FRAMES_PER_PASS,
            seed=SEED,
        )
        prompt_id = await queue_prompt(session, COMFYUI_URL, workflow)
        print(f"    prompt_id: {prompt_id}")

        print(f"\n[4] Waiting for ComfyUI to generate {FRAMES_PER_PASS} frames...")
        entry = await wait_for_completion(session, COMFYUI_URL, prompt_id, timeout=600)
        print(f"    Generation complete!")

        print(f"\n[5] Downloading frames...")
        frames = await download_output_frames(session, COMFYUI_URL, entry, frames_dir, "scruff_idle")
        print(f"    Downloaded {len(frames)} frames")

    if not frames:
        print("ERROR: No frames were generated!")
        sys.exit(1)

    # Step 5: Chroma key green back to transparent
    print(f"\n[6] Chroma keying green background to transparent...")
    keyed_frames = []
    for frame_path in frames:
        keyed_path = keyed_dir / frame_path.name
        # Use ImageMagick to remove green background
        # -fuzz allows for slight color variations from video compression
        subprocess.run([
            "convert", str(frame_path),
            "-fuzz", "25%",
            "-transparent", "#00FF00",
            str(keyed_path)
        ], check=True)
        keyed_frames.append(keyed_path)
    print(f"    Keyed {len(keyed_frames)} frames")

    # Step 6: Resize frames back to original character size
    print(f"\n[7] Resizing frames to original {CHAR_W}x{CHAR_H}...")
    resized_dir = WORK_DIR / "resized"
    resized_dir.mkdir(exist_ok=True)
    resized_frames = []
    for kf in keyed_frames:
        resized_path = resized_dir / kf.name
        subprocess.run([
            "convert", str(kf),
            "-resize", f"{CHAR_W}x{CHAR_H}!",
            str(resized_path)
        ], check=True)
        resized_frames.append(resized_path)
    print(f"    Resized {len(resized_frames)} frames")

    # Step 7: Assemble horizontal spritesheet
    print(f"\n[8] Assembling horizontal spritesheet...")
    n_frames = len(resized_frames)
    sheet_w = CHAR_W * n_frames
    sheet_h = CHAR_H

    # Use ImageMagick +append for horizontal strip
    cmd = ["convert"] + [str(f) for f in resized_frames] + ["+append", str(OUTPUT_SHEET)]
    subprocess.run(cmd, check=True)

    print(f"    Spritesheet: {OUTPUT_SHEET}")
    print(f"    Dimensions: {sheet_w}x{sheet_h} ({n_frames} frames x {CHAR_W}x{CHAR_H})")
    print(f"\n=== Done! ===")
    print(f"Spritesheet saved to: {OUTPUT_SHEET}")
    print(f"Use in game: {n_frames} frames at 16fps = {n_frames/16:.1f}s loop")


if __name__ == "__main__":
    asyncio.run(main())
