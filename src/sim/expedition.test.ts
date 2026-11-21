import { describe, expect, it } from 'vitest';
import { simulateBattle } from '../core/battleEngine';
import { affixAt, armorHitsFor, damageModifiers, encounterAt, endlessRoute, relicChoices, relics } from '../core/expedition';
import { canArrange, chooseRelic, newRun, settleTurn, victoryPayout } from '../core/shopEngine';
import { previewRelics } from '../core/relicPreview';
import { planTurn, runeFootprint } from '../core/tactics';
import type { BattleEvent, RelicId, Rune, TurnResult } from '../core/types';
import { catalog } from '../data/catalog';
import { migrateSave } from '../platform/webMockAdapter';

const noCrit = () => .99;
const rune = (configId: string): Rune => ({ configId, star: 1 });
const damage = (events: BattleEvent[]) => events.flatMap(event => event.type === 'DAMAGE' ? [event.amount] : []);
const clear: TurnResult = { type: 'TURN_RESULT', gold: 10, combo: 4, damage: 1000, hp: 0, poison: 0, win: true };

describe('expedition', () => {
  it('lists one full rotation of real endless segments and caps the last segment safely', () => {
    expect(endlessRoute(21).map(section => section.from)).toEqual([25, 30, 35, 40, 45, 50]);
    const route = endlessRoute(49);
    expect(route.map(section => section.from)).toEqual([45, 50, 55, 60, 65, 70]);
    expect(new Set(route.map(section => section.affix.id)).size).toBe(6);
    expect(route.every(section => section.affix === affixAt(section.through))).toBe(true);
    expect(endlessRoute(Number.MAX_SAFE_INTEGER).map(section => section.through)).toEqual([Number.MAX_SAFE_INTEGER]);
  });

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

  it('uses the displayed armor count and the displayed one-based affix rows and columns', () => {
    expect(armorHitsFor(encounterAt(4))).toBe(2);
    expect(armorHitsFor(encounterAt(20))).toBe(3);
    const rows = affixAt(30)!;
    expect(rows.desc).toContain('第 2、4 行');
    const events = simulateBattle({ board: ['prism_right', 'spark_orb', null, null, 'prism_right', 'spark_orb']
      .map(id => id ? rune(id) : null), gold: 10, hp: 500, affix: rows.id }, catalog, noCrit);
    expect(events.filter(event => event.type === 'CHAIN_LINK')).toMatchObject([{ from: 0, to: 1 }]);
    expect(events.filter(event => event.type === 'DAMAGE' && event.source === 5)).toMatchObject([{ amount: 20 }]);

    const columns = affixAt(50)!;
    expect(columns.desc).toContain('第 2、4 列的符文直伤 +25%，第 1、3 列 −15%');
    expect([0, 1, 2, 3].map(index => damageModifiers('sentry', [], 'rune', index, false, false, 0, columns.id).enemy))
      .toEqual([.85, 1.25, .85, 1.25]);
  });

  it('offers three distinct relics at milestones and saves the choice in run state', () => {
    const run = newRun(catalog, noCrit);
    delete run.altarRule;
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
    expect(planTurn(run, catalog).byCell[1].damage).toBeGreaterThanOrEqual(16);
    expect(relicChoices(16, ['whetstone', 'gate_tithe', 'copper_ledger'])).toEqual(['red_lens', 'moss_bowl', 'chain_ring']);
    expect(relicChoices(20, [])).toEqual([]);
    expect(encounterAt(20)).toBe('regent');
    expect(encounterAt(21)).toBe('armor');
    expect(encounterAt(26)).toBe('armor');
  });

  it('makes the expanded relics available before the final wave while keeping offers deterministic', () => {
    const all = new Set<RelicId>();
    for (let seed = 1; seed <= 48; seed++) {
      const owned: RelicId[] = [];
      for (const wave of [4, 8, 12, 16]) {
        const options = relicChoices(wave, owned, seed);
        expect(options).toEqual(relicChoices(wave, owned, seed));
        expect(new Set(options).size).toBe(3);
        expect(options.some(id => owned.includes(id))).toBe(false);
        options.forEach(id => all.add(id));
        owned.push(options[0]);
      }
    }
    expect([...all].sort()).toEqual(Object.keys(relics).sort());
    expect(relicChoices(16, [], 7)).toContain('li_fire_token');
    expect(relicChoices(20, [], 7)).toEqual([]);
  });

  it('forecasts the next battle using the real pick, including its immediate extra refresh', () => {
    const run = newRun(catalog, noCrit);
    run.wave = 4;
    settleTurn(run, { ...clear, gold: 35 }, catalog, noCrit);
    expect(run.pendingRelics).toContain('jade_abacus');
    const saved = migrateSave({ run }, catalog).run;
    expect(saved.altarRule).toBe(1);
    expect(saved.pendingRelics).toEqual(run.pendingRelics);
    const checkpoint = structuredClone(run);
    const { original, choices } = previewRelics(run, catalog);
    expect(run).toEqual(checkpoint);
    const offer = choices.find(choice => choice.id === 'jade_abacus')!;
    expect(offer.refreshes).toBe(original.refreshes + 1);
    expect(offer.result.damage).toBeGreaterThan(original.result.damage);
    expect(chooseRelic(run, offer.id)).toBe(true);
    expect(run.freeRefreshes).toBe(offer.refreshes);
    const { result } = planTurn(run, catalog);
    expect(result).toEqual(offer.result);
    expect(offer.gold).toBe(result.gold + (result.win ? victoryPayout(run, result.gold, catalog).total : 0));
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
