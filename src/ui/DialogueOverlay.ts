import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { COLORS, ELEMENTS, hex } from '../theme';
import type { AssetLoader } from '../core/AssetLoader';
import type { AudioBus } from '../core/AudioBus';
import type { LayoutInfo } from '../core/ResponsiveLayout';
import { tween, Easings, type TweenHandle } from '../core/tween';
import type { DialogueScript } from '../config/dialogue';
import { lineText } from '../config/dialogue';
import { characterName, getStoryCharacter, type Side } from '../config/storyCharacters';
import { SkipButton } from './SkipButton';
import { drawPanel, makeText } from './helpers';

const CHARS_PER_SEC = 75; // typewriter speed
const BOX_H_FRAC = 0.26; // dialogue box height as a fraction of the safe height
const BOX_MIN_H = 250;
const NAME_H = 56;
const PAD = 40;

/** Y of the dialogue box's top edge for a layout (shared with CutsceneScene). */
export function dialogueBoxTopY(info: LayoutInfo): number {
  const { safe } = info;
  const boxH = Math.max(BOX_MIN_H, safe.height * BOX_H_FRAC);
  return safe.y + safe.height - boxH - 24;
}

/**
 * Center point for a "skip" button so it rides the dialogue box's top-right edge,
 * mirroring the name plate on the top-left — i.e. right next to the box (the
 * tap-to-advance affordance). Shared by {@link DialogueOverlay} and CutsceneScene.
 */
export function dialogueSkipPos(info: LayoutInfo, btnW: number, btnH: number): { x: number; y: number } {
  const { safe } = info;
  const boxRight = safe.x + safe.width - PAD;
  return { x: boxRight - 18 - btnW / 2, y: dialogueBoxTopY(info) - btnH / 2 + 6 };
}

export interface DialogueOverlayOptions {
  /** Darken the scene behind the dialogue (0..1). Default 0.45. */
  readonly dimAlpha?: number;
  /** Show the built-in "skip" button (skips the whole script). Default true. */
  readonly showSkip?: boolean;
  /** Called when a line is shown, with its 0-based index in the script. */
  readonly onLineShown?: (index: number) => void;
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
 * advances; the SKIP button skips the whole script. It calls `onDone` once the
 * last line is acknowledged (or on skip).
 */
export class DialogueOverlay extends Container {
  private readonly scrim = new Graphics();
  private readonly portraitLayer = new Container();
  private readonly emoteLayer = new Container(); // floating-emoji flourish above portraits
  private readonly box = new Container();
  private readonly boxBg = new Graphics();
  private readonly namePlate = new Graphics();
  private readonly nameText: Text;
  private readonly chevron: Text;
  private bodyText: Text;
  private readonly skipBtn: SkipButton | null;

  private readonly slots: Record<Side, SlotOccupant | null> = { left: null, center: null, right: null };
  private readonly lastSide = new Map<string, Side>();
  /** Characters that have already barked this script — voice fires on first line only. */
  private readonly spokenChars = new Set<string>();

  private index = -1;
  private fullText = '';
  private revealed = 0; // chars revealed so far (float)
  private idleClock = 0;
  private done = false;
  private lastInfo: LayoutInfo | null = null;

  /**
   * Active per-line emoji emitter (DialogueLine.emote). Spawns either at a fixed
   * screen point (`at`, fraction of full area — DialogueLine.emoteAt) or, when
   * that's absent, anchored to the speaker's portrait slot (`side`).
   */
  private emote: { emojis: readonly string[]; side: Side | null; at: { x: number; y: number } | null } | null = null;
  private emoteClock = 0;
  private emoteParticles: { sprite: Text; handle: TweenHandle }[] = [];

  private readonly script: DialogueScript;
  private readonly assets: AssetLoader;
  private readonly audio: AudioBus;
  private readonly onDone: () => void;
  private readonly dimAlpha: number;
  private readonly onLineShown?: (index: number) => void;

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
    this.onLineShown = opts.onLineShown;

    // Scrim + box both advance the dialogue on tap (portraits live above the
    // scrim, so a tap on a portrait still hits the scrim region around it).
    this.scrim.eventMode = 'static';
    this.scrim.on('pointertap', () => this.onTap());
    this.box.eventMode = 'static';
    this.box.on('pointertap', () => this.onTap());

    this.nameText = makeText('', 'label', { fontSize: 34, fill: hex(COLORS.textBright) });
    this.nameText.anchor.set(0, 0.5);
    this.bodyText = makeText('', 'small', { fontSize: 36, fill: hex(COLORS.textBright) });
    this.bodyText.anchor.set(0, 0);
    this.chevron = makeText('▸', 'title', { fontSize: 40, fill: hex(COLORS.gold) });
    this.chevron.anchor.set(1, 1);
    this.chevron.visible = false;

    this.box.addChild(this.boxBg, this.namePlate, this.nameText, this.bodyText, this.chevron);

    this.skipBtn = (opts.showSkip ?? true) ? new SkipButton(() => this.skip()) : null;

    this.addChild(this.scrim, this.portraitLayer, this.emoteLayer, this.box);
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
    // Page-turn cue only on a real transition to another line (the last tap closes
    // the script — it's a dismiss, not a page turn).
    if (this.index + 1 < this.script.lines.length) this.audio.playSfx('sfx_nextpage');
    this.next();
  }

  private isTyping(): boolean {
    return this.revealed < this.fullText.length;
  }

  private skip(): void {
    if (this.done) return;
    this.audio.playSfx('sfx_hut');
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

    // `hidePortrait` lines show only the box (the painting already has the cast);
    // any portraits on stage are cleared. Otherwise place/light the speaker.
    if (line.hidePortrait) {
      this.clearPortraits();
    } else if (!char.narrator) {
      this.lastSide.set(char.id, side);
      this.placeSpeaker(char.id, side);
    }
    this.setActive(char.narrator || line.hidePortrait ? null : char.id);

    // Floating-emoji flourish for this line (rides the active speaker's portrait;
    // skipped when there's no portrait to anchor to — narrator / hidePortrait).
    const emoteSide: Side | null = line.hidePortrait || char.narrator ? null : side;
    this.setEmote(
      line.emote && line.emote.length > 0 && (line.emoteAt || emoteSide)
        ? { emojis: line.emote, side: line.emoteAt ? null : emoteSide, at: line.emoteAt ?? null }
        : null,
    );

    // Bark: a per-line `sound` plays for THIS phrase whenever present; otherwise the
    // speaker's default `voiceKey` fires once — only on the FIRST line that character
    // speaks in this script (later turns from the same speaker stay quiet).
    const bark = line.sound ?? (this.spokenChars.has(char.id) ? undefined : char.voiceKey);
    if (bark) this.audio.playSfx(bark);
    this.spokenChars.add(char.id);

    this.fullText = lineText(this.script.id, this.index, line.text);
    this.revealed = 0;
    this.renderBox();
    this.onLineShown?.(this.index);
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

  /** Clear every portrait on stage (used by `hidePortrait` lines). */
  private clearPortraits(): void {
    for (const s of ['left', 'center', 'right'] as Side[]) this.removeSlot(s);
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

  // --- emoji flourish ------------------------------------------------------

  /** Arm (or clear) the per-line floating-emoji emitter; tick() spawns over time. */
  private setEmote(next: { emojis: readonly string[]; side: Side | null; at: { x: number; y: number } | null } | null): void {
    this.emote = next && next.emojis.length > 0 ? next : null;
    this.emoteClock = 0;
    // Small opening burst so the flourish reads immediately (no-op before first
    // layout — there's no geometry yet; tick() takes over once it does).
    if (this.emote && this.lastInfo) for (let i = 0; i < 4; i++) this.spawnEmote();
  }

  /**
   * Spawn one emoji that drifts up + fades. It originates either at a fixed screen
   * point (`emote.at`, fraction of the full area) or, when none is set, near the
   * active speaker's portrait.
   */
  private spawnEmote(): void {
    const info = this.lastInfo;
    const emote = this.emote;
    if (!info || !emote) return;

    let startX: number;
    let startY: number;
    let rise: number;
    let sway: number;
    if (emote.at) {
      const f = info.full;
      const cx = f.x + f.width * emote.at.x;
      const cy = f.y + f.height * emote.at.y;
      startX = cx + (Math.random() - 0.5) * f.width * 0.22;
      startY = cy + (Math.random() - 0.5) * f.height * 0.05;
      rise = f.height * (0.1 + Math.random() * 0.08);
      sway = (Math.random() - 0.5) * f.width * 0.08;
    } else {
      const occ = emote.side ? this.slots[emote.side] : null;
      if (!occ || occ.sprite.destroyed) return;
      const sprite = occ.sprite;
      const w = Math.max(80, sprite.width);
      const h = Math.max(80, sprite.height);
      const top = sprite.y - h; // anchor (0.5, 1): feet at y, top a height up
      startX = occ.baseX + (Math.random() - 0.5) * w * 0.7;
      startY = top + h * (0.08 + Math.random() * 0.32);
      rise = 150 + Math.random() * 130;
      sway = (Math.random() - 0.5) * 70;
    }

    const glyph = emote.emojis[Math.floor(Math.random() * emote.emojis.length)] ?? '💖';
    const t = makeText(glyph, 'title', {
      fontSize: 46 + Math.random() * 18,
      fontFamily: '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif',
      stroke: { color: hex(COLORS.black), width: 0, alpha: 0 },
    });
    t.anchor.set(0.5);
    t.position.set(startX, startY);
    t.alpha = 0;
    this.emoteLayer.addChild(t);

    const dur = 1.5 + Math.random() * 0.9;
    const rec: { sprite: Text; handle: TweenHandle } = { sprite: t, handle: null as unknown as TweenHandle };
    rec.handle = tween({
      duration: dur,
      easing: Easings.outCubic,
      onUpdate: (e) => {
        if (t.destroyed) return;
        t.y = startY - rise * e;
        t.x = startX + sway * e + Math.sin(e * Math.PI * 3) * 6;
        t.alpha = e < 0.18 ? e / 0.18 : 1 - (e - 0.18) / 0.82;
        t.scale.set(0.7 + 0.4 * Math.min(1, e * 4));
      },
      onComplete: () => {
        const i = this.emoteParticles.indexOf(rec);
        if (i >= 0) this.emoteParticles.splice(i, 1);
        if (!t.destroyed) t.destroy();
      },
    });
    this.emoteParticles.push(rec);
  }

  // --- dialogue box --------------------------------------------------------

  private boxTopY(info: LayoutInfo): number {
    return dialogueBoxTopY(info);
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
    const bodySize = narrator ? 40 : 44;
    this.bodyText = makeText('', 'small', {
      fontSize: bodySize,
      fill: hex(narrator ? COLORS.textDim : COLORS.textBright),
      fontStyle: narrator ? 'italic' : 'normal',
      wordWrap: true,
      wordWrapWidth: wrapW,
      lineHeight: Math.round(bodySize * 1.3),
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
    // Trickle out the floating-emoji flourish while a line with `emote` is shown.
    if (this.emote) {
      const interval = 0.28;
      this.emoteClock += dt;
      while (this.emoteClock >= interval) {
        this.emoteClock -= interval;
        this.spawnEmote();
      }
    }
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
    const { full } = info;
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
    if (this.skipBtn) {
      const p = dialogueSkipPos(info, this.skipBtn.btnW, this.skipBtn.btnH);
      this.skipBtn.position.set(p.x, p.y);
    }
  }

  override destroy(options?: Parameters<Container['destroy']>[0]): void {
    for (const s of ['left', 'center', 'right'] as Side[]) this.slots[s]?.enter?.stop();
    for (const p of this.emoteParticles) p.handle.stop();
    this.emoteParticles = [];
    super.destroy(options);
  }
}
