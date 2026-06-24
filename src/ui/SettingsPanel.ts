import { Container, Graphics } from 'pixi.js';
import { COLORS } from '../theme';
import type { AudioBus } from '../core/AudioBus';
import type { LayoutInfo } from '../core/ResponsiveLayout';
import { Button } from './Button';
import { Slider } from './Slider';
import { drawPanel, makeText } from './helpers';

const CARD_W = 760;
const CARD_H = 600;
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

    const title = makeText('SETTINGS', 'title', { fontSize: 46 });
    title.anchor.set(0.5, 0);
    title.position.set(CARD_W / 2, 36);
    this.card.addChild(title);

    const sliderW = CARD_W - PAD * 2;
    const music = new Slider({
      width: sliderW,
      label: 'MUSIC',
      value: audio.getVolume('music'),
      onChange: (v) => audio.setVolume('music', v),
      accent: COLORS.crystal,
    });
    music.position.set(PAD, 120);
    const effects = new Slider({
      width: sliderW,
      label: 'EFFECTS',
      value: audio.getVolume('sfx'),
      onChange: (v) => audio.setVolume('sfx', v),
      accent: COLORS.energyOk,
    });
    effects.position.set(PAD, 220);
    const system = new Slider({
      width: sliderW,
      label: 'SYSTEM',
      value: audio.getVolume('ui'),
      onChange: (v) => audio.setVolume('ui', v),
      accent: COLORS.gold,
    });
    system.position.set(PAD, 320);
    this.card.addChild(music, effects, system);

    this.muteBtn = new Button({
      label: this.muteLabel(),
      width: sliderW,
      height: 84,
      preset: 'label',
      onClick: () => {
        this.audio.toggleMute();
        this.muteBtn.setLabel(this.muteLabel());
      },
    });
    this.muteBtn.position.set(CARD_W / 2, 452);
    this.card.addChild(this.muteBtn);

    const closeBtn = new Button({
      label: 'CLOSE',
      width: 280,
      height: 84,
      primary: true,
      onClick: () => this.close(),
    });
    closeBtn.position.set(CARD_W / 2, CARD_H - 64);
    this.card.addChild(closeBtn);

    this.addChild(this.scrim, this.card);
  }

  private muteLabel(): string {
    return this.audio.isMuted ? 'SOUND: OFF — TAP TO UNMUTE' : 'MUTE ALL';
  }

  private close(): void {
    this.audio.playSfx('sfx_click');
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
