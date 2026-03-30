"""
Generate subtle idle animation spritesheets for all NPCs using Wan 2.2 FLF2V.

Each NPC gets a very subtle idle loop — barely perceptible breathing/shifting.
Uses green screen compositing + chroma key like the Scruff pipeline.
"""

import aiohttp
import asyncio
import subprocess
import time
from pathlib import Path

COMFYUI_URL = "http://localhost:8188"
PROJECT_ROOT = Path(__file__).parent.parent
CHARS_DIR = PROJECT_ROOT / "public" / "assets" / "characters"
WORK_DIR = PROJECT_ROOT / "tools" / "_npc_idle_work"

WAN_W = 480
WAN_H = 544
FRAMES = 25
FRAME_SIZE = 256  # Normalize all to 256x256

NPCS = [
    {
        "name": "shelly",
        "source": CHARS_DIR / "shelly-new.png",
        "prompt": "cartoon tortoise on green screen, barely perceptible breathing, very subtle shell movement, perfectly still, minimal motion, closed mouth",
        "negative": "walking, moving, head turning, mouth opening, deformation, morphing, fast motion, large movement, extra limbs, text, watermark, new objects",
        "seed": 501,
    },
    {
        "name": "pip",
        "source": CHARS_DIR / "pip-new.png",
        "prompt": "cartoon robin bird on green screen, very subtle chest breathing, barely perceptible, still pose, closed beak, minimal motion",
        "negative": "hopping, flying, walking, beak opening, head turning, deformation, morphing, fast motion, large movement, extra limbs, text, watermark, new objects",
        "seed": 502,
    },
    {
        "name": "flicker",
        "source": CHARS_DIR / "flicker-new.png",
        "prompt": "cartoon woodpecker bird on branch on green screen, very subtle breathing, barely perceptible, still on branch, closed beak, minimal motion",
        "negative": "pecking, flying, hopping, beak opening, head turning fast, deformation, morphing, fast motion, large movement, extra limbs, text, watermark, new objects",
        "seed": 503,
    },
    {
        "name": "sunny",
        "source": CHARS_DIR / "sunny-new.png",
        "prompt": "cartoon snake on green screen, very subtle breathing, barely perceptible body shifting, still coiled pose, minimal motion, tongue stays in",
        "negative": "slithering, moving, tongue flicking, striking, deformation, morphing, fast motion, large movement, extra limbs, text, watermark, new objects",
        "seed": 504,
    },
    {
        "name": "sage",
        "source": CHARS_DIR / "sage-new.png",
        "prompt": "cartoon owl on green screen, very subtle breathing, barely perceptible, still pose, occasional slow blink, minimal motion, closed beak",
        "negative": "flying, hopping, head spinning, beak opening, deformation, morphing, fast motion, large movement, extra limbs, text, watermark, new objects",
        "seed": 505,
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
        "15": {"inputs": {"filename_prefix": f"npc_{seed}", "images": ["14", 0]}, "class_type": "SaveImage"},
    }


async def upload_image(session, image_path):
    with open(image_path, 'rb') as f:
        data = aiohttp.FormData()
        data.add_field('image', f, filename=image_path.name, content_type='image/png')
        async with session.post(f"{COMFYUI_URL}/upload/image", data=data) as resp:
            return (await resp.json()).get("name", image_path.name)


async def queue_prompt(session, workflow):
    async with session.post(f"{COMFYUI_URL}/prompt", json={"prompt": workflow, "client_id": "npc-animator"}) as resp:
        return (await resp.json())["prompt_id"]


async def wait_for_completion(session, prompt_id, timeout=900):
    start = time.time()
    while time.time() - start < timeout:
        if int(time.time() - start) % 30 == 0 and time.time() - start > 5:
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


async def generate_npc(session, npc):
    name = npc["name"]
    print(f"\n{'='*50}")
    print(f"Generating idle for: {name}")

    work = WORK_DIR / name
    work.mkdir(parents=True, exist_ok=True)

    # Composite on green screen
    green_path = work / "green.png"
    subprocess.run([
        "convert", "-size", f"{WAN_W}x{WAN_H}", "xc:#00FF00",
        str(npc["source"]), "-gravity", "center", "-resize", f"{WAN_W}x{WAN_H}", "-composite",
        str(green_path)
    ], check=True)

    # Upload
    uploaded = await upload_image(session, green_path)
    print(f"  Uploaded: {uploaded}")

    # Queue FLF2V (same start+end = seamless loop)
    workflow = make_flf2v_workflow(
        uploaded, uploaded, npc["prompt"], npc["negative"],
        WAN_W, WAN_H, FRAMES, npc["seed"]
    )
    prompt_id = await queue_prompt(session, workflow)
    print(f"  Queued: {prompt_id}")

    entry = await wait_for_completion(session, prompt_id)
    print(f"  Complete!")

    # Download frames
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
            "-resize", f"{FRAME_SIZE}x{FRAME_SIZE}",
            "-gravity", "center", "-background", "none", "-extent", f"{FRAME_SIZE}x{FRAME_SIZE}",
            str(kp)
        ], check=True)
        keyed.append(kp)

    # Assemble spritesheet
    output = CHARS_DIR / f"{name}-idle-sheet.png"
    subprocess.run(["convert"] + [str(f) for f in keyed] + ["+append", str(output)], check=True)
    print(f"  Spritesheet: {output} ({len(keyed)} frames @ {FRAME_SIZE}x{FRAME_SIZE})")


async def main():
    print("=== NPC Idle Animation Pipeline ===")
    WORK_DIR.mkdir(parents=True, exist_ok=True)

    async with aiohttp.ClientSession() as session:
        for npc in NPCS:
            try:
                await generate_npc(session, npc)
            except Exception as e:
                print(f"  ERROR generating {npc['name']}: {e}")

    print("\n=== All NPCs generated! ===")


if __name__ == "__main__":
    asyncio.run(main())
