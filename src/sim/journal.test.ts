import { describe, expect, it } from 'vitest';
import { encodeBoardToken, readSharedBoard } from '../core/boardShare';
import { damageBySource, damageLeaders, journalPlayback, journalRows, readJournal } from '../core/journal';
import { createMulberry32 } from '../core/rng';
import { newRun } from '../core/shopEngine';
import { planTurn } from '../core/tactics';
import { catalog } from '../data/catalog';
import { migrateSave } from '../platform/webMockAdapter';

function prepared() {
  const run = newRun(catalog, createMulberry32(667), 'poison');
  run.wave = 8;
  run.bench[0] = { configId: 'copper_mine', star: 2, bonusPower: 3 };
  run.relics = ['qiankun_pouch'];
  run.tileModifiers = { 9: 'li_fire', 10: 'xuan_ice', 11: 'spirit_gathering' };
  const { events, hp } = planTurn(run, catalog);
  return { run, journal: { formation: encodeBoardToken(run)!, maxHp: hp, events } };
}

describe('last battle journal', () => {
  it('attributes synergy poison bursts to their runes and keeps the round-end tick separate', () => {
    const { journal } = prepared();
    const { breakdown, total } = damageBySource(journal.events);
    const bursts = journal.events.flatMap(event => event.type === 'DAMAGE' && event.kind === 'poison' && event.source === 0 ? [event.amount] : []);
    expect(bursts.length).toBeGreaterThan(0);
    expect(breakdown.get(0)).toBe(bursts.reduce((a, b) => a + b, 0));
    expect(breakdown.get('poison')).toBeGreaterThan(0);
    expect([...breakdown.values()].reduce((a, b) => a + b, 0)).toBe(total);
    expect(damageLeaders(journal)).toHaveLength(3);
    expect(journalRows(journal, 'damage').every(line => ['DAMAGE', 'POISON'].includes(line.event.type))).toBe(true);
  });

  it('restores exact events and the original resources after changing the campaign board', () => {
    const { run, journal } = prepared();
    const original = structuredClone(run);
    run.lastJournal = journal;
    run.gold += 10;
    run.board.fill(null);
    run.shield--;
    const restored = migrateSave(JSON.stringify({ run }), catalog).run.lastJournal!;
    expect(restored).toEqual(journal);
    const start = readSharedBoard(restored.formation, catalog, true)!;
    expect(start).toMatchObject({ board: original.board, bench: original.bench, shield: original.shield, gold: original.gold });
    expect(planTurn(start, catalog).events).toEqual(restored.events);
    const { frames, hardestStep } = journalPlayback(restored, start.gold);
    expect(frames[0]).toMatchObject({ event: null, hp: journal.maxHp, gold: original.gold });
    const maxHit = Math.max(...restored.events.flatMap(event => event.type === 'DAMAGE' ? [event.amount] : []));
    expect(frames[hardestStep].event).toMatchObject({ type: 'DAMAGE', amount: maxHit });
    const end = restored.events.at(-1);
    if (end?.type !== 'TURN_RESULT') throw new Error('Expected a battle result');
    expect(frames.at(-1)).toMatchObject({ hp: end.hp, poison: end.poison, gold: end.gold });
  });

  it('drops an invalid record and permits a real loss with an empty board', () => {
    const { run, journal } = prepared();
    expect(readJournal({ ...journal, events: [{ type: 'CELL_ACTIVATE', index: 16 }, ...journal.events] }, catalog)).toBeUndefined();
    expect(migrateSave({ run: { ...run, lastJournal: { ...journal, formation: 'bad' } } }, catalog).run.lastJournal).toBeUndefined();
    run.board.fill(null);
    run.bench.fill(null);
    const { events, hp } = planTurn(run, catalog);
    expect(readJournal({ formation: encodeBoardToken(run), events, maxHp: hp }, catalog)?.events).toEqual(events);
  });
});
