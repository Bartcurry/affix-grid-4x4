import { describe, expect, it } from 'vitest';
import { foughtHealth } from '../core/journal';
import { createMulberry32 } from '../core/rng';
import { newRun, resolveLoss, selectTrial, settleTurn, victoryPayout } from '../core/shopEngine';
import { planTurn, prepareBattle } from '../core/tactics';
import { battleTarget } from '../core/trials';
import { catalog } from '../data/catalog';
import { migrateSave } from '../platform/webMockAdapter';

const fixture = (wave: number) => ({ ...newRun(catalog, createMulberry32(7)), wave, tileModifiers: {} });

describe('campaign bounties', () => {
  it('applies the chosen foe and HP to the simulation without changing the original route or seed', () => {
    const run = fixture(5);
    const state = run.rngState;
    const regular = planTurn(run, catalog);
    expect(selectTrial(run, true)).toBe(true);
    const trial = planTurn(run, catalog);
    expect(battleTarget(run.wave, run.trialWave)).toMatchObject({ encounter: 'armor', hp: Math.round(regular.hp * 1.2) });
    expect(trial.result.damage).toBeLessThan(regular.result.damage);
    expect(prepareBattle(run, catalog).events).toEqual(trial.events);
    expect(run.rngState).toBe(state);
    expect(selectTrial(run, false)).toBe(true);
    expect(planTurn(run, catalog).events).toEqual(regular.events);
    expect(selectTrial(fixture(6), true)).toBe(false);
  });

  it.each([
    { wave: 10, config: ['venom_drop', 'venom_drop'], foe: 'cistern', reward: 9 },
    { wave: 15, config: ['prism_right', 'spark_orb', 'prism_right', 'spark_orb'], foe: 'bell', reward: 12 },
  ])('uses real matchup advantages in the wave $wave bounty', ({ wave, config, foe, reward }) => {
    const run = fixture(wave);
    run.board = run.board.map((_, index) => config[index] ? { star: 1, configId: config[index] } : null);
    const regular = planTurn(run, catalog);
    selectTrial(run, true);
    expect(planTurn(run, catalog).result.damage).toBeGreaterThan(regular.result.damage);
    expect(battleTarget(run.wave, run.trialWave).encounter).toBe(foe);
    expect(victoryPayout(run, run.gold).trial).toBe(reward);
  });

  it('pays a cleared bounty once and preserves its journal and progress on reload', () => {
    const run = fixture(5);
    run.board = run.board.map(() => ({ configId: 'spark_orb', star: 3 }));
    selectTrial(run, true);
    const turn = planTurn(run, catalog);
    expect(turn.result.win).toBe(true);
    run.lastJournal = { wave: run.wave, trialWave: run.trialWave, board: run.board, gold: run.gold, events: turn.events };
    const payout = victoryPayout(run, turn.result.gold);
    expect(payout.trial).toBe(6);
    settleTurn(run, turn.result, catalog, createMulberry32(run.rngState));
    expect(run).toMatchObject({ wave: 6, gold: turn.result.gold + payout.total, clearedTrials: [5] });
    expect(run.trialWave).toBeUndefined();
    const restored = migrateSave({ run: { ...run, clearedTrials: [5, 5, 6, 10], trialWave: 5 } }, catalog).run;
    expect(restored.trialWave).toBeUndefined();
    expect(restored.clearedTrials).toEqual([5]);
    expect(restored.lastJournal?.trialWave).toBe(5);
    expect(foughtHealth(restored.lastJournal, 5)).toBe(turn.hp);
    expect(victoryPayout(restored, turn.result.gold).trial).toBe(0);
  });

  it('requires loss resolution before leaving a failed bounty and gives no bounty payment', () => {
    const run = fixture(10);
    selectTrial(run, true);
    const result = planTurn(run, catalog).result;
    expect(result.win).toBe(false);
    settleTurn(run, result, catalog, createMulberry32(run.rngState));
    const restored = migrateSave({ run }, catalog).run;
    expect(restored).toMatchObject({ wave: 10, trialWave: 10, gold: result.gold, pendingLoss: true });
    expect(restored.clearedTrials).toBeUndefined();
    expect(selectTrial(restored, false)).toBe(false);
    resolveLoss(restored, false);
    expect(restored.shield).toBe(2);
    expect(selectTrial(restored, false)).toBe(true);
    expect(victoryPayout(restored, result.gold).trial).toBe(0);
  });
});
