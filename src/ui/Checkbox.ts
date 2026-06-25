import { Container, Graphics, Rectangle } from 'pixi.js';
import { COLORS, RADIUS, hex } from '../theme';
import { makeText } from './helpers';

/**
 * A small labelled checkbox. Origin top-left of the box; the label sits to its
 * right. Purely self-contained: tapping anywhere on the row toggles and calls
 * `onChange` with the new value. Used for the world-map Admin toggle, and meant
 * to be reusable for future debug switches.
 */
export class Checkbox extends Container {
  private box = new Graphics();
  private tick = new Graphics();
  private _checked: boolean;
  private readonly size: number;
  private onChange: (checked: boolean) => void;

  constructor(label: string, checked: boolean, onChange: (checked: boolean) => void, size = 34) {
    super();
    this._checked = checked;
    this.size = size;
    this.onChange = onChange;

    this.addChild(this.box, this.tick);

    // Light fill + dark outline + shadow so the label reads over bright scene
    // backdrops (e.g. the world-map sand), not just dark HUD panels.
    const text = makeText(label, 'label', {
      fontSize: 24,
      fill: hex(COLORS.white),
      stroke: { color: hex(COLORS.black), width: 5, alpha: 0.95 },
      dropShadow: { color: hex(COLORS.black), alpha: 0.7, blur: 4, distance: 3, angle: Math.PI / 2 },
    });
    text.anchor.set(0, 0.5);
    text.position.set(size + 12, size / 2);
    this.addChild(text);

    this.eventMode = 'static';
    this.cursor = 'pointer';
    // Explicit hit area spanning box + label so the whole row is tappable
    // (a container without a hitArea isn't hit-tested in Pixi v8).
    const padY = Math.max(0, (text.height - size) / 2);
    this.hitArea = new Rectangle(0, -padY, size + 12 + text.width, size + padY * 2);
    this.on('pointertap', () => this.toggle());

    this.redraw();
  }

  get checked(): boolean {
    return this._checked;
  }

  set checked(v: boolean) {
    if (this._checked === v) return;
    this._checked = v;
    this.redraw();
  }

  private toggle(): void {
    this._checked = !this._checked;
    this.redraw();
    this.onChange(this._checked);
  }

  private redraw(): void {
    const s = this.size;
    const accent = this._checked ? COLORS.energyOk : COLORS.metalLight;
    this.box.clear();
    this.box
      .roundRect(0, 0, s, s, RADIUS.sm)
      .fill({ color: COLORS.bgDeep, alpha: 0.7 })
      .stroke({ width: 3, color: accent });

    this.tick.clear();
    if (this._checked) {
      this.tick
        .moveTo(s * 0.24, s * 0.52)
        .lineTo(s * 0.42, s * 0.72)
        .lineTo(s * 0.78, s * 0.28)
        .stroke({ width: 5, color: COLORS.energyOk, cap: 'round', join: 'round' });
    }
  }
}
