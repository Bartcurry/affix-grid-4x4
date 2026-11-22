import type { SharedBoard } from './boardShare';
import { previewPlacement, simulateFormation } from './tactics';
import type { Catalog, Rune, Slot, TurnResult } from './types';

export type FormationMove = { from: Slot; to: Slot; result: TurnResult };
export type FormationPlan = { moves: FormationMove[]; result: TurnResult };

const sameRune = (a: Rune | null, b: Rune | null) =>
  a?.configId === b?.configId && a?.star === b?.star && (a?.bonusPower ?? 0) === (b?.bonusPower ?? 0);

export function* formationMoves<T extends SharedBoard>(run: T, catalog: Catalog) {
  const slots = (['board', 'bench'] as const).flatMap(zone => run[zone].map((rune, index) => ({ zone, index, rune })));
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
      if (result?.type === 'TURN_RESULT') yield { move: { from, to, result }, candidate };
    }
  }
}

export function bestFormationMove(run: SharedBoard, catalog: Catalog, currentDamage: number) {
  let best: FormationMove | undefined;
  for (const { move } of formationMoves(run, catalog)) {
    if (move.result.damage > (best?.result.damage ?? currentDamage)) best = move;
  }
  return best;
}

export function findFormationPlan(run: SharedBoard, catalog: Catalog, current: TurnResult): FormationPlan | undefined {
  const attempts = [...formationMoves(run, catalog)].sort((a, b) => b.move.result.damage - a.move.result.damage);
  const first = attempts[0]?.move;
  let best = first && first.result.damage > current.damage ? { moves: [first], result: first.result } : undefined;
  if (current.win || best?.result.win) return best;

  // Widen the search when one swap cannot win. Prefer distinct pieces and directions
  // so a row of equally good empty destinations does not take all the follow-ups.
  const explored = new Set<string>();
  const seeds: typeof attempts = [];
  for (const attempt of attempts) {
    const { from, to } = attempt.move;
    const fromRune = run[from.zone][from.index]!;
    const toRune = run[to.zone][to.index];
    const key = JSON.stringify([from.zone, fromRune, to.zone, toRune]);
    if (!explored.has(key)) { explored.add(key); seeds.push(attempt); }
    if (seeds.length === 6) break;
  }
  for (const attempt of attempts) {
    if (seeds.length === 6) break;
    if (!seeds.includes(attempt)) seeds.push(attempt);
  }
  for (const { move, candidate } of seeds) {
    for (const { move: followUp } of formationMoves(candidate, catalog)) {
      if (followUp.result.damage > (best?.result.damage ?? current.damage)) {
        best = { moves: [move, followUp], result: followUp.result };
      }
    }
  }
  return best;
}
