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

import btCards from './game_configs/bot_tune/cards.json';
import btEnemies from './game_configs/bot_tune/enemies.json';
import btLevels from './game_configs/bot_tune/levels.json';
import btLevelCombat from './game_configs/bot_tune/levelCombat.json';
import btWaves from './game_configs/bot_tune/waves.json';
import btReactions from './game_configs/bot_tune/reactions.json';
import btRecipes from './game_configs/bot_tune/recipes.json';
import btProgression from './game_configs/bot_tune/progression.json';
import btCombatRules from './game_configs/bot_tune/combatRules.json';
import btBattleRules from './game_configs/bot_tune/battleRules.json';
import btBattleSeed from './game_configs/bot_tune/battleSeed.json';

import bthCards from './game_configs/bot_tune_hard/cards.json';
import bthEnemies from './game_configs/bot_tune_hard/enemies.json';
import bthLevels from './game_configs/bot_tune_hard/levels.json';
import bthLevelCombat from './game_configs/bot_tune_hard/levelCombat.json';
import bthWaves from './game_configs/bot_tune_hard/waves.json';
import bthReactions from './game_configs/bot_tune_hard/reactions.json';
import bthRecipes from './game_configs/bot_tune_hard/recipes.json';
import bthProgression from './game_configs/bot_tune_hard/progression.json';
import bthCombatRules from './game_configs/bot_tune_hard/combatRules.json';
import bthBattleRules from './game_configs/bot_tune_hard/battleRules.json';
import bthBattleSeed from './game_configs/bot_tune_hard/battleSeed.json';

import ctCards from './game_configs/campaign_tight/cards.json';
import ctEnemies from './game_configs/campaign_tight/enemies.json';
import ctLevels from './game_configs/campaign_tight/levels.json';
import ctLevelCombat from './game_configs/campaign_tight/levelCombat.json';
import ctWaves from './game_configs/campaign_tight/waves.json';
import ctReactions from './game_configs/campaign_tight/reactions.json';
import ctRecipes from './game_configs/campaign_tight/recipes.json';
import ctProgression from './game_configs/campaign_tight/progression.json';
import ctCombatRules from './game_configs/campaign_tight/combatRules.json';
import ctBattleRules from './game_configs/campaign_tight/battleRules.json';
import ctBattleSeed from './game_configs/campaign_tight/battleSeed.json';

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
  /** Bot-tuned balance: 55–70% win corridor target, spread support mobs, softer energy grid. */
  bot_tune: toGameConfig({
    cards: btCards,
    enemies: btEnemies,
    levels: btLevels,
    levelCombat: btLevelCombat,
    waves: btWaves,
    reactions: btReactions,
    recipes: btRecipes,
    progression: btProgression,
    combatRules: btCombatRules,
    battleRules: btBattleRules,
    battleSeed: btBattleSeed,
  }),
  /** bot_tune +30% hpScale tier; burn costs partially restored. */
  bot_tune_hard: toGameConfig({
    cards: bthCards,
    enemies: bthEnemies,
    levels: bthLevels,
    levelCombat: bthLevelCombat,
    waves: bthWaves,
    reactions: bthReactions,
    recipes: bthRecipes,
    progression: bthProgression,
    combatRules: bthCombatRules,
    battleRules: bthBattleRules,
    battleSeed: bthBattleSeed,
  }),
  /** Tighter campaign: empty board lvl 1–3, denser waves, lvl_7 rebalance. */
  campaign_tight: toGameConfig({
    cards: ctCards,
    enemies: ctEnemies,
    levels: ctLevels,
    levelCombat: ctLevelCombat,
    waves: ctWaves,
    reactions: ctReactions,
    recipes: ctRecipes,
    progression: ctProgression,
    combatRules: ctCombatRules,
    battleRules: ctBattleRules,
    battleSeed: ctBattleSeed,
  }),
};

export const GAME_CONFIG_NAMES: string[] = Object.keys(GAME_CONFIGS);
