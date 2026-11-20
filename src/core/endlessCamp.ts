import { endlessCampAt } from './expedition';
import { CELL_COUNT } from './grid';
import { simulateFormation } from './tactics';
import type { Catalog, Run } from './types';

export type CampChoice = { id: 'supplies' } | { id: 'repair' } | { id: 'move'; cell: number };
export const campSupplies = { gold: 18, refreshes: 2 } as const;

export function fireCell(run: Pick<Run, 'tileModifiers'>) {
  return Object.keys(run.tileModifiers).map(Number).find(index => run.tileModifiers[index] === 'li_fire');
}

function campChange(run: Run, choice: CampChoice) {
  if (!run.endless || run.endlessRule !== 1 || !run.pendingCamp || !endlessCampAt(run.wave) ||
    run.status !== 'active' || run.pendingLoss || run.pendingRelics.length) return;
  if (choice.id === 'supplies') return { gold: run.gold + campSupplies.gold, freeRefreshes: run.freeRefreshes + campSupplies.refreshes };
  if (choice.id === 'repair') return run.shield < 3 ? { shield: run.shield + 1 } : undefined;
  if (choice.id !== 'move' || !Number.isInteger(choice.cell) || choice.cell < 0 || choice.cell >= CELL_COUNT ||
    run.tileModifiers[choice.cell]) return;
  const current = fireCell(run);
  if (current === undefined) return;
  const tileModifiers = { ...run.tileModifiers, [choice.cell]: 'li_fire' as const };
  delete tileModifiers[current];
  return { tileModifiers };
}

export function claimCamp(run: Run, choice: CampChoice) {
  const change = campChange(run, choice);
  if (!change) return false;
  Object.assign(run, change);
  delete run.pendingCamp;
  return true;
}

export function previewCamp(run: Run, catalog: Catalog) {
  function score(candidate: Run) {
    const { hp, events } = simulateFormation(candidate, catalog);
    const result = events.at(-1);
    if (result?.type !== 'TURN_RESULT') throw new Error('Missing camp preview result');
    return { hp, result };
  }
  const preview = (choice: CampChoice) => {
    const change = campChange(run, choice);
    return change ? score({ ...run, ...change }) : undefined;
  };
  return {
    baseline: score(run),
    supplies: preview({ id: 'supplies' }),
    repair: preview({ id: 'repair' }),
    placements: run.board.map((_, cell) => preview({ id: 'move', cell })),
  };
}
