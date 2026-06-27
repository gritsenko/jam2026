import { Container } from 'pixi.js';
import { COLORS, hex } from '../theme';
import type { LayoutInfo } from '../core/ResponsiveLayout';
import { Scene } from '../core/scene';
import { t } from '../core/i18n';
import { Button } from '../ui/Button';
import { LangSwitch } from '../ui/LangSwitch';
import { SpeedStepper, type StepperModel } from '../ui/SpeedStepper';
import { AdminHud } from '../ui/AdminHud';
import { MuteButton } from '../ui/MuteButton';
import { SceneBackground } from '../ui/SceneBackground';
import { glowCircle, makeText } from '../ui/helpers';
import {
  getEnemySpeed,
  stepEnemySpeed,
  ENEMY_SPEED_MIN,
  ENEMY_SPEED_MAX,
} from '../core/settings';
import * as progress from '../game/progress';
import * as Telemetry from '../telemetry/Telemetry';

/** Enemy-speed dial model for the shared {@link SpeedStepper} (difficulty knob). */
const ENEMY_SPEED_MODEL: StepperModel = {
  captionKey: 'settings.enemySpeed',
  get: getEnemySpeed,
  step: stepEnemySpeed,
  min: ENEMY_SPEED_MIN,
  max: ENEMY_SPEED_MAX,
};

/** Seconds the reset button stays "armed" before it disarms itself (two-tap guard). */
const RESET_CONFIRM_SEC = 3;

/** Title screen: themed backdrop, title cluster, and a Start CTA. */
export class MainMenuScene extends Scene {
  private bg!: SceneBackground;
  private logo = new Container();
  private startBtn!: Button;
  private resetBtn!: Button;
  private watchIntroBtn!: Button;
  private muteBtn!: MuteButton;
  private adminHud!: AdminHud;
  private langSwitch!: LangSwitch;
  private enemySpeed!: SpeedStepper;
  private t = 0;
  /** True after the first reset tap, while it waits for the confirming second tap. */
  private resetArmed = false;
  private resetArmTimer = 0;

  override onEnter(): void {
    const { assets } = this.services;
    this.sortableChildren = true;
    // Intro is intentionally silent — kill any track carried over from the map.
    this.services.audio.stopMusic();

    this.bg = new SceneBackground(assets.get('bg_menu'));
    this.addChild(this.bg);

    // Title cluster: a soft glow behind the stacked title text. Brand name is a
    // non-localized literal (same in every locale, like the old SYNERGY GRID);
    // only the tagline goes through i18n.
    const glow = glowCircle(220, COLORS.gold, 0.35);
    this.logo.addChild(glow);
    const title1 = makeText('BUHANKA', 'display', {
      fontSize: 118,
      fill: hex(COLORS.textBright),
      stroke: { color: hex(COLORS.textDark), width: 8, alpha: 0.85 },
    });
    title1.anchor.set(0.5);
    title1.position.set(0, -60);
    const title2 = makeText('DEFENCE', 'display', { fontSize: 118, fill: hex(COLORS.gold) });
    title2.anchor.set(0.5);
    title2.position.set(0, 60);
    const sub = makeText(t('menu.subtitle'), 'label', {
      fontSize: 30,
      fill: hex(COLORS.textBright),
      stroke: { color: hex(COLORS.textDark), width: 5, alpha: 0.85 },
    });
    sub.anchor.set(0.5);
    sub.position.set(0, 152);
    this.logo.addChild(title1, title2, sub);
    this.addChild(this.logo);

    this.startBtn = new Button({
      label: t('common.play'),
      primary: true,
      width: 420,
      height: 110,
      labelColor: hex(COLORS.textBright),
      onClick: () => {
        this.services.audio.playSfx('sfx_click');
        Telemetry.track('menu_play');
        // First start of the campaign rolls the intro cutscene (Buhanka briefing);
        // afterwards START goes straight to the map. Gated purely on "seen" (not
        // shouldPlayStory) so Admin mode doesn't force the intro on every launch —
        // a progress reset clears seenStory and brings it back. The intro hands off
        // to the world map when it ends.
        if (!progress.hasSeenStory('intro')) {
          this.services.navigate('cutscene', { id: 'intro', next: { route: 'worldmap' } });
        } else {
          this.services.navigate('worldmap');
        }
      },
    });
    this.addChild(this.startBtn);

    // Quiet secondary action under START: wipes campaign progress so the player can
    // start over (which also re-arms the intro cutscene — next START plays it again).
    // Two-tap to confirm so a stray tap can't nuke a save: the first tap arms +
    // relabels the button, a second tap within a few seconds actually resets.
    this.resetBtn = new Button({
      label: t('menu.resetProgress'),
      preset: 'label',
      width: 420,
      height: 64,
      onClick: () => this.onResetTap(),
    });
    this.addChild(this.resetBtn);

    // Replay the intro on demand (returns to the menu when it ends/skips). Separate
    // from the auto-play gate on START — this always plays it, regardless of "seen".
    this.watchIntroBtn = new Button({
      label: t('menu.watchIntro'),
      preset: 'label',
      width: 420,
      height: 64,
      onClick: () => {
        this.services.audio.playSfx('sfx_click');
        Telemetry.track('menu_watch_intro');
        this.services.navigate('cutscene', { id: 'intro', next: { route: 'menu' } });
      },
    });
    this.addChild(this.watchIntroBtn);

    this.adminHud = new AdminHud('menu');
    this.addChild(this.adminHud);

    // Global sound on/off — same control, top-right corner, on every screen.
    this.muteBtn = new MuteButton(this.services.audio, 64);
    this.addChild(this.muteBtn);

    // Language picker at the start screen (the brief's "switch at the start"). Also
    // available in the in-battle settings panel. Switching persists + reloads.
    this.langSwitch = new LangSwitch(420, true);
    this.addChild(this.langSwitch);

    // Enemy-speed difficulty dial (separate from the in-battle game-speed tempo):
    // same stepper widget, defaults to 1.0×, persists and applies live in battle.
    this.enemySpeed = new SpeedStepper(
      420,
      (v) => Telemetry.track('enemy_speed_change', { value: v }),
      ENEMY_SPEED_MODEL,
    );
    this.addChild(this.enemySpeed);
  }

  override layout(info: LayoutInfo): void {
    this.bg.fit(info);
    const { safe } = info;
    const cx = safe.x + safe.width / 2;
    this.logo.position.set(cx, safe.y + safe.height * 0.38);
    // START sits a touch above mid-lower so the two quiet secondary buttons below it
    // (reset, watch-intro) clear the bottom language/speed controls on short screens.
    this.startBtn.position.set(cx, safe.y + safe.height * 0.66);
    // Stacked under START: reset, then watch-intro (half-START + gap + half-btn, then
    // half-btn + gap + half-btn for the next row).
    this.resetBtn.position.set(cx, this.startBtn.y + 55 + 16 + 32);
    this.watchIntroBtn.position.set(cx, this.resetBtn.y + 32 + 14 + 32);
    this.muteBtn.position.set(safe.x + safe.width - 18 - 32, safe.y + 18 + 32);
    const langY = safe.y + safe.height - this.langSwitch.contentHeight - 28;
    this.langSwitch.position.set(cx - 210, langY);
    // Enemy-speed stepper stacked just above the language picker.
    this.enemySpeed.position.set(cx - 210, langY - this.enemySpeed.contentHeight - 28);
    this.adminHud.layout(info);
  }

  /** First tap arms + relabels; second tap (while armed) performs the wipe. */
  private onResetTap(): void {
    this.services.audio.playSfx('sfx_click');
    if (!this.resetArmed) {
      this.resetArmed = true;
      this.resetArmTimer = RESET_CONFIRM_SEC;
      this.resetBtn.setLabel(t('menu.resetConfirm'));
      return;
    }
    progress.reset();
    Telemetry.track('progress_reset');
    this.disarmReset();
  }

  /** Drop the armed state and restore the resting label. */
  private disarmReset(): void {
    this.resetArmed = false;
    this.resetArmTimer = 0;
    this.resetBtn.setLabel(t('menu.resetProgress'));
  }

  override update(dt: number): void {
    this.t += dt;
    // Subtle breathing on the title cluster.
    this.logo.scale.set(1 + Math.sin(this.t * 1.4) * 0.012);
    // Auto-disarm the reset confirm if the second tap never comes.
    if (this.resetArmed) {
      this.resetArmTimer -= dt;
      if (this.resetArmTimer <= 0) this.disarmReset();
    }
  }
}
