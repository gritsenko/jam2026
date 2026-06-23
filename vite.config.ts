import { defineConfig } from 'vite';

// Vanilla Vite + TS. No framework plugins — the brief asks for "pure Pixi + TS",
// so we keep the toolchain minimal. Assets under /assets and /docs are served as-is.
export default defineConfig({
  base: './',
  server: {
    host: true,
    open: false,
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsInlineLimit: 0,
  },
});
