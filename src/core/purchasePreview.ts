import { buyRune, createSnapshot, purchaseInfo, restoreSnapshot, runeAt } from './shopEngine';
import { previewPlacement, simulateFormation } from './tactics';
import type { Catalog, Run, Slot } from './types';

export function preparePurchase(run: Run, index: number, catalog: Catalog) {
  if (purchaseInfo(run, index, catalog).blocked) return;
  const candidate = { ...run };
  restoreSnapshot(candidate, createSnapshot(run));
  const merges = buyRune(candidate, index, catalog);
  if (!merges) return;
  const merge = merges.filter(item => item.rune.configId === run.shop[index]?.configId).at(-1);
  const slot: Slot = merge?.slot ?? { zone: 'bench', index: run.bench.indexOf(null) };
  const rune = runeAt(candidate, slot);
  if (!rune) return;
  return { candidate, merges, merge, slot, rune };
}

export function purchaseLayouts(purchase: NonNullable<ReturnType<typeof preparePurchase>>, catalog: Catalog) {
  const { candidate, slot } = purchase;
  function score(run: Run) {
    const { hp, events } = simulateFormation(run, catalog);
    const result = events.at(-1);
    if (result?.type !== 'TURN_RESULT') throw new Error('Missing purchase preview result');
    return { run, hp, result };
  }
  const fixed = score(candidate);
  const placements = candidate.board.map((_, index) => {
    const moved = previewPlacement(candidate, slot, { zone: 'board', index });
    return moved ? score(moved) : undefined;
  });
  let bestDamage = fixed.result.damage;
  let recommended: number | undefined;
  placements.forEach((placement, index) => {
    if (placement && placement.result.damage > bestDamage) {
      bestDamage = placement.result.damage;
      recommended = index;
    }
  });
  return { fixed, placements, recommended };
}
