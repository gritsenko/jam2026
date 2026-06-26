import { Container, Graphics, type PointData, Sprite, type Text } from 'pixi.js';
import { COLORS, hex } from '../theme';
import { formatGoldAmount } from '../config/battleRules';
import type { AssetLoader } from '../core/AssetLoader';
import { t } from '../core/i18n';
import { drawPanel, fitSprite, glowCircle, makeText } from './helpers';
import type { SlotHighlight } from './SlotView';

/**
 * The Reactor: a right-edge drop zone for burning cards. Origin center.
 * Highlights when a drag is in progress and reports global hit-testing. The
 * burn carries an escalating gold price ({@link setCost}, v3 §3.Г) shown live
 * on the slot.
 */
export class ReactorZone extends Container {
  private bg = new Graphics();
  private hl = new Graphics();
  private costText: Text;
  private w: number;
  private h: number;

  /** Drop-zone footprint (origin is the center), for scene-side anchoring. */
  get zoneW(): number {
    return this.w;
  }
  get zoneH(): number {
    return this.h;
  }

  constructor(assets: AssetLoader, width = 196, height = 300) {
    super();
    this.w = width;
    this.h = height;
    const W = width;
    const H = height;

    drawPanel(this.bg, -W / 2, -H / 2, W, H, {
      radius: 22,
      fill: COLORS.metalMid,
      edge: COLORS.reactor,
      edgeWidth: 5,
      bevel: true,
      rivets: true,
    });
    this.addChild(this.bg);

    const title = makeText(t('hud.reactor'), 'label', { fontSize: 26, fill: hex(COLORS.reactor) });
    title.anchor.set(0.5);
    title.position.set(0, -H / 2 + 34);
    this.addChild(title);

    const glow = glowCircle(W * 0.32, COLORS.reactor, 0.6);
    glow.position.set(0, -6);
    this.addChild(glow);

    const icon = new Sprite(assets.get('icon_reactor'));
    fitSprite(icon, W * 0.62, W * 0.62);
    icon.position.set(0, -6);
    this.addChild(icon);

    const burn = makeText(t('hud.burn'), 'title', { fontSize: 34, fill: hex(COLORS.reactor) });
    burn.anchor.set(0.5);
    burn.position.set(0, H / 2 - 90);
    this.addChild(burn);

    const sub = makeText(t('hud.reactorBurnEffect'), 'micro', { fontSize: 18, fill: hex(COLORS.energyOverdrive) });
    sub.anchor.set(0.5);
    sub.position.set(0, H / 2 - 58);
    this.addChild(sub);

    // Escalating gold price of the burn — kept live by the scene via setCost().
    const costRow = new Container();
    costRow.position.set(0, H / 2 - 26);
    const costIcon = new Sprite(assets.get('icon_gold'));
    fitSprite(costIcon, 26, 26);
    costIcon.position.set(-22, 0);
    this.costText = makeText('-20', 'label', { fontSize: 24, fill: hex(COLORS.gold) });
    this.costText.anchor.set(0, 0.5);
    this.costText.position.set(-4, 0);
    costRow.addChild(costIcon, this.costText);
    this.addChild(costRow);

    this.addChild(this.hl);
  }

  /** Update the live burn price (escalates per burn) and colour it by affordability. */
  setCost(cost: number, affordable: boolean): void {
    this.costText.text = `-${formatGoldAmount(cost)}`;
    this.costText.style.fill = hex(affordable ? COLORS.gold : COLORS.energyDanger);
  }

  setHighlight(state: SlotHighlight): void {
    this.hl.clear();
    if (state === 'none') return;
    const color = state === 'hover' ? COLORS.dropHover : COLORS.reactor;
    const alpha = state === 'hover' ? 0.45 : 0.22;
    this.hl.roundRect(-this.w / 2, -this.h / 2, this.w, this.h, 22).fill({ color, alpha });
    this.hl.roundRect(-this.w / 2, -this.h / 2, this.w, this.h, 22).stroke({ width: 5, color });
  }

  containsGlobal(p: PointData): boolean {
    return this.bg.getBounds().rectangle.contains(p.x, p.y);
  }
}
