import type { SharedBoard } from './boardShare';
import { previewPlacement, simulateFormation } from './tactics';
import type { Catalog, Rune, Slot, TurnResult } from './types';

export type FormationMove = { from: Slot; to: Slot; result: TurnResult };

const sameRune = (a: Rune | null, b: Rune | null) =>
  a?.configId === b?.configId && a?.star === b?.star && (a?.bonusPower ?? 0) === (b?.bonusPower ?? 0);

export function bestFormationMove(run: SharedBoard, catalog: Catalog, currentDamage: number) {
  const slots = (['board', 'bench'] as const).flatMap(zone => run[zone].map((rune, index) => ({ zone, index, rune })));
  let best: FormationMove | undefined;
  for (let i = 0; i < run.board.length; i++) {
    const left = slots[i];
    for (const right of slots.slice(i + 1)) {
      if (sameRune(left.rune, right.rune)) continue;
      const [source, target] = left.rune ? [left, right] : [right, left];
      const from: Slot = { zone: source.zone, index: source.index };
      const to: Slot = { zone: target.zone, index: target.index };
      const candidate = previewPlacement(run, from, to);
      if (!candidate) continue;
      const result = simulateFormation(candidate, catalog).events.at(-1);
      if (result?.type === 'TURN_RESULT' && result.damage > (best?.result.damage ?? currentDamage)) best = { from, to, result };
    }
  }
  return best;
}
