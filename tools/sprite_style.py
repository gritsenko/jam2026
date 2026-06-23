"""Shared style configuration for sprite generation.

Tweak STYLE_PREAMBLE here to shift the whole project's look at once. It is
derived from docs/style_ref.png: polished hand-painted mobile tower-defense art
(Kingdom Rush / Clash style), NOT pixel art.
"""

# Prepended to every prompt. Keep the subject single + centered on a flat key
# background so postprocess.py can cleanly cut it out.
STYLE_PREAMBLE = (
    "2D game art asset, hand-painted semi-realistic cartoon style, polished mobile "
    "tower-defense aesthetic similar to Kingdom Rush and Clash of Clans, rich saturated "
    "colors, soft volumetric shading with warm key light from the top-left and a subtle "
    "cool rim light, clean confident outlines, sci-fi industrial-meets-fantasy theme. "
    "Single subject only, centered, the whole object visible with a small margin. "
    "Flat solid magenta #FF00FF background, evenly lit, no scenery, no cast shadow, "
    "no ground plane, no text, no labels, no UI, no frame or border, no watermark. "
)

# For full-bleed opaque assets (tiles, backgrounds) we must NOT ask for a magenta
# background — that produces a magenta margin around the scene. The art has to run
# to all four edges instead.
STYLE_PREAMBLE_FULLBLEED = (
    "2D game art, hand-painted semi-realistic cartoon style, polished mobile tower-defense "
    "aesthetic similar to Kingdom Rush and Clash of Clans, rich saturated colors, soft "
    "volumetric shading with warm light, clean confident outlines, sci-fi industrial-meets-"
    "fantasy theme. The artwork fills the entire frame edge to edge with absolutely no "
    "border, no margin, no frame, no padding around it. No text, no labels, no UI, no HUD, "
    "no watermark. "
)

# Optional per-category framing. Pass --category to gen_sprite.py.
CATEGORY_HINTS = {
    "card_icon": "Card artwork of the subject as the single focal device, front three-quarter view, fills most of the frame. ",
    "tower": "A defensive turret / tower structure shown in a three-quarter top-down view as it would sit in a build slot. ",
    "turret": "A defensive turret / tower structure shown in a three-quarter top-down view as it would sit in a build slot. ",
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
