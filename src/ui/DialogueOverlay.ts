import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { COLORS, ELEMENTS, hex } from '../theme';
import type { AssetLoader } from '../core/AssetLoader';
import type { AudioBus } from '../core/AudioBus';
import type { LayoutInfo } from '../core/ResponsiveLayout';
import { tween, Easings, type TweenHandle } from '../core/tween';
import type { DialogueScript } from '../config/dialogue';
import { lineText } from '../config/dialogue';
import { characterName, getStoryCharacter, type Side } from '../config/storyCharacters';
import { CloseButton } from './CloseButton';
import { drawPanel, makeText } from './helpers';

const CHARS_PER_SEC = 42; // typewriter speed
const BOX_H_FRAC = 0.24; // dialogue box height as a fraction of the safe height
const BOX_MIN_H = 230;
const NAME_H = 56;
const PAD = 40;

export interface DialogueOverlayOptions {
  /** Darken the scene behind the dialogue (0..1). Default 0.45. */
  readonly dimAlpha?: number;
  /** Show the built-in ✕ skip button (skips the whole script). Default true. */
  readonly showSkip?: boolean;
}

interface SlotOccupant {
  readonly charId: string;
  readonly sprite: Sprite;
  /** Resting x once positioned (the slide-in animates toward this). */
  baseX: number;
  enter?: TweenHandle | null;
}

/**
 * Visual-novel dialogue overlay. Plays a {@link DialogueScript} on top of any
 * scene: full-body character portraits stand on the left / center / right, the
 * active speaker is lit while the others dim, and the line is typed out in a
 * brass box at the bottom under a tinted name plate.
 *
 * Self-contained, like {@link import('./TutorialModal').TutorialModal}: add it to
 * a scene's top layer, call `layout(info)` from the scene's layout hook and
 * `tick(dt)` from update. A tap reveals the rest of the current line, then
 * advances; the ✕ skips the whole script. It calls `onDone` once the last line is
 * acknowledged (or on skip).
 */
export class DialogueOverlay extends Container {
  private readonly scrim = new Graphics();
  private readonly portraitLayer = new Container();
  private readonly box = new Container();
  private readonly boxBg = new Graphics();
  private readonly namePlate = new Graphics();
  private readonly nameText: Text;
  private readonly chevron: Text;
  private bodyText: Text;
  private readonly skipBtn: CloseButton | null;

  private readonly slots: Record<Side, SlotOccupant | null> = { left: null, center: null, right: null };
  private readonly lastSide = new Map<string, Side>();

  private index = -1;
  private fullText = '';
  private revealed = 0; // chars revealed so far (float)
  private idleClock = 0;
  private done = false;
  private lastInfo: LayoutInfo | null = null;

  private readonly script: DialogueScript;
  private readonly assets: AssetLoader;
  private readonly audio: AudioBus;
  private readonly onDone: () => void;
  private readonly dimAlpha: number;

  constructor(
    script: DialogueScript,
    assets: AssetLoader,
    audio: AudioBus,
    onDone: () => void,
    opts: DialogueOverlayOptions = {},
  ) {
    super();
    this.script = script;
    this.assets = assets;
    this.audio = audio;
    this.onDone = onDone;
    this.dimAlpha = opts.dimAlpha ?? 0.45;

    // Scrim + box both advance the dialogue on tap (portraits live above the
    // scrim, so a tap on a portrait still hits the scrim region around it).
    this.scrim.eventMode = 'static';
    this.scrim.on('pointertap', () => this.onTap());
    this.box.eventMode = 'static';
    this.box.on('pointertap', () => this.onTap());

    this.nameText = makeText('', 'label', { fontSize: 30, fill: hex(COLORS.textBright) });
    this.nameText.anchor.set(0, 0.5);
    this.bodyText = makeText('', 'small', { fontSize: 36, fill: hex(COLORS.textBright) });
    this.bodyText.anchor.set(0, 0);
    this.chevron = makeText('▸', 'title', { fontSize: 40, fill: hex(COLORS.gold) });
    this.chevron.anchor.set(1, 1);
    this.chevron.visible = false;

    this.box.addChild(this.boxBg, this.namePlate, this.nameText, this.bodyText, this.chevron);

    this.skipBtn = (opts.showSkip ?? true) ? new CloseButton(60, () => this.skip()) : null;

    this.addChild(this.scrim, this.portraitLayer, this.box);
    if (this.skipBtn) this.addChild(this.skipBtn);

    this.next(); // show the first line
  }

  // --- input ---------------------------------------------------------------

  private onTap(): void {
    if (this.done) return;
    if (this.isTyping()) {
      this.revealed = this.fullText.length; // first tap: finish the line
      this.applyReveal();
      return;
    }
    this.audio.playSfx('sfx_click');
    this.next();
  }

  private isTyping(): boolean {
    return this.revealed < this.fullText.length;
  }

  private skip(): void {
    if (this.done) return;
    this.audio.playSfx('sfx_click');
    this.finish();
  }

  private finish(): void {
    if (this.done) return;
    this.done = true;
    this.onDone();
  }

  /** Advance to the next line, or finish after the last one. */
  private next(): void {
    this.index++;
    const line = this.script.lines[this.index];
    if (!line) {
      this.finish();
      return;
    }
    const char = getStoryCharacter(line.speaker);
    const side: Side = line.side ?? this.lastSide.get(char.id) ?? char.homeSide;

    if (!char.narrator) {
      this.lastSide.set(char.id, side);
      this.placeSpeaker(char.id, side);
    }
    this.setActive(char.narrator ? null : char.id);

    this.fullText = lineText(this.script.id, this.index, line.text);
    this.revealed = 0;
    this.renderBox();
  }

  // --- portraits -----------------------------------------------------------

  /** Put a character into a side slot, sliding it in if it's new there. */
  private placeSpeaker(charId: string, side: Side): void {
    // If this char already occupies another slot, vacate it (it's moving).
    for (const s of ['left', 'center', 'right'] as Side[]) {
      const occ = this.slots[s];
      if (occ && occ.charId === charId && s !== side) {
        this.removeSlot(s);
      }
    }
    const existing = this.slots[side];
    if (existing && existing.charId === charId) return; // already on stage here
    if (existing) this.removeSlot(side); // someone else was here — evict

    const char = getStoryCharacter(charId);
    const sprite = new Sprite(this.assets.get(char.assetKey ?? 'hero_avatar'));
    sprite.anchor.set(0.5, 1);
    const occupant: SlotOccupant = { charId, sprite, baseX: 0 };
    this.slots[side] = occupant;
    this.portraitLayer.addChild(sprite);
    this.positionPortrait(side, occupant);

    // Slide in from the nearest edge + fade. Skipped before the first layout
    // (no geometry yet) — that portrait simply appears in place on first layout.
    if (!this.lastInfo) return;
    const targetX = occupant.baseX;
    const dir = side === 'left' ? -1 : side === 'right' ? 1 : 0;
    sprite.x = targetX + dir * 120;
    sprite.alpha = 0;
    occupant.enter = tween({
      duration: 0.32,
      easing: Easings.outCubic,
      onUpdate: (e) => {
        if (sprite.destroyed) return;
        sprite.x = targetX + dir * 120 * (1 - e);
        sprite.alpha = e * this.activeAlpha(side);
      },
      onComplete: () => {
        if (!sprite.destroyed) occupant.enter = null;
      },
    });
  }

  private removeSlot(side: Side): void {
    const occ = this.slots[side];
    if (!occ) return;
    this.slots[side] = null;
    occ.enter?.stop();
    const sprite = occ.sprite;
    const dir = side === 'left' ? -1 : 1;
    tween({
      duration: 0.24,
      easing: Easings.outCubic,
      onUpdate: (e) => {
        if (sprite.destroyed) return;
        sprite.alpha = (1 - e) * sprite.alpha;
        sprite.x += dir * 6;
      },
      onComplete: () => {
        if (!sprite.destroyed) sprite.destroy();
      },
    });
  }

  /** Highlight the active speaker; dim the rest. `null` dims everyone (narration). */
  private setActive(charId: string | null): void {
    for (const s of ['left', 'center', 'right'] as Side[]) {
      const occ = this.slots[s];
      if (!occ) continue;
      const active = occ.charId === charId;
      occ.sprite.tint = active ? COLORS.white : 0x6b6f76;
      if (!occ.enter) occ.sprite.alpha = active ? 1 : 0.62;
      occ.sprite.zIndex = active ? 1 : 0;
    }
    this.portraitLayer.sortableChildren = true;
  }

  /** Resting alpha for a slot given who's currently active (used during slide-in). */
  private activeAlpha(side: Side): number {
    const occ = this.slots[side];
    if (!occ) return 1;
    return occ.sprite.tint === COLORS.white ? 1 : 0.62;
  }

  private positionPortrait(side: Side, occ: SlotOccupant): void {
    const info = this.lastInfo;
    if (!info) return;
    const { safe } = info;
    const boxTop = this.boxTopY(info);
    const availH = boxTop - safe.y - 8;
    const slotMaxW = safe.width * (side === 'center' ? 0.6 : 0.56);
    const tex = occ.sprite.texture;
    const tw = tex.width || 1;
    const th = tex.height || 1;
    const scale = Math.min(slotMaxW / tw, availH / th);
    occ.sprite.scale.set(scale);
    const cx =
      side === 'left'
        ? safe.x + safe.width * 0.26
        : side === 'right'
          ? safe.x + safe.width * 0.74
          : safe.x + safe.width * 0.5;
    occ.baseX = cx;
    // Feet sit a touch below the box's top edge, so the box overlaps the legs.
    occ.sprite.y = boxTop + 26;
    // While sliding in, the entrance tween owns x; otherwise snap to the resting x.
    if (!occ.enter) occ.sprite.x = cx;
  }

  // --- dialogue box --------------------------------------------------------

  private boxTopY(info: LayoutInfo): number {
    const { safe } = info;
    const boxH = Math.max(BOX_MIN_H, safe.height * BOX_H_FRAC);
    return safe.y + safe.height - boxH - 24;
  }

  /** Draw the box panel + name plate at the current layout, then re-flow the body. */
  private renderBox(): void {
    const info = this.lastInfo;
    if (!info) return;
    const { safe } = info;
    const line = this.script.lines[this.index];
    const char = line ? getStoryCharacter(line.speaker) : null;

    const boxW = safe.width - PAD * 2;
    const boxH = Math.max(BOX_MIN_H, safe.height * BOX_H_FRAC);
    const x = safe.x + PAD;
    const y = this.boxTopY(info);
    this.box.position.set(0, 0);

    this.boxBg.clear();
    drawPanel(this.boxBg, x, y, boxW, boxH, {
      radius: 24,
      fill: COLORS.metalDark,
      fillAlpha: 0.94,
      edge: COLORS.brass,
      edgeWidth: 5,
      bevel: true,
      bevelSplit: 0.34,
      rivets: true,
    });

    // Name plate — a small tinted tab riding the box's top edge (hidden for narrator).
    this.namePlate.clear();
    const showName = !!char && !char.narrator;
    this.namePlate.visible = showName;
    this.nameText.visible = showName;
    if (showName && char) {
      const accent = char.accent ? ELEMENTS[char.accent].base : COLORS.brass;
      const name = characterName(char.id);
      this.nameText.text = name;
      const plateW = Math.min(boxW * 0.6, this.nameText.width + PAD * 1.4);
      const plateX = x + 36;
      const plateY = y - NAME_H + 6;
      drawPanel(this.namePlate, plateX, plateY, plateW, NAME_H, {
        radius: 14,
        fill: COLORS.metalMid,
        edge: accent,
        edgeWidth: 4,
        bevel: true,
        bevelSplit: 0.5,
      });
      this.nameText.style.fill = hex(ELEMENTS[char.accent ?? 'Physical']?.glow ?? COLORS.textBright);
      this.nameText.position.set(plateX + PAD * 0.7, plateY + NAME_H / 2);
    }

    // Body text — word-wrapped to the box interior. Rebuilt so the wrap width
    // tracks the box (re-layout safe), then re-sliced to the current reveal.
    const bodyTop = y + (showName ? 30 : 40);
    const wrapW = boxW - PAD * 2;
    this.box.removeChild(this.bodyText);
    this.bodyText.destroy();
    const narrator = !!char?.narrator;
    this.bodyText = makeText('', 'small', {
      fontSize: narrator ? 34 : 36,
      fill: hex(narrator ? COLORS.textDim : COLORS.textBright),
      fontStyle: narrator ? 'italic' : 'normal',
      wordWrap: true,
      wordWrapWidth: wrapW,
      lineHeight: Math.round((narrator ? 34 : 36) * 1.32),
      align: narrator ? 'center' : 'left',
    });
    this.bodyText.anchor.set(0, 0);
    this.bodyText.position.set(narrator ? x + boxW / 2 : x + PAD, bodyTop);
    if (narrator) this.bodyText.anchor.set(0.5, 0);
    this.box.addChildAt(this.bodyText, this.box.getChildIndex(this.chevron));
    this.applyReveal();

    this.chevron.position.set(x + boxW - 24, y + boxH - 16);
  }

  private applyReveal(): void {
    const shown = Math.floor(this.revealed);
    this.bodyText.text = this.fullText.slice(0, shown);
    this.chevron.visible = !this.isTyping();
  }

  // --- lifecycle -----------------------------------------------------------

  tick(dt: number): void {
    this.idleClock += dt;
    if (this.isTyping()) {
      this.revealed = Math.min(this.fullText.length, this.revealed + CHARS_PER_SEC * dt);
      this.applyReveal();
    } else {
      // Blink the "continue" chevron once the line is fully shown.
      this.chevron.alpha = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(this.idleClock * 4));
    }
  }

  layout(info: LayoutInfo): void {
    this.lastInfo = info;
    const { full, safe } = info;
    this.scrim.clear();
    this.scrim.rect(full.x, full.y, full.width, full.height).fill({ color: COLORS.black, alpha: this.dimAlpha });
    // A deeper gradient band behind the box so text always reads over busy art.
    const boxTop = this.boxTopY(info);
    this.scrim
      .rect(full.x, boxTop - 80, full.width, full.y + full.height - (boxTop - 80))
      .fill({ color: COLORS.black, alpha: 0.28 });

    for (const s of ['left', 'center', 'right'] as Side[]) {
      const occ = this.slots[s];
      if (occ) this.positionPortrait(s, occ);
    }
    this.renderBox();
    if (this.skipBtn) this.skipBtn.position.set(safe.x + safe.width - 52, safe.y + 52);
  }

  override destroy(options?: Parameters<Container['destroy']>[0]): void {
    for (const s of ['left', 'center', 'right'] as Side[]) this.slots[s]?.enter?.stop();
    super.destroy(options);
  }
}
