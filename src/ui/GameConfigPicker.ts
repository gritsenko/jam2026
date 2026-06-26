// Admin-only HTML dropdown to switch active GameConfig (requires page reload).

import { activeGameConfigName, persistGameConfigName } from '../data/load';
import { GAME_CONFIG_NAMES } from '../data/registry';

const LABELS: Record<string, string> = {
  default: 'default',
  game_config_id000001: 'id000001',
  bot_tune: 'bot_tune',
  bot_tune_hard: 'bot_tune_hard (+30%)',
};

/**
 * DOM overlay `<select>` for picking `sgtd.gameConfig`. Hidden until Admin is on.
 * Changing the value persists to localStorage and reloads the page.
 */
export class GameConfigPicker {
  readonly root: HTMLDivElement;
  private select: HTMLSelectElement;

  constructor() {
    this.root = document.createElement('div');
    this.root.style.cssText = [
      'position:fixed',
      'z-index:1000',
      'display:none',
      'flex-direction:column',
      'gap:6px',
      'pointer-events:auto',
      'font-family:system-ui,sans-serif',
    ].join(';');

    const caption = document.createElement('span');
    caption.textContent = 'CONFIG';
    caption.style.cssText = [
      'font-size:11px',
      'letter-spacing:0.2em',
      'color:#f0c071',
      'text-shadow:0 1px 3px rgba(0,0,0,0.9)',
    ].join(';');

    this.select = document.createElement('select');
    this.select.style.cssText = [
      'min-width:200px',
      'padding:8px 10px',
      'border-radius:8px',
      'border:2px solid #c79a5b',
      'background:rgba(26,15,10,0.92)',
      'color:#f5e6d3',
      'font-size:14px',
      'cursor:pointer',
    ].join(';');

    for (const id of GAME_CONFIG_NAMES) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = LABELS[id] ?? id;
      if (id === activeGameConfigName) opt.selected = true;
      this.select.appendChild(opt);
    }

    this.select.addEventListener('change', () => {
      const next = this.select.value;
      if (next && next !== activeGameConfigName) persistGameConfigName(next);
    });

    this.root.append(caption, this.select);
    document.body.appendChild(this.root);
  }

  setVisible(on: boolean): void {
    this.root.style.display = on ? 'flex' : 'none';
  }

  /** Position in screen pixels (top-left of the block). */
  layout(x: number, y: number): void {
    this.root.style.left = `${x}px`;
    this.root.style.top = `${y}px`;
  }

  destroy(): void {
    this.root.remove();
  }
}
