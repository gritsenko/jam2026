import { AUDIO_VOLUME } from '../config/audioManifest';

/**
 * Tiny dependency-free audio layer on the Web Audio API — the audio counterpart
 * of AssetLoader. The game only ever references a key; AudioBus loads
 * assets/audio/<key>.mp3 when present and otherwise stays silent, so the whole
 * shell stays playable before any sound is generated (same contract as the
 * sprite placeholders).
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

const MUTE_KEY = 'sgrid.muted';

export class AudioBus {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private buffers = new Map<string, AudioBuffer>();
  private decoding = new Map<string, Promise<AudioBuffer | null>>();
  private currentMusicKey: string | null = null;
  private currentMusic: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private pendingMusic: string | null = null;
  private muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      /* private mode / no storage — default to unmuted */
    }
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
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(this.ctx.destination);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0.7;
    this.musicBus.connect(this.master);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 1;
    this.sfxBus.connect(this.master);
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

  /** Fire-and-forget one-shot. Silent no-op if the file is absent. */
  playSfx(key: string, opts?: { volume?: number; rate?: number }): void {
    this.ensureContext();
    if (!this.ctx || !AUDIO_FILE[key]) return;
    void this.load(key).then((buf) => {
      if (!buf || !this.ctx) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      if (opts?.rate) src.playbackRate.value = opts.rate;
      const g = this.ctx.createGain();
      g.gain.value = (opts?.volume ?? AUDIO_VOLUME[key] ?? 1);
      src.connect(g).connect(this.sfxBus);
      src.start();
    });
  }

  /** Crossfade to a looping track. Same key = no-op; missing file = silent. */
  async playMusic(key: string, opts?: { fade?: number }): Promise<void> {
    this.ensureContext();
    if (!this.ctx || !AUDIO_FILE[key]) return;
    // Not unlocked yet — remember the intent and start it on the first gesture.
    if (this.ctx.state === 'suspended') {
      this.pendingMusic = key;
      return;
    }
    if (this.currentMusicKey === key) return;
    this.currentMusicKey = key;
    const fade = opts?.fade ?? 0.8;
    const buf = await this.load(key);
    if (!buf || !this.ctx) return;
    // A newer playMusic() may have superseded us during the await.
    if (this.currentMusicKey !== key) return;

    this.fadeOutCurrent(fade);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = this.ctx.createGain();
    const now = this.ctx.currentTime;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime((AUDIO_VOLUME[key] ?? 0.5), now + fade);
    src.connect(g).connect(this.musicBus);
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
