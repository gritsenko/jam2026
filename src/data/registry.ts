// Static registry of all game configs. JSON is imported eagerly (synchronous) so
// the active config is ready before any src/config/*.ts reads it — this preserves
// the existing module-init order and the eager derived caches (DRAW_POOL, etc.).
// Manual (not import.meta.glob) so it works identically in Vite and Node/tsx.
//
// `default` is the fallback config; other configs use `game_config_id<N>` ids.

import { toGameConfig } from './schema';
import type { GameConfig } from './schema';

import defCards from './game_configs/default/cards.json';
import defEnemies from './game_configs/default/enemies.json';
import defLevels from './game_configs/default/levels.json';
import defLevelCombat from './game_configs/default/levelCombat.json';
import defWaves from './game_configs/default/waves.json';
import defReactions from './game_configs/default/reactions.json';
import defRecipes from './game_configs/default/recipes.json';
import defProgression from './game_configs/default/progression.json';
import defCombatRules from './game_configs/default/combatRules.json';
import defBattleRules from './game_configs/default/battleRules.json';
import defBattleSeed from './game_configs/default/battleSeed.json';

import aCards from './game_configs/game_config_id000001/cards.json';
import aEnemies from './game_configs/game_config_id000001/enemies.json';
import aLevels from './game_configs/game_config_id000001/levels.json';
import aLevelCombat from './game_configs/game_config_id000001/levelCombat.json';
import aWaves from './game_configs/game_config_id000001/waves.json';
import aReactions from './game_configs/game_config_id000001/reactions.json';
import aRecipes from './game_configs/game_config_id000001/recipes.json';
import aProgression from './game_configs/game_config_id000001/progression.json';
import aCombatRules from './game_configs/game_config_id000001/combatRules.json';
import aBattleRules from './game_configs/game_config_id000001/battleRules.json';
import aBattleSeed from './game_configs/game_config_id000001/battleSeed.json';

export const DEFAULT_GAME_CONFIG = 'default';

export const GAME_CONFIGS: Record<string, GameConfig> = {
  default: toGameConfig({
    cards: defCards,
    enemies: defEnemies,
    levels: defLevels,
    levelCombat: defLevelCombat,
    waves: defWaves,
    reactions: defReactions,
    recipes: defRecipes,
    progression: defProgression,
    combatRules: defCombatRules,
    battleRules: defBattleRules,
    battleSeed: defBattleSeed,
  }),
  game_config_id000001: toGameConfig({
    cards: aCards,
    enemies: aEnemies,
    levels: aLevels,
    levelCombat: aLevelCombat,
    waves: aWaves,
    reactions: aReactions,
    recipes: aRecipes,
    progression: aProgression,
    combatRules: aCombatRules,
    battleRules: aBattleRules,
    battleSeed: aBattleSeed,
  }),
};

export const GAME_CONFIG_NAMES: string[] = Object.keys(GAME_CONFIGS);
