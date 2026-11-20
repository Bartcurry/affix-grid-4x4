import { describe, expect, it } from 'vitest';
import { simulateBattle } from '../core/battleEngine';
import { boardFromJournal, boardShareUrl, readSharedBoard } from '../core/boardShare';
import { damageLeaders, journalPlayback, journalRows, readJournal } from '../core/journal';
import { createMulberry32 } from '../core/rng';
import { newRun } from '../core/shopEngine';
import { prepareBattle } from '../core/tactics';
import type { BattleJournal, Slots } from '../core/types';
import { catalog } from '../data/catalog';
import { migrateSave } from '../platform/webMockAdapter';

const board: Slots = Array.from({ length: 16 }, (_, index) => {
  const configId = ['venom_drop', 'catalyst_flask', 'toxic_detonator', 'copper_mine', 'prism_right', 'spark_orb'][index];
  return configId ? { configId, star: 1 } : null;
});
const journal: BattleJournal = { board, gold: 8, wave: 4,
  events: simulateBattle({ board, gold: 8, hp: 100, encounter: 'armor' }, catalog, () => 1) };

describe('battle journal', () => {
  it('sums repeated hits from the same slot and keeps round-end poison separate', () => {
    const leaders = damageLeaders(journal);
    expect(leaders.map(({ source }) => source)).toEqual([5, 2, 'poison']);
    expect(leaders.map(({ amount }) => amount)).toEqual([36, 15, 6]);
    expect(leaders[0].share).toBeGreaterThan(leaders[1].share);
    expect(damageLeaders({ ...journal, events: [] })).toEqual([]);
  });

  it('retains event order, armor modifier, gold and unfiltered prior poison totals', () => {
    const damage = journalRows(journal, 'damage');
    expect(damage.flatMap(({ event, previousPoison }) => event.type === 'POISON' ? [[previousPoison, event.poison]] : []))
      .toEqual([[0, 7], [7, 12], [12, 6], [6, 4]]);
    expect(damage.some(({ event }) => event.type === 'DAMAGE' && (event.enemyDelta ?? 0) < 0)).toBe(true);
    expect(journalRows(journal, 'chain').some(({ event }) => event.type === 'CHAIN_LINK')).toBe(true);
    expect(journalRows(journal, 'economy')).toHaveLength(1);
    expect(journalRows(journal, 'all').some(({ event }) => event.type === 'TURN_RESULT' as string)).toBe(false);
  });

  it('seeks to the recorded moment, keeping damage, poison and gold in sync', () => {
    const { maxHp, frames, hardestStep } = journalPlayback(journal);
    expect(maxHp).toBe(100);
    expect(frames[0]).toMatchObject({ event: null, hp: 100, poison: 0, gold: 8 });
    expect(frames.slice(1).map(frame => frame.event)).toEqual(journal.events);
    expect(frames[hardestStep].event).toMatchObject({ type: 'DAMAGE', amount: 24, source: 5 });
    expect(frames.filter(frame => frame.event?.type === 'POISON').map(({ previousPoison, poison }) => [previousPoison, poison]))
      .toEqual([[0, 7], [7, 12], [12, 6], [6, 4]]);
    const result = journal.events.at(-1);
    if (result?.type !== 'TURN_RESULT') throw new Error('Missing test battle result');
    const { hp, poison, gold } = result;
    expect(frames.at(-1)).toMatchObject({ hp, poison, gold });
    expect(journalPlayback({ ...journal, events: [] }).hardestStep).toBe(0);
  });

  it('retains a valid journal on reload and drops only a malformed journal', () => {
    const copy = JSON.parse(JSON.stringify(journal));
    expect(readJournal(copy, catalog)).toEqual(journal);
    const base = migrateSave(null, catalog);
    const saved = { ...base, run: { ...base.run, gold: 32, lastJournal: copy } };
    expect(migrateSave(saved, catalog).run.lastJournal).toEqual(journal);
    copy.events[0].index = 27;
    const recovered = migrateSave(saved, catalog);
    expect(recovered.run.gold).toBe(32);
    expect(recovered.run.lastJournal).toBeUndefined();
  });

  it('shares the original battle state after gold, shield, random state and power change', () => {
    const run = newRun(catalog, createMulberry32(667));
    run.wave = run.trialWave = 10;
    run.trialRoute = 'alternate';
    run.shield = 1;
    run.gold = 23;
    run.relics = ['chain_ring'];
    run.tileModifiers = { 1: 'spirit_gathering', 12: 'li_fire', 13: 'xuan_ice' };
    const { board, events, rngState } = prepareBattle(run, catalog);
    expect(board[1]?.bonusPower).toBeGreaterThan(0);
    const { wave, trialWave, trialRoute, gold } = run;
    run.lastJournal = { wave, trialWave, trialRoute, gold, board: run.board, events,
      replay: { rngState: run.rngState, shield: run.shield, relics: [...run.relics], tileModifiers: { ...run.tileModifiers } } };
    Object.assign(run, { board, gold: 29, shield: 0, status: 'defeat', rngState });
    const restored = migrateSave(JSON.stringify({ run }), catalog).run;
    const replay = boardFromJournal(restored.lastJournal)!;
    expect(replay).toMatchObject({ gold: 23, shield: 1, trialRoute: 'alternate', relics: ['chain_ring'] });
    const address = new URL(boardShareUrl('https://example.test/', replay)!);
    expect(prepareBattle(readSharedBoard(address.hash, catalog)!, catalog).events).toEqual(events);
    const broken = readJournal({ ...restored.lastJournal!, replay: { ...replay, rngState: -1 } }, catalog);
    expect(broken?.events).toEqual(events);
    expect(boardFromJournal(broken)).toBeUndefined();
  });
});
