import { chooseRelic, victoryPayout } from './shopEngine';
import { planTurn } from './tactics';
import type { Catalog, Run } from './types';

export function previewRelics(run: Run, catalog: Catalog) {
  const evaluate = (candidate: Run) => {
    const { hp, result } = planTurn(candidate, catalog);
    const gold = result.gold + (result.win ? victoryPayout(candidate, result.gold, catalog).total : 0);
    return { hp, result, gold, refreshes: candidate.freeRefreshes };
  };
  const original = evaluate(run);
  const choices = run.pendingRelics.flatMap(id => {
    const candidate = { ...run, relics: [...run.relics] };
    return chooseRelic(candidate, id) ? [{ id, ...evaluate(candidate) }] : [];
  });
  return { original, choices };
}
