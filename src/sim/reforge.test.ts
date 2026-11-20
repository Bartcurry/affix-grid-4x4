import { describe, expect, it } from 'vitest';
import { bestFormationMove } from '../core/formationMove';
import { canReforge, findReforgeSuggestion, prepareReforge, previewReforges, reforgeWave } from '../core/reforge';
import { createMulberry32 } from '../core/rng';
import { createSnapshot, newRun, restoreSnapshot, UndoStack } from '../core/shopEngine';
import { planTurn } from '../core/tactics';
import { catalog } from '../data/catalog';
import { migrateSave } from '../platform/webMockAdapter';

const from = { zone: 'bench', index: 0 } as const;

function fixture() {
  const run = newRun(catalog, createMulberry32(667), 'gold');
  Object.assign(run, { wave: reforgeWave, gold: 55 });
  run.board.fill(null);
  run.board[1] = { configId: 'gold_cannon', star: 2, bonusPower: 8 };
  run.board[5] = { configId: 'gold_cannon', star: 2, bonusPower: 12 };
  run.bench[0] = { configId: 'echo_stone', star: 2, bonusPower: 17 };
  return run;
}

describe('campaign rune reforge', () => {
  it('keeps rarity, stars, power and money before any automatic merge', () => {
    const run = fixture();
    const prior = structuredClone(run);
    const forged = prepareReforge(run, from, 'overclock_core', catalog)!;
    expect(forged.final).toEqual({ slot: from, rune: { configId: 'overclock_core', star: 2, bonusPower: 17 } });
    expect(forged.candidate.gold).toBe(prior.gold);
    expect(forged.candidate.rngState).toBe(prior.rngState);
    expect(forged.candidate.shop).toEqual(prior.shop);
    expect(prepareReforge(run, from, 'spark_orb', catalog)).toBeUndefined();
    expect(prepareReforge(run, from, 'echo_stone', catalog)).toBeUndefined();
    expect(run).toEqual(prior);
  });

  it('simulates automatic merges into a full lineup, spends the opportunity and restores it with undo', () => {
    const run = fixture();
    run.bench.fill({ configId: 'venom_drop', star: 3 }, 1);
    run.board = run.board.map(rune => rune ?? { configId: 'copper_mine', star: 3 });
    const prior = structuredClone(run);
    const option = previewReforges(run, from, catalog).find(option => option.target.id === 'gold_cannon')!;
    const undo = new UndoStack();
    undo.push(run);
    restoreSnapshot(run, createSnapshot(option.prepared.candidate));
    expect(run.board[1]).toEqual({ configId: 'gold_cannon', star: 3, bonusPower: 37 });
    expect(run.board[5]).toBeNull();
    expect(run.bench[0]).toBeNull();
    expect(planTurn(run, catalog).result).toEqual(option.result);
    expect(prepareReforge(run, { zone: 'board', index: 1 }, 'overclock_core', catalog)).toBeUndefined();
    expect(canReforge(migrateSave({ run }, catalog).run)).toBe(false);
    expect(undo.pop(run)).toBe(true);
    expect(run).toEqual(prior);
    expect(canReforge(run)).toBe(true);
  });

  it('opens on wave 11 before the first battle and preserves the prior challenge rules', () => {
    const run = fixture();
    expect(canReforge(run)).toBe(true);
    expect(canReforge({ ...run, wave: reforgeWave - 1 })).toBe(false);
    expect(canReforge({ ...run, attempts: 1 })).toBe(false);
    expect(canReforge({ ...run, pendingLoss: true })).toBe(false);
    expect(canReforge({ ...run, endless: true })).toBe(false);
    expect(canReforge(migrateSave({ run: { ...run, reforgeRule: undefined } }, catalog).run)).toBe(false);
  });

  it('finds a winning reforge with a follow-up swap and prepares both without spending the live opportunity', () => {
    const run = fixture();
    run.tileModifiers = { 3: 'li_fire', 10: 'xuan_ice', 15: 'spirit_gathering' };
    run.board.fill(null);
    run.bench.fill(null);
    run.board[0] = { configId: 'plague_crown', star: 3, bonusPower: 12 };
    run.board[9] = { configId: 'toxic_detonator', star: 3, bonusPower: 78 };
    run.board[10] = { configId: 'catalyst_flask', star: 3, bonusPower: 43 };
    run.shield = 2;
    run.rngState = 667;

    const prior = structuredClone(run);
    const before = planTurn(run, catalog).result;
    expect(bestFormationMove(run, catalog, before.damage)?.result.win).not.toBe(true);
    const suggestion = findReforgeSuggestion(run, catalog, before.damage)!;
    const { from, target, swap, result } = suggestion;
    expect(swap).toBeDefined();
    expect(result.win).toBe(true);
    expect(previewReforges(run, from, catalog).find(item => item.target.id === target)?.result.win).toBe(false);

    const prepared = prepareReforge(run, from, target, catalog, swap)!;
    expect(prepared.final.slot).toEqual(swap!.to);
    expect(planTurn(prepared.candidate, catalog).result).toEqual(result);
    expect(canReforge(prepared.candidate)).toBe(false);
    expect(prepared.candidate.gold).toBe(run.gold);
    expect(prepareReforge(run, from, target, catalog, { from: swap!.from, to: swap!.from })).toBeUndefined();
    expect(run).toEqual(prior);
  });
});
