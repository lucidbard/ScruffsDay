"""
Two-Pass ComfyUI Animation Pipeline for ScruffsDay

Generates seamless looping animations from static game assets using Wan 2.2:
  Pass 1 (I2V):   Original image -> text-prompted video (motion outward)
  Pass 2 (FLF2V): Last frame of pass 1 -> back to original image
  Result:          Concatenated seamless loop (4-6 seconds)

Usage:
  python tools/animate_assets.py                         # Process all assets in manifest
  python tools/animate_assets.py --asset scrub-thicket   # Process one asset by name
  python tools/animate_assets.py --list                  # List all animation targets
  python tools/animate_assets.py --comfyui-url http://192.168.1.86:8188

Requires: aiohttp, Pillow (pip install aiohttp Pillow)
"""

import aiohttp
import asyncio
import argparse
import json
import os
import struct
import sys
import time
import zlib
from pathlib import Path
from typing import Optional

# -- Configuration --

COMFYUI_URL = os.getenv("COMFYUI_URL", "http://192.168.1.86:8188")
PROJECT_ROOT = Path(__file__).parent.parent
ASSETS_DIR = PROJECT_ROOT / "public" / "assets"
OUTPUT_DIR = PROJECT_ROOT / "public" / "assets" / "animated"
FRAMES_PER_PASS = 25  # ~1.5s at 16fps. Wan requires 1 + 4*n, so 25 = 1+4*6

# -- Asset Manifest --
# Each entry: name, source image path (relative to ASSETS_DIR), prompt, asset type

ASSET_MANIFEST = [
    # Backgrounds - very subtle ambient motion (almost still, barely perceptible)
    {
        "name": "scrub-thicket",
        "source": "backgrounds/scrub-thicket-bg.png",
        "prompt": "empty landscape, no creatures, no animals, no people, very subtle light shift on foliage, barely perceptible leaf movement, calm still atmosphere",
        "negative": "animals, creatures, characters, people, figures, birds, insects, moving objects, new objects appearing, text, watermark, blurry, distorted, sudden motion, camera movement, wind, large motion, dramatic, morphing, shape change",
        "type": "background",
        "width": 1280,
        "height": 720,
    },
    {
        "name": "central-trail",
        "source": "backgrounds/central-trail-bg.png",
        "prompt": "empty landscape, no creatures, no animals, no people, very subtle ambient light shift, faint shadow movement, calm peaceful trail, barely perceptible motion",
        "negative": "animals, creatures, characters, people, figures, birds, insects, moving objects, new objects appearing, text, watermark, blurry, distorted, sudden motion, camera movement, wind, large motion, dramatic, morphing, shape change",
        "type": "background",
        "width": 1280,
        "height": 720,
    },
    {
        "name": "tortoise-burrow",
        "source": "backgrounds/tortoise-burrow-bg.png",
        "prompt": "empty landscape, no creatures, no animals, no people, very faint dust motes drifting, barely perceptible shadow shift, calm underground atmosphere",
        "negative": "animals, creatures, characters, people, figures, birds, insects, moving objects, new objects appearing, text, watermark, blurry, distorted, sudden motion, camera movement, wind, large motion, dramatic, morphing, shape change",
        "type": "background",
        "width": 1280,
        "height": 720,
    },
    {
        "name": "pine-clearing",
        "source": "backgrounds/pine-clearing-bg.png",
        "prompt": "empty landscape, no creatures, no animals, no people, very subtle dappled sunlight shift, barely perceptible pine needle movement, calm clearing",
        "negative": "animals, creatures, characters, people, figures, birds, insects, moving objects, new objects appearing, text, watermark, blurry, distorted, sudden motion, camera movement, wind, large motion, dramatic, morphing, shape change",
        "type": "background",
        "width": 1280,
        "height": 720,
    },
    {
        "name": "sandy-barrens",
        "source": "backgrounds/sandy-barrens-bg.png",
        "prompt": "empty landscape, no creatures, no animals, no people, very faint heat shimmer, barely perceptible light shift on sand, calm arid atmosphere",
        "negative": "static, frozen, text, watermark, blurry, distorted, people, characters, sudden motion, camera movement, wind, large motion, swaying, dramatic, sand blowing",
        "type": "background",
        "width": 1280,
        "height": 720,
    },
    {
        "name": "owls-overlook",
        "source": "backgrounds/owls-overlook-bg.png",
        "prompt": "empty landscape, no creatures, no animals, no people, very subtle cloud shadow drifting, barely perceptible atmospheric depth shift, calm overlook",
        "negative": "animals, creatures, characters, people, figures, birds, insects, moving objects, new objects appearing, text, watermark, blurry, distorted, sudden motion, camera movement, wind, large motion, dramatic, morphing, shape change",
        "type": "background",
        "width": 1280,
        "height": 720,
    },
    # NPCs - idle breathing/swaying animation
    {
        "name": "pip",
        "source": "characters/pip.png",
        "prompt": "small robin bird breathing gently, subtle feather ruffling, tiny head movements, alive idle animation",
        "negative": "static, frozen, large motion, walking, flying, morphing, deformation, extra limbs",
        "type": "npc",
        "width": 480,
        "height": 480,
    },
    {
        "name": "flicker",
        "source": "characters/flicker.png",
        "prompt": "woodpecker bird subtle idle animation, gentle breathing, slight head tilt, feathers ruffling softly",
        "negative": "static, frozen, large motion, walking, flying, morphing, deformation, extra limbs",
        "type": "npc",
        "width": 480,
        "height": 480,
    },
    {
        "name": "sage",
        "source": "characters/sage.png",
        "prompt": "wise owl subtle idle animation, slow gentle breathing, eyes blinking slowly, feathers shifting slightly",
        "negative": "static, frozen, large motion, walking, flying, morphing, deformation, extra limbs",
        "type": "npc",
        "width": 480,
        "height": 480,
    },
    {
        "name": "shelly",
        "source": "characters/shelly.png",
        "prompt": "gopher tortoise gentle idle animation, subtle head movement, slow breathing, peaceful resting motion",
        "negative": "static, frozen, large motion, walking, morphing, deformation, extra limbs, shell changing shape",
        "type": "npc",
        "width": 480,
        "height": 480,
    },
    {
        "name": "sunny",
        "source": "characters/sunny.png",
        "prompt": "lizard subtle idle animation, gentle breathing, slight throat pulse, tiny head movements, basking in sun",
        "negative": "static, frozen, large motion, walking, morphing, deformation, extra limbs",
        "type": "npc",
        "width": 480,
        "height": 480,
    },
]


# -- Workflow Templates --

def make_i2v_workflow(image_name: str, prompt: str, negative: str,
                      width: int, height: int, length: int, seed: int) -> dict:
    """Pass 1: Image-to-Video using Wan 2.2 with 4-step Lightning LoRA."""
    return {
        "1": {
            "inputs": {
                "unet_name": "WanVideo/2_2/Wan2_2-I2V-A14B-HIGH_fp8_e4m3fn_scaled_KJ.safetensors",
                "weight_dtype": "default"
            },
            "class_type": "UNETLoader",
            "_meta": {"title": "Load High-Noise Model"}
        },
        "2": {
            "inputs": {
                "unet_name": "WanVideo/2_2/Wan2_2-I2V-A14B-LOW_fp8_e4m3fn_scaled_KJ.safetensors",
                "weight_dtype": "default"
            },
            "class_type": "UNETLoader",
            "_meta": {"title": "Load Low-Noise Model"}
        },
        "3": {
            "inputs": {
                "clip_name": "umt5_xxl_fp8_e4m3fn_scaled.safetensors",
                "type": "wan",
                "device": "default"
            },
            "class_type": "CLIPLoader",
            "_meta": {"title": "Load CLIP"}
        },
        "4": {
            "inputs": {"vae_name": "wan_2.1_vae.safetensors"},
            "class_type": "VAELoader",
            "_meta": {"title": "Load VAE"}
        },
        "5": {
            "inputs": {"image": image_name},
            "class_type": "LoadImage",
            "_meta": {"title": "Load Source Image"}
        },
        "7": {
            "inputs": {"text": prompt, "clip": ["3", 0]},
            "class_type": "CLIPTextEncode",
            "_meta": {"title": "Positive Prompt"}
        },
        "8": {
            "inputs": {"text": negative, "clip": ["3", 0]},
            "class_type": "CLIPTextEncode",
            "_meta": {"title": "Negative Prompt"}
        },
        "98": {
            "inputs": {
                "width": width,
                "height": height,
                "length": length,
                "batch_size": 1,
                "positive": ["7", 0],
                "negative": ["8", 0],
                "vae": ["4", 0],
                "start_image": ["5", 0]
            },
            "class_type": "WanImageToVideo",
            "_meta": {"title": "I2V"}
        },
        "101": {
            "inputs": {
                "lora_name": "wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors",
                "strength_model": 1.0,
                "model": ["1", 0]
            },
            "class_type": "LoraLoaderModelOnly",
            "_meta": {"title": "Lightning LoRA (High)"}
        },
        "102": {
            "inputs": {
                "lora_name": "wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors",
                "strength_model": 1.0,
                "model": ["2", 0]
            },
            "class_type": "LoraLoaderModelOnly",
            "_meta": {"title": "Lightning LoRA (Low)"}
        },
        "9": {
            "inputs": {"shift": 5.0, "model": ["101", 0]},
            "class_type": "ModelSamplingSD3",
            "_meta": {"title": "Shift (High)"}
        },
        "10": {
            "inputs": {"shift": 5.0, "model": ["102", 0]},
            "class_type": "ModelSamplingSD3",
            "_meta": {"title": "Shift (Low)"}
        },
        "12": {
            "inputs": {
                "model": ["9", 0],
                "positive": ["98", 0],
                "negative": ["98", 1],
                "latent_image": ["98", 2],
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
            "_meta": {"title": "KSampler High-Noise"}
        },
        "13": {
            "inputs": {
                "model": ["10", 0],
                "positive": ["98", 0],
                "negative": ["98", 1],
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
            "_meta": {"title": "KSampler Low-Noise"}
        },
        "14": {
            "inputs": {"samples": ["13", 0], "vae": ["4", 0]},
            "class_type": "VAEDecode",
            "_meta": {"title": "VAE Decode"}
        },
        "15": {
            "inputs": {
                "filename_prefix": "scruffsday_i2v",
                "images": ["14", 0]
            },
            "class_type": "SaveImage",
            "_meta": {"title": "Save Frames"}
        },
    }


def make_flf2v_workflow(start_image: str, end_image: str, prompt: str, negative: str,
                        width: int, height: int, length: int, seed: int) -> dict:
    """Pass 2: First-Last-Frame-to-Video — interpolates from last frame back to original."""
    return {
        "1": {
            "inputs": {
                "unet_name": "WanVideo/2_2/Wan2_2-I2V-A14B-HIGH_fp8_e4m3fn_scaled_KJ.safetensors",
                "weight_dtype": "default"
            },
            "class_type": "UNETLoader",
            "_meta": {"title": "Load High-Noise Model"}
        },
        "2": {
            "inputs": {
                "unet_name": "WanVideo/2_2/Wan2_2-I2V-A14B-LOW_fp8_e4m3fn_scaled_KJ.safetensors",
                "weight_dtype": "default"
            },
            "class_type": "UNETLoader",
            "_meta": {"title": "Load Low-Noise Model"}
        },
        "3": {
            "inputs": {
                "clip_name": "umt5_xxl_fp8_e4m3fn_scaled.safetensors",
                "type": "wan",
                "device": "default"
            },
            "class_type": "CLIPLoader",
            "_meta": {"title": "Load CLIP"}
        },
        "4": {
            "inputs": {"vae_name": "wan_2.1_vae.safetensors"},
            "class_type": "VAELoader",
            "_meta": {"title": "Load VAE"}
        },
        "5": {
            "inputs": {"image": start_image},
            "class_type": "LoadImage",
            "_meta": {"title": "Start Frame (last frame from I2V)"}
        },
        "6": {
            "inputs": {"image": end_image},
            "class_type": "LoadImage",
            "_meta": {"title": "End Frame (original image)"}
        },
        "7": {
            "inputs": {"text": prompt, "clip": ["3", 0]},
            "class_type": "CLIPTextEncode",
            "_meta": {"title": "Positive Prompt"}
        },
        "8": {
            "inputs": {"text": negative, "clip": ["3", 0]},
            "class_type": "CLIPTextEncode",
            "_meta": {"title": "Negative Prompt"}
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
            "_meta": {"title": "FLF2V (Return to Original)"}
        },
        "101": {
            "inputs": {
                "lora_name": "wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors",
                "strength_model": 1.0,
                "model": ["1", 0]
            },
            "class_type": "LoraLoaderModelOnly",
            "_meta": {"title": "Lightning LoRA (High)"}
        },
        "102": {
            "inputs": {
                "lora_name": "wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors",
                "strength_model": 1.0,
                "model": ["2", 0]
            },
            "class_type": "LoraLoaderModelOnly",
            "_meta": {"title": "Lightning LoRA (Low)"}
        },
        "9": {
            "inputs": {"shift": 5.0, "model": ["101", 0]},
            "class_type": "ModelSamplingSD3",
            "_meta": {"title": "Shift (High)"}
        },
        "10": {
            "inputs": {"shift": 5.0, "model": ["102", 0]},
            "class_type": "ModelSamplingSD3",
            "_meta": {"title": "Shift (Low)"}
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
            "_meta": {"title": "KSampler High-Noise"}
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
            "_meta": {"title": "KSampler Low-Noise"}
        },
        "14": {
            "inputs": {"samples": ["13", 0], "vae": ["4", 0]},
            "class_type": "VAEDecode",
            "_meta": {"title": "VAE Decode"}
        },
        "15": {
            "inputs": {
                "filename_prefix": "scruffsday_flf2v",
                "images": ["14", 0]
            },
            "class_type": "SaveImage",
            "_meta": {"title": "Save Frames"}
        },
    }


# -- ComfyUI API helpers --

async def upload_image(session: aiohttp.ClientSession, base_url: str, image_path: Path) -> str:
    """Upload an image to ComfyUI and return the filename."""
    with open(image_path, 'rb') as f:
        data = aiohttp.FormData()
        data.add_field('image', f, filename=image_path.name, content_type='image/png')
        async with session.post(f"{base_url}/upload/image", data=data) as resp:
            if resp.status != 200:
                raise Exception(f"Upload failed: {resp.status} - {await resp.text()}")
            result = await resp.json()
            return result.get("name", image_path.name)


async def queue_prompt(session: aiohttp.ClientSession, base_url: str, workflow: dict) -> str:
    """Submit a workflow and return the prompt_id."""
    payload = {"prompt": workflow, "client_id": "scruffsday-animator"}
    async with session.post(f"{base_url}/prompt", json=payload) as resp:
        if resp.status != 200:
            text = await resp.text()
            raise Exception(f"Queue failed: {resp.status} - {text}")
        result = await resp.json()
        return result["prompt_id"]


async def wait_for_completion(session: aiohttp.ClientSession, base_url: str,
                               prompt_id: str, timeout: int = 600) -> dict:
    """Poll until workflow completes. Returns the history entry."""
    start = time.time()
    while time.time() - start < timeout:
        async with session.get(f"{base_url}/history/{prompt_id}") as resp:
            if resp.status == 200:
                history = await resp.json()
                if prompt_id in history:
                    entry = history[prompt_id]
                    status = entry.get("status", {})
                    if status.get("completed"):
                        return entry
                    # Check for errors
                    for msg in entry.get("messages", []):
                        if msg[0] == "execution_error":
                            raise Exception(f"Workflow failed: {msg}")
        await asyncio.sleep(3)
    raise TimeoutError(f"Workflow {prompt_id} timed out after {timeout}s")


def extract_output_images(entry: dict, comfyui_output_dir: Path) -> list[Path]:
    """Extract output image paths from a completed workflow history entry."""
    paths = []
    for node_id, node_output in entry.get("outputs", {}).items():
        for img in node_output.get("images", []):
            filename = img.get("filename")
            subfolder = img.get("subfolder", "")
            if filename:
                p = comfyui_output_dir
                if subfolder:
                    p = p / subfolder
                p = p / filename
                paths.append(p)
    return sorted(paths)


async def download_image(session: aiohttp.ClientSession, base_url: str,
                          filename: str, subfolder: str, dest: Path):
    """Download an output image from ComfyUI's /view endpoint."""
    params = {"filename": filename, "type": "output"}
    if subfolder:
        params["subfolder"] = subfolder
    async with session.get(f"{base_url}/view", params=params) as resp:
        if resp.status != 200:
            raise Exception(f"Download failed for {filename}: {resp.status}")
        dest.parent.mkdir(parents=True, exist_ok=True)
        with open(dest, 'wb') as f:
            f.write(await resp.read())


async def download_output_frames(session: aiohttp.ClientSession, base_url: str,
                                  entry: dict, dest_dir: Path, prefix: str) -> list[Path]:
    """Download all output frames from a completed workflow to local files."""
    paths = []
    frame_idx = 0
    for node_id, node_output in entry.get("outputs", {}).items():
        for img in node_output.get("images", []):
            filename = img.get("filename")
            subfolder = img.get("subfolder", "")
            if filename:
                dest = dest_dir / f"{prefix}_{frame_idx:04d}.png"
                await download_image(session, base_url, filename, subfolder, dest)
                paths.append(dest)
                frame_idx += 1
    return sorted(paths)


# -- Video encoding --

async def encode_video(frames_dir: Path, name: str, mp4_path: Path, webm_path: Path, fps: int = 16):
    """Encode frame sequence to looping MP4 and WebM using ffmpeg."""
    input_pattern = str(frames_dir / f"{name}_loop_%04d.png")

    # MP4 (H.264) — wide browser support, small file
    mp4_cmd = [
        "ffmpeg", "-y", "-framerate", str(fps),
        "-i", input_pattern,
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-crf", "23", "-preset", "medium",
        "-movflags", "+faststart",  # enable streaming
        str(mp4_path),
    ]

    # WebM (VP9) — better quality/size, good browser support
    webm_cmd = [
        "ffmpeg", "-y", "-framerate", str(fps),
        "-i", input_pattern,
        "-c:v", "libvpx-vp9", "-pix_fmt", "yuv420p",
        "-crf", "30", "-b:v", "0",
        str(webm_path),
    ]

    print(f"  Encoding MP4...")
    proc = await asyncio.create_subprocess_exec(
        *mp4_cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        print(f"  WARNING: MP4 encode failed: {stderr.decode()[-200:]}")

    print(f"  Encoding WebM...")
    proc = await asyncio.create_subprocess_exec(
        *webm_cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        print(f"  WARNING: WebM encode failed: {stderr.decode()[-200:]}")


# -- Main pipeline --

async def animate_asset(asset: dict, comfyui_url: str, seed: int = 42,
                         frames_per_pass: int = FRAMES_PER_PASS,
                         mode: str = "flf2v"):
    """
    Animate a single asset.

    Modes:
      "flf2v"   - Single FLF2V pass: same image as start+end (best for backgrounds,
                   no hallucinated objects since both endpoints are anchored)
      "two-pass" - I2V then FLF2V back (better motion range, but may hallucinate)
    """
    name = asset["name"]
    source_path = ASSETS_DIR / asset["source"]
    if not source_path.exists():
        print(f"  SKIP: Source image not found: {source_path}")
        return

    asset_output_dir = OUTPUT_DIR / name
    asset_output_dir.mkdir(parents=True, exist_ok=True)

    prompt = asset["prompt"]
    negative = asset.get("negative", "static, frozen, blurry, text, watermark")
    width = asset.get("width", 1280)
    height = asset.get("height", 720)

    print(f"\n{'='*60}")
    print(f"  Animating: {name} ({asset['type']}) [mode={mode}]")
    print(f"  Source: {source_path}")
    print(f"  Resolution: {width}x{height}, Frames/pass: {frames_per_pass}")
    print(f"{'='*60}")

    import shutil

    async with aiohttp.ClientSession() as session:
        # Upload source image
        print(f"  [1] Uploading source image...")
        uploaded_name = await upload_image(session, comfyui_url, source_path)
        print(f"      -> {uploaded_name}")

        if mode == "flf2v":
            # Single FLF2V pass: same image as start and end
            print(f"  [2] Queuing FLF2V (same start+end image)...")
            workflow = make_flf2v_workflow(
                start_image=uploaded_name,
                end_image=uploaded_name,
                prompt=prompt,
                negative=negative,
                width=width,
                height=height,
                length=frames_per_pass,
                seed=seed,
            )
            prompt_id = await queue_prompt(session, comfyui_url, workflow)
            print(f"      prompt_id: {prompt_id}")

            print(f"  [3] Waiting for completion...")
            entry = await wait_for_completion(session, comfyui_url, prompt_id)
            print(f"      Done!")

            # Download frames
            combined_dir = asset_output_dir / "loop"
            combined_dir.mkdir(exist_ok=True)
            frames = await download_output_frames(
                session, comfyui_url, entry, combined_dir, f"{name}_loop"
            )
            total_frames = len(frames)

        else:  # two-pass mode
            # -- Pass 1: I2V --
            print(f"  [2] Queuing Pass 1 (I2V)...")
            i2v_workflow = make_i2v_workflow(
                image_name=uploaded_name,
                prompt=prompt,
                negative=negative,
                width=width,
                height=height,
                length=frames_per_pass,
                seed=seed,
            )
            i2v_id = await queue_prompt(session, comfyui_url, i2v_workflow)
            print(f"      prompt_id: {i2v_id}")

            print(f"  [3] Waiting for Pass 1...")
            i2v_entry = await wait_for_completion(session, comfyui_url, i2v_id)
            print(f"      Pass 1 done!")

            pass1_dir = asset_output_dir / "pass1"
            pass1_dir.mkdir(exist_ok=True)
            pass1_frames = await download_output_frames(
                session, comfyui_url, i2v_entry, pass1_dir, f"{name}_p1"
            )
            print(f"      Downloaded {len(pass1_frames)} frames")

            if not pass1_frames:
                print(f"  ERROR: No frames from Pass 1!")
                return

            # Upload last frame for Pass 2
            last_frame = pass1_frames[-1]
            print(f"  [4] Uploading last frame for Pass 2...")
            last_frame_name = await upload_image(session, comfyui_url, last_frame)

            # -- Pass 2: FLF2V --
            print(f"  [5] Queuing Pass 2 (FLF2V: last frame -> original)...")
            flf2v_workflow = make_flf2v_workflow(
                start_image=last_frame_name,
                end_image=uploaded_name,
                prompt=prompt,
                negative=negative,
                width=width,
                height=height,
                length=frames_per_pass,
                seed=seed,
            )
            flf2v_id = await queue_prompt(session, comfyui_url, flf2v_workflow)
            print(f"      prompt_id: {flf2v_id}")

            print(f"  [6] Waiting for Pass 2...")
            flf2v_entry = await wait_for_completion(session, comfyui_url, flf2v_id)
            print(f"      Pass 2 done!")

            pass2_dir = asset_output_dir / "pass2"
            pass2_dir.mkdir(exist_ok=True)
            pass2_frames = await download_output_frames(
                session, comfyui_url, flf2v_entry, pass2_dir, f"{name}_p2"
            )
            print(f"      Downloaded {len(pass2_frames)} frames")

            # Combine passes
            combined_dir = asset_output_dir / "loop"
            combined_dir.mkdir(exist_ok=True)
            frame_idx = 0
            for f in pass1_frames:
                dest = combined_dir / f"{name}_loop_{frame_idx:04d}.png"
                shutil.copy2(f, dest)
                frame_idx += 1
            for f in pass2_frames[1:]:
                dest = combined_dir / f"{name}_loop_{frame_idx:04d}.png"
                shutil.copy2(f, dest)
                frame_idx += 1
            total_frames = frame_idx

        duration = total_frames / 16.0

        # Encode looping MP4 + WebM for game use
        mp4_path = asset_output_dir / f"{name}-loop.mp4"
        webm_path = asset_output_dir / f"{name}-loop.webm"
        await encode_video(combined_dir, name, mp4_path, webm_path, fps=16)

        # Copy videos to game assets directory
        game_video_dir = ASSETS_DIR / "animated"
        game_video_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(mp4_path, game_video_dir / f"{name}-loop.mp4")
        shutil.copy2(webm_path, game_video_dir / f"{name}-loop.webm")

        print(f"\n  Complete: {total_frames} frames, ~{duration:.1f}s loop @ 16fps")
        print(f"  Video:    {game_video_dir}/{name}-loop.mp4")
        print(f"  Frames:   {combined_dir}/")

        return {
            "name": name,
            "type": asset["type"],
            "frames": total_frames,
            "duration": duration,
            "fps": 16,
            "mp4": f"assets/animated/{name}-loop.mp4",
            "webm": f"assets/animated/{name}-loop.webm",
            "output_dir": str(combined_dir),
        }


async def main():
    parser = argparse.ArgumentParser(description="Animate ScruffsDay assets with Wan 2.2")
    parser.add_argument("--asset", type=str, help="Process single asset by name")
    parser.add_argument("--list", action="store_true", help="List all animation targets")
    parser.add_argument("--comfyui-url", type=str, default=COMFYUI_URL)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--frames", type=int, default=FRAMES_PER_PASS,
                        help=f"Frames per pass (must be 1+4*n, default {FRAMES_PER_PASS})")
    parser.add_argument("--type", type=str, choices=["background", "npc"],
                        help="Only process assets of this type")
    parser.add_argument("--mode", type=str, choices=["flf2v", "two-pass"], default="flf2v",
                        help="flf2v = single pass same start+end (no hallucination), "
                             "two-pass = I2V then FLF2V back (more motion)")
    args = parser.parse_args()

    if args.list:
        print(f"\nAnimation targets ({len(ASSET_MANIFEST)} assets):\n")
        for a in ASSET_MANIFEST:
            source = ASSETS_DIR / a["source"]
            exists = "OK" if source.exists() else "MISSING"
            print(f"  [{exists}] {a['name']:20s} ({a['type']:10s}) {a['source']}")
        return

    # Validate frames param
    if (args.frames - 1) % 4 != 0:
        print(f"ERROR: --frames must be 1 + 4*n (e.g. 17, 21, 25, 29, 33, 37, 41, 45, 49)")
        sys.exit(1)

    # Filter assets
    targets = ASSET_MANIFEST
    if args.asset:
        targets = [a for a in targets if a["name"] == args.asset]
        if not targets:
            print(f"ERROR: No asset named '{args.asset}'")
            print(f"Available: {', '.join(a['name'] for a in ASSET_MANIFEST)}")
            sys.exit(1)
    if args.type:
        targets = [a for a in targets if a["type"] == args.type]

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    print(f"ComfyUI: {args.comfyui_url}")
    print(f"Mode: {args.mode}")
    print(f"Targets: {len(targets)} assets")
    print(f"Frames/pass: {args.frames} ({args.frames/16:.1f}s @ 16fps)")

    results = []
    for asset in targets:
        try:
            result = await animate_asset(asset, args.comfyui_url, args.seed, args.frames, args.mode)
            if result:
                results.append(result)
        except Exception as e:
            print(f"\n  FAILED: {asset['name']}: {e}")

    # Write manifest of completed animations
    if results:
        manifest_path = OUTPUT_DIR / "manifest.json"
        with open(manifest_path, 'w') as f:
            json.dump(results, f, indent=2)
        print(f"\nManifest written to {manifest_path}")
        print(f"Completed {len(results)}/{len(targets)} assets")


if __name__ == "__main__":
    asyncio.run(main())
