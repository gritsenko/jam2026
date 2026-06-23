"""Sprite post-processing: chroma-key removal, despill, auto-trim, downscale.

Used by gen_sprite.py right after generation, and also runnable standalone to
re-process an already generated PNG without spending another API call:

    python tools/postprocess.py assets/raw/mushroom.png assets/sprites/mushroom.png --size 512

The generator asks the model for a flat solid background (magenta by default),
which we key out here. Keying a uniform studio background is far more reliable
than trusting the model to return a clean alpha channel.
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

# Default chroma-key color. Magenta is safer than green for this project: the
# game art uses green energy glows / UI arrows that a green key would eat.
DEFAULT_KEY = (255, 0, 255)


def load_rgba(path: str | Path) -> np.ndarray:
    return np.array(Image.open(path).convert("RGBA"))


def detect_key_color(arr: np.ndarray) -> tuple[int, int, int] | None:
    """Sample the four corners; if they agree, that's the studio background."""
    h, w = arr.shape[:2]
    s = max(2, min(h, w) // 50)  # small corner patch
    corners = [
        arr[:s, :s, :3], arr[:s, w - s:, :3],
        arr[h - s:, :s, :3], arr[h - s:, w - s:, :3],
    ]
    means = np.array([c.reshape(-1, 3).mean(axis=0) for c in corners])
    # Corners must be consistent with each other to count as a flat background.
    if means.std(axis=0).max() > 18:
        return None
    return tuple(int(round(v)) for v in means.mean(axis=0))


def chroma_key(arr: np.ndarray, key: tuple[int, int, int], tol: float = 60.0,
               despill: bool = True) -> np.ndarray:
    """Make pixels near `key` transparent, with a soft edge band + despill."""
    arr = arr.copy()
    rgb = arr[..., :3].astype(np.float32)
    dist = np.sqrt(((rgb - np.array(key, dtype=np.float32)) ** 2).sum(axis=-1))

    solid = dist < tol                      # fully keyed out
    band = (dist >= tol) & (dist < tol * 1.6)  # partial transition

    arr[solid, 3] = 0
    factor = np.clip((dist[band] - tol) / (tol * 0.6), 0.0, 1.0)
    arr[band, 3] = (arr[band, 3].astype(np.float32) * factor).astype(np.uint8)

    if despill:
        # Pull down whichever channels the key is bright in, on edge pixels,
        # to kill the colored fringe (e.g. magenta halo around the subject).
        hi = [i for i, v in enumerate(key) if v > 200]
        lo = [i for i in range(3) if i not in hi]
        if hi and lo:
            cap = arr[..., lo].max(axis=-1)
            edge = arr[..., 3] < 255
            for i in hi:
                capped = np.minimum(arr[..., i], cap)
                arr[..., i] = np.where(edge, capped, arr[..., i])
    return arr


def clean_edges(arr: np.ndarray, key: tuple[int, int, int] = (255, 0, 255),
                erode: float = 1.0, feather: float = 0.8, despill_band: int = 3) -> np.ndarray:
    """Remove the keyed-background fringe that survives a plain chroma key.

    Anti-aliased pixels along the cut edge keep full alpha *and* a tint of the
    key colour, leaving a coloured halo (e.g. a magenta ring). We:
      1) erode the alpha by ~`erode` px to drop that outer ring outright,
      2) feather the alpha slightly for a clean edge,
      3) de-spill the key colour ONLY within `despill_band` px of the cut, so
         interior art colours (warm cores, reds) are never touched.
    Works whether the alpha came from our chroma key or was already baked in.
    """
    arr = arr.copy()
    alpha = arr[..., 3]
    if alpha.min() == 255:
        return arr  # fully opaque (tile/background) — nothing to clean

    transparent = alpha < 16

    a_img = Image.fromarray(alpha, "L")
    er = int(round(erode))
    if er >= 1:
        a_img = a_img.filter(ImageFilter.MinFilter(2 * er + 1))
    if feather > 0:
        a_img = a_img.filter(ImageFilter.GaussianBlur(feather))
    new_alpha = np.array(a_img)

    hi = [i for i, v in enumerate(key) if v > 200]   # channels the key is bright in
    lo = [i for i in range(3) if i not in hi]
    if hi and lo:
        d = int(round(despill_band))
        if d >= 1:
            t_dil = np.array(
                Image.fromarray((transparent * 255).astype(np.uint8), "L")
                .filter(ImageFilter.MaxFilter(2 * d + 1))
            ) > 127
        else:
            t_dil = transparent
        band = t_dil & (new_alpha > 0)
        cap = arr[..., lo].max(axis=-1)  # the dim channel(s) set the neutral ceiling
        for i in hi:
            capped = np.minimum(arr[..., i], cap)
            arr[..., i] = np.where(band, capped, arr[..., i])

    arr[..., 3] = new_alpha
    return arr


def trim(arr: np.ndarray, alpha_thresh: int = 8, pad: int = 2) -> np.ndarray:
    """Crop transparent borders so the subject fills the frame; keep `pad` px."""
    alpha = arr[..., 3]
    ys, xs = np.where(alpha > alpha_thresh)
    if xs.size == 0:
        return arr
    x0, x1 = xs.min(), xs.max() + 1
    y0, y1 = ys.min(), ys.max() + 1
    h, w = arr.shape[:2]
    x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
    x1, y1 = min(w, x1 + pad), min(h, y1 + pad)
    return arr[y0:y1, x0:x1]


def downscale(img: Image.Image, size: int, pixel: bool = False) -> Image.Image:
    """Cap the longest side at `size`. Never upscales (keeps source quality)."""
    w, h = img.size
    if max(w, h) <= size:
        return img
    scale = size / max(w, h)
    new = (max(1, round(w * scale)), max(1, round(h * scale)))
    return img.resize(new, Image.NEAREST if pixel else Image.LANCZOS)


def _parse_key(key: str) -> tuple[int, int, int] | None:
    if key == "magenta":
        return (255, 0, 255)
    if key == "green":
        return (0, 255, 0)
    if "," in key:
        return tuple(int(x) for x in key.split(","))  # type: ignore[return-value]
    return None


def process_image(in_path: str | Path, out_path: str | Path, *, size: int = 512,
                  key: str = "auto", tol: float = 60.0, pad: int = 2,
                  pixel: bool = False, do_trim: bool = True,
                  do_key: bool = True, do_clean: bool = True,
                  clean_key: str = "magenta", erode: float = 1.0,
                  feather: float = 0.8) -> dict:
    """Full pipeline: key out background -> clean fringe -> trim -> downscale.

    key: "auto" (detect from corners), "magenta", "green", or "r,g,b".
    do_key=False / do_trim=False for opaque assets like terrain tiles.
    do_clean removes the leftover key-coloured halo (erode + edge de-spill); it
    runs even when do_key is False, so an already-keyed PNG can be cleaned up.
    """
    arr = load_rgba(in_path)
    src_w, src_h = arr.shape[1], arr.shape[0]
    used_key = None

    if do_key:
        if key == "auto":
            used_key = detect_key_color(arr)
        else:
            used_key = _parse_key(key)
        if used_key is not None:
            arr = chroma_key(arr, used_key, tol=tol)

    has_alpha = bool(arr[..., 3].min() < 255)
    if do_clean and has_alpha:
        ck = _parse_key(clean_key) or (255, 0, 255)
        arr = clean_edges(arr, ck, erode=erode, feather=feather)

    if do_trim and (used_key is not None or (do_clean and has_alpha)):
        arr = trim(arr, pad=pad)

    img = Image.fromarray(arr, "RGBA")
    img = downscale(img, size, pixel=pixel)

    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path, "PNG", optimize=True)
    return {
        "out": str(out_path),
        "source_size": (src_w, src_h),
        "final_size": img.size,
        "key": used_key,
        "bytes": out_path.stat().st_size,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description="Re-process a sprite PNG (key/trim/downscale).")
    ap.add_argument("input")
    ap.add_argument("output")
    ap.add_argument("--size", type=int, default=512, help="max longest side (px)")
    ap.add_argument("--key", default="auto", help='"auto" | "magenta" | "green" | "r,g,b"')
    ap.add_argument("--tol", type=float, default=60.0, help="chroma-key tolerance")
    ap.add_argument("--pad", type=int, default=2, help="transparent padding after trim")
    ap.add_argument("--pixel", action="store_true", help="NEAREST resize (pixel art)")
    ap.add_argument("--no-trim", action="store_true")
    ap.add_argument("--no-key", action="store_true", help="opaque asset (tiles/backgrounds)")
    ap.add_argument("--no-clean", action="store_true", help="skip edge fringe cleanup")
    ap.add_argument("--clean-key", default="magenta", help="key colour to de-spill at edges")
    ap.add_argument("--erode", type=float, default=1.0, help="alpha erosion in px (kills the fringe ring)")
    ap.add_argument("--feather", type=float, default=0.8, help="alpha feather (gaussian) in px")
    a = ap.parse_args()
    info = process_image(a.input, a.output, size=a.size, key=a.key, tol=a.tol,
                         pad=a.pad, pixel=a.pixel, do_trim=not a.no_trim,
                         do_key=not a.no_key, do_clean=not a.no_clean,
                         clean_key=a.clean_key, erode=a.erode, feather=a.feather)
    kb = info["bytes"] / 1024
    print(f"saved {info['out']}  {info['source_size']} -> {info['final_size']}  "
          f"({kb:.0f} KB, key={info['key']})")


if __name__ == "__main__":
    main()
