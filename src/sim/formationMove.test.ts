import { describe, expect, it } from 'vitest';
import { bestFormationMove, findFormationPlan } from '../core/formationMove';
import { createMulberry32 } from '../core/rng';
import { newRun, swapRunes } from '../core/shopEngine';
import { planTurn } from '../core/tactics';
import type { Slot } from '../core/types';
import { catalog } from '../data/catalog';

function centerFixture() {
  const run = newRun(catalog, createMulberry32(667));
  Object.assign(run, { wave: 8, gold: 12, shield: 2, rngState: 667, tileModifiers: {} });
  run.board.fill(null);
  run.board[0] = { configId: 'spark_orb', star: 3, bonusPower: 150 };
  return run;
}

describe('formation moves', () => {
  it('finds a free one-step win against Stone Lion and predicts the applied result', () => {
    const run = centerFixture();
    const before = structuredClone(run);
    const original = planTurn(run, catalog);
    expect(original.result).toMatchObject({ win: false, damage: 567 });
    const best = bestFormationMove(run, catalog, original.result.damage)!;
    expect(best).toMatchObject({ from: { zone: 'board', index: 0 }, to: { zone: 'board', index: 1 }, result: { win: true, damage: 892 } });
    expect(findFormationPlan(run, catalog, original.result)?.moves).toEqual([best]);
    expect(run).toEqual(before);
    expect(swapRunes(run, best.from, best.to)).toBe(true);
    expect(planTurn(run, catalog).result).toEqual(best.result);
    expect(bestFormationMove(run, catalog, best.result.damage)).toBeUndefined();
  });

  it('finds a two-step clear when every individual swap falls short', () => {
    const run = centerFixture();
    run.board[0] = { configId: 'spark_orb', star: 3, bonusPower: 60 };
    run.board[12] = { configId: 'spark_orb', star: 3, bonusPower: 60 };
    const prior = structuredClone(run);
    const original = planTurn(run, catalog).result;
    expect(original.damage).toBe(504);
    expect(bestFormationMove(run, catalog, original.damage)?.result.win).toBe(false);
    const hint = findFormationPlan(run, catalog, original)!;
    expect(hint.moves).toHaveLength(2);
    expect(hint.result).toMatchObject({ damage: 794, win: true });
    expect(run).toEqual(prior);
    for (const { from, to } of hint.moves) expect(swapRunes(run, from, to)).toBe(true);
    expect(planTurn(run, catalog).result).toEqual(hint.result);
  });

  it('matches an independent exhaustive check including occupied bench swaps and relics', () => {
    const run = centerFixture();
    run.wave = 4;
    run.board[0] = { configId: 'spark_orb', star: 1 };
    run.board[2] = { configId: 'echo_stone', star: 1 };
    run.bench[0] = { configId: 'gold_cannon', star: 2, bonusPower: 9 };
    run.tileModifiers = { 1: 'li_fire' };
    run.relics = ['qiankun_pouch'];
    const original = planTurn(run, catalog);
    const best = bestFormationMove(run, catalog, original.result.damage)!;
    const slots: Slot[] = (['board', 'bench'] as const).flatMap(zone => run[zone].map((_, index) => ({ zone, index })));
    const scores = slots.flatMap(from => slots.flatMap(to => {
      const candidate = structuredClone(run);
      return swapRunes(candidate, from, to) ? [planTurn(candidate, catalog).result.damage] : [];
    }));
    expect(best.result.damage).toBe(Math.max(...scores));
    expect(best.from).toEqual({ zone: 'bench', index: 0 });
    expect(best.to).toEqual({ zone: 'board', index: 1 });
  });
});
