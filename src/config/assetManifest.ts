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
 * Status note (2026): the style-validation batch already exists on disk —
 * bg_level, base_platform, plasma_shutter, the four resource icons and the
 * ui_* chrome. Everything else still resolves to a placeholder.
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
  readonly shape: 'rect' | 'round' | 'disc';
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
    prompt: 'steampunk tower-defense platform plate, brass and blue steel, nine glowing rune slots in a 3x3 grid, reactor stack at the back, three-quarter view',
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

  // ---- Card / tower art (keyed by card id) ---------------------------------
  {
    key: 'plasma_shutter',
    category: 'card_icon',
    size: 512,
    prompt: 'plasma shutter turret, glowing orange plasma core, brass and steel housing, three-quarter view',
    placeholder: { shape: 'round', tint: F, label: 'PLASMA' },
  },
  {
    key: 'frost_pulse',
    category: 'card_icon',
    size: 512,
    prompt: 'frost pulse turret, icy blue crystal emitter coils on frosted metal, three-quarter view',
    placeholder: { shape: 'round', tint: W, label: 'FROST' },
  },
  {
    key: 'storm_coil',
    category: 'card_icon',
    size: 512,
    prompt: 'storm coil tesla turret, crackling violet lightning arcs over copper rings, three-quarter view',
    placeholder: { shape: 'round', tint: E, label: 'STORM' },
  },
  {
    key: 'railgun',
    category: 'card_icon',
    size: 512,
    prompt: 'heavy railgun turret, long barrel with exposed rails, steel plating, faint sparks, three-quarter view',
    placeholder: { shape: 'round', tint: P, label: 'RAILGUN' },
  },
  {
    key: 'shield_generator',
    category: 'card_icon',
    size: 512,
    prompt: 'shield dome generator emitting a glowing protective energy cupola, brass base, three-quarter view',
    placeholder: { shape: 'round', tint: P, label: 'SHIELD' },
  },
  {
    key: 'grid_stabilizer',
    category: 'card_icon',
    size: 512,
    prompt: 'uranium battery cell stabilizer, glowing green energy rods, yellow hazard markings, three-quarter view',
    placeholder: { shape: 'round', tint: N, label: 'CELL' },
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
