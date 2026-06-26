import { Container } from 'pixi.js';
import type { LayoutInfo } from '../core/ResponsiveLayout';
import * as progress from '../game/progress';
import { Checkbox } from './Checkbox';
import * as Telemetry from '../telemetry/Telemetry';
import {
  ADMIN_EDGE,
  ADMIN_ROW_H,
  getConfigPicker,
  layoutConfigPickerAt,
  worldMapAdminColumnX,
} from './adminTools';

/**
 * Pixi admin controls: ADMIN + optional Sell Towers / Burn Towers / Debug mode.
 * Always shows ADMIN; test toggles appear when admin is on. DOM config picker stacks below.
 */
export class AdminHud extends Container {
  readonly adminToggle: Checkbox;
  readonly sellToggle: Checkbox;
  readonly burnToggle: Checkbox;
  readonly debugToggle: Checkbox;
  private screen: 'menu' | 'worldmap';

  constructor(screen: 'menu' | 'worldmap', onAdminChange?: () => void) {
    super();
    this.screen = screen;
    this.sortableChildren = true;
    this.zIndex = 1000;

    this.adminToggle = new Checkbox('ADMIN', progress.isAdmin(), (on) => {
      progress.setAdmin(on);
      if (!on) {
        progress.setDebugMode(false);
        this.debugToggle.checked = false;
      }
      this.sellToggle.visible = on;
      this.burnToggle.visible = on;
      this.debugToggle.visible = on;
      onAdminChange?.();
      if (this.lastLayout) this.layout(this.lastLayout);
      else getConfigPicker().setVisible(on);
    });
    this.sellToggle = new Checkbox('Sell Towers', progress.isSellEnabled(), (on) => {
      progress.setSellEnabled(on);
      Telemetry.track('sell_toggle', { on });
    });
    this.burnToggle = new Checkbox('Burn Towers', progress.isBurnFieldEnabled(), (on) => {
      progress.setBurnFieldEnabled(on);
      Telemetry.track('burn_field_toggle', { on });
    });
    // Session-only: always off on load; not tied to Admin persistence.
    this.debugToggle = new Checkbox('Debug mode', false, (on) => {
      progress.setDebugMode(on);
    });
    const adminOn = progress.isAdmin();
    this.sellToggle.visible = adminOn;
    this.burnToggle.visible = adminOn;
    this.debugToggle.visible = adminOn;

    this.addChild(this.adminToggle, this.sellToggle, this.burnToggle, this.debugToggle);
  }

  private lastLayout?: LayoutInfo;

  layout(info: LayoutInfo): void {
    this.lastLayout = info;
    const { safe } = info;

    if (this.screen === 'menu') {
      this.layoutColumn(info, safe.x + ADMIN_EDGE + 8, safe.y + 88);
      return;
    }

    const colX = worldMapAdminColumnX(safe);
    const colY = safe.y + 100;
    this.layoutColumn(info, colX, colY);
  }

  /** Top → bottom: ADMIN, Sell Towers, Burn Towers, Debug mode, CONFIG. */
  private layoutColumn(info: LayoutInfo, colX: number, adminY: number): void {
    const sellY = adminY + ADMIN_ROW_H;
    const burnY = sellY + ADMIN_ROW_H;
    const debugY = burnY + ADMIN_ROW_H;
    const configY = debugY + ADMIN_ROW_H;
    this.adminToggle.position.set(colX, adminY);
    this.sellToggle.position.set(colX, sellY);
    this.burnToggle.position.set(colX, burnY);
    this.debugToggle.position.set(colX, debugY);
    layoutConfigPickerAt(info, colX, configY);
  }
}
