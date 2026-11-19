import { describe, expect, it } from 'vitest';
import { simulateBattle } from '../core/battleEngine';
import { encounterAt, relicChoices } from '../core/expedition';
import { readJournal } from '../core/journal';
import { canArrange, chooseRelic, newRun, settleTurn } from '../core/shopEngine';
import { planTurn, runeFootprint } from '../core/tactics';
import type { BattleEvent, Rune, Slots, TurnResult } from '../core/types';
import { catalog } from '../data/catalog';

const noCrit = () => .99;
const rune = (configId: string): Rune => ({ configId, star: 1 });
const damage = (events: BattleEvent[]) => events.flatMap(event => event.type === 'DAMAGE' ? [event.amount] : []);
const clear: TurnResult = { type: 'TURN_RESULT', gold: 10, combo: 4, damage: 1000, hp: 0, poison: 0, win: true };

describe('expedition', () => {
  it('breaks iron armor in hit order, not on activations that do no damage', () => {
    const board = ['copper_mine', 'prism_right', 'spark_orb', 'spark_orb'].map(rune);
    const events = simulateBattle({ board, gold: 10, hp: 100, encounter: 'armor' }, catalog, noCrit);
    expect(damage(events)).toEqual([3, 12, 12, 12]);
    expect(events.at(-1)).toMatchObject({ damage: 39, hp: 61, combo: 5 });
    expect(events.filter(event => event.type === 'DAMAGE').slice(0, 2)).toMatchObject([{ enemyDelta: -3 }, { enemyDelta: -12 }]);
  });

  it('rewards center columns, chain hits and poison with different matchups', () => {
    const hits = ['spark_orb', 'spark_orb', 'prism_right', 'spark_orb'].map(rune);
    expect(damage(simulateBattle({ board: hits, gold: 10, hp: 100, encounter: 'flanks' }, catalog, noCrit))).toEqual([9, 14, 7, 17, 9]);
    expect(damage(simulateBattle({ board: hits, gold: 10, hp: 100, encounter: 'bell' }, catalog, noCrit))).toEqual([11, 11, 6, 30, 11]);
    expect(damage(simulateBattle({ board: hits, gold: 10, hp: 100, encounter: 'regent' }, catalog, noCrit))).toEqual([6, 6, 3, 29, 12]);
    const board = ['venom_drop', 'spark_orb'].map(rune);
    const events = simulateBattle({ board, gold: 10, hp: 100, encounter: 'cistern', relics: ['moss_bowl'] }, catalog, noCrit);
    expect(damage(events)).toEqual([11, 16]);
    expect(events.at(-1)).toMatchObject({ damage: 27, poison: 5 });
  });

  it('breaches exactly at half health and applies the new multipliers from the next hit', () => {
    const board: Slots = Array.from({ length: 16 }, (_, index) => index <= 4 || index === 8 ? rune('spark_orb') : null);
    const events = simulateBattle({ board, gold: 10, hp: 60, poison: 10, encounter: 'last_gate' }, catalog, noCrit);
    expect(damage(events)).toEqual([6, 6, 6, 12, 11, 18, 13]);
    expect(events.filter(event => event.type === 'DAMAGE' && event.breach)).toEqual([
      { type: 'DAMAGE', source: 3, amount: 12, hp: 30, crit: false, kind: 'rune', breach: true },
    ]);
    const journal = { wave: 20, board, gold: 10, events };
    expect(readJournal(journal, catalog)).toEqual(journal);
    expect(readJournal({ ...journal, wave: 19 }, catalog)).toBeUndefined();
    expect(encounterAt(25)).toBe('regent');
  });

  it('lets a poison tick reach the breach without boosting itself, and omits a breach on instant defeat', () => {
    const poisoned = simulateBattle({ board: [], gold: 0, hp: 60, poison: 34, encounter: 'last_gate' }, catalog, noCrit);
    expect(poisoned[0]).toMatchObject({ type: 'DAMAGE', amount: 34, hp: 26, kind: 'poison', breach: true });
    const instant = simulateBattle({ board: [{ configId: 'spark_orb', star: 3, bonusPower: 200 }], gold: 0, hp: 60, encounter: 'last_gate' }, catalog, noCrit);
    expect(instant.some(event => event.type === 'DAMAGE' && event.breach)).toBe(false);
    expect(instant.at(-1)).toMatchObject({ hp: 0, win: true });
  });

  it('offers three distinct relics at milestones and saves the choice in run state', () => {
    const run = newRun(catalog, noCrit);
    run.wave = 4;
    settleTurn(run, clear, catalog, noCrit);
    expect(run.wave).toBe(5);
    expect(run.pendingRelics).toEqual(['whetstone', 'chain_ring', 'moss_bowl']);
    expect(canArrange(run)).toBe(false);
    expect(chooseRelic(run, 'gate_tithe')).toBe(false);
    expect(chooseRelic(run, 'whetstone')).toBe(true);
    expect(chooseRelic(run, 'moss_bowl')).toBe(false);
    expect(run.relics).toEqual(['whetstone']);
    expect(canArrange(run)).toBe(true);
    expect(planTurn(run, catalog).byCell[0].damage).toBeGreaterThan(planTurn({ ...run, relics: [] }, catalog).byCell[0].damage);
    expect(relicChoices(16, ['whetstone', 'gate_tithe', 'copper_ledger'])).toEqual(['red_lens', 'moss_bowl', 'chain_ring']);
    expect(relicChoices(20, [])).toEqual([]);
    expect(encounterAt(20)).toBe('last_gate');
    expect(encounterAt(21)).toBe('armor');
    expect(encounterAt(26)).toBe('armor');
  });

  it('combines relics with a vertical chain and a gold payout', () => {
    const board = [rune('falling_bell'), null, null, null, rune('coin_mold')];
    const events = simulateBattle({ board, gold: 10, hp: 100, relics: ['copper_ledger'] }, catalog, noCrit);
    expect([...runeFootprint(catalog.falling_bell, 0).links]).toEqual([4]);
    expect(runeFootprint(catalog.falling_bell, 12).links.size).toBe(0);
    expect(events.at(-1)).toMatchObject({ damage: 5, gold: 16, combo: 3 });
    const run = newRun(catalog, noCrit);
    run.relics = ['gate_tithe'];
    settleTurn(run, clear, catalog, noCrit);
    expect(run.gold).toBe(23);
  });

  it('lets the new support runes reward neighbors and position', () => {
    const board = [rune('red_seal'), rune('spark_orb'), null, null, rune('spark_orb'), rune('moss_brick')];
    const events = simulateBattle({ board, gold: 10, hp: 100, relics: ['red_lens'], encounter: 'sentry' }, catalog, () => .2);
    expect(damage(events)).toEqual([12, 41, 8]);
    expect(events.at(-1)).toMatchObject({ damage: 61 });
  });
});
