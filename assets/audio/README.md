# assets/audio

Drop generated/sourced sound files here as `<key>.mp3` (`.ogg`/`.m4a` also work).
**File name = audio key**, exactly like sprites in `assets/sprites/`.

The full list of keys, what each sound should be, and a ready-to-use text-to-audio
prompt for every one lives in [`src/config/audioManifest.ts`](../../src/config/audioManifest.ts).

How it works:

- [`src/core/AudioBus.ts`](../../src/core/AudioBus.ts) resolves this folder with a
  Vite glob at startup. A key with no file on disk is a **silent no-op** — the game
  runs fine before any audio exists (same contract as sprite placeholders).
- After adding a file, **restart the dev server** (the glob resolves once at boot).

Keep it light: SFX trimmed mono mp3 (~5–20 KB each), music as seamless mono loops
at 64–96 kbps (~0.3–0.6 MB/min). Tune per-clip loudness via `volume` in the manifest.

Per-tower hit clips (`sfx_hit_*`) route via `TOWER_HIT_SFX` in BattleScene; `sfx_hit_storm`
is still a cryo placeholder — replace with a unique chain-lightning sample when ready.
