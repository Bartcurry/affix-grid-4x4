import { describe, expect, it } from 'vitest';
import { previewOffer } from '../core/marketPreview';
import { createMulberry32 } from '../core/rng';
import { buyRune, newRun, swapRunes, UndoStack } from '../core/shopEngine';
import { prepareBattle } from '../core/tactics';
import { catalog } from '../data/catalog';

const fixture = () => ({ ...newRun(catalog, createMulberry32(667)), wave: 2, tileModifiers: {} });

describe('buy and place forecasts', () => {
  it('predicts all 16 positions, deducts the price, and matches an ordinary purchase and swap', () => {
    const run = fixture();
    run.shop[0] = { configId: 'echo_stone', locked: true };
    const initial = structuredClone(run);
    const options = previewOffer(run, 0, catalog);
    expect(options.map(option => option.cell)).toEqual(Array.from({ length: 16 }, (_, cell) => cell));
    expect(options[2].result.win).toBe(true);
    expect(options[2].result.damage).toBeGreaterThan(options[3].result.damage);
    expect(options[2].result.gold).toBe(run.gold - catalog.echo_stone.cost);
    expect(run).toEqual(initial);

    const undo = new UndoStack();
    undo.push(run);
    expect(buyRune(run, 0, catalog, 0)).toEqual([]);
    expect(run.board[0]?.configId).toBe('echo_stone');
    expect(run.bench[0]?.configId).toBe('prism_right');
    expect(prepareBattle(run, catalog).events.at(-1)).toEqual(options[0].result);
    const manual = structuredClone(initial);
    expect(buyRune(manual, 0, catalog)).toEqual([]);
    swapRunes(manual, { zone: 'bench', index: 0 }, { zone: 'board', index: 0 });
    expect(run).toEqual(manual);
    expect(undo.pop(run)).toBe(true);
    expect(run).toEqual(initial);
  });

  it('forecasts a three-star cascade while both the bench and board are full', () => {
    const run = fixture();
    run.shop[0] = { configId: 'spark_orb', locked: false };
    run.board.fill({ configId: 'copper_mine', star: 3 });
    run.bench.fill({ configId: 'venom_drop', star: 3 });
    for (const [index, star] of [2, 2, 1, 1].entries()) run.board[index] = { configId: 'spark_orb', star: star === 2 ? 2 : 1 };
    const initial = structuredClone(run);
    const options = previewOffer(run, 0, catalog);
    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({ cell: undefined, merges: [
      { slot: { zone: 'board', index: 2 }, rune: { configId: 'spark_orb', star: 2 } },
      { slot: { zone: 'board', index: 0 }, rune: { configId: 'spark_orb', star: 3 } },
    ] });
    expect(run).toEqual(initial);
    expect(buyRune(run, 0, catalog, 8)).toBeNull();
    expect(buyRune(run, 0, catalog)).toEqual(options[0].merges);
    expect(run.board[0]?.star).toBe(3);
    expect(run.bench).toEqual(initial.bench);
    expect(prepareBattle(run, catalog).events.at(-1)).toEqual(options[0].result);
  });

  it('leaves money and inventory alone when the cell or purchase is unavailable', () => {
    const run = fixture();
    run.shop[0] = { configId: 'gold_cannon', locked: false };
    const initial = structuredClone(run);
    expect(buyRune(run, 0, catalog, 16)).toBeNull();
    expect(run).toEqual(initial);
    run.gold = 0;
    expect(previewOffer(run, 0, catalog)).toEqual([]);
    expect(buyRune(run, 0, catalog, 1)).toBeNull();
    run.gold = 10;
    run.bench.fill({ configId: 'venom_drop', star: 3 });
    expect(previewOffer(run, 0, catalog)).toEqual([]);
    expect(buyRune(run, 0, catalog, 1)).toBeNull();
    expect(run.gold).toBe(10);
    expect(run.shop[0]?.configId).toBe('gold_cannon');
  });
});
