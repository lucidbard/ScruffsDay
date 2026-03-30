"""
Generate transition spritesheets for Scruff using ComfyUI Wan 2.2 FLF2V.

Generates:
1. turn-to-side: front-facing → side-facing (play once for turn)
2. hop-side: side-facing → side-facing (looping hop cycle)

Right-facing versions are mirrored in code.
"""

import aiohttp
import asyncio
import json
import subprocess
import sys
import time
from pathlib import Path

COMFYUI_URL = "http://localhost:8188"
PROJECT_ROOT = Path(__file__).parent.parent
CHARS_DIR = PROJECT_ROOT / "public" / "assets" / "characters"
WORK_DIR = PROJECT_ROOT / "tools" / "_scruff_transitions_work"

# Source images
IDLE_FRONT = CHARS_DIR / "scruff-idle-front.png"  # 232x256
IDLE_SIDE = CHARS_DIR / "scruff-idle-side.png"     # 256x255

# Wan needs dimensions divisible by 16, and min ~480px
WAN_W = 480
WAN_H = 544
FRAMES = 13  # 1 + 4*n, shorter for transitions (~0.8s at 16fps)

ANIMATIONS = [
    {
        "name": "turn-to-side",
        "start": IDLE_FRONT,
        "end": IDLE_SIDE,
        "prompt": "cartoon bird turning from front view to side view, smooth rotation, green screen background",
        "negative": "deformation, extra limbs, morphing body shape, flying, hopping, walking, text, watermark, new objects",
        "frames": FRAMES,
        "seed": 201,
        "output": CHARS_DIR / "scruff-turn-sheet.png",
    },
    {
        "name": "hop-side",
        "start": IDLE_SIDE,
        "end": IDLE_SIDE,
        "prompt": "cartoon bird hopping on ground, small hop up and down, side view, green screen background",
        "negative": "flying, wing flapping, deformation, extra limbs, morphing, text, watermark, new objects, mouth opening",
        "frames": FRAMES,
        "seed": 202,
        "output": CHARS_DIR / "scruff-hop-sheet.png",
    },
]


def make_flf2v_workflow(start_image, end_image, prompt, negative, width, height, length, seed):
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
                "type": "wan", "device": "default"
            },
            "class_type": "CLIPLoader",
        },
        "4": {"inputs": {"vae_name": "wan_2.1_vae.safetensors"}, "class_type": "VAELoader"},
        "5": {"inputs": {"image": start_image}, "class_type": "LoadImage"},
        "6": {"inputs": {"image": end_image}, "class_type": "LoadImage"},
        "7": {"inputs": {"text": prompt, "clip": ["3", 0]}, "class_type": "CLIPTextEncode"},
        "8": {"inputs": {"text": negative, "clip": ["3", 0]}, "class_type": "CLIPTextEncode"},
        "11": {
            "inputs": {
                "positive": ["7", 0], "negative": ["8", 0], "vae": ["4", 0],
                "start_image": ["5", 0], "end_image": ["6", 0],
                "width": width, "height": height, "length": length, "batch_size": 1
            },
            "class_type": "WanFirstLastFrameToVideo",
        },
        "101": {
            "inputs": {
                "lora_name": "wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors",
                "strength_model": 1.0, "model": ["1", 0]
            },
            "class_type": "LoraLoaderModelOnly",
        },
        "102": {
            "inputs": {
                "lora_name": "wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors",
                "strength_model": 1.0, "model": ["2", 0]
            },
            "class_type": "LoraLoaderModelOnly",
        },
        "9": {"inputs": {"shift": 5.0, "model": ["101", 0]}, "class_type": "ModelSamplingSD3"},
        "10": {"inputs": {"shift": 5.0, "model": ["102", 0]}, "class_type": "ModelSamplingSD3"},
        "12": {
            "inputs": {
                "model": ["9", 0], "positive": ["11", 0], "negative": ["11", 1],
                "latent_image": ["11", 2], "add_noise": "enable", "noise_seed": seed,
                "steps": 4, "cfg": 1.0, "sampler_name": "euler", "scheduler": "simple",
                "start_at_step": 0, "end_at_step": 2, "return_with_leftover_noise": "enable"
            },
            "class_type": "KSamplerAdvanced",
        },
        "13": {
            "inputs": {
                "model": ["10", 0], "positive": ["11", 0], "negative": ["11", 1],
                "latent_image": ["12", 0], "add_noise": "disable", "noise_seed": seed,
                "steps": 4, "cfg": 1.0, "sampler_name": "euler", "scheduler": "simple",
                "start_at_step": 2, "end_at_step": 10000, "return_with_leftover_noise": "disable"
            },
            "class_type": "KSamplerAdvanced",
        },
        "14": {"inputs": {"samples": ["13", 0], "vae": ["4", 0]}, "class_type": "VAEDecode"},
        "15": {
            "inputs": {"filename_prefix": "scruff_transition", "images": ["14", 0]},
            "class_type": "SaveImage",
        },
    }


async def upload_image(session, image_path):
    with open(image_path, 'rb') as f:
        data = aiohttp.FormData()
        data.add_field('image', f, filename=image_path.name, content_type='image/png')
        async with session.post(f"{COMFYUI_URL}/upload/image", data=data) as resp:
            if resp.status != 200:
                raise Exception(f"Upload failed: {await resp.text()}")
            return (await resp.json()).get("name", image_path.name)


async def queue_prompt(session, workflow):
    payload = {"prompt": workflow, "client_id": "scruff-transition-gen"}
    async with session.post(f"{COMFYUI_URL}/prompt", json=payload) as resp:
        if resp.status != 200:
            raise Exception(f"Queue failed: {await resp.text()}")
        return (await resp.json())["prompt_id"]


async def wait_for_completion(session, prompt_id, timeout=900):
    start = time.time()
    while time.time() - start < timeout:
        if (time.time() - start) % 15 < 3:
            print(f"    ... waiting ({time.time() - start:.0f}s)")
        async with session.get(f"{COMFYUI_URL}/history/{prompt_id}") as resp:
            if resp.status == 200:
                history = await resp.json()
                if prompt_id in history:
                    entry = history[prompt_id]
                    if entry.get("status", {}).get("completed"):
                        return entry
                    for msg in entry.get("messages", []):
                        if msg[0] == "execution_error":
                            raise Exception(f"Workflow failed: {msg}")
        await asyncio.sleep(3)
    raise TimeoutError("Timed out")


async def download_frames(session, entry, dest_dir, prefix):
    paths = []
    idx = 0
    for node_output in entry.get("outputs", {}).values():
        for img in node_output.get("images", []):
            filename = img.get("filename")
            if filename:
                dest = dest_dir / f"{prefix}_{idx:04d}.png"
                params = {"filename": filename, "type": "output"}
                sf = img.get("subfolder", "")
                if sf:
                    params["subfolder"] = sf
                async with session.get(f"{COMFYUI_URL}/view", params=params) as resp:
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    with open(dest, 'wb') as f:
                        f.write(await resp.read())
                paths.append(dest)
                idx += 1
    return sorted(paths)


def composite_on_green(src_png, dest_png, wan_w, wan_h):
    subprocess.run([
        "convert", "-size", f"{wan_w}x{wan_h}", "xc:#00FF00",
        str(src_png), "-gravity", "center", "-resize", f"{wan_w}x{wan_h}", "-composite",
        str(dest_png)
    ], check=True)


def chroma_key_and_resize(frame_path, dest_path, target_w, target_h):
    subprocess.run([
        "convert", str(frame_path), "-fuzz", "25%", "-transparent", "#00FF00",
        "-resize", f"{target_w}x{target_h}!", str(dest_path)
    ], check=True)


async def generate_animation(session, anim):
    name = anim["name"]
    print(f"\n{'='*50}")
    print(f"Generating: {name}")
    print(f"  Start: {anim['start'].name} → End: {anim['end'].name}")
    print(f"  Frames: {anim['frames']}, Seed: {anim['seed']}")
    print(f"  Prompt: {anim['prompt']}")

    work = WORK_DIR / name
    work.mkdir(parents=True, exist_ok=True)

    # Composite start/end on green
    start_green = work / "start_green.png"
    end_green = work / "end_green.png"
    composite_on_green(anim["start"], start_green, WAN_W, WAN_H)
    composite_on_green(anim["end"], end_green, WAN_W, WAN_H)

    # Upload
    start_name = await upload_image(session, start_green)
    end_name = await upload_image(session, end_green)
    print(f"  Uploaded: {start_name}, {end_name}")

    # Queue workflow
    workflow = make_flf2v_workflow(
        start_name, end_name, anim["prompt"], anim["negative"],
        WAN_W, WAN_H, anim["frames"], anim["seed"]
    )
    prompt_id = await queue_prompt(session, workflow)
    print(f"  Queued: {prompt_id}")

    # Wait
    entry = await wait_for_completion(session, prompt_id)
    print(f"  Generation complete!")

    # Download
    frames_dir = work / "frames"
    frames_dir.mkdir(exist_ok=True)
    frames = await download_frames(session, entry, frames_dir, name)
    print(f"  Downloaded {len(frames)} frames")

    # Chroma key + resize
    # Use the larger dimension for consistent frame size
    frame_w = 256
    frame_h = 256
    keyed_dir = work / "keyed"
    keyed_dir.mkdir(exist_ok=True)
    keyed = []
    for fp in frames:
        kp = keyed_dir / fp.name
        chroma_key_and_resize(fp, kp, frame_w, frame_h)
        keyed.append(kp)

    # Assemble spritesheet
    output = anim["output"]
    cmd = ["convert"] + [str(f) for f in keyed] + ["+append", str(output)]
    subprocess.run(cmd, check=True)
    print(f"  Spritesheet: {output} ({len(keyed)} frames @ {frame_w}x{frame_h})")

    return len(keyed), frame_w, frame_h


async def main():
    print("=== Scruff Transition Animation Pipeline ===")
    WORK_DIR.mkdir(parents=True, exist_ok=True)

    async with aiohttp.ClientSession() as session:
        for anim in ANIMATIONS:
            n, w, h = await generate_animation(session, anim)
            print(f"  → {anim['name']}: {n} frames, {w}x{h}")

    print("\n=== All transitions generated! ===")


if __name__ == "__main__":
    asyncio.run(main())
