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
    volume: 0.15,
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
  {
    key: 'sfx_upgrade',
    kind: 'sfx',
    volume: 0.65,
    prompt:
      'permanent base upgrade, warm rising harmonic shimmer resolving into a bright satisfying major chord chime, with a soft swelling power-up hum underneath, triumphant and rewarding, smooth and clean, 0.8 seconds',
  },

  // ---- Energy grid state + Reactor burn (player-authored clips) ------------
  // power_down/power_up are edge-triggered stingers when the energy network tips
  // into / recovers from overload (see BattleScene.refreshEnergy); impact is the
  // card-into-Reactor burn punch (replaces sfx_burn at the literal burn sites).
  {
    key: 'power_down_01',
    kind: 'sfx',
    volume: 0.5,
    prompt:
      'energy network overloading, deep descending power-down groan with a low warning hum, ominous but smooth, not harsh, 0.9 seconds',
  },
  {
    key: 'power_up_01',
    kind: 'sfx',
    volume: 0.5,
    prompt:
      'energy network recovering from overload, rising warm power-up hum resolving into a clean confirming chime, relieving and bright, 0.9 seconds',
  },
  {
    key: 'impact_01',
    kind: 'sfx',
    volume: 0.6,
    prompt:
      'feeding a card into an energy reactor, heavy fiery impact whoomph with a warm surging power charge, satisfying and weighty, not noisy, 0.8 seconds',
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

  // ---- Gameplay SFX: combat (generic fallback) -----------------------------
  // Used by towers that have no dedicated sound (e.g. Shield's barrier shot) and
  // as the fallback if a per-tower clip is missing. See tower-specific keys below.
  {
    key: 'sfx_shoot',
    kind: 'sfx',
    volume: 0.2,
    prompt:
      'soft sci-fi energy bolt, smooth synthetic laser pew, light and clean, gentle not piercing, 0.25 seconds',
  },
  {
    key: 'sfx_hit',
    kind: 'sfx',
    volume: 0.25,
    prompt:
      'soft energy projectile impact, gentle electric tick with a subtle warm thump, 0.2 seconds',
  },

  // ---- Gameplay SFX: per-tower fire + impact -------------------------------
  // Each attacking tower gets its own pair (shoot/hit) matching its element/style.
  // Routed in BattleScene by card id (shoot) and source element (hit); see
  // docs/planned/tower-sound-design.md. Support towers fire no projectile.
  {
    key: 'sfx_shoot_plasma',
    kind: 'sfx',
    volume: 0.2,
    prompt:
      'plasma cannon firing a hot energy bolt, deep punchy fiery whoomph with a short electric crackle, warm and powerful, not harsh, 0.3 seconds',
  },
  {
    key: 'sfx_hit_plasma',
    kind: 'sfx',
    volume: 0.25,
    prompt:
      'plasma bolt impact, satisfying fiery thump with a soft sizzling ember tail, warm and weighty, 0.3 seconds',
  },
  {
    key: 'sfx_shoot_frost',
    kind: 'sfx',
    volume: 0.55,
    prompt:
      'frost projectile launch, soft airy icy whoosh with a gentle crystalline shimmer, cool and clean, 0.3 seconds',
  },
  {
    key: 'sfx_hit_frost',
    kind: 'sfx',
    volume: 0.6,
    prompt:
      'frost impact freezing an enemy, smooth glassy crystallize chime with a soft frosty crackle, gentle and magical, 0.35 seconds',
  },
  {
    key: 'sfx_shoot_storm',
    kind: 'sfx',
    volume: 0.25,
    prompt:
      'electric coil discharging, crisp clean synthetic zap with a quick high spark snap, snappy not piercing, 0.25 seconds',
  },
  {
    key: 'sfx_hit_storm',
    kind: 'sfx',
    volume: 0.3,
    prompt:
      'chain lightning arcing between enemies, fast tight electric crackle-zip with a bright spark, clean and energetic, 0.3 seconds',
  },
  {
    key: 'sfx_shoot_railgun',
    kind: 'sfx',
    volume: 0.3,
    prompt:
      'heavy railgun firing, deep magnetic charge-up into a powerful low boom and a sharp metallic snap, weighty and impactful, clean, 0.6 seconds',
  },
  {
    key: 'sfx_hit_railgun',
    kind: 'sfx',
    volume: 0.35,
    prompt:
      'high-velocity slug piercing through, hard kinetic thud with a brief metallic ring-out, satisfying and heavy, 0.35 seconds',
  },

  // ---- Fusion hybrid towers (v2 §6.5) — see fusion-hybrid-assets.md ----------
  {
    key: 'sfx_shoot_steam',
    kind: 'sfx',
    volume: 0.5,
    prompt:
      'steam cannon firing a pressurized water-frost bolt, soft hissing whoosh with a warm vapor puff and gentle crystalline tail, smooth not harsh, 0.35 seconds',
  },
  {
    key: 'sfx_hit_steam',
    kind: 'sfx',
    volume: 0.55,
    prompt:
      'steam burst impact, satisfying wet hiss with soft scalding puff and frosty shimmer, warm and airy, 0.35 seconds',
  },
  {
    key: 'sfx_shoot_cryo',
    kind: 'sfx',
    volume: 0.45,
    prompt:
      'cryo lightning discharge, crisp electric zap layered with a glassy ice crackle, snappy and cool, 0.3 seconds',
  },
  {
    key: 'sfx_shoot_ion',
    kind: 'sfx',
    volume: 0.5,
    prompt:
      'rapid ion volley burst, fast tight plasma pops with a bright electric snap, energetic and clean, 0.25 seconds',
  },
  {
    key: 'sfx_shoot_thermo',
    kind: 'sfx',
    volume: 0.6,
    prompt:
      'thermo rail spear firing, deep magnetic charge into a fiery detonation snap, heavy warm boom with metallic ring, 0.55 seconds',
  },
  {
    key: 'sfx_hit_thermo',
    kind: 'sfx',
    volume: 0.6,
    prompt:
      'thermo detonation impact, punchy fiery thump with a soft shrapnel spread crackle, warm and weighty, 0.4 seconds',
  },
  {
    key: 'sfx_shoot_icebreaker',
    kind: 'sfx',
    volume: 0.55,
    prompt:
      'icebreaker rail shot, heavy kinetic launch with a cold frosty whoosh and deep metal thunk, 0.5 seconds',
  },
  {
    key: 'sfx_shoot_gauss',
    kind: 'sfx',
    volume: 0.55,
    prompt:
      'gauss coil discharge, swelling magnetic hum into a bright electric arc crack along the rail, powerful and clean, 0.55 seconds',
  },

  {
    key: 'sfx_crit',
    kind: 'sfx',
    volume: 0.35,
    prompt:
      'powerful critical energy strike, deep satisfying impact with a bright crystalline sparkle tail, punchy but smooth, 0.5 seconds',
  },
  {
    key: 'sfx_enemy_die',
    kind: 'sfx',
    volume: 0.45,
    prompt:
      'small sci-fi drone dissolving, soft digital poof with a gentle descending shimmer, satisfying not crunchy, 0.5 seconds',
  },
  {
    key: 'sfx_leak',
    kind: 'sfx',
    volume: 0.45,
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
    key: 'sfx_stun',
    kind: 'sfx',
    volume: 0.4,
    prompt:
      'tower stunned and shut down, short heavy electric lock-down zap with a low descending power-down dip and a brief dead hum, jarring but smooth, not harsh static, 0.4 seconds',
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

  // ---- Character voices (assets/audio/heroes/<key>.mp3) ---------------------
  // A short voice bark played when a character "opens" in a dialogue (first line
  // of a speaker turn). Wired per-character via StoryCharacter.voiceKey
  // (config/storyCharacters.ts). The key is the bare filename: heroes/support.mp3
  // → 'support'. Routed on the sfx bus. Add a row here when a new voice lands.
  {
    key: 'support',
    kind: 'sfx',
    volume: 0.9,
    prompt: 'short dieselpunk lead-admin voice bark / radio greeting (player-authored clip)',
  },
  {
    key: 'war',
    kind: 'sfx',
    volume: 0.9,
    prompt: 'short gruff combat-division voice bark (player-authored clip)',
  },
  {
    key: 'TeodorLegenda',
    kind: 'sfx',
    volume: 0.9,
    prompt: 'short friendly steampunk-engineer voice bark / greeting (player-authored clip)',
  },
  {
    key: 'klevak',
    kind: 'sfx',
    volume: 0.9,
    prompt: 'short upbeat wasteland vibecoder voice bark / sheepish greeting (player-authored clip)',
  },
  {
    key: 'vadim',
    kind: 'sfx',
    volume: 0.9,
    prompt: 'short steampunk data-center navigator voice bark / greeting (player-authored clip)',
  },
  {
    key: 'khatenkoff',
    kind: 'sfx',
    volume: 0.9,
    prompt: 'short tactical-range leader voice bark / greeting (player-authored clip)',
  },
  {
    key: 'olivia',
    kind: 'sfx',
    volume: 0.9,
    prompt: 'short haughty chat-queen villain voice bark / taunt (player-authored clip)',
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
