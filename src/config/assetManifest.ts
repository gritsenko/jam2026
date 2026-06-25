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
 * to docs/visual_refs/new_style.jpg. On disk: backgrounds, platform, 6 towers +
 * 4 `<id>_dirs` aim strips, 5 enemies, map nodes, icon_star, the 3 modernization
 * cards, the sym_* element marks. The HUD chrome is procedural (drawPanel /
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
  {
    key: 'bg_menu',
    category: 'background',
    size: 1024,
    prompt: 'vast desert canyon at warm golden sunset, distant rune-carved mesas, heat haze, dramatic sky',
    placeholder: { shape: 'rect', tint: COLORS.bgCanyon, label: '' },
  },
  {
    key: 'bg_worldmap',
    category: 'background',
    size: 1024,
    prompt: 'top-down stylized desert canyon region, winding dry riverbed, scattered mesas and a turquoise oasis',
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
  // `<id>` is the resting tower sprite (also the hand-card art). Attacking
  // turrets additionally have an `<id>_dirs` strip of 8 facing frames that the
  // slot swaps to aim at the lead enemy (see the "Turret aim strips" block).
  // Supports (shield/stabilizer) don't aim. Hybrids reuse their parent's art.
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

  // ---- Turret aim strips ---------------------------------------------------
  // 8-direction facing frames for the attacking turrets, packed as one uniform
  // horizontal strip (8 equal cells, N→NW clockwise) by tools/pack_dirs (NOT
  // gen_sprite — the 8 source frames are generated per direction, then packed).
  // SlotView slices the strip and swaps cells to aim; absent → the turret is
  // static. Prototype frames (see docs); refined later. Keyed `<iconKey>_dirs`.
  {
    key: 'plasma_shutter_dirs',
    category: 'tower',
    size: 2048,
    prompt: 'packed 8-direction aim strip for the fire turret (see plasma_shutter); built by tools/pack_dirs, not gen_sprite',
    placeholder: { shape: 'round', tint: F, label: '' },
  },
  {
    key: 'frost_pulse_dirs',
    category: 'tower',
    size: 2048,
    prompt: 'packed 8-direction aim strip for the ice turret (see frost_pulse); built by tools/pack_dirs, not gen_sprite',
    placeholder: { shape: 'round', tint: W, label: '' },
  },
  {
    key: 'storm_coil_dirs',
    category: 'tower',
    size: 2048,
    prompt: 'packed 8-direction aim strip for the tesla turret (see storm_coil); built by tools/pack_dirs, not gen_sprite',
    placeholder: { shape: 'round', tint: E, label: '' },
  },
  {
    key: 'railgun_dirs',
    category: 'tower',
    size: 2048,
    prompt: 'packed 8-direction aim strip for the railgun turret (see railgun); built by tools/pack_dirs, not gen_sprite',
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
  icon_reactor: 'ui_button_overdrive',
};
