import { describe, expect, it } from 'vitest';
import { createMulberry32 } from '../core/rng';
import { preparePurchase, purchaseLayouts } from '../core/purchasePreview';
import { buyRune, newRun, swapRunes, UndoStack } from '../core/shopEngine';
import { planTurn } from '../core/tactics';
import { previewUpgrade, upgradeProgress } from '../core/upgradeProgress';
import { catalog } from '../data/catalog';

function fixture() {
  const run = newRun(catalog, createMulberry32(667));
  run.wave = 6;
  run.gold = 22;
  run.tileModifiers = {};
  run.board.fill({ configId: 'copper_mine', star: 3 });
  run.bench.fill({ configId: 'venom_drop', star: 3 });
  run.board[0] = { configId: 'spark_orb', star: 2, bonusPower: 5 };
  run.board[1] = { configId: 'spark_orb', star: 1 };
  run.bench[0] = { configId: 'spark_orb', star: 2, bonusPower: 2 };
  run.bench[1] = { configId: 'spark_orb', star: 1, bonusPower: 1 };
  run.shop = [null, { configId: 'spark_orb', locked: true }, { configId: 'spark_orb', locked: false }];
  return run;
}

describe('upgrade book', () => {
  it('counts both zones and excludes max stars even when they cover the rest of the board', () => {
    expect(upgradeProgress(fixture())).toEqual([
      { id: 'spark_orb', target: 3, required: 9, filled: 8, missing: 1, offers: [1, 2],
        singles: [{ zone: 'board', index: 1 }, { zone: 'bench', index: 1 }],
        doubles: [{ zone: 'board', index: 0 }, { zone: 'bench', index: 0 }] },
    ]);
  });

  it('previews the exact destination, inherited power, freed cells and result of a full-bench cascade', () => {
    const run = fixture();
    const original = structuredClone(run);
    const plan = previewUpgrade(run, 1, catalog)!;
    expect(run).toEqual(original);
    expect(plan.final).toEqual({ slot: { zone: 'board', index: 0 }, rune: { configId: 'spark_orb', star: 3, bonusPower: 8 } });
    expect(plan.freed).toEqual([{ zone: 'board', index: 1 }, { zone: 'bench', index: 0 }, { zone: 'bench', index: 1 }]);
    const undo = new UndoStack();
    undo.push(run);
    expect(buyRune(run, 1, catalog)?.at(-1)).toEqual(plan.final);
    expect(planTurn(run, catalog).result).toEqual(plan.result);
    expect(undo.pop(run)).toBe(true);
    expect(run).toEqual(original);
    run.gold = 0;
    expect(previewUpgrade(run, 1, catalog)).toBeUndefined();
  });
});

describe('shop purchase previews', () => {
  it('accounts for the lost cannon damage when buying and verifies the placed result against real operations', () => {
    const run = newRun(catalog, createMulberry32(667));
    Object.assign(run, { wave: 8, gold: 20, rngState: 667, tileModifiers: {},
      board: [null, { configId: 'spark_orb', star: 3, bonusPower: 100 }, { configId: 'gold_cannon', star: 1 }, ...Array(13).fill(null)],
      bench: Array(4).fill(null), shop: [{ configId: 'prism_right', locked: true }, null, null] });
    const original = structuredClone(run);
    const base = planTurn(run, catalog).result;
    const preview = preparePurchase(run, 0, catalog)!;
    const { fixed, placements, recommended } = purchaseLayouts(preview, catalog);
    expect(run).toEqual(original);
    expect(fixed.run.gold).toBe(16);
    expect(fixed.result.damage).toBeLessThan(base.damage);
    expect(recommended).toBe(0);
    expect(placements[2]?.run.bench[0]?.configId).toBe('gold_cannon');
    expect(placements[recommended!]!.result.win).toBe(true);
    const undo = new UndoStack();
    undo.push(run);
    expect(buyRune(run, 0, catalog)).toEqual([]);
    expect(swapRunes(run, preview.slot, { zone: 'board', index: recommended! })).toBe(true);
    expect(planTurn(run, catalog).result).toEqual(placements[recommended!]!.result);
    expect(undo.pop(run)).toBe(true);
    expect(run).toEqual(original);
  });
});
