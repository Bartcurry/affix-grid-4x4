import { expect, it } from 'vitest';
import { simulateBattle } from '../core/battleEngine';
import { campChoices, claimCamp } from '../core/endlessCamp';
import { affixAt } from '../core/expedition';
import { createMulberry32 } from '../core/rng';
import { canArrange, newRun, settleTurn, startEndless } from '../core/shopEngine';
import { prepareBattle } from '../core/tactics';
import { catalog } from '../data/catalog';
import { migrateSave } from '../platform/webMockAdapter';

function champion() {
  const run = newRun(catalog, createMulberry32(667));
  run.wave = 20;
  run.status = 'victory';
  run.shield = 2;
  run.tileModifiers = { 13: 'xuan_ice', 14: 'li_fire', 15: 'spirit_gathering' };
  return run;
}

it('offers one rest after the finale and after every five completed endless waves', () => {
  const run = champion();
  startEndless(run, catalog, createMulberry32(run.rngState));
  expect(run).toMatchObject({ wave: 21, endless: true, pendingCamp: true });
  expect(canArrange(run)).toBe(false);
  const restored = migrateSave(JSON.stringify({ run }), catalog).run;
  expect(restored.pendingCamp).toBe(true);
  expect(claimCamp(restored, 'repair')).toBe(true);
  expect(restored.shield).toBe(3);
  expect(claimCamp(restored, 'supplies')).toBe(false);
  expect(canArrange(restored)).toBe(true);
  restored.wave = 25;
  restored.board[1] = { configId: 'spark_orb', star: 3, bonusPower: 150000 };
  const result = prepareBattle(restored, catalog).events.at(-1);
  if (result?.type !== 'TURN_RESULT') throw new Error('Missing battle result');
  expect(result.win).toBe(true);
  settleTurn(restored, result, catalog, createMulberry32(restored.rngState));
  expect(restored).toMatchObject({ wave: 26, pendingCamp: true });
  expect(claimCamp(restored, 'repair')).toBe(false);
  const gold = restored.gold;
  expect(claimCamp(restored, 'supplies')).toBe(true);
  expect(restored.gold).toBe(gold + 18);

  const legacy = { ...champion(), endlessRule: undefined };
  startEndless(legacy, catalog, createMulberry32(legacy.rngState));
  expect(legacy).toMatchObject({ wave: 21, endless: true });
  expect(canArrange(legacy)).toBe(true);
  expect(claimCamp(legacy, 'supplies')).toBe(false);
});

it('previews and moves only the fire tile without spending gold or changing the seed', () => {
  const run = champion();
  startEndless(run, catalog, createMulberry32(run.rngState));
  const before = structuredClone(run);
  const { baseline, options } = campChoices(run, catalog);
  const onSpark = options.find(option => option.kind === 'move' && option.cell === 1)!;
  expect(onSpark.result.damage).toBeGreaterThan(baseline.result.damage);
  expect(run).toEqual(before);
  for (const cell of [13, 14, 15, 16, -1, 1.5]) expect(claimCamp(run, 'move', cell)).toBe(false);
  expect(claimCamp(run, 'move', 1)).toBe(true);
  expect(run.tileModifiers).toEqual({ 1: 'li_fire', 13: 'xuan_ice', 15: 'spirit_gathering' });
  expect(run.rngState).toBe(before.rngState);
  expect(run.gold).toBe(before.gold);
  expect(prepareBattle(run, catalog).events.at(-1)).toEqual(onSpark.result);
});

it('identifies the human-numbered rows affected by the fire affix', () => {
  const affix = affixAt(30);
  expect(affix?.desc).toContain('第 2、4 排');
  const board = Array.from({ length: 16 }, (_, index) => index % 4 < 2
    ? { configId: index % 4 === 0 ? 'prism_right' : 'spark_orb', star: 1 as const } : null);
  const events = simulateBattle({ board, gold: 10, hp: 500, affix: affix?.id }, catalog, () => 1);
  expect(events.flatMap(event => event.type === 'CHAIN_LINK' ? [event.from] : [])).toEqual([0, 8]);
  const hits = events.flatMap(event => event.type === 'DAMAGE' && event.source === 5 ? [event.amount] : []);
  expect(hits).toEqual([20]);
});
