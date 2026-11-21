import { bestFormationMove, type FormationMove } from './formationMove';
import { preparePurchase, purchaseLayouts } from './purchasePreview';
import { previewPlacement } from './tactics';
import type { Catalog, Run, Slot, TurnResult } from './types';

export interface FirstSupplyPlan {
  run: Run;
  result: TurnResult;
  purchase?: { index: number; landing: Slot };
  move?: FormationMove;
}

export function findFirstSupply(run: Run, catalog: Catalog, current: TurnResult): FirstSupplyPlan | undefined {
  if (run.wave !== 2 || current.win) return;
  const free = improve({ run, result: current }, catalog);
  if (free?.result.win) return free;

  const stock = run.shop.flatMap((offer, index) => {
    if (!offer) return [];
    const prepared = preparePurchase(run, index, catalog);
    if (!prepared) return [];
    const { fixed, placements } = purchaseLayouts(prepared, catalog);
    return [
      { ...fixed, purchase: { index, landing: prepared.slot } },
      ...placements.flatMap((layout, indexOnBoard) => layout
        ? [{ ...layout, purchase: { index, landing: { zone: 'board' as const, index: indexOnBoard } } }]
        : []),
    ];
  }).sort((a, b) => b.result.damage - a.result.damage);
  const choose = (options: FirstSupplyPlan[]) => options.filter(option => option.result.win)
    .sort((a, b) => b.run.gold - a.run.gold || b.result.damage - a.result.damage)[0];
  const immediate = choose(stock);
  if (immediate) return immediate;

  // A new rune can also make it worth moving one of the original pieces.
  const refinements = stock.slice(0, 10).flatMap(option => improve(option, catalog) ?? []);
  return choose(refinements) ?? [free, stock[0], ...refinements]
    .filter((option): option is FirstSupplyPlan => !!option && option.result.damage > current.damage)
    .sort((a, b) => b.result.damage - a.result.damage)[0];
}

function improve(plan: FirstSupplyPlan, catalog: Catalog): FirstSupplyPlan | undefined {
  const move = bestFormationMove(plan.run, catalog, plan.result.damage);
  if (!move) return;
  const run = previewPlacement(plan.run, move.from, move.to);
  if (run) return { ...plan, run, move, result: move.result };
}
