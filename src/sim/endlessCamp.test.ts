import { describe, expect, it } from 'vitest';
import { claimCamp, previewCamp } from '../core/endlessCamp';
import { affixAt, endlessCampAt, endlessSegment } from '../core/expedition';
import { createMulberry32 } from '../core/rng';
import { canArrange, chooseRelic, newRun, settleTurn, startEndless } from '../core/shopEngine';
import { planTurn } from '../core/tactics';
import type { TurnResult } from '../core/types';
import { catalog } from '../data/catalog';
import { migrateSave } from '../platform/webMockAdapter';

const rng = () => createMulberry32(667);
const cleanWin: TurnResult = { type: 'TURN_RESULT', damage: 200_000, hp: 0, combo: 4, poison: 0, gold: 40, win: true };

function firstCamp() {
  const run = newRun(catalog, rng());
  Object.assign(run, { wave: 20, status: 'victory', shield: 1, gold: 40,
    board: [{ configId: 'blood_prism', star: 1 }, { configId: 'spark_orb', star: 3, bonusPower: 27_000 }, ...Array(14).fill(null)],
    tileModifiers: { 13: 'spirit_gathering', 14: 'xuan_ice', 15: 'li_fire' } });
  startEndless(run, catalog, rng());
  return run;
}

describe('endless camps', () => {
  it('saves the first camp and blocks purchases and battles until a reward is claimed once', () => {
    const run = firstCamp();
    expect(run).toMatchObject({ endless: true, wave: 21, pendingCamp: true, shield: 1, gold: 40 });
    expect(canArrange(run)).toBe(false);
    settleTurn(run, cleanWin, catalog, rng());
    expect(run.wave).toBe(21);
    const restored = migrateSave({ run }, catalog).run;
    expect(restored.pendingCamp).toBe(true);
    expect(claimCamp(restored, { id: 'supplies' })).toBe(true);
    expect(restored).toMatchObject({ gold: 58, freeRefreshes: 3, shield: 1 });
    expect(claimCamp(restored, { id: 'supplies' })).toBe(false);
    expect(migrateSave({ run: { ...restored, pendingCamp: true, wave: 22 } }, catalog).run.pendingCamp).toBeUndefined();
    expect(canArrange(restored)).toBe(true);
  });

  it('previews a shield-sensitive formation and the effect of moving the one fire tile', () => {
    const run = firstCamp();
    const clean = structuredClone(run);
    const repair = previewCamp(run, catalog).repair!.result;
    expect(repair.damage).toBeGreaterThan(previewCamp(run, catalog).baseline.result.damage);
    expect(claimCamp(run, { id: 'repair' })).toBe(true);
    expect(planTurn(run, catalog).result).toEqual(repair);

    const source = structuredClone(clean);
    const before = previewCamp(source, catalog);
    expect(source).toEqual(clean);
    expect(before.placements[13]).toBeUndefined();
    expect(before.placements[14]).toBeUndefined();
    expect(before.placements[15]).toBeUndefined();
    expect(claimCamp(source, { id: 'move', cell: 14 })).toBe(false);
    expect(claimCamp(source, { id: 'move', cell: 1 })).toBe(true);
    expect(source.tileModifiers).toEqual({ 1: 'li_fire', 13: 'spirit_gathering', 14: 'xuan_ice' });
    expect(planTurn(source, catalog).result).toEqual(before.placements[1]!.result);
  });

  it('sequences relics before the camp and aligns later camps with affix changes', () => {
    const run = firstCamp();
    expect(claimCamp(run, { id: 'supplies' })).toBe(true);
    run.wave = 24;
    settleTurn(run, cleanWin, catalog, rng());
    expect(run).toMatchObject({ wave: 25, pendingCamp: true });
    expect(run.pendingRelics.length).toBeGreaterThan(0);
    expect(claimCamp(run, { id: 'supplies' })).toBe(false);
    expect(chooseRelic(run, run.pendingRelics[0])).toBe(true);
    expect(canArrange(run)).toBe(false);
    expect(claimCamp(run, { id: 'supplies' })).toBe(true);
    expect(affixAt(25)?.id).toBe('limit_triggers');
    expect(endlessSegment(21)).toEqual({ from: 21, through: 24, next: 25 });
    expect(endlessSegment(29)).toEqual({ from: 25, through: 29, next: 30 });
    expect(endlessCampAt(30)).toBe(true);
    expect(affixAt(30)?.id).toBe('odd_row_frenzy');
    expect(endlessSegment(Number.MAX_SAFE_INTEGER).through).toBe(Number.MAX_SAFE_INTEGER);
  });
});
