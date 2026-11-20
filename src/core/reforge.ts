import { canArrange, createSnapshot, mergeRunes, restoreSnapshot, runeAt } from './shopEngine';
import { simulateFormation } from './tactics';
import type { Catalog, Run, Slot } from './types';

export const reforgeWave = 11;

export function canReforge(run: Run) {
  return run.reforgeRule === 1 && run.wave === reforgeWave && run.attempts === 0 &&
    !run.endless && !run.reforgeUsed && canArrange(run);
}

export function reforgeTargets(catalog: Catalog, configId: string) {
  const rarity = catalog[configId]?.rarity;
  return Object.values(catalog).filter(config => config.rarity === rarity && config.id !== configId);
}

export function prepareReforge(run: Run, from: Slot, target: string, catalog: Catalog) {
  if (!canReforge(run) || (from.zone !== 'board' && from.zone !== 'bench')) return;
  const original = runeAt(run, from);
  if (!original || original.configId === target || !Object.hasOwn(catalog, target) ||
      catalog[original.configId]?.rarity !== catalog[target].rarity) return;
  const candidate = { ...run };
  restoreSnapshot(candidate, createSnapshot(run));
  const replacement = { ...original, configId: target };
  candidate[from.zone][from.index] = replacement;
  const merges = mergeRunes(candidate);
  const final = merges.filter(merge => merge.rune.configId === target).at(-1) ?? { slot: from, rune: replacement };
  candidate.reforgeUsed = true;
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
