import { AUDIO_KIND, AUDIO_VOLUME, type AudioKind } from '../config/audioManifest';

/**
 * Tiny dependency-free audio layer on the Web Audio API — the audio counterpart
 * of AssetLoader. The game only ever references a key; AudioBus loads
 * assets/audio/<key>.mp3 when present and otherwise stays silent, so the whole
 * shell stays playable before any sound is generated (same contract as the
 * sprite placeholders).
 *
 * Mixer: three buses (music / sfx / ui), each with its own user-facing volume
 * slider, summed into a master gain that the "mute all" toggle zeroes. A clip's
 * own loudness comes from the manifest (AUDIO_VOLUME); the bus gain is the
 * player's setting. Bus volumes + mute persist in localStorage.
 *
 * Design notes:
 *  - One music track plays at a time; switching crossfades.
 *  - Browsers block audio until a user gesture, so the AudioContext is created
 *    lazily and resumed on the first pointer/key event. Music requested before
 *    that is queued and started on unlock.
 *  - Buffers are fetched + decoded on first use and cached.
 */

const AUDIO_URLS = import.meta.glob('/assets/audio/*.{mp3,ogg,m4a}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

function basename(path: string): string {
  const file = path.split('/').pop() ?? path;
  return file.replace(/\.(mp3|ogg|m4a)$/i, '');
}

/** key -> url for every audio file that actually exists on disk. */
const AUDIO_FILE: Record<string, string> = {};
for (const [path, url] of Object.entries(AUDIO_URLS)) AUDIO_FILE[basename(path)] = url;

export type MixBus = 'music' | 'sfx' | 'ui';

const MUTE_KEY = 'sgrid.muted';
const VOL_KEY: Record<MixBus, string> = {
  music: 'sgrid.vol.music',
  sfx: 'sgrid.vol.sfx',
  ui: 'sgrid.vol.ui',
};
const DEFAULT_VOL: Record<MixBus, number> = { music: 0.7, sfx: 0.9, ui: 0.9 };

function loadNumber(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;
  } catch {
    return fallback;
  }
}

export class AudioBus {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private bus: Record<MixBus, GainNode> | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private decoding = new Map<string, Promise<AudioBuffer | null>>();
  private currentMusicKey: string | null = null;
  private currentMusic: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private pendingMusic: string | null = null;
  private muted = false;
  private vol: Record<MixBus, number>;

  constructor() {
    this.muted = (() => {
      try {
        return localStorage.getItem(MUTE_KEY) === '1';
      } catch {
        return false;
      }
    })();
    this.vol = {
      music: loadNumber(VOL_KEY.music, DEFAULT_VOL.music),
      sfx: loadNumber(VOL_KEY.sfx, DEFAULT_VOL.sfx),
      ui: loadNumber(VOL_KEY.ui, DEFAULT_VOL.ui),
    };
    // Autoplay policy: defer context creation/resume to the first user gesture.
    const unlock = () => {
      this.ensureContext();
      void this.ctx?.resume();
      if (this.pendingMusic) {
        const k = this.pendingMusic;
        this.pendingMusic = null;
        void this.playMusic(k);
      }
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  private ensureContext(): void {
    if (this.ctx) return;
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(this.ctx.destination);
    const mk = (b: MixBus): GainNode => {
      const g = this.ctx!.createGain();
      g.gain.value = this.vol[b];
      g.connect(this.master);
      return g;
    };
    this.bus = { music: mk('music'), sfx: mk('sfx'), ui: mk('ui') };
  }

  private load(key: string): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(key);
    if (cached) return Promise.resolve(cached);
    const inFlight = this.decoding.get(key);
    if (inFlight) return inFlight;
    const url = AUDIO_FILE[key];
    if (!url || !this.ctx) return Promise.resolve(null);
    const ctx = this.ctx;
    const p = fetch(url)
      .then((r) => r.arrayBuffer())
      .then((b) => ctx.decodeAudioData(b))
      .then((buf) => {
        this.buffers.set(key, buf);
        return buf;
      })
      .catch((err) => {
        console.warn(`[AudioBus] failed to load "${key}"`, err);
        return null;
      });
    this.decoding.set(key, p);
    return p;
  }

  /** Fire-and-forget one-shot, routed to its manifest bus. No-op if file absent. */
  playSfx(key: string, opts?: { volume?: number; rate?: number }): void {
    this.ensureContext();
    if (!this.ctx || !this.bus || !AUDIO_FILE[key]) return;
    const kind: AudioKind = AUDIO_KIND[key] ?? 'sfx';
    const bus = kind === 'ui' ? this.bus.ui : this.bus.sfx;
    void this.load(key).then((buf) => {
      if (!buf || !this.ctx) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      if (opts?.rate) src.playbackRate.value = opts.rate;
      const g = this.ctx.createGain();
      g.gain.value = opts?.volume ?? AUDIO_VOLUME[key] ?? 1;
      src.connect(g).connect(bus);
      src.start();
    });
  }

  /** Crossfade to a looping track. Same key = no-op; missing file = silent. */
  async playMusic(key: string, opts?: { fade?: number }): Promise<void> {
    this.ensureContext();
    if (!this.ctx || !this.bus || !AUDIO_FILE[key]) return;
    // Not unlocked yet — remember the intent and start it on the first gesture.
    if (this.ctx.state === 'suspended') {
      this.pendingMusic = key;
      return;
    }
    if (this.currentMusicKey === key) return;
    this.currentMusicKey = key;
    const fade = opts?.fade ?? 0.8;
    const buf = await this.load(key);
    if (!buf || !this.ctx || !this.bus) return;
    // A newer playMusic() may have superseded us during the await.
    if (this.currentMusicKey !== key) return;

    this.fadeOutCurrent(fade);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = this.ctx.createGain();
    const now = this.ctx.currentTime;
    const target = AUDIO_VOLUME[key] ?? 0.5;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(target, now + fade);
    src.connect(g).connect(this.bus.music);
    src.start();
    this.currentMusic = { src, gain: g };
  }

  stopMusic(fade = 0.6): void {
    this.currentMusicKey = null;
    this.pendingMusic = null;
    this.fadeOutCurrent(fade);
  }

  private fadeOutCurrent(fade: number): void {
    const node = this.currentMusic;
    this.currentMusic = null;
    if (!node || !this.ctx) return;
    const now = this.ctx.currentTime;
    const g = node.gain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(Math.max(0.0001, g.value), now);
    g.exponentialRampToValueAtTime(0.0001, now + fade);
    node.src.stop(now + fade + 0.05);
  }

  // --- Settings (persisted) -------------------------------------------------

  getVolume(bus: MixBus): number {
    return this.vol[bus];
  }

  setVolume(bus: MixBus, v: number): void {
    const clamped = Math.min(1, Math.max(0, v));
    this.vol[bus] = clamped;
    try {
      localStorage.setItem(VOL_KEY[bus], String(clamped));
    } catch {
      /* ignore */
    }
    if (this.bus) this.bus[bus].gain.value = clamped;
    // Let the player hear the new sfx/ui level immediately.
    if (bus === 'ui') this.playSfx('sfx_click');
    else if (bus === 'sfx') this.playSfx('sfx_hit');
  }

  get isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (this.ctx) this.master.gain.value = muted ? 0 : 1;
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }
}
