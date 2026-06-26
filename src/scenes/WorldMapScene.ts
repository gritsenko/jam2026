import { Container, Graphics, Sprite } from 'pixi.js';
import { COLORS, hex } from '../theme';
import type { LayoutInfo } from '../core/ResponsiveLayout';
import { Scene } from '../core/scene';
import { tween, Easings } from '../core/tween';
import type { TweenHandle } from '../core/tween';
import { LEVELS, levelRegion, levelsInRegion, worldMapPageCount } from '../config/levels';
import type { LevelNode } from '../config/types';
import * as progress from '../game/progress';
import { t } from '../core/i18n';
import { AdminHud } from '../ui/AdminHud';
import { Button } from '../ui/Button';
import { MuteButton } from '../ui/MuteButton';
import { SceneBackground } from '../ui/SceneBackground';
import { WorldMapNode } from '../ui/WorldMapNode';
import { makeText } from '../ui/helpers';
import * as Telemetry from '../telemetry/Telemetry';

/** One world-map screen: themed backdrop + serpentine path + level nodes. */
class MapPage extends Container {
  readonly map = new Sprite();
  readonly path = new Graphics();
  readonly nodesLayer = new Container();
  nodes: WorldMapNode[] = [];

  constructor(tex: import('pixi.js').Texture) {
    super();
    this.map.texture = tex;
    this.map.anchor.set(0.5);
    this.addChild(this.map, this.path, this.nodesLayer);
  }

  layoutMap(fw: number, fh: number): void {
    const tw = this.map.texture.width || 1;
    const th = this.map.texture.height || 1;
    const scale = Math.max(fw / tw, fh / th);
    this.map.scale.set(scale);
    this.map.position.set(fw / 2, fh / 2);
  }

  /** Node positions in page-local frame coords (0..fw × 0..fh). */
  layoutNodes(fw: number, fh: number, regionLevels: LevelNode[]): void {
    this.nodes.forEach((view, i) => {
      const n = regionLevels[i]!;
      view.position.set(n.nx * fw, n.ny * fh);
    });
    this.path.clear();
    const pts = this.nodes.map((v) => ({ x: v.x, y: v.y }));
    if (pts.length > 1) {
      const draw = (width: number, color: number, alpha: number) => {
        this.path.moveTo(pts[0]!.x, pts[0]!.y);
        for (let i = 1; i < pts.length; i++) this.path.lineTo(pts[i]!.x, pts[i]!.y);
        this.path.stroke({ width, color, alpha, cap: 'round', join: 'round' });
      };
      draw(26, COLORS.black, 0.3);
      draw(16, COLORS.brass, 0.85);
      draw(5, COLORS.brassLight, 0.6);
    }
  }
}

/**
 * World map: two campaign regions on separate screens, panned with arrow buttons.
 * Region 1 — levels 1–7 (seeded board); region 2 — levels 8–12 (empty start).
 */
export class WorldMapScene extends Scene {
  private marginBg!: SceneBackground;
  private scrollLayer = new Container();
  private mapMask = new Graphics();
  private mapFrame = new Graphics();
  private pages: MapPage[] = [];
  private pageIndex = 0;
  private pageCount = 1;
  private panTween?: TweenHandle;
  private frameW = 0;
  private backBtn!: Button;
  private prevBtn!: Button;
  private nextBtn!: Button;
  private adminHud!: AdminHud;
  private muteBtn!: MuteButton;
  private title = makeText(t('worldmap.title'), 'title', {
    fill: hex(COLORS.white),
    stroke: { color: hex(COLORS.black), width: 7, alpha: 0.95 },
    dropShadow: { color: hex(COLORS.black), alpha: 0.7, blur: 5, distance: 4, angle: Math.PI / 2 },
  });
  private regionLabel = makeText(t('worldmap.region1'), 'label', {
    fontSize: 24,
    fill: hex(COLORS.textDim),
  });
  private lastInfo?: LayoutInfo;

  override onEnter(): void {
    const { assets } = this.services;
    this.sortableChildren = true;
    this.pageCount = worldMapPageCount();
    this.services.audio.playMusic('music_map');
    Telemetry.setContext({ level: undefined, wave: undefined });
    Telemetry.track('worldmap_view', {
      cleared: LEVELS.filter((l) => progress.isCleared(l.id)).length,
      totalStars: LEVELS.reduce((sum, l) => sum + progress.starsFor(l.id), 0),
      pages: this.pageCount,
    });
    this.marginBg = new SceneBackground(assets.get('bg_arena'));
    const mapTex = assets.get('bg_worldmap');
    this.addChild(this.marginBg, this.scrollLayer, this.mapMask, this.mapFrame);

    this.scrollLayer.mask = this.mapMask;
    for (let i = 0; i < this.pageCount; i++) {
      const page = new MapPage(mapTex);
      this.pages.push(page);
      this.scrollLayer.addChild(page);
    }

    this.rebuildNodes();

    this.title.anchor.set(0.5, 0);
    this.regionLabel.anchor.set(0.5, 0);
    this.addChild(this.title, this.regionLabel);

    this.backBtn = new Button({
      label: t('common.back'),
      width: 200,
      height: 76,
      preset: 'label',
      onClick: () => {
        this.services.audio.playSfx('sfx_click');
        this.services.navigate('menu');
      },
    });
    this.addChild(this.backBtn);

    this.prevBtn = new Button({
      label: '◀',
      width: 88,
      height: 88,
      preset: 'title',
      onClick: () => this.goToPage(this.pageIndex - 1),
    });
    this.nextBtn = new Button({
      label: '▶',
      width: 88,
      height: 88,
      preset: 'title',
      onClick: () => this.goToPage(this.pageIndex + 1),
    });
    this.addChild(this.prevBtn, this.nextBtn);

    this.adminHud = new AdminHud('worldmap', () => {
      this.rebuildNodes();
      if (this.lastInfo) this.layout(this.lastInfo);
    });
    this.addChild(this.adminHud);

    this.muteBtn = new MuteButton(this.services.audio, 64);
    this.addChild(this.muteBtn);
  }

  override onExit(): void {
    this.panTween?.stop();
  }

  private goToPage(index: number): void {
    if (index < 0 || index >= this.pageCount || index === this.pageIndex) return;
    this.services.audio.playSfx('sfx_click');
    const fromX = this.scrollLayer.x;
    const toX = -index * this.frameW;
    this.panTween?.stop();
    this.panTween = tween({
      duration: 0.42,
      easing: Easings.inOutCubic,
      onUpdate: (t) => {
        this.scrollLayer.x = fromX + (toX - fromX) * t;
      },
      onComplete: () => {
        this.pageIndex = index;
        this.scrollLayer.x = toX;
        this.refreshNav();
      },
    });
    this.pageIndex = index;
    this.refreshNav();
  }

  private refreshNav(): void {
    this.prevBtn.visible = this.pageIndex > 0;
    this.nextBtn.visible = this.pageIndex < this.pageCount - 1;
    this.regionLabel.text =
      this.pageCount > 1 && this.pageIndex === 1 ? t('worldmap.region2') : t('worldmap.region1');
  }

  private rebuildNodes(): void {
    const texNode = this.services.assets.get('map_node');
    const texLocked = this.services.assets.get('map_node_locked');
    const admin = progress.isAdmin();
    for (let i = 0; i < this.pageCount; i++) {
      const region = i + 1;
      const page = this.pages[i]!;
      const regionLevels = levelsInRegion(region);
      page.nodesLayer.removeChildren();
      page.nodes = [];
      for (const node of regionLevels) {
        const state = progress.levelState(node.id);
        const selectable = state === 'available' || (state === 'cleared' && admin);
        const view = new WorldMapNode(
          node,
          state,
          progress.starsFor(node.id),
          selectable,
          texNode,
          texLocked,
          (n) => this.onSelect(n),
        );
        page.nodes.push(view);
        page.nodesLayer.addChild(view);
      }
    }
  }

  private onSelect(node: LevelNode): void {
    console.log(`[WorldMap] entering level ${node.id} (${node.name})`);
    Telemetry.track('level_select', {
      levelId: node.id,
      state: progress.levelState(node.id),
      stars: progress.starsFor(node.id),
      region: levelRegion(node),
    });
    this.services.navigate('battle', { levelId: node.id });
  }

  override layout(info: LayoutInfo): void {
    this.lastInfo = info;
    this.marginBg.fit(info);

    const fw = info.width;
    const fh = info.height;
    this.frameW = fw;

    this.mapMask.clear();
    this.mapMask.rect(0, 0, fw, fh).fill({ color: COLORS.white });

    this.mapFrame.clear();
    if (info.mode === 'wide' || info.offsetY > 0) {
      this.mapFrame
        .roundRect(2, 2, fw - 4, fh - 4, 8)
        .stroke({ width: 4, color: COLORS.brass, alpha: 0.5 });
    }

    for (let i = 0; i < this.pageCount; i++) {
      const page = this.pages[i]!;
      page.position.set(i * fw, 0);
      page.layoutMap(fw, fh);
      page.layoutNodes(fw, fh, levelsInRegion(i + 1));
    }
    this.scrollLayer.x = -this.pageIndex * fw;

    const { safe } = info;
    this.title.position.set(safe.x + safe.width / 2, safe.y + 12);
    this.regionLabel.position.set(safe.x + safe.width / 2, safe.y + 56);
    this.muteBtn.position.set(safe.x + safe.width - 18 - 32, safe.y + 18 + 32);
    this.backBtn.position.set(safe.x + 120, safe.y + safe.height - 60);
    this.prevBtn.position.set(safe.x + 56, safe.y + safe.height * 0.5);
    this.nextBtn.position.set(safe.x + safe.width - 56, safe.y + safe.height * 0.5);
    this.adminHud.layout(info);
    this.refreshNav();
  }

  override update(dt: number): void {
    for (const page of this.pages) for (const n of page.nodes) n.tick(dt);
  }
}
