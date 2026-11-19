import { describe, expect, it } from 'vitest';
import { catalog, runes } from '../data/catalog';
import { bossHealth, simulateBattle } from '../core/battleEngine';
import { MAX_CELL_TRIGGERS, MAX_DEPTH, MAX_EVENTS } from '../core/eventBus';
import { resolveTargets, toIndex } from '../core/grid';
import { buyRune, mergeRunes, newRun, purchaseInfo, refreshShop, resolveLoss, sellRune, settleTurn, startEndless, swapRunes, toggleLock, victoryPayout } from '../core/shopEngine';
import type { BattleEvent, Rune, Star, TurnResult } from '../core/types';

const rune = (configId: string, star: Star = 1): Rune => ({ configId, star });
const noCrit = () => 0.99;
function resultOf(events: BattleEvent[]) {
  const result = events.at(-1);
  if (result?.type !== 'TURN_RESULT') throw new Error('Missing turn result');
  return result;
}
const attack = (...ids: string[]) => simulateBattle({ board: ids.map(id => rune(id)), hp: 9999, gold: 10 }, catalog, noCrit);
const amounts = (events: BattleEvent[]) => events.flatMap(event => event.type === 'DAMAGE' ? [event.amount] : []);

describe('battle simulation', () => {
  it('raises health without a new spike at the campaign or endless boundary', () => {
    expect(bossHealth(1)).toBe(60);
    expect(bossHealth(10)).toBe(1703);
    expect(bossHealth(11) / bossHealth(10)).toBeLessThan(1.4);
    expect(bossHealth(20)).toBe(45864);
    expect(bossHealth(21) / bossHealth(20)).toBeLessThan(1.25);
    for (let wave = 2; wave < 50; wave++) expect(bossHealth(wave)).toBeGreaterThan(bossHealth(wave - 1));
  });

  it('keeps ordinary flask damage intact but only amplifies part of extreme poison totals', () => {
    const events = simulateBattle({ hp: 50_000, board: [rune('catalyst_flask')], gold: 0, poison: 5000 }, catalog, noCrit);
    expect(amounts(events)).toEqual([5900]);
    expect(resultOf(events).poison).toBe(4720);
  });
  it('loads all 20 runes and resolves edge coordinates without wraparound', () => {
    expect(Object.keys(catalog)).toHaveLength(20);
    expect(runes).toHaveLength(20);
    expect(toIndex(3, 3)).toBe(15);
    expect(resolveTargets(3, 'RIGHT')).toEqual([]);
    expect(resolveTargets(0, 'ADJACENT_4')).toEqual([4, 1]);
  });

  it('stops two adjacent relays after eight activations each', () => {
    const events = attack('relay_cross', 'relay_cross');
    const activations = events.flatMap(event => event.type === 'CELL_ACTIVATE' ? [event.index] : []);
    expect(activations.filter(index => index === 0)).toHaveLength(MAX_CELL_TRIGGERS);
    expect(activations.filter(index => index === 1)).toHaveLength(MAX_CELL_TRIGGERS);
    expect(events.length).toBeLessThanOrEqual(MAX_EVENTS);
    expect(events.filter(event => event.type === 'CHAIN_LINK')).toHaveLength(15);
  });

  it('enforces the depth and event budgets even with dense listener traffic', () => {
    const board = Array.from({ length: 16 }, (_, index) => rune(index % 4 === 3 ? 'overclock_core' : 'relay_cross', 3));
    const events = simulateBattle({ board, hp: 9999, gold: 10, poison: 5 }, catalog, noCrit);
    const depths = events.flatMap(event => event.type === 'CELL_ACTIVATE' ? [event.depth] : []);
    expect(Math.max(...depths)).toBe(MAX_DEPTH - 1);
    expect(events).toHaveLength(MAX_EVENTS);
    expect(events.at(-3)).toMatchObject({ type: 'DAMAGE', amount: 5, kind: 'poison' });
    expect(resultOf(events).poison).toBe(4);
  });

  it('resolves prism and echo depth-first with exact spark chain damage', () => {
    const events = attack('prism_right', 'spark_orb', 'echo_stone');
    expect(events.flatMap(event => event.type === 'CELL_ACTIVATE' ? [event.index] : [])).toEqual([0, 1, 1, 2, 1, 1]);
    expect(amounts(events)).toEqual([6, 24, 12, 24, 24]);
    expect(resultOf(events)).toMatchObject({ damage: 90, combo: 6, hp: 9909 });
  });

  it('multiplies poison, retains half on detonation, then ticks and decays', () => {
    const events = attack('venom_drop', 'catalyst_flask', 'toxic_detonator');
    expect(events.flatMap(event => event.type === 'POISON' ? [event.poison] : [])).toEqual([7, 12, 6, 4]);
    expect(amounts(events)).toEqual([30, 6]);
    expect(resultOf(events)).toMatchObject({ damage: 36, poison: 4 });
  });

  it('uses the current gold after neighbor income when firing the gold cannon', () => {
    const events = attack('copper_mine', 'greed_amplifier', 'gold_cannon');
    expect(amounts(events)).toEqual([21]);
    expect(resultOf(events).gold).toBe(15);
  });

  it('allows crit follow-ups to crit without dispatching themselves again', () => {
    const events = simulateBattle({ board: [rune('blood_altar'), rune('spark_orb')], hp: 999, gold: 0 }, catalog, () => 0);
    expect(amounts(events)).toEqual([24, 36]);
    expect(resultOf(events).combo).toBe(2);
  });

  it('keeps inputs unchanged and clears wave one with the documented tutorial link', () => {
    const run = newRun(catalog, noCrit);
    const before = structuredClone(run);
    const input = { ...run, hp: bossHealth(1), tutorial: true };
    const events = simulateBattle(input, catalog, noCrit);
    expect(amounts(events)).toEqual([12, 6, 42]);
    expect(events).toContainEqual({ type: 'CHAIN_LINK', from: 1, to: 0, tutorial: true });
    expect(resultOf(events)).toMatchObject({ damage: 60, win: true });
    expect(simulateBattle(input, catalog)).toEqual(simulateBattle(input, catalog));
    expect(run).toEqual(before);
    expect(resultOf(simulateBattle({ ...input, tutorial: false }, catalog, noCrit)).damage).toBe(18);
  });
});

describe('run economy', () => {
  const turn = (win: boolean): TurnResult => ({ type: 'TURN_RESULT', gold: 36, combo: 4, damage: 60, hp: win ? 0 : 1, poison: 0, win });

  it('supplies each opening at wave two without disturbing a locked offer', () => {
    for (const [opening, supply] of [['chain', 'echo_stone'], ['poison', 'moss_brick'], ['gold', 'greed_amplifier'], ['amplify', 'ember_amp']] as const) {
      const run = newRun(catalog, noCrit, opening);
      run.shop[0] = { configId: 'red_seal', locked: true };
      settleTurn(run, turn(true), catalog, noCrit);
      expect(run.shop[0]).toEqual({ configId: 'red_seal', locked: true });
      expect(run.shop[1]).toEqual({ configId: supply, locked: false });
      settleTurn(run, turn(true), catalog, noCrit);
      expect(run.shop[1]?.configId).not.toBe(supply);
    }
  });

  it('uses the selected focus only on the first unlocked slot, without changing rarity', () => {
    const run = newRun(catalog, noCrit);
    run.shopFocus = 'poison';
    run.shop[0] = { configId: 'red_seal', locked: true };
    expect(refreshShop(run, catalog, () => .01)).toBe(true);
    expect(run.shop.map(offer => offer?.configId)).toEqual(['red_seal', 'venom_drop', 'spark_orb']);
    run.shopFocus = 'chain';
    expect(refreshShop(run, catalog, () => .99)).toBe(true);
    expect(run.shop[1]?.configId).toBe('relay_cross');
    expect(run.gold).toBe(8);
    run.shopFocus = 'amplify';
    expect(refreshShop(run, catalog, () => .99)).toBe(true);
    expect(run.shop[1]?.configId).toBe('combo_finisher');
  });

  it('uses the same settlement payout as the forecast and caps interest', () => {
    const run = newRun(catalog, noCrit);
    run.relics = ['gate_tithe'];
    const result = { ...turn(true), gold: 69 };
    const payout = victoryPayout(run, result.gold);
    expect(payout).toEqual({ base: 8, interest: 5, relic: 4, total: 17 });
    settleTurn(run, result, catalog, noCrit);
    expect(run.gold).toBe(86);
  });

  it('merges nine one-stars into a single board three-star', () => {
    const run = newRun(catalog, noCrit);
    run.board.fill(null);
    run.board.fill(rune('spark_orb'), 1, 7);
    run.bench.fill(rune('spark_orb'), 0, 3);
    expect(mergeRunes(run)).toHaveLength(4);
    expect([...run.board, ...run.bench].filter(Boolean)).toEqual([rune('spark_orb', 3)]);
    expect(run.board[1]).toEqual(rune('spark_orb', 3));
    expect(sellRune(run, { zone: 'board', index: 1 }, catalog)).toBe(16);
  });

  it('accepts a merging purchase with a full bench and rejects a non-merging one', () => {
    const run = newRun(catalog, noCrit);
    run.bench = [rune('spark_orb'), rune('venom_drop'), rune('ember_amp'), rune('echo_stone')];
    run.shop[0] = { configId: 'spark_orb', locked: true };
    run.shop[1] = { configId: 'copper_mine', locked: false };
    expect(purchaseInfo(run, 1, catalog)).toEqual({ copies: 0, willMerge: false, blocked: 'bench' });
    expect(purchaseInfo(run, 0, catalog)).toEqual({ copies: 2, willMerge: true, blocked: null });
    expect(buyRune(run, 1, catalog)).toBeNull();
    expect(buyRune(run, 0, catalog)?.[0]).toMatchObject({ slot: { zone: 'board', index: 0 }, rune: { star: 2 } });
    expect(run.bench).toHaveLength(4);
    expect(run.gold).toBe(7);
    expect(swapRunes(run, { zone: 'board', index: 0 }, { zone: 'bench', index: 0 })).toBe(true);
  });

  it('shows purchase requirements without mutating the run', () => {
    const run = newRun(catalog, noCrit);
    run.gold = 2;
    run.shop[0] = { configId: 'spark_orb', locked: false };
    run.shop[1] = null;
    const before = structuredClone(run);
    expect(purchaseInfo(run, 0, catalog)).toEqual({ copies: 1, willMerge: false, blocked: 'gold' });
    expect(purchaseInfo(run, 1, catalog).blocked).toBe('unavailable');
    expect(run).toEqual(before);
  });

  it('preserves locks, grants interest and a manual refresh on the next wave', () => {
    const run = newRun(catalog, noCrit);
    toggleLock(run, 0);
    const locked = run.shop[0];
    refreshShop(run, catalog, noCrit);
    expect(run.gold).toBe(10);
    refreshShop(run, catalog, noCrit);
    expect(run.gold).toBe(8);
    settleTurn(run, turn(true), catalog, noCrit);
    expect(run).toMatchObject({ wave: 2, gold: 47, freeRefreshes: 1 });
    expect(run.shop[0]).toBe(locked);
  });

  it('defers shield loss, supports no-loss retries and unlocks endless at wave 20', () => {
    const run = newRun(catalog, noCrit);
    settleTurn(run, turn(false), catalog, noCrit);
    expect(run).toMatchObject({ shield: 3, pendingLoss: true });
    resolveLoss(run, true);
    expect(run.shield).toBe(3);
    settleTurn(run, turn(false), catalog, noCrit);
    resolveLoss(run, false);
    expect(run.shield).toBe(2);
    run.wave = 20;
    settleTurn(run, turn(true), catalog, noCrit);
    expect(run.status).toBe('victory');
    startEndless(run, catalog, noCrit);
    expect(run).toMatchObject({ status: 'active', wave: 21, endless: true });
  });
});
