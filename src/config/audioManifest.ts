/**
 * Single source of truth for every sound in the game (mirror of assetManifest.ts
 * but for audio). Keys follow the on-disk convention: the game references a key,
 * AudioBus loads assets/audio/<key>.mp3 when present and otherwise stays silent —
 * so the whole shell is fully playable before any audio exists.
 *
 * `prompt` is the English description fed to a text-to-audio model
 * (ElevenLabs Sound Effects / Stable Audio for SFX, Suno/Udio/Stable Audio for
 * music). It doubles as living documentation of what each sound should feel like.
 *
 * Authoring guidance for whoever generates these:
 *   - SFX: short (<0.6s for combat, <0.3s for UI), punchy, mono. Export mp3.
 *     Trim silence. Keep peaks consistent so nothing is jarringly loud.
 *   - Music: seamless LOOP, no intro/outro tail, no vocals, mono is fine for a
 *     jam (halves the size). 64–96 kbps mp3.
 * Drop the resulting files into assets/audio/ and restart the dev server
 * (the glob in AudioBus resolves at startup, same as sprites).
 */

export type AudioKind = 'music' | 'sfx';

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
      'calm cyberpunk synthwave main menu loop, slow warm analog pads, gentle arpeggio, hopeful and clean, no drums or light soft kick only, no vocals, seamless loop, 80 bpm',
  },
  {
    key: 'music_map',
    kind: 'music',
    volume: 0.5,
    prompt:
      'light exploratory ambient electronic loop for a level-select world map, curious and airy, soft plucks and pads, subtle pulse, optimistic, no vocals, seamless loop, 90 bpm',
  },
  {
    key: 'music_battle',
    kind: 'music',
    volume: 0.45,
    prompt:
      'driving dark synth tower-defense battle loop, pulsing bass arpeggio, tense but groovy, industrial cyber energy, steady percussion, rising urgency, no vocals, seamless loop, 120 bpm',
  },

  // ---- Combat SFX ----------------------------------------------------------
  {
    key: 'sfx_shoot',
    kind: 'sfx',
    volume: 0.5,
    prompt:
      'short sci-fi energy bolt firing zap, synthetic plasma pew with a quick electric snap, bright and light, 0.2 seconds',
  },
  {
    key: 'sfx_hit',
    kind: 'sfx',
    volume: 0.55,
    prompt:
      'short energy projectile impact, soft electric thud with a faint metallic sparkle, 0.2 seconds',
  },
  {
    key: 'sfx_crit',
    kind: 'sfx',
    volume: 0.7,
    prompt:
      'satisfying critical hit, wet electric crackle with a heavier punchy impact and bright sparkle tail, 0.3 seconds',
  },
  {
    key: 'sfx_enemy_die',
    kind: 'sfx',
    volume: 0.6,
    prompt:
      'small robotic enemy destroyed, crunchy digital pop with a short downward glitch fizzle, 0.3 seconds',
  },
  {
    key: 'sfx_leak',
    kind: 'sfx',
    volume: 0.75,
    prompt:
      'alarming core breach warning, low ominous synth hit with a brief distorted buzz, conveys taking damage, 0.4 seconds',
  },
  {
    key: 'sfx_disrupt',
    kind: 'sfx',
    volume: 0.55,
    prompt:
      'tower jammed by signal disruptor, glitchy digital stutter and static burst, malfunction, 0.3 seconds',
  },
  {
    key: 'sfx_barrier',
    kind: 'sfx',
    volume: 0.5,
    prompt:
      'force shield engaging, short shimmering energy bubble whoosh with a soft hum, 0.3 seconds',
  },

  // ---- UI / card SFX -------------------------------------------------------
  {
    key: 'sfx_click',
    kind: 'sfx',
    volume: 0.5,
    prompt:
      'crisp futuristic UI button click, clean soft synthetic tick with a tiny digital blip, 0.1 seconds',
  },
  {
    key: 'sfx_place',
    kind: 'sfx',
    volume: 0.6,
    prompt:
      'placing a turret card onto a grid slot, solid mechanical clunk with a soft electronic confirm chime, 0.25 seconds',
  },
  {
    key: 'sfx_merge',
    kind: 'sfx',
    volume: 0.7,
    prompt:
      'cards merging and upgrading, rising magical-tech power-up swell with a bright confirming sparkle, 0.5 seconds',
  },
  {
    key: 'sfx_fusion',
    kind: 'sfx',
    volume: 0.7,
    prompt:
      'two cards fusing into a hybrid, energetic alchemical fusion whoosh with a glittering resolve, 0.6 seconds',
  },
  {
    key: 'sfx_burn',
    kind: 'sfx',
    volume: 0.65,
    prompt:
      'card sacrificed into a reactor for an overdrive surge, fiery electric burn whoosh with a deep energy charge-up, 0.5 seconds',
  },
  {
    key: 'sfx_reroll',
    kind: 'sfx',
    volume: 0.55,
    prompt:
      'rerolling the hand, quick shuffling digital flurry of cards with a light synthetic sweep, 0.4 seconds',
  },

  // ---- Stingers ------------------------------------------------------------
  {
    key: 'sfx_wave_start',
    kind: 'sfx',
    volume: 0.6,
    prompt:
      'wave incoming alert, short rising sci-fi siren swell signaling enemies approaching, tense, 0.6 seconds',
  },
  {
    key: 'sfx_wave_clear',
    kind: 'sfx',
    volume: 0.6,
    prompt:
      'wave cleared confirmation, bright positive two-note synth chime, relieving and rewarding, 0.5 seconds',
  },
  {
    key: 'sfx_victory',
    kind: 'sfx',
    volume: 0.75,
    prompt:
      'victory fanfare stinger, triumphant uplifting synth chord progression with a shimmering finish, 1.5 seconds',
  },
  {
    key: 'sfx_defeat',
    kind: 'sfx',
    volume: 0.75,
    prompt:
      'defeat stinger, somber descending synth chord with a low power-down hum, the core failed, 1.5 seconds',
  },
];

/** Quick lookup of per-clip volume by key (1 if unknown). */
export const AUDIO_VOLUME: Record<string, number> = Object.fromEntries(
  AUDIO.map((a) => [a.key, a.volume]),
);
