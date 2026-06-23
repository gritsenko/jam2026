import { Game } from './core/Game';
import type { RouteId, SceneFactory } from './core/scene';
import { MainMenuScene } from './scenes/MainMenuScene';
import { WorldMapScene } from './scenes/WorldMapScene';
import { BattleScene } from './scenes/BattleScene';

const routes: Record<RouteId, SceneFactory> = {
  menu: (s) => new MainMenuScene(s),
  worldmap: (s) => new WorldMapScene(s),
  battle: (s) => new BattleScene(s),
};

async function main(): Promise<void> {
  const game = new Game();
  await game.boot(routes, 'menu');
  // Expose for quick console poking during development.
  (window as unknown as { game: Game }).game = game;
}

main().catch((err) => {
  console.error('[Synergy Grid TD] failed to start', err);
  const boot = document.getElementById('boot');
  if (boot) boot.textContent = 'Failed to start — see console';
});
