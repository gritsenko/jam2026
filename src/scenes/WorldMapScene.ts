import { Container, Graphics, Sprite } from 'pixi.js';
import { COLORS, hex } from '../theme';
import type { LayoutInfo } from '../core/ResponsiveLayout';
import { Scene } from '../core/scene';
import { LEVELS } from '../config/levels';
import type { LevelNode } from '../config/types';
import * as progress from '../game/progress';
import { Button } from '../ui/Button';
import { Checkbox } from '../ui/Checkbox';
import { SceneBackground } from '../ui/SceneBackground';
import { WorldMapNode } from '../ui/WorldMapNode';
import { makeText } from '../ui/helpers';

/** World map: a winding canyon path of level nodes; tap an open node to fight.
 *  Node states + stars are read live from campaign progress, and an Admin toggle
 *  unlocks every level (progression / admin-mode requests).
 *
 *  Layout mirrors the battle scene so it scales correctly on mobile and never
 *  desyncs on wide screens: a neutral backdrop (`bg_arena`) fills the whole
 *  canvas incl. the wide-screen decor margins, while the themed campaign map is
 *  **locked to the centered portrait frame** (the same `info.width`×`info.height`
 *  space the level nodes are positioned in). Because the map is cover-fit to that
 *  frame — not the full canvas — its themed biomes always line up with the nodes,
 *  whatever the screen aspect. */
export class WorldMapScene extends Scene {
  private marginBg!: SceneBackground; // neutral backdrop for the wide-screen margins + brass frame
  private map!: Sprite; // themed campaign map, locked to the portrait frame
  private mapMask = new Graphics(); // clips the map to the portrait frame
  private mapFrame = new Graphics(); // brass viewport edge, only when decor margins show
  private path = new Graphics();
  private nodesLayer = new Container();
  private nodes: WorldMapNode[] = [];
  private backBtn!: Button;
  private adminToggle!: Checkbox;
  private title = makeText('CHOOSE YOUR STAND', 'title', {
    fill: hex(COLORS.white),
    stroke: { color: hex(COLORS.black), width: 7, alpha: 0.95 },
    dropShadow: { color: hex(COLORS.black), alpha: 0.7, blur: 5, distance: 4, angle: Math.PI / 2 },
  });
  private lastInfo?: LayoutInfo;

  override onEnter(): void {
    const { assets } = this.services;
    this.services.audio.playMusic('music_map');
    this.marginBg = new SceneBackground(assets.get('bg_arena'));
    this.map = new Sprite(assets.get('bg_worldmap'));
    this.map.anchor.set(0.5);
    this.map.mask = this.mapMask;
    this.addChild(this.marginBg, this.map, this.mapMask, this.mapFrame, this.path, this.nodesLayer);

    this.rebuildNodes();

    this.title.anchor.set(0.5, 0);
    this.addChild(this.title);

    this.backBtn = new Button({
      label: 'BACK',
      width: 200,
      height: 76,
      preset: 'label',
      onClick: () => {
        this.services.audio.playSfx('sfx_click');
        this.services.navigate('menu');
      },
    });
    this.addChild(this.backBtn);

    this.adminToggle = new Checkbox('ADMIN', progress.isAdmin(), (on) => {
      progress.setAdmin(on);
      // Re-evaluate every node's lock/clear state with the new override.
      this.rebuildNodes();
      if (this.lastInfo) this.layout(this.lastInfo);
    });
    this.addChild(this.adminToggle);
  }

  /** (Re)create the level markers from current progress (states + stars). */
  private rebuildNodes(): void {
    const texNode = this.services.assets.get('map_node');
    const texLocked = this.services.assets.get('map_node_locked');
    this.nodesLayer.removeChildren();
    this.nodes = [];
    const admin = progress.isAdmin();
    for (const node of LEVELS) {
      const state = progress.levelState(node.id);
      // Available is always playable; cleared is replayable only in Admin (§4).
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
      this.nodes.push(view);
      this.nodesLayer.addChild(view);
    }
  }

  private onSelect(node: LevelNode): void {
    console.log(`[WorldMap] entering level ${node.id} (${node.name})`);
    this.services.navigate('battle', { levelId: node.id });
  }

  override layout(info: LayoutInfo): void {
    this.lastInfo = info;
    // Neutral backdrop fills the whole canvas (and frames the portrait column on
    // wide screens); the themed map is then locked to that portrait frame.
    this.marginBg.fit(info);

    const fw = info.width;
    const fh = info.height;
    const tw = this.map.texture.width || 1;
    const th = this.map.texture.height || 1;
    const scale = Math.max(fw / tw, fh / th); // cover-fit the frame, crop the overflow
    this.map.scale.set(scale);
    this.map.position.set(fw / 2, fh / 2);
    this.mapMask.clear();
    this.mapMask.rect(0, 0, fw, fh).fill({ color: COLORS.white });

    // Brass viewport edge only when decor margins are visible (wide / letterboxed);
    // in full-portrait the map runs edge-to-edge with no inset frame.
    this.mapFrame.clear();
    if (info.mode === 'wide' || info.offsetY > 0) {
      this.mapFrame
        .roundRect(2, 2, fw - 4, fh - 4, 8)
        .stroke({ width: 4, color: COLORS.brass, alpha: 0.5 });
    }

    const { safe } = info;

    this.nodes.forEach((view, i) => {
      const n = LEVELS[i]!;
      view.position.set(safe.x + n.nx * safe.width, safe.y + n.ny * safe.height);
    });

    // Connecting path through node centers (in array order).
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

    this.title.position.set(safe.x + safe.width / 2, safe.y + 12);
    this.backBtn.position.set(safe.x + 120, safe.y + safe.height - 60);
    // Admin toggle bottom-right, mirroring the BACK button's bottom margin.
    this.adminToggle.position.set(
      safe.x + safe.width - this.adminToggle.width - 40,
      safe.y + safe.height - 60 - this.adminToggle.height / 2,
    );
  }

  override update(dt: number): void {
    for (const n of this.nodes) n.tick(dt);
  }
}
