// Design editor app (dev-only). Talks to editorDevPlugin endpoints to load/save
// game configs as JSON, and renders friendly editors for the design content:
// enemies, levels, cards (incl. grade rows), per-level combat with a visual wave
// builder, friendly number forms for the economy/sim tuning (combatRules /
// battleRules), plus a raw-JSON panel for the battle seed. Save runs the shared
// integrity check first. See docs/backlog/design-editor.md.
//
// The in-memory `files` object is the single source of truth: inputs mutate it in
// place (untouched fields preserved), JSON panels replace a sub-tree on valid parse.

import { collectGameConfigIssues } from '../data/validate';
import type { GameConfig } from '../data/schema';
import { POLICIES, POLICY_LABELS } from '../../sim/bot/policies';

const ELEMENTS = ['Fire', 'Water', 'Electricity', 'Physical', 'Energy'];
const PATHS = ['', 'bottom', 'top', 'left', 'right'];
const GRADE_NUM_FIELDS = ['damage', 'rangeCells', 'buff', 'sig', 'sig2', 'bonusDamage'];

type Json = Record<string, unknown>;
let gameConfigName = '';
let files: Record<string, unknown> = {};

const $ = (id: string) => document.getElementById(id)!;
const root = $('root');
const statusEl = $('status');
const configSelect = $('configSelect') as HTMLSelectElement;
const botPolicySelect = $('botPolicy') as HTMLSelectElement;
const botSeedsInput = $('botSeeds') as HTMLInputElement;

// Populate policy dropdown with descriptions (values stay PolicyName | 'all').
botPolicySelect.innerHTML = '';
for (const p of POLICIES) {
  botPolicySelect.append(el('option', { value: p }, POLICY_LABELS[p]));
}
botPolicySelect.append(el('option', { value: 'all' }, 'all — все политики'));
botPolicySelect.value = 'smart';

function status(msg: string, kind: 'ok' | 'err' | '' = ''): void {
  statusEl.textContent = msg;
  statusEl.className = 'status ' + (kind === 'ok' ? 'ok' : kind === 'err' ? 'err' : 'muted');
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else e.setAttribute(k, v);
  }
  for (const c of children) e.append(c);
  return e;
}

/** Bound input → obj[key]. Number '' clears the key (so optional fields drop out). */
function field(obj: Json, key: string, type: 'text' | 'number'): HTMLInputElement {
  const inp = el('input', { type, value: obj[key] == null ? '' : String(obj[key]) });
  if (type === 'text') inp.className = 'txt';
  if (type === 'number') inp.step = 'any';
  inp.addEventListener('input', () => {
    obj[key] = type === 'number' ? (inp.value === '' ? undefined : Number(inp.value)) : inp.value;
  });
  return inp;
}

function boolField(obj: Json, key: string): HTMLInputElement {
  const inp = el('input', { type: 'checkbox' });
  inp.checked = obj[key] === true;
  inp.addEventListener('change', () => {
    obj[key] = inp.checked ? true : undefined;
  });
  return inp;
}

function selectField(obj: Json, key: string, options: string[]): HTMLSelectElement {
  const sel = el('select');
  for (const o of options) {
    const opt = el('option', { value: o }, o || '(default)');
    if (String(obj[key] ?? '') === o) opt.selected = true;
    sel.append(opt);
  }
  sel.addEventListener('change', () => {
    obj[key] = sel.value === '' ? undefined : sel.value;
  });
  return sel;
}

/** A small inline JSON input bound to obj[key] (for arrays/objects in a form row). */
function jsonField(obj: Json, key: string): HTMLElement {
  const wrap = el('div');
  const ta = el('textarea');
  ta.style.minHeight = '48px';
  ta.style.margin = '0';
  ta.value = JSON.stringify(obj[key]);
  const err = el('span', { class: 'err' });
  ta.addEventListener('input', () => {
    try {
      obj[key] = JSON.parse(ta.value);
      err.textContent = '';
    } catch (e) {
      err.textContent = ' ' + String(e);
    }
  });
  wrap.append(ta, err);
  return wrap;
}

/** A JSON textarea bound to files[fileKey] (replaces it on valid parse). */
function jsonPanel(title: string, fileKey: string): HTMLElement {
  const wrap = el('details');
  wrap.append(el('summary', {}, title));
  const ta = el('textarea');
  ta.value = JSON.stringify(files[fileKey] ?? null, null, 2);
  const err = el('div', { class: 'row err' });
  ta.addEventListener('input', () => {
    try {
      files[fileKey] = JSON.parse(ta.value);
      err.textContent = '';
    } catch (e) {
      err.textContent = String(e);
    }
  });
  wrap.append(ta, err);
  return wrap;
}

function table(headers: string[], rows: HTMLElement[]): HTMLTableElement {
  const t = el('table');
  const head = el('tr');
  for (const h of headers) head.append(el('th', {}, h));
  t.append(head);
  for (const r of rows) t.append(r);
  return t;
}

function td(child: Node): HTMLTableCellElement {
  const c = el('td');
  c.append(child);
  return c;
}
function note(text: string): HTMLElement {
  return el('div', { class: 'row muted' }, text);
}

function enemyIds(): string[] {
  return ((files.enemies as Json[]) ?? []).map((e) => String(e.id));
}

function renderEnemies(): HTMLElement {
  const list = (files.enemies as Json[]) ?? [];
  const cols = ['id', 'name', 'element', 'maxHp', 'speed', 'bounty', 'coreDamage'];
  const rows = list.map((e) => {
    const tr = el('tr');
    tr.append(el('td', {}, String(e.id ?? '')));
    tr.append(td(field(e, 'name', 'text')));
    tr.append(td(selectField(e, 'element', ELEMENTS)));
    for (const k of ['maxHp', 'speed', 'bounty', 'coreDamage']) tr.append(td(field(e, k, 'number')));
    return tr;
  });
  const wrap = el('div');
  wrap.append(el('h2', {}, 'Enemies · монстры'));
  wrap.append(table(cols, rows));
  wrap.append(note('Advanced fields (archetype, auras, interrupt) are preserved; edit via the raw JSON panel.'));
  wrap.append(jsonPanel('enemies.json (raw — all fields)', 'enemies'));
  return wrap;
}

function renderLevels(): HTMLElement {
  const list = (files.levels as Json[]) ?? [];
  const rows = list.map((l) => {
    const tr = el('tr');
    tr.append(el('td', {}, String(l.id ?? '')));
    tr.append(td(field(l, 'name', 'text')));
    tr.append(td(field(l, 'nx', 'number')));
    tr.append(td(field(l, 'ny', 'number')));
    return tr;
  });
  const wrap = el('div');
  wrap.append(el('h2', {}, 'Levels · уровни (карта мира)'));
  wrap.append(table(['id', 'name', 'nx', 'ny'], rows));
  return wrap;
}

/** Structured 3-row grade editor for one card. */
function gradeTable(card: Json): HTMLElement {
  const grades = (card.grades as Json[]) ?? [];
  const headers = ['grade', ...GRADE_NUM_FIELDS, 'diagonal'];
  const rows = grades.map((g, i) => {
    const tr = el('tr');
    tr.append(el('td', {}, ['I', 'II', 'III'][i] ?? String(i + 1)));
    for (const k of GRADE_NUM_FIELDS) tr.append(td(field(g, k, 'number')));
    tr.append(td(boolField(g, 'diagonal')));
    return tr;
  });
  return table(headers, rows);
}

function renderCards(): HTMLElement {
  const cards = (files.cards as Record<string, Json>) ?? {};
  const wrap = el('div');
  wrap.append(el('h2', {}, 'Cards · башни/карты'));
  const cols = ['id', 'shortName', 'element', 'category', 'baseLoad', 'costGold', 'cooldown'];
  const rows = Object.values(cards).map((c) => {
    const tr = el('tr');
    tr.append(el('td', {}, String(c.id ?? '')));
    tr.append(td(field(c, 'shortName', 'text')));
    tr.append(td(selectField(c, 'element', ELEMENTS)));
    tr.append(el('td', {}, String(c.category ?? '')));
    for (const k of ['baseLoad', 'costGold', 'cooldown']) tr.append(td(field(c, k, 'number')));
    return tr;
  });
  wrap.append(table(cols, rows));
  for (const c of Object.values(cards)) {
    const d = el('details');
    d.append(el('summary', {}, `${c.id} · grades (${c.element})`));
    d.append(gradeTable(c));
    wrap.append(d);
  }
  return wrap;
}

/** Visual wave builder for one level's waves array. */
function waveBuilder(cfg: Json): HTMLElement {
  const container = el('div');
  const rebuild = (): void => {
    container.innerHTML = '';
    const waves = (cfg.waves as Json[]) ?? ((cfg.waves = []) as Json[]);
    waves.forEach((w, wi) => {
      const block = el('div', { class: 'wave' });
      const head = el('div', { class: 'row' });
      const rm = el('button', { class: 'warn' }, `✕ wave ${wi + 1}`);
      rm.addEventListener('click', () => {
        waves.splice(wi, 1);
        rebuild();
      });
      head.append(el('strong', {}, `Wave ${wi + 1}`), rm);
      block.append(head);
      const groups = (w.groups as Json[]) ?? ((w.groups = []) as Json[]);
      groups.forEach((g, gi) => {
        const row = el('div', { class: 'row' });
        row.append(el('span', { class: 'muted' }, 'enemy'), selectField(g, 'enemyId', enemyIds()));
        row.append(el('span', { class: 'muted' }, 'count'), field(g, 'count', 'number'));
        row.append(el('span', { class: 'muted' }, 'gap'), field(g, 'gap', 'number'));
        const grm = el('button', { class: 'warn' }, '✕');
        grm.addEventListener('click', () => {
          groups.splice(gi, 1);
          rebuild();
        });
        row.append(grm);
        block.append(row);
      });
      const addG = el('button', {}, '+ group');
      addG.addEventListener('click', () => {
        groups.push({ enemyId: enemyIds()[0] ?? '', count: 1, gap: 1 });
        rebuild();
      });
      block.append(el('div', { class: 'row' }, addG));
      container.append(block);
    });
    const addW = el('button', { class: 'primary' }, '+ wave');
    addW.addEventListener('click', () => {
      waves.push({ groups: [] });
      rebuild();
    });
    container.append(el('div', { class: 'row' }, addW));
  };
  rebuild();
  return container;
}

function renderLevelCombat(): HTMLElement {
  const lc = (files.levelCombat as Record<string, Json>) ?? {};
  const wrap = el('div');
  wrap.append(el('h2', {}, 'Level combat · волны и тир сложности'));
  for (const [lvl, cfg] of Object.entries(lc)) {
    const d = el('details');
    d.append(el('summary', {}, lvl + ` · ${(cfg.waves as unknown[])?.length ?? 0} waves`));
    const row = el('div', { class: 'row' });
    row.append(el('label', {}, 'hpScale'), field(cfg, 'hpScale', 'number'));
    row.append(el('label', {}, 'bountyScale'), field(cfg, 'bountyScale', 'number'));
    row.append(el('label', {}, 'pathId'), selectField(cfg, 'pathId', PATHS));
    d.append(row);
    d.append(waveBuilder(cfg));
    wrap.append(d);
  }
  return wrap;
}

/** Friendly number form for a flat tuning file (combatRules / battleRules). Each
 *  numeric key → a labeled number input; arrays/objects → an inline JSON field. */
function tuningForm(title: string, fileKey: string): HTMLElement {
  const obj = files[fileKey] as Json | undefined;
  const wrap = el('div');
  wrap.append(el('h2', {}, title));
  if (!obj) {
    wrap.append(note('no data'));
    return wrap;
  }
  const rows = Object.keys(obj).map((key) => {
    const tr = el('tr');
    tr.append(el('td', {}, key));
    tr.append(td(typeof obj[key] === 'number' ? field(obj, key, 'number') : jsonField(obj, key)));
    return tr;
  });
  wrap.append(table(['key', 'value'], rows));
  return wrap;
}

function render(): void {
  root.innerHTML = '';
  if (!gameConfigName) {
    root.append(note('Select a game config to edit.'));
    return;
  }
  root.append(renderEnemies());
  root.append(renderCards());
  root.append(renderLevels());
  root.append(renderLevelCombat());

  const econ = el('div');
  econ.append(el('h2', {}, 'Economy & sim tuning · combatRules'));
  econ.append(tuningForm('combatRules', 'combatRules'));
  econ.append(tuningForm('battleRules', 'battleRules'));
  root.append(econ);

  const raw = el('div');
  raw.append(el('h2', {}, 'Other (raw JSON)'));
  raw.append(jsonPanel('reactions.json', 'reactions'));
  raw.append(jsonPanel('recipes.json', 'recipes'));
  raw.append(jsonPanel('progression.json', 'progression'));
  raw.append(jsonPanel('battleSeed.json', 'battleSeed'));
  root.append(raw);
}

/** Build a GameConfig view over the editor's `files` for the integrity check. */
function asGameConfig(): GameConfig {
  const prog = (files.progression as Json) ?? {};
  return {
    ...(files as object),
    levelUnlocks: prog.levelUnlocks,
    startingTowers: prog.startingTowers,
  } as unknown as GameConfig;
}

function populateOptions(configs: string[], selected?: string): void {
  configSelect.innerHTML = '';
  for (const s of configs) configSelect.append(el('option', { value: s }, s));
  if (selected && configs.includes(selected)) configSelect.value = selected;
}

async function loadConfigs(select?: string): Promise<void> {
  const r = await fetch('/__editor/game_configs').then((x) => x.json());
  const configs = r.configs as string[];
  const target = select && configs.includes(select) ? select : configs[0];
  populateOptions(configs, target);
  if (target) await loadConfig(target);
}

async function loadConfig(name: string): Promise<void> {
  const r = await fetch('/__editor/game_config/' + encodeURIComponent(name)).then((x) => x.json());
  gameConfigName = r.name;
  files = r.files;
  render();
  status('loaded "' + gameConfigName + '"', 'ok');
}

async function save(name: string): Promise<void> {
  let issues: string[] = [];
  try {
    issues = collectGameConfigIssues(asGameConfig());
  } catch (e) {
    issues = ['could not validate: ' + String(e)];
  }
  if (issues.length > 0) {
    status('not saved — ' + issues.length + ' issue(s): ' + issues.slice(0, 3).join('; '), 'err');
    return;
  }
  const r = await fetch('/__editor/save', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, files }),
  }).then((x) => x.json());
  if (r.ok) {
    gameConfigName = name;
    populateOptions((r.configs as string[]) ?? [], name);
    status('saved "' + name + '" ✓', 'ok');
  } else {
    status('save failed: ' + (r.error ?? '?'), 'err');
  }
}

configSelect.addEventListener('change', () => void loadConfig(configSelect.value));
$('save').addEventListener('click', () => void save(gameConfigName));
$('newConfig').addEventListener('click', () => {
  // New configs are named game_config_id<N>; copies the current edits.
  const suggested = 'game_config_id' + String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
  const name = prompt('New game config id (copies current edits):', suggested);
  if (name) void save(name);
});
$('play').addEventListener('click', () => {
  window.open('/?game_config=' + encodeURIComponent(gameConfigName), '_blank');
});
$('runBot').addEventListener('click', () => {
  const out = $('botOut');
  const seeds = Math.max(1, Math.min(1000, Math.floor(Number(botSeedsInput.value)) || 1));
  botSeedsInput.value = String(seeds);
  const policy = botPolicySelect.value;
  out.style.display = 'block';
  out.textContent = `running bot on "${gameConfigName}" · policy=${policy} · seeds=${seeds}…`;
  status('running bot…', '');
  fetch('/__editor/run-bot', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: gameConfigName, seeds, policy }),
  })
    .then((x) => x.json())
    .then((r) => {
      out.textContent = r.output ?? JSON.stringify(r);
      status(
        r.ok ? `bot run complete ✓ (${policy}, ${seeds} seeds)` : 'bot run exited ' + r.code,
        r.ok ? 'ok' : 'err',
      );
    })
    .catch((e) => {
      out.textContent = String(e);
      status('bot run failed', 'err');
    });
});

void loadConfigs();
