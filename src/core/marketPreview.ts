import { buyRune, createSnapshot, purchaseInfo, restoreSnapshot, type Merge } from './shopEngine';
import { prepareBattle } from './tactics';
import type { Catalog, Run, TurnResult } from './types';

export interface OfferPlacement {
  cell?: number;
  hp: number;
  result: TurnResult;
  merges: Merge[];
}

export function previewOffer(run: Run, index: number, catalog: Catalog): OfferPlacement[] {
  const { blocked, willMerge } = purchaseInfo(run, index, catalog);
  if (blocked) return [];
  const cells = willMerge ? [undefined] : run.board.map((_, cell) => cell);
  const snapshot = createSnapshot(run);
  const options: OfferPlacement[] = [];
  for (const cell of cells) {
    const candidate = { ...run };
    restoreSnapshot(candidate, snapshot);
    const merges = buyRune(candidate, index, catalog, cell);
    if (!merges) continue;
    const { events, hp } = prepareBattle(candidate, catalog);
    const result = events.at(-1);
    if (result?.type === 'TURN_RESULT') options.push({ cell, hp, result, merges });
  }
  return options;
}
