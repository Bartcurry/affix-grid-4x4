import { buyRune, createSnapshot, purchaseInfo, restoreSnapshot, runeAt, victoryPayout } from './shopEngine';
import { previewPlacement, simulateFormation } from './tactics';
import type { Catalog, Run, Slot, TurnResult } from './types';

export function purchaseWallet(run: Run, result: TurnResult, catalog: Catalog) {
  const payout = result.win ? victoryPayout(run, result.gold, catalog) : undefined;
  return { gold: result.gold + (payout?.total ?? 0), interest: payout?.interest ?? 0 };
}

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
    return { run, hp, result, wallet: purchaseWallet(run, result, catalog) };
  }
  const fixed = score(candidate);
  const placements = candidate.board.map((_, index) => {
    const moved = previewPlacement(candidate, slot, { zone: 'board', index });
    return moved ? score(moved) : undefined;
  });
  let recommended: number | undefined;
  let strongest = fixed;
  let richest = fixed.result.win ? fixed : undefined;
  let economy: number | undefined;
  placements.forEach((placement, index) => {
    if (!placement) return;
    if (placement.result.damage > strongest.result.damage) {
      strongest = placement;
      recommended = index;
    }
    if (placement.result.win && (!richest || placement.wallet.gold > richest.wallet.gold ||
      (placement.wallet.gold === richest.wallet.gold && economy !== undefined && placement.result.damage > richest.result.damage))) {
      richest = placement;
      economy = index;
    }
  });
  return { fixed, placements, recommended, economy: richest && richest.wallet.gold > strongest.wallet.gold ? economy : undefined };
}
