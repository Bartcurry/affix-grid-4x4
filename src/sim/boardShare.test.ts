import { describe, expect, it } from 'vitest';
import { boardShareUrl, readSharedBoard } from '../core/boardShare';
import { createMulberry32 } from '../core/rng';
import { newRun } from '../core/shopEngine';
import { prepareBattle } from '../core/tactics';
import { catalog } from '../data/catalog';

const fromParts = (raw: unknown) => `#board=${btoa(JSON.stringify(raw)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')}`;

describe('one-wave board links', () => {
  it('recreates the exact combat state and events without carrying the campaign or seed', () => {
    const run = newRun(catalog, createMulberry32(667), 'chain');
    run.wave = run.trialWave = 10;
    run.gold = 39;
    run.shield = 2;
    run.relics = ['seal_script', 'row_banner'];
    run.board[1] = { configId: 'spark_orb', star: 2, bonusPower: 18 };
    const before = structuredClone(run);
    const address = new URL(boardShareUrl('https://test.example/affix-grid-4x4/?challenge=other', run)!);
    expect(address.pathname).toBe('/affix-grid-4x4/');
    expect(address.search).toBe('');
    const trial = readSharedBoard(address.hash, catalog)!;
    expect(trial).toEqual({ wave: run.wave, gold: 39, shield: 2, rngState: run.rngState, trialWave: 10,
      relics: run.relics, board: run.board, tileModifiers: run.tileModifiers });
    expect(prepareBattle(trial, catalog)).toEqual(prepareBattle(run, catalog));
    expect(run).toEqual(before);
    expect(boardShareUrl('file:///preview.html', run)).toBeNull();
  });

  it('rejects malformed revisions, illegal pieces and inconsistent trial or tile settings', () => {
    const pieces = Array.from({ length: 16 }, (_, index) => index === 0 ? ['spark_orb', 1, 0] : null);
    const valid = ['s1', 5, 0, 3, 667, 1, [], [[2, 'li_fire']], pieces];
    expect(readSharedBoard(fromParts(valid), catalog)).not.toBeNull();
    for (const changes of [{ 0: 's2' }, { 1: 6 }, { 3: 5 }, { 6: ['not_a_relic'] }, { 7: [[2, 'li_fire'], [2, 'xuan_ice']] },
      { 7: [[16, 'li_fire']] }, { 8: [['spark_orb', 9, 0], ...pieces.slice(1)] }, { 8: [['missing', 1, 0], ...pieces.slice(1)] },
      { 8: [['spark_orb', 1, -5], ...pieces.slice(1)] }, { 8: pieces.slice(1) }]) {
      expect(readSharedBoard(fromParts(Object.assign([...valid], changes)), catalog)).toBeNull();
    }
    expect(readSharedBoard('#board=%%%', catalog)).toBeNull();
    expect(readSharedBoard(`#board=${'A'.repeat(3000)}`, catalog)).toBeNull();
  });
});
