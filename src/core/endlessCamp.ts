import { endlessCampAt } from './expedition';
import { CELL_COUNT } from './grid';
import { prepareBattle } from './tactics';
import type { Catalog, Run } from './types';

export type CampChoice = 'supplies' | 'repair' | 'move';
export const campGold = 18;

function campChange(run: Run, kind: CampChoice, cell?: number) {
  if (!run.endless || run.endlessRule !== 1 || !run.pendingCamp || !endlessCampAt(run.wave) ||
    run.status !== 'active' || run.pendingLoss || run.pendingRelics.length) return;
  if (kind === 'supplies') return { gold: run.gold + campGold };
  if (kind === 'repair') return run.shield < 3 ? { shield: run.shield + 1 } : undefined;
  if (kind !== 'move' || cell === undefined || !Number.isInteger(cell) || cell < 0 || cell >= CELL_COUNT || run.tileModifiers[cell]) return;
  const existing = Object.keys(run.tileModifiers).map(Number).find(index => run.tileModifiers[index] === 'li_fire');
  if (existing === undefined) return;
  const tileModifiers = { ...run.tileModifiers, [cell]: 'li_fire' as const };
  delete tileModifiers[existing];
  return { tileModifiers };
}

export function claimCamp(run: Run, kind: CampChoice, cell?: number) {
  const change = campChange(run, kind, cell);
  if (!change) return false;
  Object.assign(run, change, { pendingCamp: undefined });
  return true;
}

export function campChoices(run: Run, catalog: Catalog) {
  const forecast = (candidate: Run) => {
    const { events, hp } = prepareBattle(candidate, catalog);
    const result = events.at(-1);
    if (result?.type !== 'TURN_RESULT') throw new Error('Missing camp forecast');
    return { hp, result };
  };
  const show = (kind: CampChoice, cell?: number) => {
    const change = campChange(run, kind, cell);
    if (change) return [{ kind, cell, ...forecast({ ...run, ...change }) }];
    return [];
  };
  return { baseline: forecast(run), options: [...show('supplies'), ...show('repair'), ...run.board.flatMap((_, index) => show('move', index))] };
}
