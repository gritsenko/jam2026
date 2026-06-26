// Ensures every folder under src/data/game_configs/ is registered in registry.ts
// (and vice versa). Pure Node — no tsx. Run before production build.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CONFIGS_DIR = `${ROOT}/src/data/game_configs`;
const REGISTRY_PATH = `${ROOT}/src/data/registry.ts`;

function listConfigDirs() {
  return readdirSync(CONFIGS_DIR)
    .filter((name) => statSync(`${CONFIGS_DIR}/${name}`).isDirectory())
    .sort();
}

/** Keys in `export const GAME_CONFIGS = { ... }` (manual registry). */
function listRegisteredConfigs() {
  const src = readFileSync(REGISTRY_PATH, 'utf8');
  const block = src.match(/export const GAME_CONFIGS[^=]*=\s*\{([\s\S]*?)\n\};/);
  if (!block) throw new Error('GAME_CONFIGS block not found in registry.ts');
  return [...block[1].matchAll(/^\s+([a-z0-9_]+):\s+toGameConfig/gm, 'm')]
    .map((m) => m[1])
    .sort();
}

const onDisk = listConfigDirs();
const registered = listRegisteredConfigs();

const missingInRegistry = onDisk.filter((id) => !registered.includes(id));
const missingOnDisk = registered.filter((id) => !onDisk.includes(id));

if (missingInRegistry.length > 0 || missingOnDisk.length > 0) {
  const lines = ['Game config registry mismatch:'];
  if (missingInRegistry.length > 0) {
    lines.push(`  folders without registry entry: ${missingInRegistry.join(', ')}`);
    lines.push('  → add imports + GAME_CONFIGS entry in src/data/registry.ts');
  }
  if (missingOnDisk.length > 0) {
    lines.push(`  registry entries without folder: ${missingOnDisk.join(', ')}`);
  }
  console.error(lines.join('\n'));
  process.exit(1);
}

console.log(`game configs OK (${onDisk.length}): ${onDisk.join(', ')}`);
