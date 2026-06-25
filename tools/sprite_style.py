"""Shared style configuration for sprite generation.

Tweak STYLE_PREAMBLE here to shift the whole project's look at once. The target
is the look in docs/visual_refs/new_style.jpg and the Iron Marines screenshots:
bold, clean, polished hand-painted cartoon (Iron Marines / Kingdom Rush) -- NOT
photorealistic, NOT busy/over-detailed steampunk, NOT pixel art. Warm desert-
canyon base palette with glowing sci-fi element accents.
"""

# Prepended to every prompt. Keep the subject single + centered on a flat key
# background so postprocess.py can cleanly cut it out.
STYLE_PREAMBLE = (
    "2D game art asset in the flat flash-animation cartoon style of Iron Marines and "
    "Kingdom Rush: bold simplified chunky shapes, strong instantly-readable silhouette, "
    "clean uniform dark outlines around every form, FLAT cel shading built from a few "
    "simple flat shadow and highlight shapes, minimal interior detail (vector-like, low "
    "detail, no noisy texture, no fine rendering, not photorealistic, not painterly), one "
    "warm key light from the top-left with a crisp rim light, rich tasteful saturated "
    "colors. Weathered metal, stone and warm earthy palette with bright glowing sci-fi "
    "energy accents. Cohesive game-art look, sci-fi-meets-fantasy theme. "
    "Single subject only, centered, the whole object visible with a small margin. "
    "Flat solid magenta #FF00FF background, evenly lit, no scenery, no cast shadow, "
    "no ground plane, no text, no labels, no UI, no frame or border, no watermark. "
)

# For full-bleed opaque assets (tiles, backgrounds) we must NOT ask for a magenta
# background — that produces a magenta margin around the scene. The art has to run
# to all four edges instead.
STYLE_PREAMBLE_FULLBLEED = (
    "2D game art in the flat flash-animation cartoon style of Iron Marines and Kingdom "
    "Rush: bold simplified shapes, clean uniform dark outlines, FLAT cel shading from a few "
    "simple flat shadow shapes, low detail (no noisy texture, not photorealistic, not "
    "painterly), warm key light. Weathered metal, stone and warm earthy palette with "
    "glowing sci-fi energy accents, cohesive game-art look. The artwork fills the entire "
    "frame edge to edge with absolutely no border, no margin, no frame, no padding around "
    "it. No text, no labels, no UI, no HUD, no watermark. "
)

# Optional per-category framing. Pass --category to gen_sprite.py.
CATEGORY_HINTS = {
    "card_icon": "Card artwork of the subject as the single focal device, front three-quarter view, fills most of the frame. ",
    "tower": "A defensive turret / tower structure with a chunky readable base, shown in a three-quarter top-down view as it would sit in a build slot, compact and self-contained. ",
    "turret": "A defensive turret / tower structure with a chunky readable base, shown in a three-quarter top-down view as it would sit in a build slot, compact and self-contained. ",
    "enemy": "A creature / enemy character, full body, clear silhouette, side three-quarter walking pose facing left. ",
    "prop": "A single environment prop object, three-quarter view. ",
    "fx": "A stylized visual effect element on a flat background, glowing, crisp edges. ",
    "ui": "A single game UI element shown flat and front-facing (orthographic, no perspective), crisp readable shape, ornate metal-brass-and-stone styling consistent with the HUD, blank where content would go. ",
    "icon": "A single chunky game resource/UI icon, front view, bold readable silhouette, subtle bevel and glow, fills most of the frame. ",
    # Opaque, full-bleed assets -> caller should also use --key none.
    "tile": "A seamless top-down terrain tile that fills the entire frame edge to edge, no central subject. ",
    "background": "A full-bleed background scene that fills the entire frame edge to edge. ",
}

# Categories that should NOT be chroma-keyed/trimmed (full-bleed, opaque).
OPAQUE_CATEGORIES = {"tile", "background"}


def build_prompt(user_prompt: str, category: str | None = None) -> str:
    hint = CATEGORY_HINTS.get(category or "", "")
    base = STYLE_PREAMBLE_FULLBLEED if category in OPAQUE_CATEGORIES else STYLE_PREAMBLE
    return f"{base}{hint}Subject: {user_prompt}"
