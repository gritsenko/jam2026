// Dev-only Vite plugin backing the design editor (editor.html). Adds endpoints to
// the dev server for reading/writing game configs on disk:
//   GET  /__editor/game_configs        -> { configs: string[] }
//   GET  /__editor/game_config/<name>  -> { name, files: { <file>: <json> } }
//   POST /__editor/save                -> body { name, files } writes src/data/game_configs/<name>/*.json
//   POST /__editor/run-bot             -> body { name } runs the bot harness for that config
// `apply: 'serve'` keeps it out of production builds. See docs/backlog/design-editor.md.

import { readdirSync, readFileSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import type { Plugin } from 'vite';

const CONFIGS_DIR = fileURLToPath(new URL('../data/game_configs/', import.meta.url));
const PROJECT_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const TSX_BIN = PROJECT_ROOT + 'sim/server/node_modules/.bin/tsx';
const BOT_SCRIPT = PROJECT_ROOT + 'sim/bot/run.ts';

// The JSON files that make up one game config (keys used by the editor UI).
export const GAME_CONFIG_FILES = [
  'cards',
  'enemies',
  'levels',
  'levelCombat',
  'waves',
  'reactions',
  'recipes',
  'progression',
  'combatRules',
  'battleRules',
  'battleSeed',
] as const;

const NAME_RE = /^[a-z0-9_-]+$/i;

function listConfigs(): string[] {
  if (!existsSync(CONFIGS_DIR)) return [];
  return readdirSync(CONFIGS_DIR).filter((d) => {
    try {
      return statSync(`${CONFIGS_DIR}${d}`).isDirectory();
    } catch {
      return false;
    }
  });
}

function readConfig(name: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of GAME_CONFIG_FILES) {
    const path = `${CONFIGS_DIR}${name}/${f}.json`;
    out[f] = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
  }
  return out;
}

function writeConfig(name: string, files: Record<string, unknown>): void {
  const dir = `${CONFIGS_DIR}${name}`;
  mkdirSync(dir, { recursive: true });
  for (const f of GAME_CONFIG_FILES) {
    if (files[f] == null) continue;
    writeFileSync(`${dir}/${f}.json`, JSON.stringify(files[f], null, 2) + '\n', 'utf8');
  }
}

function json(res: import('node:http').ServerResponse, code: number, body: unknown): void {
  res.statusCode = code;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

export function editorDevPlugin(): Plugin {
  return {
    name: 'sgtd-editor',
    apply: 'serve',
    configureServer(server) {
      // Vite does NOT put .env(.local) VITE_* vars into process.env, so read the
      // resolved env here to find the telemetry endpoint for run-bot pushes.
      const telemetryUrl =
        (server.config.env.VITE_TELEMETRY_URL as string | undefined) ??
        process.env.VITE_TELEMETRY_URL ??
        '';
      server.middlewares.use('/__editor', (req, res) => {
        const url = new URL(req.url ?? '', 'http://localhost');
        const parts = url.pathname.split('/').filter(Boolean); // after /__editor

        try {
          if (req.method === 'GET' && parts[0] === 'game_configs') {
            return json(res, 200, { configs: listConfigs() });
          }
          if (req.method === 'GET' && parts[0] === 'game_config' && parts[1]) {
            const name = decodeURIComponent(parts[1]);
            if (!NAME_RE.test(name) || !existsSync(`${CONFIGS_DIR}${name}`)) {
              return json(res, 404, { error: 'unknown game config' });
            }
            return json(res, 200, { name, files: readConfig(name) });
          }
          if (req.method === 'POST' && parts[0] === 'run-bot') {
            let raw = '';
            req.on('data', (c) => (raw += c));
            req.on('end', () => {
              let name = 'default';
              try {
                name = (JSON.parse(raw) as { name?: string }).name ?? 'default';
              } catch {
                /* default */
              }
              if (!NAME_RE.test(name)) return json(res, 400, { error: 'invalid config name' });
              // Spawn the headless bot harness for this config; push to the telemetry
              // backend if VITE_TELEMETRY_URL is configured.
              const child = spawn(TSX_BIN, [BOT_SCRIPT], {
                cwd: PROJECT_ROOT,
                env: {
                  ...process.env,
                  GAME_CONFIG: name,
                  INGEST_URL: telemetryUrl,
                  SEEDS: process.env.SEEDS ?? '30', // meaningful sample from one click
                },
              });
              let out = '';
              child.stdout.on('data', (d) => (out += d));
              child.stderr.on('data', (d) => (out += d));
              child.on('error', (e) => json(res, 500, { error: String(e) }));
              child.on('close', (code) => json(res, 200, { ok: code === 0, code, output: out.slice(-4000) }));
            });
            return;
          }
          if (req.method === 'POST' && parts[0] === 'save') {
            let raw = '';
            req.on('data', (c) => (raw += c));
            req.on('end', () => {
              try {
                const body = JSON.parse(raw) as { name?: string; files?: Record<string, unknown> };
                const name = body.name ?? '';
                if (!NAME_RE.test(name)) return json(res, 400, { error: 'invalid config name' });
                if (!body.files || typeof body.files !== 'object') {
                  return json(res, 400, { error: 'missing files' });
                }
                writeConfig(name, body.files);
                return json(res, 200, { ok: true, name, configs: listConfigs() });
              } catch (e) {
                return json(res, 400, { error: String(e) });
              }
            });
            return;
          }
          return json(res, 404, { error: 'not found' });
        } catch (e) {
          return json(res, 500, { error: String(e) });
        }
      });
    },
  };
}
