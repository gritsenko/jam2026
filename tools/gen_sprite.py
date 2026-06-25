#!/usr/bin/env python3
"""Generate a game sprite with Gemini ("Nano Banana") and post-process it.

    python tools/gen_sprite.py "<english prompt>" assets/sprites/<name>.png [options]

Examples:
    python tools/gen_sprite.py "plasma shutter turret, glowing orange core" assets/sprites/plasma_shutter.png --category tower
    python tools/gen_sprite.py "frost pulse turret, icy blue crystals" assets/sprites/frost_pulse.png --category card_icon --size 256
    python tools/gen_sprite.py "desert sand terrain" assets/sprites/tile_sand.png --category tile --size 512

By default the project style reference (docs/visual_refs/new_style.jpg) is
attached so every asset stays visually consistent. Pass --no-ref to disable, or
--ref <path> to use a different reference (e.g. an already-approved sprite).

The API key is read from, in order: GEMINI_API_KEY env, GOOGLE_API_KEY env,
tools/.gemini_key file, or a .env file. See tools/README.md.
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from io import BytesIO
from pathlib import Path

from PIL import Image

# Local modules (script dir is on sys.path when run as `python tools/gen_sprite.py`).
from postprocess import process_image
from sprite_style import OPAQUE_CATEGORIES, build_prompt

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_REF = ROOT / "docs" / "visual_refs" / "new_style.jpg"
RAW_DIR = ROOT / "assets" / "raw"

# Tried in order until one works. Env GEMINI_IMAGE_MODEL or --model jumps the queue.
# Names verified June 2026; the chain absorbs the -preview suffix churn between models.
MODEL_CHAIN = [
    "gemini-3.1-flash-image",          # Nano Banana 2
    "gemini-3.1-flash-image-preview",
    "gemini-3-pro-image",              # Nano Banana Pro (higher fidelity, pricier)
    "gemini-3-pro-image-preview",
    "gemini-2.5-flash-image",          # Nano Banana (cheapest, GA fallback)
]


# A real Google API key is ASCII, no spaces, ~30-60 chars (e.g. "AIza...").
# This guards against a half-edited .gemini_key.example (prose / placeholder)
# being sent verbatim as a key, which otherwise fails with a cryptic error.
_KEY_RE = re.compile(r"^[A-Za-z0-9_\-]{20,200}$")


def _looks_like_key(s: str | None) -> bool:
    return bool(s and _KEY_RE.match(s.strip()))


def _key_from_file(p: Path) -> str | None:
    """Pull the first key-looking token, tolerating prose/`KEY=val` lines."""
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line and line.split("=", 1)[0].strip() in ("GEMINI_API_KEY", "GOOGLE_API_KEY"):
            line = line.split("=", 1)[1].strip().strip('"').strip("'")
        if _looks_like_key(line):
            return line.strip()
    return None


def load_api_key() -> str | None:
    for var in ("GEMINI_API_KEY", "GOOGLE_API_KEY"):
        v = os.environ.get(var)
        if _looks_like_key(v):
            return v.strip()
    here = Path(__file__).resolve().parent
    for p in (here / ".gemini_key", ROOT / ".gemini_key",
              here / ".env", ROOT / ".env"):
        if p.exists():
            k = _key_from_file(p)
            if k:
                return k
    return None


def extract_image(resp) -> bytes | None:
    candidates = getattr(resp, "candidates", None) or []
    for cand in candidates:
        content = getattr(cand, "content", None)
        for part in (getattr(content, "parts", None) or []):
            inline = getattr(part, "inline_data", None)
            if inline and getattr(inline, "data", None):
                return inline.data
    return None


def generate(client, prompt: str, ref_path: Path | None, model_hint: str | None,
             aspect: str) -> tuple[bytes, str]:
    """Try the model chain; within each, try with/without image_config.

    Returns (image_bytes, model_used). Raises RuntimeError if nothing worked.
    """
    from google.genai import types

    contents: list = [prompt]
    if ref_path and ref_path.exists():
        contents.append(Image.open(ref_path))

    models = []
    for m in (model_hint, os.environ.get("GEMINI_IMAGE_MODEL")):
        if m and m not in models:
            models.append(m)
    for m in MODEL_CHAIN:
        if m not in models:
            models.append(m)

    errors: list[str] = []
    for model in models:
        for use_aspect in (True, False):
            try:
                cfg_kwargs = {"response_modalities": ["IMAGE"]}
                if use_aspect:
                    cfg_kwargs["image_config"] = types.ImageConfig(aspect_ratio=aspect)
                resp = client.models.generate_content(
                    model=model,
                    contents=contents,
                    config=types.GenerateContentConfig(**cfg_kwargs),
                )
                data = extract_image(resp)
                if data:
                    return data, model
                errors.append(f"{model} (aspect={use_aspect}): no image part returned")
            except Exception as e:  # noqa: BLE001 - fall through to next attempt
                errors.append(f"{model} (aspect={use_aspect}): {type(e).__name__}: {e}")
                # If the model itself is unknown/forbidden, skip its second attempt.
                msg = str(e).lower()
                if any(t in msg for t in ("not found", "404", "permission", "403",
                                          "does not exist", "unsupported")):
                    break
    raise RuntimeError("All model attempts failed:\n  " + "\n  ".join(errors))


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Generate a sprite with Gemini and post-process it.")
    ap.add_argument("prompt", help="English description of the subject")
    ap.add_argument("output", help="output PNG path, e.g. assets/sprites/foo.png")
    ap.add_argument("--category", help="card_icon|tower|turret|enemy|prop|fx|tile|background")
    ap.add_argument("--size", type=int, default=512, help="max longest side after downscale (default 512)")
    ap.add_argument("--aspect", default="1:1", help='requested aspect ratio (default "1:1")')
    ap.add_argument("--model", help="force a model id (else uses the fallback chain)")
    ap.add_argument("--ref", help="style reference image (default docs/visual_refs/new_style.jpg)")
    ap.add_argument("--no-ref", action="store_true", help="do not attach a style reference")
    ap.add_argument("--key", default="auto", help='chroma key: auto|magenta|green|"r,g,b"')
    ap.add_argument("--tol", type=float, default=60.0, help="chroma-key tolerance")
    ap.add_argument("--pixel", action="store_true", help="NEAREST downscale (pixel art)")
    ap.add_argument("--keep-raw", action="store_true", help="keep the raw generation in assets/raw/")
    a = ap.parse_args()

    key = load_api_key()
    if not key:
        print("ERROR: no API key. Put it in tools/.gemini_key (see tools/README.md) "
              "or set GEMINI_API_KEY.", file=sys.stderr)
        return 2

    try:
        from google import genai
    except ImportError:
        print("ERROR: google-genai not installed. Run:\n"
              "  tools/.venv/Scripts/python.exe -m pip install -r tools/requirements.txt",
              file=sys.stderr)
        return 2

    opaque = (a.category in OPAQUE_CATEGORIES)
    # Attach the style reference for everything except seamless tiles (where a
    # full scene reference would bleed unwanted detail into the texture).
    if a.no_ref or a.category == "tile":
        ref_path = None
    else:
        ref_path = Path(a.ref) if a.ref else DEFAULT_REF

    # Surface the style anchor in the log. A requested-but-missing ref is dropped
    # silently by generate() (line ~106), which once let assets drift off-style
    # when the default path moved -- so warn loudly instead of guessing.
    if ref_path is None:
        print("  style ref: <none>")
    elif ref_path.exists():
        print(f"  style ref: {ref_path}")
    else:
        print(f"  WARNING: style ref not found, generating WITHOUT anchor: {ref_path}",
              file=sys.stderr)

    prompt = build_prompt(a.prompt, a.category)

    client = genai.Client(api_key=key)
    print(f"generating: {a.prompt!r}  (category={a.category}, size<= {a.size})")
    try:
        data, model_used = generate(client, prompt, ref_path, a.model, a.aspect)
    except Exception as e:  # noqa: BLE001
        print(f"ERROR: {e}", file=sys.stderr)
        return 1
    print(f"  model: {model_used}")

    # Persist the raw generation, then post-process into the final asset.
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    raw_path = RAW_DIR / (Path(a.output).stem + ".raw.png")
    Image.open(BytesIO(data)).save(raw_path, "PNG")

    info = process_image(
        raw_path, a.output, size=a.size, key=a.key, tol=a.tol,
        pixel=a.pixel, do_trim=not opaque, do_key=not opaque,
    )
    if not a.keep_raw:
        try:
            raw_path.unlink()
        except OSError:
            pass

    kb = info["bytes"] / 1024
    print(f"  saved {info['out']}  {info['source_size']} -> {info['final_size']}  ({kb:.0f} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
