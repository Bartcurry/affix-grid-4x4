import { engravingPower, engravingWave } from './bounties';
import { simulateFormation } from './tactics';
import type { Catalog, Run } from './types';

export function claimEngraving(run: Run, index: number) {
  if (run.engravingRule !== 1 || !run.pendingEngraving || run.wave !== engravingWave ||
    run.endless || run.status !== 'active' || run.pendingLoss || run.pendingRelics.length ||
    !Number.isInteger(index) || index < 0 || index >= run.board.length) return false;
  const rune = run.board[index];
  if (!rune) return false;
  run.board[index] = { ...rune, bonusPower: (rune.bonusPower ?? 0) + engravingPower };
  delete run.pendingEngraving;
  return true;
}

export function previewEngravings(run: Run, catalog: Catalog) {
  function evaluate(candidate: Run) {
    const { hp, events } = simulateFormation(candidate, catalog);
    const result = events.at(-1);
    if (result?.type !== 'TURN_RESULT') throw new Error('Missing engraving preview result');
    return { hp, result };
  }
  const choices = run.board.flatMap((rune, index) => {
    if (!rune) return [];
    const candidate = { ...run, board: [...run.board] };
    return claimEngraving(candidate, index) ? [{ index, rune: candidate.board[index]!, ...evaluate(candidate) }] : [];
  });
  return { baseline: evaluate(run), choices };
}
