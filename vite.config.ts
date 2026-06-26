import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { editorDevPlugin } from './src/editor/devPlugin';

// Short git sha of the build → telemetry `balanceVersion`, so dashboards can compare
// balance across versions. Falls back to 'dev' if git is unavailable.
function gitSha(): string {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim() || 'dev';
  } catch {
    return 'dev';
  }
}

// Vanilla Vite + TS. No framework plugins — the brief asks for "pure Pixi + TS",
// so we keep the toolchain minimal. Assets under /assets and /docs are served as-is.
//
// Telemetry endpoint is read from VITE_TELEMETRY_URL (empty → telemetry disabled).
// Set it in .env.local or inline, e.g.:
//   VITE_TELEMETRY_URL=http://127.0.0.1:8787 npm run dev
// The design editor (editor.html + src/editor/) is a dev-only tool. Its save/read
// endpoints come from editorDevPlugin (apply: 'serve' → not in prod). The page is
// only built into dist/ when BUILD_EDITOR=1, so the shipped game stays clean.
const includeEditor = process.env.BUILD_EDITOR === '1';

export default defineConfig({
  base: './',
  define: {
    __BALANCE_VERSION__: JSON.stringify(gitSha()),
  },
  plugins: [editorDevPlugin()],
  server: {
    host: true,
    open: false,
    // The editor writes ConfigSet JSON under src/data/sets/. Don't let Vite
    // full-reload pages on those writes (it would wipe the editor's in-progress
    // edits / "saved" status). The game picks up the latest set on a fresh load
    // ("play this set" opens a new tab), so live-watching them isn't needed.
    watch: { ignored: ['**/src/data/sets/**'] },
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsInlineLimit: 0,
    rollupOptions: {
      input: includeEditor
        ? {
            main: fileURLToPath(new URL('index.html', import.meta.url)),
            editor: fileURLToPath(new URL('editor.html', import.meta.url)),
          }
        : fileURLToPath(new URL('index.html', import.meta.url)),
    },
  },
});
