import { victoryPayout } from './shopEngine';
import { prepareBattle } from './tactics';
import type { Catalog, Run } from './types';

export function previewRelics(run: Run, catalog: Catalog) {
  const evaluate = (candidate: Run) => {
    const { events, hp } = prepareBattle(candidate, catalog);
    const result = events.at(-1);
    if (result?.type !== 'TURN_RESULT') throw new Error('Missing relic forecast result');
    const gold = result.gold + (result.win ? victoryPayout(candidate, result.gold).total : 0);
    return { result, hp, gold };
  };
  const baseline = evaluate(run);
  const choices = run.pendingRelics.map(id => ({ id, ...evaluate({ ...run, relics: [...run.relics, id] }) }));
  return { baseline, choices };
}
