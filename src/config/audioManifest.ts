/**
 * Single source of truth for every sound in the game (mirror of assetManifest.ts
 * but for audio). Keys follow the on-disk convention: the game references a key,
 * AudioBus loads assets/audio/<key>.mp3 when present and otherwise stays silent —
 * so the whole shell is fully playable before any audio exists.
 *
 * `prompt` is the English description fed to a text-to-audio model
 * (ElevenLabs Sound Effects). It doubles as living documentation of what each
 * sound should feel like. Prompts lean on "soft / smooth / clean / warm" wording
 * on purpose — the raw model skews harsh, so we steer it toward polished,
 * meaning-fitting results rather than literal noise.
 *
 * `kind` routes the clip to a mixer bus with its own volume slider:
 *   - 'music' → looping background tracks (one at a time, crossfaded)
 *   - 'sfx'   → gameplay effects (towers, enemies, cards, stingers)
 *   - 'ui'    → system/interface effects (clicks, reroll, menu)
 *
 * Authoring guidance for whoever regenerates these:
 *   - SFX: short and punchy, mono. Export mp3. Trim silence.
 *   - Music: seamless LOOP, no vocals (the engine loops the clip).
 * Drop the resulting files into assets/audio/ and restart the dev server
 * (the glob in AudioBus resolves at startup, same as sprites).
 */

export type AudioKind = 'music' | 'sfx' | 'ui';

export interface AudioSpec {
  readonly key: string;
  readonly kind: AudioKind;
  /** English text-to-audio prompt. */
  readonly prompt: string;
  /** Per-clip mix level (0..1). Tune so nothing clips when many SFX overlap. */
  readonly volume: number;
}

export const AUDIO: AudioSpec[] = [
  // ---- Music (seamless loops, one plays per scene) -------------------------
  {
    key: 'music_menu',
    kind: 'music',
    volume: 0.55,
    prompt:
      'calm cyberpunk synthwave music loop, warm analog pad chords with a gentle hopeful arpeggio, soft and atmospheric, clean, instrumental, around 80 bpm',
  },
  {
    key: 'music_map',
    kind: 'music',
    volume: 0.5,
    prompt:
      'light airy ambient electronic music loop, soft plucks and warm pads with a subtle gentle pulse, curious and optimistic, instrumental, around 90 bpm',
  },
  {
    key: 'music_battle',
    kind: 'music',
    volume: 0.45,
    prompt:
      'driving dark synth music loop, pulsing bass arpeggio with steady punchy electronic percussion, tense industrial cyberpunk energy, instrumental, around 120 bpm',
  },

  // ---- Gameplay SFX: cards / placement -------------------------------------
  {
    key: 'sfx_pickup',
    kind: 'sfx',
    volume: 0.5,
    prompt:
      'picking up a holographic card, soft airy lift swish with a gentle digital shimmer, light and tactile, smooth, 0.3 seconds',
  },
  {
    key: 'sfx_place',
    kind: 'sfx',
    volume: 0.6,
    prompt:
      'placing a turret onto a board slot, soft satisfying click-thunk with a warm electronic confirm shimmer, clean and tactile, not harsh, 0.4 seconds',
  },
  {
    key: 'sfx_merge',
    kind: 'sfx',
    volume: 0.65,
    prompt:
      'two pieces merging and upgrading, smooth rising harmonic shimmer resolving to a warm bright chime, magical and satisfying, 0.7 seconds',
  },
  {
    key: 'sfx_fusion',
    kind: 'sfx',
    volume: 0.65,
    prompt:
      'magical fusion crafting, swirling energetic shimmer rising into a sparkling resolve, smooth and alchemical, 0.9 seconds',
  },
  {
    key: 'sfx_burn',
    kind: 'sfx',
    volume: 0.6,
    prompt:
      'feeding a card into an energy reactor, smooth deep whoosh with a soft warm fiery surge and a rising power charge, satisfying and natural, not harsh or noisy, 0.8 seconds',
  },

  // ---- Gameplay SFX: reward pickup (random variant on collect) -------------
  // Externally sourced clips; one of the N variants plays each time the reward
  // tokens land on the HUD chip. See playOneOf() / streamReward().
  { key: 'sfx_gold1', kind: 'sfx', volume: 0.5, prompt: 'collecting gold coins, bright pleasant metallic coin chime, satisfying, short' },
  { key: 'sfx_gold2', kind: 'sfx', volume: 0.5, prompt: 'collecting gold coins, bright pleasant metallic coin chime, satisfying, short (variant)' },
  { key: 'sfx_gold3', kind: 'sfx', volume: 0.5, prompt: 'collecting gold coins, bright pleasant metallic coin chime, satisfying, short (variant)' },
  { key: 'sfx_crystal1', kind: 'sfx', volume: 0.55, prompt: 'collecting a crystal, clear glassy crystalline sparkle chime, magical, short' },
  { key: 'sfx_crystal2', kind: 'sfx', volume: 0.55, prompt: 'collecting a crystal, clear glassy crystalline sparkle chime, magical, short (variant)' },
  { key: 'sfx_crystal3', kind: 'sfx', volume: 0.55, prompt: 'collecting a crystal, clear glassy crystalline sparkle chime, magical, short (variant)' },

  // ---- Gameplay SFX: combat ------------------------------------------------
  {
    key: 'sfx_shoot',
    kind: 'sfx',
    volume: 0.45,
    prompt:
      'soft sci-fi energy bolt, smooth synthetic laser pew, light and clean, gentle not piercing, 0.25 seconds',
  },
  {
    key: 'sfx_hit',
    kind: 'sfx',
    volume: 0.5,
    prompt:
      'soft energy projectile impact, gentle electric tick with a subtle warm thump, 0.2 seconds',
  },
  {
    key: 'sfx_crit',
    kind: 'sfx',
    volume: 0.65,
    prompt:
      'powerful critical energy strike, deep satisfying impact with a bright crystalline sparkle tail, punchy but smooth, 0.5 seconds',
  },
  {
    key: 'sfx_enemy_die',
    kind: 'sfx',
    volume: 0.55,
    prompt:
      'small sci-fi drone dissolving, soft digital poof with a gentle descending shimmer, satisfying not crunchy, 0.5 seconds',
  },
  {
    key: 'sfx_leak',
    kind: 'sfx',
    volume: 0.85,
    prompt:
      'enemy breaches the core and deals damage, strong clear impact hit with a deep heavy boom and a short alarming distorted synth blare, punchy and very noticeable, urgent warning, not muffled, 1 second',
  },
  {
    key: 'sfx_disrupt',
    kind: 'sfx',
    volume: 0.55,
    prompt:
      'electronic interference jamming a tower, smooth glitchy modulated warble, eerie and wobbly, not harsh static, 0.5 seconds',
  },
  {
    key: 'sfx_barrier',
    kind: 'sfx',
    volume: 0.5,
    prompt:
      'energy shield forming, soft shimmering whoosh with a warm protective hum, magical and gentle, 0.5 seconds',
  },

  // ---- Gameplay SFX: stingers ----------------------------------------------
  {
    key: 'sfx_wave_start',
    kind: 'sfx',
    volume: 0.6,
    prompt:
      'wave incoming, smooth rising tense synth swell with a soft warning pulse, cinematic, 0.9 seconds',
  },
  {
    key: 'sfx_wave_clear',
    kind: 'sfx',
    volume: 0.6,
    prompt:
      'wave cleared, gentle uplifting two-note synth chime, warm and rewarding, 0.6 seconds',
  },
  {
    key: 'sfx_victory',
    kind: 'sfx',
    volume: 0.7,
    prompt:
      'victory fanfare, warm triumphant uplifting synth chord swell with a shimmering bright resolve, 2.5 seconds',
  },
  {
    key: 'sfx_defeat',
    kind: 'sfx',
    volume: 0.7,
    prompt:
      'defeat, soft somber descending synth pad with a deep low power-down hum, melancholic, 2.5 seconds',
  },

  // ---- UI / system effects -------------------------------------------------
  {
    key: 'sfx_click',
    kind: 'ui',
    volume: 0.45,
    prompt:
      'minimal clean UI tap, soft subtle digital tick, gentle and crisp, 0.15 seconds',
  },
  {
    key: 'sfx_reroll',
    kind: 'ui',
    volume: 0.5,
    prompt:
      'UI card shuffle, light quick digital riffle with a soft airy sweep, clean, 0.5 seconds',
  },
];

/** Per-clip volume by key (1 if unknown). */
export const AUDIO_VOLUME: Record<string, number> = Object.fromEntries(
  AUDIO.map((a) => [a.key, a.volume]),
);

/** Which mixer bus each key routes to (defaults to 'sfx' if unknown). */
export const AUDIO_KIND: Record<string, AudioKind> = Object.fromEntries(
  AUDIO.map((a) => [a.key, a.kind]),
);
