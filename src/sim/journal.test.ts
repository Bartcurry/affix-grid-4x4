import { describe, expect, it } from 'vitest';
import { simulateBattle } from '../core/battleEngine';
import { damageLeaders, journalRows, readJournal } from '../core/journal';
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
});
