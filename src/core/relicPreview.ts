import { formationMoves } from './formationMove';
import { canArrange, chooseRelic, victoryPayout } from './shopEngine';
import { previewPlacement, simulateFormation } from './tactics';
import type { Catalog, RelicId, Run, Slot, TurnResult } from './types';

interface RelicForecast {
  hp: number;
  result: TurnResult;
  gold: number;
  refreshes: number;
}

export interface RelicPlacement extends RelicForecast {
  from: Slot;
  to: Slot;
  relicDamage: number;
  relicGold: number;
}

export function previewRelicPick(run: Run, id: RelicId) {
  const candidate = { ...run, relics: [...run.relics] };
  return chooseRelic(candidate, id) ? candidate : undefined;
}

const settleGold = (run: Run, catalog: Catalog, result: TurnResult) =>
  result.gold + (result.win ? victoryPayout(run, result.gold, catalog).total : 0);

function evaluate(run: Run, catalog: Catalog): RelicForecast {
  const { hp, events } = simulateFormation(run, catalog);
  const result = events.at(-1);
  if (result?.type !== 'TURN_RESULT') throw new Error('Missing relic preview result');
  return { hp, result, gold: settleGold(run, catalog, result), refreshes: run.freeRefreshes };
}

export function previewRelics(run: Run, catalog: Catalog) {
  const original = evaluate(run, catalog);
  const choices = run.pendingRelics.flatMap(id => {
    const candidate = previewRelicPick(run, id);
    return candidate ? [{ id, ...evaluate(candidate, catalog) }] : [];
  });
  return { original, choices };
}

export function suggestRelicPlacement(run: Run, catalog: Catalog, original: RelicForecast, offer: RelicForecast & { id: RelicId }) {
  const picked = previewRelicPick(run, offer.id);
  if (!picked || !canArrange(picked)) return;
  const currentRelicDamage = offer.result.damage - original.result.damage;
  const currentRelicGold = offer.gold - original.gold;
  let best: RelicPlacement | undefined;
  for (const { move, candidate } of formationMoves(picked, catalog)) {
    const { from, to, result } = move;
    if (result.damage < offer.result.damage) continue;
    const gold = settleGold(candidate, catalog, result);
    if (result.damage === offer.result.damage && gold <= offer.gold) continue;
    if (best && (result.damage < best.result.damage || result.damage === best.result.damage && gold < best.gold)) continue;
    const movedWithoutRelic = previewPlacement(run, from, to);
    if (!movedWithoutRelic) continue;
    const withoutRelic = evaluate(movedWithoutRelic, catalog);
    const relicDamage = result.damage - withoutRelic.result.damage;
    const relicGold = gold - withoutRelic.gold;
    if ((relicDamage <= 0 && relicGold <= 0) || (relicDamage <= currentRelicDamage && relicGold <= currentRelicGold)) continue;
    if (best && result.damage === best.result.damage && gold === best.gold &&
      (relicDamage < best.relicDamage || relicDamage === best.relicDamage && relicGold <= best.relicGold)) continue;
    best = { from, to, hp: offer.hp, refreshes: offer.refreshes, result, gold, relicDamage, relicGold };
  }
  return best;
}
