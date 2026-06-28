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
 *  - Buffers are fetched + decoded on first use and cached. preload() warms that
 *    cache ahead of time: it prefetches every clip's compressed bytes at boot
 *    (no AudioContext needed) and, once the context unlocks on the first gesture,
 *    decodes them into ready AudioBuffers in the background — so the first play
 *    of any sound is instant instead of stalling on a fetch + decode.
 */

// Recursive: top-level clips plus per-folder sets (e.g. assets/audio/heroes/*.mp3
// for character voices). The key is the bare filename (basename), so keep names
// unique across folders — a collision would let the later file win.
const AUDIO_URLS = import.meta.glob('/assets/audio/**/*.{mp3,ogg,m4a}', {
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

export interface MusicOpts {
  /** Crossfade seconds (default 0.8). */
  readonly fade?: number;
  /**
   * Output routing. `'music'` (default) goes through the music-volume slider;
   * `'master'` bypasses it and plays at the overall (master / mute) volume — for
   * cinematic theme moments (intro / finale) that aren't background game music.
   */
  readonly bus?: MixBus | 'master';
}

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
  /** Compressed bytes prefetched ahead of decode (freed once decoded). */
  private bytes = new Map<string, Promise<ArrayBuffer | null>>();
  /** preload() requested — decode the cache as soon as the context exists. */
  private preloadRequested = false;
  /** A background decode pass is already running (warmDecode runs once). */
  private warming = false;
  private currentMusicKey: string | null = null;
  private currentMusicOpts?: MusicOpts;
  private currentMusic: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private pendingMusic: { key: string; opts?: MusicOpts } | null = null;
  /**
   * Set when the OS suspended/interrupted the context while music was playing
   * (iOS backgrounding). iOS tears the music source down, so once the context is
   * running again we restart the track instead of leaving it silent.
   */
  private needsMusicRestart = false;
  private muted = false;
  /**
   * Transient "duck everything" flag, independent of the persisted `muted`
   * setting: set while the window is unfocused / the tab is hidden so the game
   * goes silent in the background and the player's own mute choice is restored
   * untouched when they return. Effective master gain = 0 if muted OR suspended.
   */
  private suspended = false;
  private vol: Record<MixBus, number>;
  /** Last play time (ms) per throttle group, for playOneOf burst-limiting. */
  private lastGroupPlay = new Map<string, number>();

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
    // iOS Safari re-suspends the context after backgrounding / interruptions, so
    // the gesture listeners stay attached and re-resume on every interaction
    // instead of unbinding after the first one.
    const unlock = () => this.unlock();
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('touchend', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.resumeContext();
    });
  }

  /** Create the context (if needed) and resume it — must run inside a gesture. */
  private unlock(): void {
    this.ensureContext(); // also kicks off warmDecode() when preload() was requested
    this.resumeContext();
  }

  /**
   * Resume a suspended context and, once it is actually running, start any music
   * that was requested before the first gesture. iOS keeps `state === 'suspended'`
   * synchronously after resume(), so the pending track is flushed in the promise
   * callback rather than immediately (otherwise it would re-queue forever).
   */
  private resumeContext(): void {
    if (!this.ctx) return;
    // iOS may park the context in the non-standard 'interrupted' state (audio
    // session interruption / backgrounding) on top of plain 'suspended'; both
    // need an explicit resume(). The actual flush + music restart runs in the
    // 'statechange' → 'running' handler, because resume() resolves while iOS
    // still reports the old state synchronously.
    const state: string = this.ctx.state;
    if (state === 'suspended' || state === 'interrupted') {
      void this.ctx.resume().then(() => this.flushPendingMusic());
    } else {
      this.flushPendingMusic();
    }
  }

  /**
   * AudioContext lifecycle hook. When iOS backgrounds the page it suspends (or
   * 'interrupt's) the context and tears down the playing music source — so even
   * after the context resumes, the music stays silent. We flag that here and, as
   * soon as the context is running again (via the visibilitychange resume or the
   * next user gesture), re-arm output and restart the track. Desktop never gets
   * here for backgrounding: we only zero the master gain there, the context
   * itself keeps running.
   */
  private onStateChange(): void {
    if (!this.ctx) return;
    const state: string = this.ctx.state;
    if (state === 'suspended' || state === 'interrupted') {
      if (this.currentMusicKey) this.needsMusicRestart = true;
    } else if (state === 'running') {
      this.kickSilent(); // re-open audio output on iOS after an interruption
      this.flushPendingMusic();
      if (this.needsMusicRestart) {
        this.needsMusicRestart = false;
        this.restartMusic();
      }
    }
  }

  /** Replay the current music track from a fresh source (its node likely died). */
  private restartMusic(): void {
    const key = this.currentMusicKey;
    if (!key) return;
    const opts = this.currentMusicOpts;
    const old = this.currentMusic;
    // Bypass the same-key no-op guard in playMusic() and drop the dead node so
    // fadeOutCurrent() doesn't poke it.
    this.currentMusic = null;
    this.currentMusicKey = null;
    if (old) {
      try {
        old.src.stop();
      } catch {
        /* already stopped / torn down */
      }
    }
    void this.playMusic(key, opts);
  }

  private flushPendingMusic(): void {
    if (!this.pendingMusic || !this.ctx || this.ctx.state !== 'running') return;
    const pending = this.pendingMusic;
    this.pendingMusic = null;
    void this.playMusic(pending.key, pending.opts);
  }

  private ensureContext(): void {
    if (this.ctx) return;
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    // iOS suspends/interrupts the context on backgrounding and resumes it on
    // return — watch the lifecycle so we can re-arm output and restart music.
    this.ctx.addEventListener('statechange', () => this.onStateChange());
    this.master = this.ctx.createGain();
    this.master.gain.value = this.masterTarget();
    this.master.connect(this.ctx.destination);
    const mk = (b: MixBus): GainNode => {
      const g = this.ctx!.createGain();
      g.gain.value = this.vol[b];
      g.connect(this.master);
      return g;
    };
    this.bus = { music: mk('music'), sfx: mk('sfx'), ui: mk('ui') };
    this.kickSilent();
    // Context just became available — start the background decode pass at the
    // earliest moment, whoever created it (gesture unlock or menu playMusic).
    if (this.preloadRequested) this.warmDecode();
  }

  /**
   * Play a 1-sample silent buffer. On some iOS configs Web Audio only fully
   * unlocks when a buffer source is actually started inside the gesture, not
   * just by calling resume() — this is the classic, harmless nudge.
   */
  private kickSilent(): void {
    if (!this.ctx) return;
    try {
      const buf = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.ctx.destination);
      src.start(0);
    } catch {
      /* ignore */
    }
  }

  /**
   * Fetch (and cache) a clip's compressed bytes. Needs no AudioContext, so it
   * can run at boot before the first gesture to hide network latency — the only
   * thing left at play time is the cheap decode. The ArrayBuffer is dropped once
   * decoded (see load) to reclaim memory.
   */
  private fetchBytes(key: string): Promise<ArrayBuffer | null> {
    const cached = this.bytes.get(key);
    if (cached) return cached;
    const url = AUDIO_FILE[key];
    if (!url) return Promise.resolve(null);
    const p = fetch(url)
      .then((r) => r.arrayBuffer())
      .catch((err) => {
        console.warn(`[AudioBus] failed to fetch "${key}"`, err);
        this.bytes.delete(key); // allow a later retry
        return null;
      });
    this.bytes.set(key, p);
    return p;
  }

  private load(key: string): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(key);
    if (cached) return Promise.resolve(cached);
    const inFlight = this.decoding.get(key);
    if (inFlight) return inFlight;
    if (!this.ctx || !AUDIO_FILE[key]) return Promise.resolve(null);
    const ctx = this.ctx;
    const p = this.fetchBytes(key)
      .then((bytes) => (bytes ? ctx.decodeAudioData(bytes) : null))
      .then((buf) => {
        if (buf) this.buffers.set(key, buf);
        this.bytes.delete(key); // compressed bytes no longer needed
        return buf;
      })
      .catch((err) => {
        console.warn(`[AudioBus] failed to decode "${key}"`, err);
        this.decoding.delete(key); // allow a later retry
        return null;
      });
    this.decoding.set(key, p);
    return p;
  }

  /**
   * Warm the sound cache so the first play of any clip is instant instead of
   * stalling on a fetch + decode. Call once at boot. It prefetches every clip's
   * compressed bytes immediately (no AudioContext needed) and, as soon as the
   * context unlocks on the first user gesture, decodes them into ready buffers in
   * the background. Idempotent and fire-and-forget.
   */
  preload(): void {
    this.preloadRequested = true;
    for (const key of this.orderedKeys()) void this.fetchBytes(key);
    if (this.ctx) this.warmDecode(); // a gesture already created the context
  }

  /**
   * Background pass: decode every known clip into the buffer cache, hottest
   * first, with a small concurrency cap so it neither saturates the network nor
   * spikes the main thread. Runs once. Safe on a suspended context (decode does
   * not need the context running).
   */
  private warmDecode(): void {
    if (this.warming || !this.ctx) return;
    this.warming = true;
    const keys = this.orderedKeys();
    let i = 0;
    const CONCURRENCY = 4;
    const worker = async (): Promise<void> => {
      while (i < keys.length) {
        const key = keys[i++]!;
        if (!this.buffers.has(key)) await this.load(key);
      }
    };
    for (let n = 0; n < CONCURRENCY; n++) void worker();
  }

  /**
   * Prefetch / decode priority: gameplay + UI clips first (a mid-action lag is
   * the most jarring), then music loops, then everything else (voices, one-offs).
   */
  private orderedKeys(): string[] {
    const rank = (k: string): number => {
      const kind = AUDIO_KIND[k];
      if (kind === 'sfx' || kind === 'ui') return 0;
      if (kind === 'music') return 1;
      return 2;
    };
    return Object.keys(AUDIO_FILE).sort((a, b) => rank(a) - rank(b));
  }

  /** Fire-and-forget one-shot, routed to its manifest bus. No-op if file absent. */
  playSfx(key: string, opts?: { volume?: number; rate?: number }): void {
    this.ensureContext();
    if (!this.ctx || !this.bus || !AUDIO_FILE[key]) return;
    // SFX fire from user actions, so this resume() runs inside a gesture — needed
    // on iOS where the context may still be suspended for the very first sound.
    if (this.ctx.state === 'suspended') void this.ctx.resume();
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

  /**
   * Play one randomly-chosen variant from a list (e.g. coin pickup 1/2/3).
   * `throttleMs` + `group` rate-limit a burst: when many tokens land on the same
   * frame, only one chime per `throttleMs` for that group gets through, so a mass
   * payout cascades pleasantly instead of becoming a wall of sound.
   */
  playOneOf(
    keys: string[],
    opts?: { volume?: number; rate?: number; throttleMs?: number; group?: string },
  ): void {
    const present = keys.filter((k) => AUDIO_FILE[k]);
    if (present.length === 0) return;
    if (opts?.throttleMs && opts.group) {
      const now = performance.now();
      const last = this.lastGroupPlay.get(opts.group) ?? -Infinity;
      if (now - last < opts.throttleMs) return;
      this.lastGroupPlay.set(opts.group, now);
    }
    const key = present[Math.floor(Math.random() * present.length)]!;
    this.playSfx(key, { volume: opts?.volume, rate: opts?.rate });
  }

  /** Crossfade to a looping track. Same key = no-op; missing file = silent. */
  async playMusic(key: string, opts?: MusicOpts): Promise<void> {
    this.ensureContext();
    if (!this.ctx || !this.bus || !AUDIO_FILE[key]) return;
    // Not unlocked yet — remember the intent (incl. routing) and start it on the
    // first gesture.
    if (this.ctx.state === 'suspended') {
      this.pendingMusic = { key, opts };
      return;
    }
    if (this.currentMusicKey === key) return;
    this.currentMusicKey = key;
    this.currentMusicOpts = opts;
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
    // 'master' bypasses the music-volume slider (cinematic theme); otherwise route
    // to the requested mixer bus, defaulting to 'music'.
    let dest: GainNode;
    if (opts?.bus === 'master') dest = this.master;
    else if (opts?.bus) dest = this.bus[opts.bus];
    else dest = this.bus.music;
    src.connect(g).connect(dest);
    src.start();
    this.currentMusic = { src, gain: g };
  }

  stopMusic(fade = 0.6): void {
    this.currentMusicKey = null;
    this.currentMusicOpts = undefined;
    this.needsMusicRestart = false;
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
    if (bus === 'ui') this.playSfx('sfx_click_1');
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
    this.applyMasterGain();
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  /**
   * Silence (or restore) all output while the window is unfocused / hidden,
   * without touching the player's persisted mute setting. Returning to the
   * foreground calls `setSuspended(false)` and the previous volume comes back.
   */
  setSuspended(suspended: boolean): void {
    if (this.suspended === suspended) return;
    this.suspended = suspended;
    this.applyMasterGain();
  }

  /** Effective master level: zero when muted by the player or backgrounded. */
  private masterTarget(): number {
    return this.muted || this.suspended ? 0 : 1;
  }

  private applyMasterGain(): void {
    if (this.ctx) this.master.gain.value = this.masterTarget();
  }
}
