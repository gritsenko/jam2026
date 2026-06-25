#!/usr/bin/env python3
"""Pack per-direction turret frames into uniform 8-cell aim strips.

Each attacking turret has 8 facing frames (N, NE, E, SE, S, SW, W, NW) under
tools/dir_frames/<prefix>_d{0..7}.png. This packs them into one horizontal strip
of 8 EQUAL cells -> assets/sprites/<iconKey>_dirs.png, which SlotView slices and
swaps to aim the turret (see src/ui/SlotView.ts). Equal cells guarantee the
turret never jumps size/position as the facing changes.

Workflow to refine later: regenerate/redraw the 8 frames for a turret (keeping
the d0..d7 = N..NW clockwise convention and a roughly centered subject), drop
them in tools/dir_frames/, then re-run:

    tools\\.venv\\Scripts\\python.exe tools\\pack_dirs.py

Restart the Vite dev server afterward (the sprite glob resolves at startup).
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
FRAMES = ROOT / "tools" / "dir_frames"
SPRITES = ROOT / "assets" / "sprites"
CELL = 256   # px per direction cell (square)
PAD = 10     # transparent margin inside each cell
N = 8

# prefix in tools/dir_frames -> output icon key (matches CardDef.iconKey)
TURRETS = {
    "plasma": "plasma_shutter",
    "frost": "frost_pulse",
    "storm": "storm_coil",
    "rail": "railgun",
}


def fit_center(im: Image.Image, box: int) -> Image.Image:
    """Scale to fit within box (keep aspect) and center on a transparent square."""
    im = im.copy()
    im.thumbnail((box - 2 * PAD, box - 2 * PAD), Image.LANCZOS)
    cell = Image.new("RGBA", (box, box), (0, 0, 0, 0))
    cell.alpha_composite(im, ((box - im.width) // 2, (box - im.height) // 2))
    return cell


def main() -> int:
    for prefix, key in TURRETS.items():
        try:
            frames = [Image.open(FRAMES / f"{prefix}_d{i}.png").convert("RGBA") for i in range(N)]
        except FileNotFoundError as e:
            print(f"SKIP {key}: missing frame ({e.filename})")
            continue
        strip = Image.new("RGBA", (CELL * N, CELL), (0, 0, 0, 0))
        for i, f in enumerate(frames):
            strip.alpha_composite(fit_center(f, CELL), (i * CELL, 0))
        out = SPRITES / f"{key}_dirs.png"
        strip.save(out, "PNG")
        print(f"packed {out.name}  ({strip.width}x{strip.height})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
