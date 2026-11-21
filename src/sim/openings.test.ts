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
      expect(forecast.tutorialDamage).toBe(0);
      expect(forecast.hp).toBe(run.opening === 'chain' ? 40 : 60);
    }
  });

  it('teaches a real rightward chain that wins even without critical hits or special tiles', () => {
    for (const difficulty of [undefined, 'beginner', 'expert'] as const) {
      const run = newRun(catalog, createMulberry32(667), 'chain', undefined, difficulty);
      run.tileModifiers = {};
      const forecast = planTurn(run, catalog);
      expect(run.board.slice(0, 2).map(rune => rune?.configId)).toEqual(['prism_right', 'spark_orb']);
      expect(forecast.minDamage).toBe(42);
      expect(forecast.verdict).toBe('win');
      expect(forecast.events.filter(event => event.type === 'CHAIN_LINK')).toEqual([{ type: 'CHAIN_LINK', from: 0, to: 1 }]);
      expect(forecast.events.filter(event => event.type === 'CELL_ACTIVATE').map(event => event.index)).toEqual([0, 1, 1]);
      [run.board[0], run.board[1]] = [run.board[1], run.board[0]];
      expect(planTurn(run, catalog)).toMatchObject({ hp: 40, tutorialDamage: 0, verdict: 'gap' });
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
    const run = newRun(catalog, rng, 'chain', undefined, undefined, 0);
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
