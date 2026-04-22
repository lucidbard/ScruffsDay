import type { GameState, FlagId, ItemId, SceneId } from './GameState';
import sceneThoughts from '../data/scene-thoughts.json';

interface ThoughtRule {
  dialogueId: string;
  flags?: string[];
  notFlags?: string[];
  items?: string[];
  notItems?: string[];
}

interface SceneThoughtsMap {
  [sceneId: string]: ThoughtRule[];
}

/**
 * Pick the highest-priority unshown thought for the current scene based on
 * game flags + inventory. Returns the dialogue id, or null if none match
 * (or all matching thoughts have already been shown).
 *
 * Rule matching: all listed `flags`/`items` must be set, all `notFlags`/`notItems`
 * must be unset. First matching rule in the scene's list wins.
 */
export function pickThoughtId(sceneId: SceneId, gameState: GameState): string | null {
  const rules = (sceneThoughts as unknown as SceneThoughtsMap)[sceneId];
  if (!rules) return null;

  for (const rule of rules) {
    if (gameState.hasShownThought(rule.dialogueId)) continue;
    if (rule.flags?.some((f) => !gameState.getFlag(f as FlagId))) continue;
    if (rule.notFlags?.some((f) => gameState.getFlag(f as FlagId))) continue;
    if (rule.items?.some((i) => !gameState.hasItem(i as ItemId))) continue;
    if (rule.notItems?.some((i) => gameState.hasItem(i as ItemId))) continue;
    return rule.dialogueId;
  }
  return null;
}
