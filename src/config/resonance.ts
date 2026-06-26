import type { ElementId, ReactionId } from './types';
import { activeGameConfig } from '../data/load';

/**
 * Stable, order-independent key for an unordered element pair, so the resonance
 * lookup is symmetric (Fire+Water === Water+Fire).
 */
export function pairKey(a: ElementId, b: ElementId): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** One element-pair resonance reaction (v2 §7) and the combat effect it grants. */
export interface Reaction {
  readonly id: ReactionId;
  readonly elements: readonly [ElementId, ElementId];
  /** Short label for the inspection panel / banner. */
  readonly name: string;
  /** One-line description of the effect. */
  readonly blurb: string;
}

/**
 * The Resonance Table (v2 §7). Data lives in JSON (src/data/game_configs/<config>/reactions.json)
 * via the active ConfigSet (docs/backlog/config-as-data.md). A reaction triggers on
 * a turret when its element pool contains both elements of a pair — gated to Grade
 * II+ by the "different sources" rule (§2.В).
 */
export const REACTIONS: readonly Reaction[] = activeGameConfig.reactions;

const BY_PAIR = new Map<string, Reaction>(REACTIONS.map((r) => [pairKey(r.elements[0], r.elements[1]), r]));
const BY_ID = new Map<ReactionId, Reaction>(REACTIONS.map((r) => [r.id, r]));

/** The reaction for an unordered element pair, or null if the pair is inert. */
export function reactionFor(a: ElementId, b: ElementId): Reaction | null {
  return BY_PAIR.get(pairKey(a, b)) ?? null;
}

export function getReaction(id: ReactionId): Reaction {
  const r = BY_ID.get(id);
  if (!r) throw new Error(`Unknown reaction id: ${id}`);
  return r;
}
