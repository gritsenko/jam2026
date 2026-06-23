import { Container, Graphics } from 'pixi.js';
import { COLORS, hex } from '../theme';
import type { LayoutInfo } from '../core/ResponsiveLayout';
import { Scene } from '../core/scene';
import { LEVELS } from '../config/levels';
import type { LevelNode } from '../config/types';
import { Button } from '../ui/Button';
import { SceneBackground } from '../ui/SceneBackground';
import { WorldMapNode } from '../ui/WorldMapNode';
import { makeText } from '../ui/helpers';

/** World map: a winding canyon path of level nodes; tap an open node to fight. */
export class WorldMapScene extends Scene {
  private bg!: SceneBackground;
  private path = new Graphics();
  private nodesLayer = new Container();
  private nodes: WorldMapNode[] = [];
  private backBtn!: Button;
  private title = makeText('CHOOSE YOUR STAND', 'title', { fill: hex(COLORS.brassLight) });

  override onEnter(): void {
    const { assets } = this.services;
    this.bg = new SceneBackground(assets.get('bg_worldmap'));
    this.addChild(this.bg, this.path, this.nodesLayer);

    const texNode = assets.get('map_node');
    const texLocked = assets.get('map_node_locked');
    for (const node of LEVELS) {
      const view = new WorldMapNode(node, texNode, texLocked, (n) => this.onSelect(n));
      this.nodes.push(view);
      this.nodesLayer.addChild(view);
    }

    this.title.anchor.set(0.5, 0);
    this.addChild(this.title);

    this.backBtn = new Button({
      label: 'BACK',
      width: 200,
      height: 76,
      preset: 'label',
      onClick: () => this.services.navigate('menu'),
    });
    this.addChild(this.backBtn);
  }

  private onSelect(node: LevelNode): void {
    console.log(`[WorldMap] entering level ${node.id} (${node.name})`);
    this.services.navigate('battle', { levelId: node.id });
  }

  override layout(info: LayoutInfo): void {
    this.bg.fit(info);
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
  }

  override update(dt: number): void {
    for (const n of this.nodes) n.tick(dt);
  }
}
