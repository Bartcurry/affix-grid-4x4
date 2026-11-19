import { describe, expect, it } from 'vitest';
import { bossHealth, simulateBattle } from '../core/battleEngine';
import { MAX_CELL_TRIGGERS } from '../core/eventBus';
import { createMulberry32, decodeSeed, encodeSeed } from '../core/rng';
import { buyRune, newRun, purchaseInfo, refreshShop, swapRunes, UndoStack } from '../core/shopEngine';
import type { BattleEvent, Rune, Star } from '../core/types';
import { catalog } from '../data/catalog';
import { migrateSave } from '../platform/webMockAdapter';

const rune = (configId: string, star: Star = 1, bonusPower?: number): Rune => ({ configId, star, ...(bonusPower ? { bonusPower } : {}) });

describe('Module 1: Seeded PRNG Determinism & Save Migration', () => {
  it('runs two separate runs with the same seed and produces 100% identical event streams', () => {
    const seedCode = 'A7K9-M2P4';
    const seedNum = decodeSeed(seedCode);

    // Run 1
    const rng1 = createMulberry32(seedNum);
    const run1 = newRun(catalog, rng1, 'chain', seedCode);
    refreshShop(run1, catalog, rng1);
    const events1 = simulateBattle({
      board: run1.board,
      hp: bossHealth(1),
      gold: run1.gold,
      tileModifiers: run1.tileModifiers,
      shield: run1.shield,
    }, catalog, rng1);

    // Run 2
    const rng2 = createMulberry32(seedNum);
    const run2 = newRun(catalog, rng2, 'chain', seedCode);
    refreshShop(run2, catalog, rng2);
    const events2 = simulateBattle({
      board: run2.board,
      hp: bossHealth(1),
      gold: run2.gold,
      tileModifiers: run2.tileModifiers,
      shield: run2.shield,
    }, catalog, rng2);

    expect(run1.tileModifiers).toEqual(run2.tileModifiers);
    expect(run1.shop).toEqual(run2.shop);
    expect(events1).toEqual(events2);
    expect(rng1.getState()).toBe(rng2.getState());
  });

  it('correctly encodes and decodes 8-char seed codes', () => {
    const original = 314159265;
    const code = encodeSeed(original);
    expect(code).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/);
    expect(decodeSeed(code)).toBe(original);
    // Arbitrary text fallback
    expect(decodeSeed('custom-text')).toBeGreaterThan(0);
  });

  it('smoothly migrates v1 save to v2, filling missing fields and preserving records', () => {
    const v1Save = {
      run: {
        opening: 'poison',
        shopFocus: 'poison',
        wave: 4,
        gold: 25,
        shield: 2,
        board: [rune('venom_drop')],
        bench: [],
        shop: [{ configId: 'catalyst_flask', locked: false }],
        freeRefreshes: 0,
        attempts: 1,
        endless: false,
        status: 'active',
        lastDamage: 120,
        lastPoison: 24,
        bestCombo: 5,
        pendingLoss: false,
        relics: [],
        pendingRelics: [],
      },
      records: { poison: { cleared: 12, combo: 15 } },
      muted: true,
      skin: false,
      speed: 2,
    };

    const migrated = migrateSave(v1Save, catalog);
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.run.seed).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/);
    expect(migrated.run.rngState).toBeGreaterThan(0);
    expect(Object.keys(migrated.run.tileModifiers)).toHaveLength(3);
    expect(migrated.records.poison).toEqual({ cleared: 12, combo: 15 });
    expect(migrated.muted).toBe(true);
    expect(migrated.speed).toBe(2);
  });

  it('safely recovers clean initial state from corrupted JSON data without crashing', () => {
    const corruptedString = '{"run": { INVALID JSON';
    const recovered = migrateSave(corruptedString, catalog);
    expect(recovered.schemaVersion).toBe(2);
    expect(recovered.run.wave).toBe(1);
    expect(recovered.run.board).toHaveLength(16);
    expect(recovered.records).toEqual({});

    // Partial recovery of records from broken run
    const partialBroken = {
      run: null,
      records: { chain: { cleared: 18, combo: 22 } },
    };
    const recoveredPartial = migrateSave(partialBroken, catalog);
    expect(recoveredPartial.schemaVersion).toBe(2);
    expect(recoveredPartial.records.chain).toEqual({ cleared: 18, combo: 22 });
    expect(recoveredPartial.run.wave).toBe(1);
  });
});

describe('Module 2: Deadlock-free Purchase & Undo Stack', () => {
  it('allows buying 3rd rune when board (16) and bench (4) are completely full, triggering 3-merge', () => {
    const rng = createMulberry32(42);
    const run = newRun(catalog, rng, 'chain');

    // Put 2 spark_orbs at index 0 and 1, and fill 14 other board cells with distinct runes
    const distinctFillers = Object.keys(catalog).filter(
      id => !['spark_orb', 'falling_bell', 'venom_drop', 'catalyst_flask', 'ember_amp', 'echo_stone'].includes(id)
    ).slice(0, 14);
    run.board = [rune('spark_orb', 1), rune('spark_orb', 1), ...distinctFillers.map(id => rune(id))];

    // Fill all 4 bench slots with other runes
    run.bench = [rune('venom_drop'), rune('catalyst_flask'), rune('ember_amp'), rune('echo_stone')];
    expect(run.board.filter(Boolean)).toHaveLength(16);
    expect(run.bench.filter(Boolean)).toHaveLength(4);

    // Shop has spark_orb and copper_mine
    run.shop[0] = { configId: 'spark_orb', locked: false };
    run.shop[1] = { configId: 'falling_bell', locked: false };
    run.gold = 20;

    // Buying non-merging falling_bell is blocked by bench
    expect(purchaseInfo(run, 1, catalog)).toEqual({ copies: 0, willMerge: false, blocked: 'bench' });
    expect(buyRune(run, 1, catalog)).toBeNull();

    // Buying merging spark_orb is allowed!
    const info = purchaseInfo(run, 0, catalog);
    expect(info.willMerge).toBe(true);
    expect(info.blocked).toBeNull();

    const merges = buyRune(run, 0, catalog);
    expect(merges).not.toBeNull();
    expect(merges!).toHaveLength(1);
    expect(merges![0].rune).toEqual(rune('spark_orb', 2));

    // Board[0] is upgraded to star 2, board[1] is cleared (null)
    expect(run.board[0]).toEqual(rune('spark_orb', 2));
    expect(run.board[1]).toBeNull();
    expect(run.bench).toHaveLength(4);
    // Board now has 15 runes, bench has 4 runes, total occupied = 19 (free slot available!)
    expect(run.board.filter(Boolean)).toHaveLength(15);
  });

  it('accurately captures and restores snapshots with UndoStack', () => {
    const rng = createMulberry32(100);
    const run = newRun(catalog, rng, 'chain');
    const undo = new UndoStack();

    const initialGold = run.gold;
    const initialBoard = structuredClone(run.board);

    // Action 1: swap
    undo.push(run);
    swapRunes(run, { zone: 'board', index: 0 }, { zone: 'board', index: 3 });
    expect(run.board[3]).toEqual(initialBoard[0]);

    // Action 2: buy
    run.shop[0] = { configId: 'spark_orb', locked: false };
    undo.push(run);
    buyRune(run, 0, catalog);
    expect(undo.length).toBe(2);

    // Undo action 2 (buy)
    expect(undo.pop(run)).toBe(true);
    expect(run.shop[0]).toEqual({ configId: 'spark_orb', locked: false });

    // Undo action 1 (swap)
    expect(undo.pop(run)).toBe(true);
    expect(run.board).toEqual(initialBoard);
    expect(run.gold).toBe(initialGold);

    // Undo empty stack
    expect(undo.pop(run)).toBe(false);
  });

  it('caps undo stack at 20 snapshots without memory leak', () => {
    const rng = createMulberry32(1);
    const run = newRun(catalog, rng);
    const undo = new UndoStack();

    for (let i = 0; i < 25; i++) {
      run.gold = i;
      undo.push(run);
    }
    expect(undo.length).toBe(20);
  });
});

describe('Module 4: Tile Modifiers & 6 Dual-Tag Bridge Runes', () => {
  it('activates Li Fire tile for an extra trigger within MAX_CELL_TRIGGERS budget', () => {
    const board = [rune('copper_mine')];
    const tileModifiers = { 0: 'li_fire' as const };
    const events = simulateBattle({
      board,
      hp: 1000,
      gold: 0,
      tileModifiers,
    }, catalog, () => 0.5);

    const cellActivations = events.filter(e => e.type === 'CELL_ACTIVATE' && e.index === 0);
    // Should trigger 2 times (1 normal + 1 extra)
    expect(cellActivations).toHaveLength(2);
    const goldEvents = events.filter(e => e.type === 'GOLD');
    expect(goldEvents).toHaveLength(2);
  });

  it('boosts Xuan Ice tile base crit rate by +45%', () => {
    const board = [rune('spark_orb')];
    const tileModifiers = { 0: 'xuan_ice' as const };
    // RNG returns 0.40, which is below 0.05 + 0.45 = 0.50 crit chance -> crits!
    const events = simulateBattle({
      board,
      hp: 1000,
      gold: 0,
      tileModifiers,
    }, catalog, () => 0.40);

    const damageEvents = events.filter((e): e is Extract<BattleEvent, { type: 'DAMAGE' }> => e.type === 'DAMAGE');
    expect(damageEvents[0]?.crit).toBe(true);
  });

  it('permanently adds +2 base power to rune on Spirit Gathering tile when adjacent cells activate', () => {
    // Cell 0 activates, neighbor cell 1 has spirit_gathering
    const board = [rune('copper_mine'), rune('spark_orb')];
    const tileModifiers = { 1: 'spirit_gathering' as const };
    simulateBattle({
      board,
      hp: 1000,
      gold: 0,
      tileModifiers,
    }, catalog, () => 0.5);

    // Cell 1 rune should gain bonusPower
    expect(board[1]?.bonusPower).toBe(2);
  });

  it('triggers toxic_fuse: bursts 15% current poison for double damage on chain hit without reducing poison', () => {
    // Cell 0 triggers Cell 1 (toxic_fuse) via chain link
    const board = [rune('prism_right'), rune('toxic_fuse')];
    const events = simulateBattle({
      board,
      hp: 5000,
      gold: 0,
      poison: 100,
    }, catalog, () => 0.99);

    // 15% of 100 is 15. Double damage is 30.
    const damageEvents = events.filter((e): e is Extract<BattleEvent, { type: 'DAMAGE' }> => e.type === 'DAMAGE' && e.source === 1);
    expect(damageEvents.some(e => e.amount === 30)).toBe(true);
    // Poison is NOT consumed by burst
    const endResult = events.find(e => e.type === 'TURN_RESULT') as Extract<BattleEvent, { type: 'TURN_RESULT' }>;
    // 100 poison ticked at end for 100, then decayed to 80
    expect(endResult.poison).toBe(80);
  });

  it('triggers gilded_fang: adds 4 poison and grants gold based on poison / 12 capped at 6', () => {
    const board = [rune('gilded_fang')];
    // Start with 60 poison -> floor(64 / 12) = 5 gold
    const events = simulateBattle({
      board,
      hp: 5000,
      gold: 0,
      poison: 60,
    }, catalog, () => 0.99);

    const goldEvents = events.filter(e => e.type === 'GOLD');
    expect(goldEvents.some(e => e.delta === 5)).toBe(true);
  });

  it('triggers storm_gambler on row crit without infinite recursive loops', () => {
    // Row 0: Cell 0 (storm_gambler), Cell 1 (spark_orb), Cell 2 (blood_altar)
    const board = [rune('storm_gambler'), rune('spark_orb'), rune('blood_altar')];
    // Force crit with rng = 0.0
    const events = simulateBattle({
      board,
      hp: 5000,
      gold: 0,
    }, catalog, () => 0.0);

    const activates = events.filter(e => e.type === 'CELL_ACTIVATE');
    expect(activates.length).toBeLessThan(MAX_CELL_TRIGGERS * 3);
    const endResult = events.find(e => e.type === 'TURN_RESULT');
    expect(endResult).toBeDefined();
  });

  it('triggers blood_prism: consumes 1 shield on first activation if shield >= 2 to double adjacent multipliers', () => {
    const board = [rune('blood_prism'), rune('spark_orb')];
    const events = simulateBattle({
      board,
      hp: 5000,
      gold: 0,
      shield: 3,
    }, catalog, () => 0.99);

    // Cell 1 (spark_orb, 12 base) should have doubled multiplier (24 damage)
    const damageEvents = events.filter((e): e is Extract<BattleEvent, { type: 'DAMAGE' }> => e.type === 'DAMAGE' && e.source === 1);
    expect(damageEvents.some(e => e.amount === 24)).toBe(true);
  });

  it('triggers alchemy_bell: retriggers down and adds +50% multiplier only when gold >= 25', () => {
    // Cell 0 (alchemy_bell) above Cell 4 (spark_orb)
    const board = [rune('alchemy_bell'), null, null, null, rune('spark_orb')];
    const eventsHighGold = simulateBattle({
      board,
      hp: 5000,
      gold: 30,
    }, catalog, () => 0.99);

    const retriggeredHit = eventsHighGold.filter((e): e is Extract<BattleEvent, { type: 'DAMAGE' }> => e.type === 'DAMAGE' && e.source === 4);
    // 12 base * 1.5 = 18 damage
    expect(retriggeredHit.some(e => e.amount === 18)).toBe(true);

    const eventsLowGold = simulateBattle({
      board,
      hp: 5000,
      gold: 10,
    }, catalog, () => 0.99);
    const retriggeredLow = eventsLowGold.filter((e): e is Extract<BattleEvent, { type: 'DAMAGE' }> => e.type === 'DAMAGE' && e.source === 4);
    // 12 base * 1.0 = 12 damage
    expect(retriggeredLow.some(e => e.amount === 12)).toBe(true);
  });

  it('triggers plague_crown: adds +50% multiplier to row poison runes and increases poison by 25%', () => {
    // Row 0: Cell 0 (plague_crown), Cell 1 (venom_drop)
    const board = [rune('plague_crown'), rune('venom_drop')];
    const events = simulateBattle({
      board,
      hp: 5000,
      gold: 0,
      poison: 40,
    }, catalog, () => 0.99);

    // 40 poison + 25% = 50 poison. Then venom_drop adds 7 -> 57.
    const poisonEvents = events.filter(e => e.type === 'POISON');
    expect(poisonEvents.some(e => e.poison >= 50)).toBe(true);
  });
});
