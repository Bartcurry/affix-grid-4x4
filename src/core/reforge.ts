import { bestFormationMove } from './formationMove';
import { canArrange, createSnapshot, mergeRunes, restoreSnapshot, runeAt, swapRunes } from './shopEngine';
import { simulateFormation } from './tactics';
import type { Catalog, Run, Slot, TurnResult } from './types';

export const reforgeWave = 11;
export type ReforgeSwap = { from: Slot; to: Slot };
export type ReforgeSuggestion = { from: Slot; target: string; swap?: ReforgeSwap; result: TurnResult };

export function canReforge(run: Run) {
  return run.reforgeRule === 1 && run.wave === reforgeWave && run.attempts === 0 &&
    !run.endless && !run.reforgeUsed && canArrange(run);
}

export function reforgeTargets(catalog: Catalog, configId: string) {
  const rarity = catalog[configId]?.rarity;
  return Object.values(catalog).filter(config => config.rarity === rarity && config.id !== configId);
}

export function prepareReforge(run: Run, from: Slot, target: string, catalog: Catalog, swap?: ReforgeSwap) {
  if (!canReforge(run) || (from.zone !== 'board' && from.zone !== 'bench')) return;
  const original = runeAt(run, from);
  if (!original || original.configId === target || !Object.hasOwn(catalog, target) ||
      catalog[original.configId]?.rarity !== catalog[target].rarity) return;
  const candidate = { ...run };
  restoreSnapshot(candidate, createSnapshot(run));
  const replacement = { ...original, configId: target };
  candidate[from.zone][from.index] = replacement;
  const merges = mergeRunes(candidate);
  let final = merges.filter(merge => merge.rune.configId === target).at(-1) ?? { slot: from, rune: replacement };
  candidate.reforgeUsed = true;
  if (swap) {
    const { from, to } = swap;
    if ((from.zone === 'bench' && to.zone === 'bench') || (from.zone === to.zone && from.index === to.index) ||
        !swapRunes(candidate, from, to)) return;
    if (runeAt(candidate, to) === final.rune) final = { ...final, slot: to };
    else if (runeAt(candidate, from) === final.rune) final = { ...final, slot: from };
  }
  return { candidate, final, merges };
}

export function previewReforges(run: Run, from: Slot, catalog: Catalog) {
  const source = runeAt(run, from);
  if (!source) return [];
  return reforgeTargets(catalog, source.configId).flatMap(config => {
    const prepared = prepareReforge(run, from, config.id, catalog);
    if (!prepared) return [];
    const { events } = simulateFormation(prepared.candidate, catalog);
    const result = events.at(-1);
    return result?.type === 'TURN_RESULT' ? [{ target: config, prepared, result }] : [];
  }).sort((a, b) => b.result.damage - a.result.damage);
}

export function findReforgeSuggestion(run: Run, catalog: Catalog, currentDamage: number): ReforgeSuggestion | undefined {
  if (!canReforge(run)) return;
  const choices = (['board', 'bench'] as const).flatMap(zone => run[zone].flatMap((rune, index) => {
    if (!rune) return [];
    const from = { zone, index };
    return previewReforges(run, from, catalog).map(option => ({ ...option, from }));
  })).sort((a, b) => b.result.damage - a.result.damage);
  const top = choices[0];
  if (!top) return;
  let best: ReforgeSuggestion | undefined = top.result.damage > currentDamage
    ? { from: top.from, target: top.target.id, result: top.result } : undefined;
  if (best?.result.win) return best;

  // Leave room for a promising change at a different source or with a different replacement.
  const distinct = new Set<string>();
  for (const choice of choices) {
    const key = `${choice.from.zone}:${choice.from.index}:${choice.target.archetype}`;
    if (distinct.has(key)) continue;
    distinct.add(key);
    const move = bestFormationMove(choice.prepared.candidate, catalog, choice.result.damage);
    if (move && move.result.damage > (best?.result.damage ?? currentDamage)) {
      best = { from: choice.from, target: choice.target.id, swap: { from: move.from, to: move.to }, result: move.result };
    }
    if (distinct.size === 6) break;
  }
  return best;
}
