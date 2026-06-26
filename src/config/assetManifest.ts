import { COLORS, ELEMENTS } from '../theme';

/**
 * The single source of truth for every game asset.
 *
 * Keys follow the project's on-disk convention (see CLAUDE.md): card art is
 * named by the card id from docs/cards.json. The AssetLoader loads
 * assets/sprites/<key>.png when present and otherwise builds a themed
 * placeholder, so the whole shell is playable before art exists.
 * `prompt`/`category`/`size` feed tools/gen_sprite.py (mirrored in
 * tools/assets.manifest.json).
 *
 * Status note (2026): the whole gameplay set was re-skinned to one style — flat
 * flash-cartoon (Iron Marines / Kingdom Rush) + dark dieselpunk metal, anchored
 * to docs/visual_refs/new_style.jpg. On disk: backgrounds, platform, 6 towers
 * (hand-made) + 2 `<id>_dirs` 3×3 aim sheets for the rotating turrets
 * (plasma_shutter, railgun; other towers are static), 5 enemies, map nodes,
 * icon_star, the 3 modernization cards, the sym_* element marks. The HUD chrome
 * is procedural (drawPanel /
 * PlatformGrid.buildPlate), so the legacy ui_panel/ui_button/ui_card_frame keys
 * are unused. Only decor_pylon (unwired) and icon_reactor (uses ui_button_overdrive
 * via ASSET_FALLBACKS) still resolve to a placeholder.
 */
export type AssetCategory =
  | 'background'
  | 'card_icon'
  | 'tower'
  | 'enemy'
  | 'icon'
  | 'ui'
  | 'prop';

export interface PlaceholderSpec {
  readonly shape: 'rect' | 'round' | 'disc' | 'star';
  readonly tint: number;
  readonly label: string;
}

export interface AssetSpec {
  readonly key: string;
  readonly category: AssetCategory;
  readonly size: number;
  /** English subject only — gen_sprite.py adds the shared style preamble. */
  readonly prompt: string;
  readonly placeholder: PlaceholderSpec;
}

const F = ELEMENTS.Fire.base;
const W = ELEMENTS.Water.base;
const E = ELEMENTS.Electricity.base;
const P = ELEMENTS.Physical.base;
const N = ELEMENTS.Energy.base;

export const ASSETS: AssetSpec[] = [
  // ---- Backgrounds ---------------------------------------------------------
  {
    // Neutral battle backdrop: a dark, low-contrast steel/stone wall with faint
    // embossed gears. Deliberately quiet so it never competes with the platform,
    // cards and energy beams (unlike the busy bg_level canyon).
    key: 'bg_arena',
    category: 'background',
    size: 1024,
    prompt: 'dark industrial steel and stone backdrop wall, muted desaturated charcoal and warm grey-brown tones, faint embossed gears and riveted metal panels in the same dark tone, low contrast, soft even ambient lighting, gentle dark vignette toward all edges, calm neutral non-distracting backdrop, no bright highlights, no focal subject',
    placeholder: { shape: 'rect', tint: 0x1c1712, label: '' },
  },
  {
    key: 'bg_level',
    category: 'background',
    // Square (1:1) so it fills the near-square mobile play area; the platform
    // sits in the open center and enemies walk the looping road ring.
    size: 1024,
    prompt: 'top-down desert canyon battle arena, a worn dirt enemy road looping in a rounded square ring around a large open flat sandy plateau in the center, scattered rocks ruins and gears, warm tones, no characters (square 1:1)',
    placeholder: { shape: 'rect', tint: 0x2e2013, label: '' },
  },

  // ---- Per-level arena backgrounds -----------------------------------------
  // One themed arena per campaign level, keyed `bg_<levelId>` so BattleScene can
  // resolve it directly from the level id. CRUCIAL: the worn road painted into
  // each image follows the SAME shape as that level's enemy path (combatRules
  // ENEMY_PATHS / levelCombat.pathId) so the baked road matches where the units
  // actually walk — full ring for `bottom` levels, an L-bracket on two edges for
  // the `top`/`left`/`right` sweeps (the opposite corner is left open). The road
  // sits inset from the frame edges in the 0.16/0.84 band and never crosses the
  // open central plateau (the platform's seat). The precise route is still
  // re-traced on top procedurally (BattleScene.drawRoad), so these only need to
  // be approximately on-band. Any missing PNG falls back to `bg_level` (the
  // generic ring) via ASSET_FALLBACKS, so the shell stays playable.
  {
    key: 'bg_lvl_1', // Sunbaked Gulch — ring (bottom)
    category: 'background',
    size: 1024,
    prompt: 'top-down sunbaked desert gulch battle arena, dry cracked warm clay and scattered sandstone rocks, a worn dirt enemy road looping in a rounded square ring inset from the frame edges around a large open flat plateau in the center (the road never crosses the center), warm golden tones, no characters (square 1:1)',
    placeholder: { shape: 'rect', tint: 0x3a2a16, label: '' },
  },
  {
    key: 'bg_lvl_2', // Rusted Spillway — ring (bottom)
    category: 'background',
    size: 1024,
    prompt: 'top-down abandoned rusted industrial water-spillway battle arena, rusty riveted metal channels and dried teal water stains on cracked concrete, a worn enemy road looping in a rounded square ring inset from the frame edges around a large open flat plateau in the center (the road never crosses the center), warm rust and brown tones, no characters (square 1:1)',
    placeholder: { shape: 'rect', tint: 0x3a2418, label: '' },
  },
  {
    key: 'bg_lvl_3', // Static Mesa — ring (bottom)
    category: 'background',
    size: 1024,
    prompt: 'top-down high desert mesa battle arena crackling with static electricity, violet electric arcs and glowing tesla nodes along the rocks, a worn enemy road looping in a rounded square ring inset from the frame edges around a large open flat plateau in the center (the road never crosses the center), warm rock tones with violet electric glow, no characters (square 1:1)',
    placeholder: { shape: 'rect', tint: 0x2a2438, label: '' },
  },
  {
    key: 'bg_lvl_4', // Ember Hollow — L bracket on top + right edges (pathId 'top')
    category: 'background',
    size: 1024,
    prompt: 'top-down volcanic ember-hollow battle arena, charred black volcanic rock with glowing molten-orange lava cracks and drifting ember sparks, a worn enemy road that runs horizontally across the top and turns at the upper-right corner to run straight down the right side, forming a backwards-L bracket hugging the top and right edges inset from the frame, the lower-left half is open empty ground with no road, a large open flat plateau fills the center, dark rock with fiery orange glow, no characters (square 1:1)',
    placeholder: { shape: 'rect', tint: 0x2e1410, label: '' },
  },
  {
    key: 'bg_lvl_5', // Glass Dunes — L bracket on left + top edges (pathId 'left')
    category: 'background',
    size: 1024,
    prompt: 'top-down fused-glass desert dunes battle arena, smooth vitrified pale sand with turquoise and teal glass shards catching light, a worn enemy road that runs vertically up the left side and turns at the upper-left corner to run horizontally across the top, forming an L bracket hugging the left and top edges inset from the frame, the lower-right half is open empty ground with no road, a large open flat plateau fills the center, warm sand with cool turquoise glass accents, no characters (square 1:1)',
    placeholder: { shape: 'rect', tint: 0x1c2a2a, label: '' },
  },
  {
    key: 'bg_lvl_6', // Coolant Ridge — L bracket on right + bottom edges (pathId 'right')
    category: 'background',
    size: 1024,
    prompt: 'top-down frozen coolant-ridge battle arena, pale cyan ice and frost over dark rock with teal coolant pools and snow patches, a worn enemy road that runs vertically down the right side and turns at the lower-right corner to run horizontally across the bottom, forming an L bracket hugging the right and bottom edges inset from the frame, the upper-left half is open empty ground with no road, a large open flat plateau fills the center, cold cyan and teal tones, no characters (square 1:1)',
    placeholder: { shape: 'rect', tint: 0x1a2630, label: '' },
  },
  {
    key: 'bg_lvl_7', // Overload Spire — ring (bottom), climactic finale
    category: 'background',
    size: 1024,
    prompt: 'top-down overloaded reactor-spire battle arena, dark dieselpunk metal deck with glowing energy conduits and an intense multi-colored energy storm crackling around the edges, a worn enemy road looping in a rounded square ring inset from the frame edges around a large open flat plateau in the center (the road never crosses the center), dark metal with vivid glowing energy accents, no characters (square 1:1)',
    placeholder: { shape: 'rect', tint: 0x251a2e, label: '' },
  },
  {
    key: 'bg_menu',
    category: 'background',
    size: 1024,
    prompt: 'vast desert canyon at warm golden sunset, distant rune-carved mesas, heat haze, dramatic sky',
    placeholder: { shape: 'rect', tint: COLORS.bgCanyon, label: '' },
  },
  {
    // Campaign map: a tall 9:16 journey whose seven themed regions are stacked
    // bottom→top in campaign order, so each level node's `ny` (levels.ts — a
    // serpentine climbing from lvl_1 at the bottom to lvl_7 at the top) lands it
    // on the matching biome. The brass trail + nodes are drawn over it by
    // WorldMapScene; this only supplies the banded backdrop.
    key: 'bg_worldmap',
    category: 'background',
    size: 1536,
    prompt: 'top-down stylized hand-painted fantasy campaign world-map, tall portrait orientation, a single worn trail snaking in a serpentine zigzag from the bottom edge up to the top edge, passing seven distinct themed regions stacked vertically in order from bottom to top: at the very bottom a warm sunbaked desert gulch of dry cracked canyons; above it rusted industrial water-spillway ruins with teal water channels and gears; then a rocky mesa crackling with violet static electricity; in the middle a glowing molten volcanic hollow with orange lava cracks; above it pale turquoise fused-glass dunes; then a frozen cyan coolant ridge with ice and snow; and at the very top a towering glowing energy reactor spire; warm sandy palette at the bottom shifting smoothly to cold blue and vivid energy-glow tones at the top, no characters, no text, no labels',
    placeholder: { shape: 'rect', tint: 0x3a2a18, label: '' },
  },

  // ---- Platform + props ----------------------------------------------------
  {
    key: 'base_platform',
    category: 'prop',
    size: 1024,
    prompt: 'dieselpunk tower-defense battle platform, a heavy square dark gunmetal iron plate with bolted riveted edges and a few rust streaks, its flat top surface holds nine recessed metal build sockets in a clean 3x3 grid linked by glowing blue energy channels, dark weathered steel with brass bolt accents and glowing blue energy at the socket rims, chunky industrial beveled sides, three-quarter top-down view',
    placeholder: { shape: 'round', tint: COLORS.metalMid, label: '' },
  },
  {
    // The in-battle platform BOARD: a top-down dark-steel plate whose nine recessed
    // sockets ARE the build slots. PlatformGrid draws this instead of the old
    // procedural octagon, and SlotView no longer paints a socket — the art provides
    // them. Slot geometry is traced from this art (gridMetrics in
    // platformGeometry.ts): sockets centered, inter-socket pitch ≈310/1024 of the
    // plate, inner socket ≈235/1024. Hand-made (docs/visual_refs/visual_sources/
    // board1.psd), NOT gen_sprite. (base_platform stays the menu's 3/4 hero plate.)
    key: 'platform_board',
    category: 'prop',
    size: 1024,
    prompt: 'top-down dark dieselpunk iron tower-defense battle platform plate with riveted chamfered edges and rust streaks, nine large recessed metal build sockets in a clean 3x3 grid, transparent background around the plate, hand-made (board1.psd), not gen_sprite',
    placeholder: { shape: 'round', tint: COLORS.metalMid, label: '' },
  },
  {
    key: 'logo_title',
    category: 'prop',
    size: 1024,
    prompt: 'ornate brass game-title emblem plate, energy crystals and gears, blank banner center for a logo',
    placeholder: { shape: 'round', tint: COLORS.brass, label: '' },
  },
  {
    key: 'decor_pylon',
    category: 'prop',
    size: 512,
    prompt: 'weathered desert signal pylon with a glowing crystal antenna, leaning',
    placeholder: { shape: 'round', tint: 0x4a3a26, label: '' },
  },

  // ---- Hero + frame --------------------------------------------------------
  {
    key: 'hero_avatar',
    category: 'icon',
    size: 256,
    prompt: 'rugged desert engineer hero portrait, brass goggles and headset, confident half-smile, bust shot',
    placeholder: { shape: 'disc', tint: 0x7a5a36, label: 'HERO' },
  },
  {
    key: 'frame_avatar',
    category: 'ui',
    size: 256,
    prompt: 'ornate filigree brass portrait frame, circular, steampunk rivets and gears, empty transparent center',
    placeholder: { shape: 'disc', tint: COLORS.brass, label: '' },
  },

  // ---- Resource icons ------------------------------------------------------
  {
    key: 'icon_gold',
    category: 'icon',
    size: 256,
    prompt: 'stack of glowing gold coins, chunky readable silhouette',
    placeholder: { shape: 'disc', tint: COLORS.gold, label: 'G' },
  },
  {
    key: 'icon_crystal',
    category: 'icon',
    size: 256,
    prompt: 'cluster of glowing blue energy crystals',
    placeholder: { shape: 'disc', tint: COLORS.crystal, label: 'C' },
  },
  {
    key: 'icon_synergy',
    category: 'icon',
    size: 256,
    prompt: 'green synergy spark emblem, interlocking glowing energy rings',
    placeholder: { shape: 'disc', tint: COLORS.synergy, label: 'SP' },
  },
  {
    key: 'icon_energy',
    category: 'icon',
    size: 256,
    prompt: 'glowing energy bolt token, brass ring',
    placeholder: { shape: 'disc', tint: COLORS.energyOk, label: 'E' },
  },
  {
    // Referenced by ReactorZone; prefers ui_button_overdrive via ASSET_FALLBACKS
    // when present, otherwise falls back to this themed placeholder (not magenta).
    key: 'icon_reactor',
    category: 'icon',
    size: 256,
    prompt: 'burning reactor furnace pictogram, orange flame inside a brass ring, hazard styling',
    placeholder: { shape: 'disc', tint: COLORS.reactor, label: 'CORE' },
  },
  {
    // End-of-level star rating on the result banner (v3 §10.Г). Filled stars draw
    // this texture as-is; empty stars reuse it tinted/dimmed. Until the PNG exists,
    // the star-shaped placeholder (see AssetLoader) keeps the rating readable.
    key: 'icon_star',
    category: 'icon',
    size: 256,
    prompt: 'glowing gold five-point reward star, brass rim, clean readable game UI icon',
    placeholder: { shape: 'star', tint: COLORS.gold, label: '' },
  },

  // ---- UI chrome -----------------------------------------------------------
  {
    key: 'ui_button',
    category: 'ui',
    size: 512,
    prompt: 'blank gold tower-defense button plate, glossy bevel, brass rim',
    placeholder: { shape: 'round', tint: COLORS.brass, label: '' },
  },
  {
    key: 'ui_panel',
    category: 'ui',
    size: 512,
    prompt: 'ornate horizontal HUD panel, brass frame with lion-head crests and gem corners, stone center',
    placeholder: { shape: 'round', tint: COLORS.metalMid, label: '' },
  },
  {
    key: 'ui_card_frame',
    category: 'ui',
    size: 512,
    prompt: 'ornate filigree card frame, brass and steel with gears, empty transparent center, portrait',
    placeholder: { shape: 'round', tint: COLORS.brass, label: '' },
  },
  {
    key: 'ui_button_overdrive',
    category: 'ui',
    size: 512,
    prompt: 'round reactor overdrive button, orange swirling plasma core, yellow-black hazard ring, brass bezel',
    placeholder: { shape: 'disc', tint: COLORS.reactor, label: 'BURN' },
  },

  // ---- Tower art (keyed by card id) ----------------------------------------
  // `<id>` is the tower's hand-card art. Rotating turrets (plasma_shutter,
  // railgun) ALSO have an `<id>_dirs` 3×3 directional sheet that the slot slices
  // to aim at the lead enemy (see the "Turret aim sheets" block); for those the
  // in-game tower renders from the sheet, not `<id>`. Non-rotating towers
  // (frost_pulse, storm_coil, shield_generator, grid_stabilizer) are a single
  // static sprite. Hybrids have dedicated iconKeys (see fusion-hybrid-assets.md);
  // until PNGs land, ASSET_FALLBACKS may point at a parent tower.
  {
    key: 'plasma_shutter',
    category: 'tower',
    size: 512,
    prompt: 'fire turret base mount, a chunky armored circular turntable with a glowing molten-orange plasma core at its center and a forward gun-mount cradle, dark burnished metal, three-quarter top-down view',
    placeholder: { shape: 'round', tint: F, label: 'FIRE' },
  },
  {
    key: 'frost_pulse',
    category: 'tower',
    size: 512,
    prompt: 'ice cannon turret base mount, a chunky armored circular turntable with a glowing pale-cyan frost crystal core and a forward gun-mount cradle, dark frosted metal, three-quarter top-down view',
    placeholder: { shape: 'round', tint: W, label: 'FROST' },
  },
  {
    key: 'storm_coil',
    category: 'tower',
    size: 512,
    prompt: 'tesla turret base mount, a chunky armored circular turntable with crackling violet electric arcs over copper rings and a glowing core, forward gun-mount cradle, dark metal, three-quarter top-down view',
    placeholder: { shape: 'round', tint: E, label: 'STORM' },
  },
  {
    key: 'railgun',
    category: 'tower',
    size: 512,
    prompt: 'heavy railgun turret base mount, a chunky reinforced steel turntable with a long rail-cradle and a glowing energy capacitor, dark gunmetal with brass bolts, three-quarter top-down view',
    placeholder: { shape: 'round', tint: P, label: 'RAILGUN' },
  },
  {
    key: 'shield_generator',
    category: 'tower',
    size: 512,
    prompt: 'shield dome generator turret, a squat armored emitter projecting a translucent glowing blue energy dome, dark metal base, three-quarter top-down view',
    placeholder: { shape: 'round', tint: P, label: 'SHIELD' },
  },
  {
    key: 'grid_stabilizer',
    category: 'tower',
    size: 512,
    prompt: 'uranium battery stabilizer cell turret, a dark metal canister with glowing green energy rods and yellow-black hazard stripes, three-quarter top-down view',
    placeholder: { shape: 'round', tint: N, label: 'CELL' },
  },

  // ---- Fusion hybrids (v2 §6.5) — see docs/planned/fusion-hybrid-assets.md ----
  {
    key: 'steam_cannon',
    category: 'tower',
    size: 512,
    prompt: 'steam cannon hybrid turret, frost and fire fusion, chunky armored turntable with hissing steam vents and orange-ice dual glow core, three-quarter top-down view',
    placeholder: { shape: 'round', tint: W, label: 'STEAM' },
  },
  {
    key: 'cryo_discharge',
    category: 'tower',
    size: 512,
    prompt: 'cryo discharge hybrid turret, tesla coil fused with frost crystals, violet lightning arcs over icy blue core on dark metal base, three-quarter top-down view',
    placeholder: { shape: 'round', tint: E, label: 'CRYO' },
  },
  {
    key: 'ion_volley',
    category: 'tower',
    size: 512,
    prompt: 'ion volley hybrid turret, rapid-fire plasma gun with electric ionizer rings, fiery orange core with violet arc accents, three-quarter top-down view',
    placeholder: { shape: 'round', tint: F, label: 'ION' },
  },
  {
    key: 'thermo_spear',
    category: 'tower',
    size: 512,
    prompt: 'thermo spear hybrid turret, railgun fused with fire, long heated rail cradle glowing molten orange on heavy gunmetal base, three-quarter top-down view',
    placeholder: { shape: 'round', tint: F, label: 'THERMO' },
  },
  {
    key: 'icebreaker',
    category: 'tower',
    size: 512,
    prompt: 'icebreaker hybrid turret, railgun fused with frost, long rail with pale cyan ice coating and frosted energy capacitor, three-quarter top-down view',
    placeholder: { shape: 'round', tint: W, label: 'ICE' },
  },
  {
    key: 'gauss_coil',
    category: 'tower',
    size: 512,
    prompt: 'gauss coil hybrid turret, railgun fused with tesla, magnetic rail with crackling violet coils and brass capacitors, three-quarter top-down view',
    placeholder: { shape: 'round', tint: E, label: 'GAUSS' },
  },

  // ---- Turret aim sheets ---------------------------------------------------
  // Hand-made 3×3 directional sprite-sheets for the rotating turrets. The 8
  // perimeter cells point outward by grid position (top row NW/N/NE … bottom row
  // SW/S/SE). Two layouts (see COMPOSED_AIM_SHEETS in cards.ts): COMPOSED sheets
  // (plasma_shutter, railgun) put a STATIONARY base in the center cell and the
  // rotating head-only on the perimeter — SlotView draws the base once and rotates
  // just the head; OLD sheets (none currently) bake a full turret into every cell
  // (center = idle) and rotate the whole sprite. Either way the facing frame is hard-
  // swapped (no crossfade) one octant at a time. SlotView slices the sheet and
  // aims it ([SlotView.sliceSheet3x3] / [BattleSim.towerAim]). NOT generated —
  // drop a transparent 3×3 sheet here as `<iconKey>_dirs.png`. Only rotating
  // turrets have one (static towers omit it → no aim).
  {
    key: 'plasma_shutter_dirs',
    category: 'tower',
    size: 1024,
    prompt: 'hand-made 3x3 directional sheet for the plasma turret (see plasma_shutter); not gen_sprite',
    placeholder: { shape: 'round', tint: F, label: '' },
  },
  {
    key: 'railgun_dirs',
    category: 'tower',
    size: 1069,
    prompt: 'hand-made 3x3 directional sheet for the gauss/railgun turret (see railgun); not gen_sprite',
    placeholder: { shape: 'round', tint: P, label: '' },
  },

  // ---- Element symbols (readability: the element motif on cards/dots/panel) -
  // One bold emblem per ElementId; key = `sym_<element lowercased>` (see
  // theme.elementSymbolKey). Shown on the card body, on the influence dots and
  // in the tower info panel so the element reads by SHAPE, not only color.
  {
    key: 'sym_fire',
    category: 'icon',
    size: 256,
    prompt: 'a single bold stylized flame emblem, teardrop fire shape, warm orange and yellow glow, strong dark outline, clean readable game UI symbol',
    placeholder: { shape: 'disc', tint: F, label: 'FIRE' },
  },
  {
    key: 'sym_water',
    category: 'icon',
    size: 256,
    prompt: 'a single bold six-point snowflake ice crystal emblem, cyan and pale white, strong dark outline, clean readable game UI symbol',
    placeholder: { shape: 'disc', tint: W, label: 'ICE' },
  },
  {
    key: 'sym_electricity',
    category: 'icon',
    size: 256,
    prompt: 'a single bold lightning bolt emblem, zigzag, violet and white glow, strong dark outline, clean readable game UI symbol',
    placeholder: { shape: 'disc', tint: E, label: 'VOLT' },
  },
  {
    key: 'sym_physical',
    category: 'icon',
    size: 256,
    prompt: 'a single bold bullet kinetic slug emblem with a sharp tip, polished steel grey, strong dark outline, clean readable game UI symbol',
    placeholder: { shape: 'disc', tint: P, label: 'KIN' },
  },
  {
    key: 'sym_energy',
    category: 'icon',
    size: 256,
    prompt: 'a single bold glowing diamond energy-cell emblem, vivid green core, strong dark outline, clean readable game UI symbol',
    placeholder: { shape: 'disc', tint: N, label: 'NRG' },
  },
  {
    // Hand-made 5×2 element-symbol sheet for the influence dots on placed towers
    // AND hand cards (row 0 = off/unlit, row 1 = on/lit; columns = SYM_SHEET_COLS
    // in src/ui/helpers.ts: Fire, Energy, Water, Electricity, Physical). Sliced in
    // helpers.sliceElementSymbolSheet; NOT gen_sprite. Replaces the old per-frame
    // down-scaled sym_ icons on the dots. Key = filename (Symbols.png).
    key: 'Symbols',
    category: 'icon',
    size: 210,
    prompt: 'hand-made 5x2 element-symbol sheet (off/on rows) for influence dots; not gen_sprite',
    placeholder: { shape: 'disc', tint: N, label: 'SYM' },
  },
  {
    // Hand-made vertical 5-frame charge/cooldown battery sheet for the placed-tower
    // charge bar (top→bottom: [0] empty/discharged, then the "ready" colors
    // [1] blue, [2] green, [3] yellow, [4] red). Sliced in helpers.sliceCooldownSheet;
    // NOT gen_sprite. The bar reveals the chosen color over the empty frame by the
    // recharge fraction; color encodes tower efficiency. Key = filename (cooldown.png).
    key: 'cooldown',
    category: 'icon',
    size: 362,
    prompt: 'hand-made vertical 5-frame battery charge sheet (empty + blue/green/yellow/red ready states) for the tower charge bar; not gen_sprite',
    placeholder: { shape: 'round', tint: W, label: 'CD' },
  },
  {
    // Hand-made dark rounded backing plate drawn behind the placed-tower influence/
    // resonance dot row (SlotView.drawDots) so the element symbols read against the
    // tower art. Key = filename.
    key: 'upgrade_back',
    category: 'icon',
    size: 114,
    prompt: 'hand-made dark rounded riveted backing plate for the tower resonance/synergy dot indicators; not gen_sprite',
    placeholder: { shape: 'round', tint: P, label: '' },
  },

  // ---- Modernization cards (global platform upgrades) ----------------------
  {
    key: 'isolation_circuit',
    category: 'card_icon',
    size: 512,
    prompt: 'isolation circuit upgrade emblem, layered brass insulation rings around a glowing green energy core, riveted heat-shield plating, no turret, three-quarter view',
    placeholder: { shape: 'round', tint: N, label: 'ISOLATE' },
  },
  {
    key: 'elemental_focus',
    category: 'card_icon',
    size: 512,
    prompt: 'elemental focus lens device, a brass prism splitting a white beam into five colored elemental rays, polished steel mount, no turret, three-quarter view',
    placeholder: { shape: 'round', tint: P, label: 'FOCUS' },
  },
  {
    key: 'emergency_overdrive',
    category: 'card_icon',
    size: 512,
    prompt: 'emergency overdrive lever, a slammed red hazard switch venting orange plasma and sparks, yellow-black warning stripes, brass housing, no turret, three-quarter view',
    placeholder: { shape: 'round', tint: F, label: 'OVERDRIVE' },
  },

  // ---- Enemies -------------------------------------------------------------
  {
    key: 'enemy_magma_brute',
    category: 'enemy',
    size: 512,
    prompt: 'armored magma brute creature, glowing molten cracks, heavy walking pose',
    placeholder: { shape: 'disc', tint: F, label: 'MAGMA' },
  },
  {
    key: 'enemy_frost_wisp',
    category: 'enemy',
    size: 512,
    prompt: 'floating frost wisp spirit, translucent icy body, trailing cold mist',
    placeholder: { shape: 'disc', tint: W, label: 'WISP' },
  },
  {
    key: 'enemy_volt_crawler',
    category: 'enemy',
    size: 512,
    prompt: 'electric crawler insectoid, crackling blue-violet energy along its carapace',
    placeholder: { shape: 'disc', tint: E, label: 'VOLT' },
  },
  {
    key: 'enemy_iron_husk',
    category: 'enemy',
    size: 512,
    prompt: 'hulking scrap-metal husk golem, riveted plates, lumbering walk',
    placeholder: { shape: 'disc', tint: P, label: 'HUSK' },
  },
  {
    key: 'enemy_disruptor',
    category: 'enemy',
    size: 512,
    prompt:
      'menacing signal-jammer saboteur drone creature, bristling with broadcast antenna spikes, glitching red and violet disruptive energy arcs crackling around it, fast aggressive low crawling pose',
    placeholder: { shape: 'disc', tint: E, label: 'JAMMER' },
  },
  // Support mobs (docs/planned/support-enemies.md): the "enemies synergize" mirror.
  // Silhouettes read as "I radiate, not attack" — auras, rings, emitters; no guns.
  {
    key: 'enemy_resonance_mote',
    category: 'enemy',
    size: 512,
    prompt:
      'floating resonance mote creature, warm amber-gold energy core, pulsing concentric aura rings rippling outward, hovering bobbing pose, no limbs',
    placeholder: { shape: 'disc', tint: N, label: 'MOTE' },
  },
  {
    key: 'enemy_coolant_mender',
    category: 'enemy',
    size: 512,
    prompt:
      'drifting coolant mender spirit, translucent teal jellyfish-like dome body, trailing restorative coolant vapor streams reaching outward, gentle floating pose',
    placeholder: { shape: 'disc', tint: W, label: 'MENDER' },
  },
  {
    key: 'enemy_aegis_beacon',
    category: 'enemy',
    size: 512,
    prompt:
      'hovering aegis beacon drone creature, faceted hexagonal energy-shield emitter nodes, projecting translucent dome barriers outward, cool blue-gold glow, steady levitating defensive pose',
    placeholder: { shape: 'disc', tint: N, label: 'BEACON' },
  },
  {
    key: 'enemy_boss_warden',
    category: 'enemy',
    size: 512,
    prompt:
      'massive grid warden boss creature, towering riveted scrap-metal golem with glowing energy grid lines across its plates, slow heavy menacing walk, dieselpunk tower-defense boss silhouette',
    placeholder: { shape: 'disc', tint: P, label: 'WARDEN' },
  },
  {
    key: 'enemy_boss_titan',
    category: 'enemy',
    size: 512,
    prompt:
      'colossal overload titan boss creature, molten reactor core chest with venting orange plasma and crackling energy crown, enormous slow lumbering final-boss silhouette, dieselpunk metal limbs',
    placeholder: { shape: 'disc', tint: F, label: 'TITAN' },
  },

  // ---- World map -----------------------------------------------------------
  {
    key: 'map_node',
    category: 'icon',
    size: 256,
    prompt: 'glowing brass map node marker with a bright energy gem at its center, available',
    placeholder: { shape: 'disc', tint: COLORS.brassLight, label: '' },
  },
  {
    key: 'map_node_locked',
    category: 'icon',
    size: 256,
    prompt: 'dim cold map node marker with an iron padlock, deactivated',
    placeholder: { shape: 'disc', tint: COLORS.metalLight, label: '' },
  },
];

export const ASSET_BY_KEY: Record<string, AssetSpec> = Object.fromEntries(
  ASSETS.map((a) => [a.key, a]),
);

/**
 * Graceful fallbacks: if a key has no real sprite yet, borrow a thematically
 * close one that does, so scenes never show a flat placeholder where we have
 * something better. Falls through to the key's own placeholder if none load.
 */
export const ASSET_FALLBACKS: Record<string, string> = {
  bg_menu: 'bg_level',
  bg_worldmap: 'bg_level',
  // Per-level arenas fall back to the generic ring backdrop until their PNG
  // exists (and for any future level id without a dedicated background).
  bg_lvl_1: 'bg_level',
  bg_lvl_2: 'bg_level',
  bg_lvl_3: 'bg_level',
  bg_lvl_4: 'bg_level',
  bg_lvl_5: 'bg_level',
  bg_lvl_6: 'bg_level',
  bg_lvl_7: 'bg_level',
  icon_reactor: 'ui_button_overdrive',
  steam_cannon: 'frost_pulse',
  cryo_discharge: 'storm_coil',
  ion_volley: 'plasma_shutter',
  thermo_spear: 'railgun',
  icebreaker: 'railgun',
  gauss_coil: 'railgun',
};
