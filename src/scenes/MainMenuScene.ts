import { Container, Sprite } from 'pixi.js';
import { COLORS, hex } from '../theme';
import type { LayoutInfo } from '../core/ResponsiveLayout';
import { Scene } from '../core/scene';
import { Button } from '../ui/Button';
import { Checkbox } from '../ui/Checkbox';
import { GameConfigPicker } from '../ui/GameConfigPicker';
import { MuteButton } from '../ui/MuteButton';
import { SceneBackground } from '../ui/SceneBackground';
import { fitSprite, glowCircle, makeText } from '../ui/helpers';
import * as progress from '../game/progress';
import * as Telemetry from '../telemetry/Telemetry';

/** Title screen: themed backdrop, logo, platform showcase, and a Start CTA. */
export class MainMenuScene extends Scene {
  private bg!: SceneBackground;
  private logo = new Container();
  private platform = new Container();
  private platformBaseY = 0;
  private startBtn!: Button;
  private muteBtn!: MuteButton;
  private adminToggle!: Checkbox;
  private configPicker!: GameConfigPicker;
  private t = 0;
  private lastLayout?: LayoutInfo;

  override onExit(): void {
    this.configPicker?.destroy();
  }

  override onEnter(): void {
    const { assets } = this.services;
    // Intro is intentionally silent — kill any track carried over from the map.
    this.services.audio.stopMusic();

    this.bg = new SceneBackground(assets.get('bg_menu'));
    this.addChild(this.bg);

    // Hero showcase of the steampunk platform (the isometric base_platform art).
    if (assets.has('base_platform')) {
      const plate = new Sprite(assets.get('base_platform'));
      fitSprite(plate, 720, 560);
      this.platform.addChild(plate);
    }
    this.addChild(this.platform);

    // Logo cluster: emblem plate (if any) behind stacked title text.
    const glow = glowCircle(220, COLORS.gold, 0.35);
    this.logo.addChild(glow);
    if (assets.has('logo_title')) {
      const plate = new Sprite(assets.get('logo_title'));
      fitSprite(plate, 560, 360);
      this.logo.addChild(plate);
    }
    const title1 = makeText('SYNERGY', 'display', {
      fontSize: 120,
      fill: hex(COLORS.textBright),
      stroke: { color: hex(COLORS.textDark), width: 8, alpha: 0.85 },
    });
    title1.anchor.set(0.5);
    title1.position.set(0, -64);
    const title2 = makeText('GRID', 'display', { fontSize: 150, fill: hex(COLORS.gold) });
    title2.anchor.set(0.5);
    title2.position.set(0, 56);
    const sub = makeText('TOWER DEFENSE • MERGE', 'label', { fontSize: 30, fill: hex(COLORS.textDim) });
    sub.anchor.set(0.5);
    sub.position.set(0, 150);
    this.logo.addChild(title1, title2, sub);
    this.addChild(this.logo);

    this.startBtn = new Button({
      label: 'START',
      primary: true,
      width: 420,
      height: 110,
      labelColor: hex(COLORS.textBright),
      onClick: () => {
        this.services.audio.playSfx('sfx_click');
        Telemetry.track('menu_play');
        this.services.navigate('worldmap');
      },
    });
    this.addChild(this.startBtn);

    this.adminToggle = new Checkbox('ADMIN', progress.isAdmin(), (on) => {
      progress.setAdmin(on);
      Telemetry.track('admin_toggle', { on, screen: 'menu' });
      this.configPicker.setVisible(on);
      if (this.lastLayout) this.layoutAdmin(this.lastLayout);
    });
    this.addChild(this.adminToggle);

    this.configPicker = new GameConfigPicker();
    this.configPicker.setVisible(progress.isAdmin());

    // Global sound on/off — same control, top-right corner, on every screen.
    this.muteBtn = new MuteButton(this.services.audio, 64);
    this.addChild(this.muteBtn);
  }

  override layout(info: LayoutInfo): void {
    this.lastLayout = info;
    this.bg.fit(info);
    const { safe } = info;
    const cx = safe.x + safe.width / 2;
    this.logo.position.set(cx, safe.y + safe.height * 0.22);
    this.platformBaseY = safe.y + safe.height * 0.56;
    this.platform.position.set(cx, this.platformBaseY);
    this.startBtn.position.set(cx, safe.y + safe.height * 0.86);
    this.muteBtn.position.set(safe.x + safe.width - 18 - 32, safe.y + 18 + 32);
    this.layoutAdmin(info);
  }

  private layoutAdmin(info: LayoutInfo): void {
    const { safe } = info;
    this.adminToggle.position.set(safe.x + 40, safe.y + safe.height - 60 - this.adminToggle.height / 2);
    if (progress.isAdmin()) {
      const g = this.adminToggle.getGlobalPosition();
      this.configPicker.layout(g.x, g.y - 76);
    }
  }

  override update(dt: number): void {
    this.t += dt;
    // Subtle breathing on the logo + a gentle platform float.
    this.logo.scale.set(1 + Math.sin(this.t * 1.4) * 0.012);
    this.platform.y = this.platformBaseY + Math.sin(this.t * 1.1) * 6;
  }
}
