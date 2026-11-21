import { readSharedBoard } from '../core/boardShare';
import { runScore } from '../core/openings';
import type { Catalog } from '../core/types';
import type { RunArchive } from './adapter';

export const archiveLimit = 5;

export function archiveBoard(entry: RunArchive, catalog: Catalog) {
  if (!entry.formation || !Number.isSafeInteger(entry.wave)) return;
  const board = readSharedBoard(entry.formation, catalog);
  if (!board || board.opening !== entry.opening || (board.enableSynergies === false) !== (entry.enableSynergies === false) ||
    (board.difficulty === 'expert') !== (entry.difficulty === 'expert') ||
    (board.bountyRoute && entry.bountyRule !== 1) || (board.wave === 20 && board.finaleRule !== entry.finaleRule)) return;
  if (board.wave === entry.wave || (entry.status === 'active' && board.wave === entry.wave - 1)) return board;
}

export function updateArchive(history: RunArchive[], entry: RunArchive) {
  const index = history.findIndex(item => item.seed === entry.seed && item.opening === entry.opening && item.difficulty === entry.difficulty &&
    item.enableSynergies === entry.enableSynergies &&
    item.altarRule === entry.altarRule && item.bountyRule === entry.bountyRule && item.engravingRule === entry.engravingRule &&
    item.endlessRule === entry.endlessRule && item.reforgeRule === entry.reforgeRule && item.finaleRule === entry.finaleRule);
  if (index < 0) return [entry, ...history].slice(0, archiveLimit);
  const prior = history[index];
  const before = runScore(prior);
  const after = runScore(entry);
  const difference = after.cleared - before.cleared || after.combo - before.combo ||
    Number(entry.status === 'victory') - Number(prior.status === 'victory') || Number(!!entry.formation) - Number(!!prior.formation);
  if (difference <= 0) return history;
  return history.map((item, position) => position === index ? entry : item);
}
