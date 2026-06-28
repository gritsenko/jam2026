import { Container, Graphics } from 'pixi.js';
import { COLORS } from '../theme';
import type { AudioBus } from '../core/AudioBus';
import type { LayoutInfo } from '../core/ResponsiveLayout';
import { Button } from './Button';
import { Slider } from './Slider';
import { Checkbox } from './Checkbox';
import { LangSwitch } from './LangSwitch';
import { SpeedStepper } from './SpeedStepper';
import { drawPanel, makeText } from './helpers';
import { t } from '../core/i18n';
import { isTouchDragBoostEnabled, setTouchDragBoostEnabled } from '../core/touchControls';
import * as Telemetry from '../telemetry/Telemetry';

const CARD_W = 760;
const CARD_H = 1086;
const PAD = 52;

/**
 * Modal audio-settings overlay: a dimmed scrim behind a centered card with one
 * volume slider per mixer bus (music / effects / system) and a "mute all"
 * toggle. Reads and writes live through the AudioBus (which persists to
 * localStorage), so changes apply immediately and survive reloads.
 *
 * Self-contained: tapping the scrim (outside the card) closes it. Add it to a
 * scene's top layer and call `layout(info)` from the scene's layout hook.
 */
export class SettingsPanel extends Container {
  private scrim = new Graphics();
  private card = new Container();
  private cardBg = new Graphics();
  private muteBtn: Button;
  private privacyBtn: Button;
  private readonly audio: AudioBus;
  private readonly onClose: () => void;

  constructor(audio: AudioBus, onClose: () => void) {
    super();
    this.audio = audio;
    this.onClose = onClose;

    this.scrim.eventMode = 'static';
    this.scrim.cursor = 'pointer';
    this.scrim.on('pointertap', () => this.close());

    this.cardBg = new Graphics();
    drawPanel(this.cardBg, 0, 0, CARD_W, CARD_H, {
      radius: 28,
      fill: COLORS.metalMid,
      edge: COLORS.brass,
      edgeWidth: 5,
      bevel: true,
      rivets: true,
    });
    // Swallow taps on the card so they don't fall through to the scrim.
    this.card.eventMode = 'static';
    this.card.addChild(this.cardBg);

    const title = makeText(t('settings.title'), 'title', { fontSize: 46 });
    title.anchor.set(0.5, 0);
    title.position.set(CARD_W / 2, 36);
    this.card.addChild(title);

    const sliderW = CARD_W - PAD * 2;
    const music = new Slider({
      width: sliderW,
      label: t('settings.music'),
      value: audio.getVolume('music'),
      onChange: (v) => {
        audio.setVolume('music', v);
        Telemetry.track('volume_change', { channel: 'music', value: v });
      },
      accent: COLORS.crystal,
    });
    music.position.set(PAD, 120);
    const effects = new Slider({
      width: sliderW,
      label: t('settings.effects'),
      value: audio.getVolume('sfx'),
      onChange: (v) => {
        audio.setVolume('sfx', v);
        Telemetry.track('volume_change', { channel: 'sfx', value: v });
      },
      accent: COLORS.energyOk,
    });
    effects.position.set(PAD, 220);
    const system = new Slider({
      width: sliderW,
      label: t('settings.system'),
      value: audio.getVolume('ui'),
      onChange: (v) => {
        audio.setVolume('ui', v);
        Telemetry.track('volume_change', { channel: 'ui', value: v });
      },
      accent: COLORS.gold,
    });
    system.position.set(PAD, 320);
    this.card.addChild(music, effects, system);

    // Gameplay tempo: scales the whole battle sim (movement, projectiles, turret
    // rotation, cooldowns, buff/debuff durations) live. UI chrome is unaffected.
    const speed = new SpeedStepper(sliderW, (v) => {
      Telemetry.track('game_speed_change', { value: v });
    });
    speed.position.set(PAD, 408);
    this.card.addChild(speed);

    // Touch drag-assist toggle, placed right under the speed control (per request):
    // off makes a lifted card track the finger 1:1 vertically instead of racing ahead
    // (Block-Blast §2). Touch-only — mouse/pen are always 1:1 — and the bottom-third
    // lift (§3) stays on either way, so the finger never covers the card.
    const dragBoost = new Checkbox(
      t('settings.touchDragBoost'),
      isTouchDragBoostEnabled(),
      (on) => {
        setTouchDragBoostEnabled(on);
        Telemetry.track('touch_drag_boost_toggle', { on });
      },
    );
    dragBoost.position.set((CARD_W - dragBoost.width) / 2, 540);
    this.card.addChild(dragBoost);

    this.muteBtn = new Button({
      label: this.muteLabel(),
      width: sliderW,
      height: 84,
      preset: 'label',
      onClick: () => {
        this.audio.toggleMute();
        this.muteBtn.setLabel(this.muteLabel());
        Telemetry.track('mute_toggle', { muted: this.audio.isMuted });
      },
    });
    this.muteBtn.position.set(CARD_W / 2, 658);
    this.card.addChild(this.muteBtn);

    // Privacy: opt in/out of anonymous gameplay telemetry. Toggling emits one
    // last/first event so the change itself is recorded (when enabling).
    this.privacyBtn = new Button({
      label: this.privacyLabel(),
      width: sliderW,
      height: 84,
      preset: 'label',
      onClick: () => {
        const enable = !Telemetry.isEnabled();
        Telemetry.setEnabled(enable);
        Telemetry.track('telemetry_optout', { on: !enable });
        this.privacyBtn.setLabel(this.privacyLabel());
      },
    });
    this.privacyBtn.position.set(CARD_W / 2, 746);
    this.card.addChild(this.privacyBtn);

    // Language picker (mirrors the start-screen control). Switching persists +
    // reloads the page, so a change applies even mid-battle.
    const langSwitch = new LangSwitch(sliderW, true);
    langSwitch.position.set(PAD, 830);
    this.card.addChild(langSwitch);

    const closeBtn = new Button({
      label: t('common.close'),
      width: 280,
      height: 84,
      primary: true,
      onClick: () => this.close(),
    });
    closeBtn.position.set(CARD_W / 2, CARD_H - 64);
    this.card.addChild(closeBtn);

    this.addChild(this.scrim, this.card);
    Telemetry.track('settings_open');
  }

  private muteLabel(): string {
    return this.audio.isMuted ? t('settings.soundOff') : t('settings.muteAll');
  }

  private privacyLabel(): string {
    return Telemetry.isEnabled() ? t('settings.analyticsOn') : t('settings.analyticsOff');
  }

  private close(): void {
    this.onClose();
  }

  /** Cover the full canvas with the scrim and center the card on the safe area. */
  layout(info: LayoutInfo): void {
    const { full, safe } = info;
    this.scrim.clear();
    this.scrim
      .rect(full.x, full.y, full.width, full.height)
      .fill({ color: COLORS.black, alpha: 0.6 });
    this.card.position.set(
      safe.x + (safe.width - CARD_W) / 2,
      safe.y + (safe.height - CARD_H) / 2,
    );
  }
}
