import { describe, expect, it } from 'vitest';
import { catalog } from '../data/catalog';
import { fieldTip } from '../core/fieldGuide';
import { createMulberry32 } from '../core/rng';
import { buyRune, newRun, swapRunes } from '../core/shopEngine';
import { planTurn, prepareBattle } from '../core/tactics';
import { migrateSave } from '../platform/webMockAdapter';

const newBoard = () => ({ ...newRun(catalog, createMulberry32(667)), tileModifiers: {} });

describe('early field guide', () => {
  it('finds the second-wave opening partner without touching money, RNG, or rune slots', () => {
    const run = newBoard();
    run.wave = 2;
    run.shop = [{ configId: 'echo_stone', locked: false }, null, null];
    const snapshot = structuredClone(run);
    const turn = planTurn(run, catalog);
    expect(turn.result.win).toBe(false);
    const tip = fieldTip(run, catalog, turn);
    expect(tip).toMatchObject({ offer: 0, destination: { zone: 'board', index: 2 } });
    expect(run).toEqual(snapshot);
    expect(buyRune(run, 0, catalog)).toEqual([]);
    expect(swapRunes(run, { zone: 'bench', index: 0 }, tip!.destination!)).toBe(true);
    expect(planTurn(run, catalog).result.win).toBe(true);
  });

  it('prefers a free fix when the player already owns the missing rune', () => {
    const run = newBoard();
    run.wave = 2;
    run.shop[0] = { configId: 'echo_stone', locked: false };
    run.bench[0] = { configId: 'echo_stone', star: 1 };
    expect(fieldTip(run, catalog, planTurn(run, catalog))).toMatchObject({ origin: { zone: 'bench', index: 0 } });
    run.wave = 4;
    expect(fieldTip(run, catalog, planTurn(run, catalog))).toBeNull();
  });

  it('prepares the exact forecast without committing growth or consuming saved randomness', () => {
    const run = newBoard();
    run.tileModifiers = { 1: 'spirit_gathering', 13: 'xuan_ice', 14: 'li_fire' };
    const snapshot = structuredClone(run);
    const first = prepareBattle(run, catalog);
    expect(first.events).toEqual(planTurn(run, catalog).events);
    expect(first).toEqual(prepareBattle(run, catalog));
    expect(first.rngState).not.toBe(run.rngState);
    expect(first.board[1]?.bonusPower).toBeGreaterThan(0);
    expect(run).toEqual(snapshot);
  });

  it('only migrates the old untouched opener once', () => {
    const run = newBoard();
    delete run.openingRule;
    [run.board[0], run.board[1]] = [run.board[1], run.board[0]];
    const migrated = migrateSave({ run }, catalog).run;
    expect(migrated.board[0]?.configId).toBe('prism_right');
    [migrated.board[0], migrated.board[1]] = [migrated.board[1], migrated.board[0]];
    expect(migrateSave({ run: migrated }, catalog).run.board[0]?.configId).toBe('spark_orb');
  });
});
