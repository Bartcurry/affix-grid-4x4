import { describe, expect, it } from 'vitest';
import { boardShareParam, boardShareUrl, readSharedBoard, sameBattleSetup, sameFormation } from '../core/boardShare';
import { formationDuelParam, formationDuelUrl, readFormationDuel } from '../core/formationDuel';
import { createMulberry32 } from '../core/rng';
import { newRun } from '../core/shopEngine';
import { planTurn } from '../core/tactics';
import { catalog } from '../data/catalog';

describe('one-wave board links', () => {
  it('recreates an opening-dependent battle and preserves its random state', () => {
    const run = newRun(catalog, createMulberry32(667), 'chain');
    const url = new URL(boardShareUrl('https://example.com/play/?challenge=ignored#old', run)!);
    expect(url.pathname).toBe('/play/');
    expect(url.hash).toBe('');
    expect([...url.searchParams.keys()]).toEqual([boardShareParam]);
    const restored = readSharedBoard(url.searchParams.get(boardShareParam), catalog)!;
    expect(restored).toMatchObject({ opening: run.opening, shield: run.shield, rngState: run.rngState,
      enableSynergies: true, tileModifiers: run.tileModifiers });
    expect(planTurn(restored, catalog).events).toEqual(planTurn(run, catalog).events);
  });

  it('preserves the full bench, relics, rune power and both layouts through a rematch link', () => {
    const run = newRun(catalog, createMulberry32(667), 'gold');
    Object.assign(run, { wave: 4, gold: 35, shield: 2, relics: ['qiankun_pouch', 'bagua_mirror'],
      tileModifiers: { 1: 'li_fire', 6: 'xuan_ice', 13: 'spirit_gathering' } });
    run.board.fill(null);
    run.board[0] = { configId: 'spark_orb', star: 1 };
    run.board[2] = { configId: 'echo_stone', star: 1 };
    run.board[5] = { configId: 'copper_mine', star: 1 };
    run.bench[0] = { configId: 'gold_cannon', star: 2, bonusPower: 9 };
    const encode = () => new URL(boardShareUrl('https://example.com/play/', run)!).searchParams.get(boardShareParam);
    const original = readSharedBoard(encode(), catalog)!;
    expect(original).toMatchObject({ bench: run.bench, board: run.board, relics: run.relics, gold: 35 });
    const before = planTurn(original, catalog);
    [run.board[1], run.bench[0]] = [run.bench[0], run.board[1]];
    const rematch = readSharedBoard(encode(), catalog)!;
    const after = planTurn(rematch, catalog);
    expect(before.result.win).toBe(false);
    expect(after.result.win).toBe(true);
    expect(after.events).toEqual(planTurn(run, catalog).events);
    expect(planTurn(original, catalog)).toEqual(before);
    expect(sameBattleSetup(original, rematch)).toBe(true);
    expect(sameFormation(original, rematch)).toBe(false);
    expect(sameBattleSetup(original, { ...rematch, gold: rematch.gold + 1 })).toBe(false);
    const differentRune = { ...rematch, board: [...rematch.board] };
    differentRune.board[1] = { ...rematch.board[1]!, bonusPower: 10 };
    expect(sameBattleSetup(original, differentRune)).toBe(false);
  });

  it('rejects malformed, oversized and older data before simulation', () => {
    const run = newRun(catalog, createMulberry32(667));
    const url = new URL(boardShareUrl('https://example.com/play/', run)!);
    const original = JSON.parse(atob(url.searchParams.get(boardShareParam)!.replaceAll('-', '+').replaceAll('_', '/')));
    const encode = (value: unknown) => btoa(JSON.stringify(value)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
    for (const edits of [{ 0: 's2' }, { 4: 4 }, { 7: ['qiankun_pouch', 'qiankun_pouch'] },
      { 8: [[10, 'li_fire'], [10, 'xuan_ice']] }, { 9: [['not-in-catalog', 1, 0]] }, { 10: [] }]) {
      expect(readSharedBoard(encode(Object.assign([...original], edits)), catalog)).toBeUndefined();
    }
    expect(readSharedBoard('A'.repeat(2600), catalog)).toBeUndefined();
    expect(readSharedBoard(null, catalog)).toBeUndefined();
  });

  it('replays the steps in an invitation and derives a reachable score without changing the original board', () => {
    const run = newRun(catalog, createMulberry32(667));
    run.wave = 8;
    run.tileModifiers = {};
    run.board.fill(null);
    run.bench[0] = { configId: 'spark_orb', star: 3, bonusPower: 190 };
    const steps = [[{ zone: 'bench', index: 0 }, { zone: 'board', index: 1 }]] as const;
    const url = new URL(formationDuelUrl('https://example.com/game/?daily=old#result', run, steps)!);
    expect([...url.searchParams.keys()]).toEqual([boardShareParam, formationDuelParam]);
    expect(url.searchParams.get(formationDuelParam)).toBe('v1.G1');
    const restored = readSharedBoard(url.searchParams.get(boardShareParam), catalog)!;
    expect(restored.board).toEqual(run.board);
    const setup = { ...run, board: [...run.board], bench: [...run.bench] };
    [setup.board[1], setup.bench[0]] = [setup.bench[0], setup.board[1]];
    expect(readFormationDuel(url.searchParams.get(formationDuelParam), restored, catalog))
      .toEqual({ moves: 1, damage: planTurn(setup, catalog).result.damage });
    expect(restored.bench).toEqual(run.bench);
    expect(restored.board.every(piece => !piece)).toBe(true);
    for (const invalid of ['v2.G1', 'v1.G', 'v1.GZ', 'v1.GG', 'v1.1G', 'v1.G11G', 'v1.G11GG11GG1']) {
      expect(readFormationDuel(invalid, restored, catalog), invalid).toBeUndefined();
    }
    expect(formationDuelUrl('https://example.com/game/', run, [])).toBeUndefined();
  });
});
