import { describe, expect, it } from 'vitest';
import { catalog } from '../data/catalog';
import { simulateBattle } from '../core/battleEngine';
import { findFirstSupply } from '../core/firstSupply';
import { openingIds, updateRecords } from '../core/openings';
import { createMulberry32 } from '../core/rng';
import { newRun, settleTurn } from '../core/shopEngine';
import { planTurn } from '../core/tactics';

const shopRandom = () => .4;

describe('opening routes', () => {
  it('offers four distinct, immediately playable first waves', () => {
    const runs = openingIds.map(id => newRun(catalog, shopRandom, id));
    expect(new Set(runs.map(run => JSON.stringify(run.board))).size).toBe(4);
    for (const run of runs) {
      const forecast = planTurn(run, catalog);
      expect(forecast.result.win, run.opening).toBe(true);
      expect(run.relics).toEqual([]);
      expect(run.pendingRelics).toEqual([]);
      expect(run.shield).toBe(3);
      expect(forecast.tutorialDamage).toBe(run.opening === 'chain' ? 42 : 0);
    }
  });

  it('keeps independent records without counting an uncleared current wave', () => {
    const active = { opening: 'poison', wave: 8, status: 'active', bestCombo: 10 } as const;
    const first = updateRecords({}, active);
    expect(first).toEqual({ poison: { cleared: 7, combo: 10 } });
    expect(updateRecords(first, { ...active, wave: 2, bestCombo: 3 })).toBe(first);
    const victory = updateRecords(first, { opening: 'gold', wave: 20, status: 'victory', bestCombo: 12 });
    expect(victory).toEqual({ ...first, gold: { cleared: 20, combo: 12 } });
    expect(updateRecords(victory, { opening: 'gold', wave: 21, status: 'defeat', bestCombo: 18 }).gold)
      .toEqual({ cleared: 20, combo: 18 });
    expect(updateRecords({}, { opening: 'amplify', wave: 1, status: 'active', bestCombo: 0 })).toEqual({});
  });

  it('can preview one buy and one extra swap without spending or moving runes', () => {
    const rng = createMulberry32(2 * 104729);
    const run = newRun(catalog, rng);
    const first = simulateBattle({ board: run.board, bench: run.bench, gold: run.gold, hp: 60, shield: run.shield,
      tileModifiers: run.tileModifiers, tutorial: true, enableSynergies: true }, catalog, rng).at(-1);
    if (first?.type !== 'TURN_RESULT') throw new Error('Missing first wave result');
    settleTurn(run, first, catalog, rng);
    run.rngState = rng.getState();
    const before = structuredClone(run);
    const current = planTurn(run, catalog).result;
    expect(current.win).toBe(false);
    const plan = findFirstSupply(run, catalog, current)!;
    expect(plan.purchase).toBeDefined();
    expect(plan.move).toBeDefined();
    expect(plan.result.win).toBe(true);
    expect(planTurn(plan.run, catalog).result).toEqual(plan.result);
    expect(plan.run.gold).toBeLessThan(run.gold);
    expect(run).toEqual(before);
    expect(findFirstSupply(plan.run, catalog, plan.result)).toBeUndefined();
  });
});
