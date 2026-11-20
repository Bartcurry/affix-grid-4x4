import { describe, expect, it } from 'vitest';
import { encodeBoardToken, readSharedBoard, sameBattleSetup } from '../core/boardShare';
import { battleTarget } from '../core/bounties';
import { readJournal } from '../core/journal';
import { createMulberry32 } from '../core/rng';
import { newRun } from '../core/shopEngine';
import { planTurn } from '../core/tactics';
import { catalog } from '../data/catalog';

function finale() {
  const run = newRun(catalog, createMulberry32(667));
  run.wave = 20;
  run.board.fill(null);
  run.tileModifiers = {};
  return run;
}

describe('campaign finale rotation seal', () => {
  it('locks consecutive damage in the same column after the third direct hit', () => {
    const run = finale();
    for (const index of [0, 1, 5, 9, 10, 14]) run.board[index] = { configId: 'spark_orb', star: 1 };
    const revised = planTurn(run, catalog);
    const original = planTurn({ ...run, finaleRule: undefined }, catalog);
    expect(revised.hp).toBe(original.hp);
    expect(revised.events.flatMap(event => event.type === 'DAMAGE' ?
      [[event.source, event.amount, !!event.gateBlocked]] : [])).toEqual([
      [0, 6, false], [1, 6, false], [5, 6, false], [9, 9, true], [10, 12, false], [14, 9, true],
    ]);
    expect(revised.result.damage).toBe(48);
    expect(original.result.damage).toBe(54);
    expect(battleTarget(25, undefined, 1).encounter).toBe('regent');
  });

  it('leaves the locked column unchanged during an intervening poison hit', () => {
    const run = finale();
    for (const index of [0, 1, 4, 8]) run.board[index] = { configId: 'spark_orb', star: 1 };
    for (const index of [5, 6, 7]) run.board[index] = { configId: 'venom_drop', star: 1 };
    const damage = planTurn(run, catalog).events.filter(event => event.type === 'DAMAGE');
    expect(damage.find(event => event.source === 5)).toMatchObject({ kind: 'poison', amount: 1 });
    expect(damage.find(event => event.source === 8)).toMatchObject({ gateBlocked: true, amount: 9 });
  });

  it('keeps the exact final rules in formation links and battle journals', () => {
    const run = finale();
    for (const index of [0, 4, 8, 12]) run.board[index] = { configId: 'spark_orb', star: 1 };
    const formation = encodeBoardToken(run)!;
    const replay = readSharedBoard(formation, catalog)!;
    const actual = planTurn(run, catalog);
    expect(replay.finaleRule).toBe(1);
    expect(planTurn(replay, catalog).events).toEqual(actual.events);
    expect(sameBattleSetup(run, replay)).toBe(true);
    const oldFormation = encodeBoardToken({ ...run, finaleRule: undefined })!;
    expect(sameBattleSetup(run, readSharedBoard(oldFormation, catalog)!)).toBe(false);
    expect(readJournal({ formation, maxHp: actual.hp, events: actual.events }, catalog)?.events).toEqual(actual.events);
    expect(readJournal({ formation: oldFormation, maxHp: actual.hp, events: actual.events }, catalog)).toBeUndefined();
  });
});
