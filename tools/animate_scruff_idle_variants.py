"""
Generate multiple idle behavior spritesheets for Scruff using ComfyUI Wan 2.2 FLF2V.

Variants:
1. head-bob: bird looking left and right
2. look-around: bird tilting head up, looking around alertly
3. ruffle: bird ruffling/shaking feathers briefly

All use the front-facing idle as start+end frame for seamless loops.
"""

import aiohttp
import asyncio
import subprocess
import sys
import time
from pathlib import Path

COMFYUI_URL = "http://localhost:8188"
PROJECT_ROOT = Path(__file__).parent.parent
CHARS_DIR = PROJECT_ROOT / "public" / "assets" / "characters"
WORK_DIR = PROJECT_ROOT / "tools" / "_scruff_idle_variants_work"
SOURCE = CHARS_DIR / "scruff-idle-front.png"

CHAR_W = 256
CHAR_H = 256
WAN_W = 480
WAN_H = 544
FRAMES = 25  # 1 + 4*n

VARIANTS = [
    {
        "name": "head-bob",
        "prompt": "cartoon bird on green screen, bird turning head to look left then right, curious head movement, beak closed, body stays still",
        "negative": "open mouth, talking, flying, walking, hopping, wing movement, deformation, morphing, extra limbs, text, watermark, new objects",
        "seed": 301,
        "output": CHARS_DIR / "scruff-idle-headbob.png",
    },
    {
        "name": "look-around",
        "prompt": "cartoon bird on green screen, bird looking up and around alertly, head tilting, curious expression, beak closed, body stays still",
        "negative": "open mouth, talking, flying, walking, hopping, wing movement, deformation, morphing, extra limbs, text, watermark, new objects",
        "seed": 302,
        "output": CHARS_DIR / "scruff-idle-lookaround.png",
    },
    {
        "name": "ruffle",
        "prompt": "cartoon bird on green screen, bird briefly ruffling feathers and settling, quick shake then still, beak closed",
        "negative": "open mouth, talking, flying, walking, hopping, deformation, morphing, extra limbs, text, watermark, new objects, large movement",
        "seed": 303,
        "output": CHARS_DIR / "scruff-idle-ruffle.png",
    },
]


def make_flf2v_workflow(start_image, end_image, prompt, negative, width, height, length, seed):
    return {
        "1": {"inputs": {"unet_name": "WanVideo/2_2/Wan2_2-I2V-A14B-HIGH_fp8_e4m3fn_scaled_KJ.safetensors", "weight_dtype": "default"}, "class_type": "UNETLoader"},
        "2": {"inputs": {"unet_name": "WanVideo/2_2/Wan2_2-I2V-A14B-LOW_fp8_e4m3fn_scaled_KJ.safetensors", "weight_dtype": "default"}, "class_type": "UNETLoader"},
        "3": {"inputs": {"clip_name": "umt5_xxl_fp8_e4m3fn_scaled.safetensors", "type": "wan", "device": "default"}, "class_type": "CLIPLoader"},
        "4": {"inputs": {"vae_name": "wan_2.1_vae.safetensors"}, "class_type": "VAELoader"},
        "5": {"inputs": {"image": start_image}, "class_type": "LoadImage"},
        "6": {"inputs": {"image": end_image}, "class_type": "LoadImage"},
        "7": {"inputs": {"text": prompt, "clip": ["3", 0]}, "class_type": "CLIPTextEncode"},
        "8": {"inputs": {"text": negative, "clip": ["3", 0]}, "class_type": "CLIPTextEncode"},
        "11": {"inputs": {"positive": ["7", 0], "negative": ["8", 0], "vae": ["4", 0], "start_image": ["5", 0], "end_image": ["6", 0], "width": width, "height": height, "length": length, "batch_size": 1}, "class_type": "WanFirstLastFrameToVideo"},
        "101": {"inputs": {"lora_name": "wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors", "strength_model": 1.0, "model": ["1", 0]}, "class_type": "LoraLoaderModelOnly"},
        "102": {"inputs": {"lora_name": "wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors", "strength_model": 1.0, "model": ["2", 0]}, "class_type": "LoraLoaderModelOnly"},
        "9": {"inputs": {"shift": 5.0, "model": ["101", 0]}, "class_type": "ModelSamplingSD3"},
        "10": {"inputs": {"shift": 5.0, "model": ["102", 0]}, "class_type": "ModelSamplingSD3"},
        "12": {"inputs": {"model": ["9", 0], "positive": ["11", 0], "negative": ["11", 1], "latent_image": ["11", 2], "add_noise": "enable", "noise_seed": seed, "steps": 4, "cfg": 1.0, "sampler_name": "euler", "scheduler": "simple", "start_at_step": 0, "end_at_step": 2, "return_with_leftover_noise": "enable"}, "class_type": "KSamplerAdvanced"},
        "13": {"inputs": {"model": ["10", 0], "positive": ["11", 0], "negative": ["11", 1], "latent_image": ["12", 0], "add_noise": "disable", "noise_seed": seed, "steps": 4, "cfg": 1.0, "sampler_name": "euler", "scheduler": "simple", "start_at_step": 2, "end_at_step": 10000, "return_with_leftover_noise": "disable"}, "class_type": "KSamplerAdvanced"},
        "14": {"inputs": {"samples": ["13", 0], "vae": ["4", 0]}, "class_type": "VAEDecode"},
        "15": {"inputs": {"filename_prefix": f"scruff_{seed}", "images": ["14", 0]}, "class_type": "SaveImage"},
    }


async def upload_image(session, image_path):
    with open(image_path, 'rb') as f:
        data = aiohttp.FormData()
        data.add_field('image', f, filename=image_path.name, content_type='image/png')
        async with session.post(f"{COMFYUI_URL}/upload/image", data=data) as resp:
            return (await resp.json()).get("name", image_path.name)


async def queue_prompt(session, workflow):
    async with session.post(f"{COMFYUI_URL}/prompt", json={"prompt": workflow, "client_id": "idle-variants"}) as resp:
        return (await resp.json())["prompt_id"]


async def wait_for_completion(session, prompt_id, timeout=900):
    start = time.time()
    while time.time() - start < timeout:
        if int(time.time() - start) % 30 == 0:
            print(f"    ... {time.time() - start:.0f}s")
        async with session.get(f"{COMFYUI_URL}/history/{prompt_id}") as resp:
            if resp.status == 200:
                history = await resp.json()
                if prompt_id in history:
                    entry = history[prompt_id]
                    if entry.get("status", {}).get("completed"):
                        return entry
                    for msg in entry.get("messages", []):
                        if msg[0] == "execution_error":
                            raise Exception(f"Failed: {msg}")
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
                if sf: params["subfolder"] = sf
                async with session.get(f"{COMFYUI_URL}/view", params=params) as resp:
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    with open(dest, 'wb') as f:
                        f.write(await resp.read())
                paths.append(dest)
                idx += 1
    return sorted(paths)


async def generate_variant(session, variant, uploaded_name):
    name = variant["name"]
    print(f"\n=== Generating: {name} ===")
    print(f"  Prompt: {variant['prompt']}")

    work = WORK_DIR / name
    work.mkdir(parents=True, exist_ok=True)

    workflow = make_flf2v_workflow(
        uploaded_name, uploaded_name,
        variant["prompt"], variant["negative"],
        WAN_W, WAN_H, FRAMES, variant["seed"]
    )
    prompt_id = await queue_prompt(session, workflow)
    print(f"  Queued: {prompt_id}")

    entry = await wait_for_completion(session, prompt_id)
    print(f"  Complete!")

    frames_dir = work / "frames"
    frames_dir.mkdir(exist_ok=True)
    frames = await download_frames(session, entry, frames_dir, name)
    print(f"  Downloaded {len(frames)} frames")

    # Chroma key + resize + pad to 256x256
    keyed_dir = work / "keyed"
    keyed_dir.mkdir(exist_ok=True)
    keyed = []
    for fp in frames:
        kp = keyed_dir / fp.name
        subprocess.run([
            "convert", str(fp),
            "-fuzz", "25%", "-transparent", "#00FF00",
            "-resize", f"{CHAR_W}x{CHAR_H}",
            "-gravity", "center", "-background", "none", "-extent", f"{CHAR_W}x{CHAR_H}",
            str(kp)
        ], check=True)
        keyed.append(kp)

    # Assemble spritesheet
    output = variant["output"]
    subprocess.run(["convert"] + [str(f) for f in keyed] + ["+append", str(output)], check=True)
    print(f"  Spritesheet: {output} ({len(keyed)} frames @ {CHAR_W}x{CHAR_H})")


async def main():
    print("=== Scruff Idle Variant Spritesheets ===")
    WORK_DIR.mkdir(parents=True, exist_ok=True)

    # Composite source on green screen
    green_path = WORK_DIR / "source_green.png"
    subprocess.run([
        "convert", "-size", f"{WAN_W}x{WAN_H}", "xc:#00FF00",
        str(SOURCE), "-gravity", "center", "-resize", f"{WAN_W}x{WAN_H}", "-composite",
        str(green_path)
    ], check=True)

    async with aiohttp.ClientSession() as session:
        uploaded = await upload_image(session, green_path)
        print(f"Uploaded source as: {uploaded}")

        for variant in VARIANTS:
            await generate_variant(session, variant, uploaded)

    print("\n=== All variants generated! ===")


if __name__ == "__main__":
    asyncio.run(main())
