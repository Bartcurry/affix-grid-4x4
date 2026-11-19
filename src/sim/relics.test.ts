import { describe, expect, it } from 'vitest';
import { simulateBattle } from '../core/battleEngine';
import { relicChoices } from '../core/expedition';
import { readJournal } from '../core/journal';
import { previewRelics } from '../core/relicPreview';
import { createMulberry32 } from '../core/rng';
import { chooseRelic, newRun, settleTurn } from '../core/shopEngine';
import { prepareBattle } from '../core/tactics';
import type { RelicId, Rune, Slots, TurnResult } from '../core/types';
import { catalog } from '../data/catalog';
import { migrateSave } from '../platform/webMockAdapter';

const rune = (configId: string): Rune => ({ configId, star: 1 });
const noCrit = () => 1;
const newFixture = () => ({ ...newRun(catalog, createMulberry32(667)), tileModifiers: {} });

describe('expanded altar choices', () => {
  it('boosts each row’s first damaging hit and stacks with an active temporary multiplier', () => {
    const board: Slots = Array(16).fill(null);
    board[0] = rune('ember_amp');
    board[1] = rune('spark_orb');
    board[2] = rune('spark_orb');
    board[4] = rune('copper_mine');
    board[5] = rune('spark_orb');
    board[6] = rune('spark_orb');
    const relics: RelicId[] = ['row_banner', 'seal_script'];
    const events = simulateBattle({ board, gold: 10, hp: 300, relics, poison: 3 }, catalog, noCrit);
    const hits = events.filter(event => event.type === 'DAMAGE');
    expect(hits.map(event => event.amount)).toEqual([40, 12, 20, 12, 3]);
    expect(hits.map(event => event.relics)).toEqual([['row_banner', 'seal_script'], undefined, ['row_banner'], undefined, undefined]);
    expect(readJournal({ wave: 13, board, gold: 10, events }, catalog)?.events).toEqual(events);
  });

  it('keeps existing saves on the old altar schedule and offers the new relics to fresh runs', () => {
    const run = newFixture();
    run.wave = 8;
    const legacy = migrateSave({ run: { ...run, relicRule: undefined } }, catalog).run;
    const clear: TurnResult = { type: 'TURN_RESULT', damage: 1000, combo: 10, gold: 15, hp: 0, poison: 0, win: true };
    settleTurn(legacy, clear, catalog, createMulberry32(legacy.rngState));
    settleTurn(run, clear, catalog, createMulberry32(run.rngState));
    expect(legacy.pendingRelics).toEqual(['copper_ledger', 'red_lens', 'gate_tithe']);
    expect(run.pendingRelics).toEqual(['seal_script', 'red_lens', 'copper_ledger']);
    expect(relicChoices(12, ['moss_bowl'], 1)).toContain('row_banner');
    expect(relicChoices(16, ['seal_script', 'row_banner'], 1)).toEqual(['gate_tithe', 'whetstone', 'copper_ledger']);
    expect(migrateSave({ run }, catalog).run.pendingRelics).toEqual(run.pendingRelics);
  });

  it('forecasts the exact damage and final gold without choosing the relic or changing the board', () => {
    const run = newFixture();
    run.wave = 9;
    run.board[0] = rune('ember_amp');
    run.board[1] = { configId: 'spark_orb', star: 3, bonusPower: 350 };
    run.board[2] = rune('coin_mold');
    run.pendingRelics = ['seal_script', 'gate_tithe', 'row_banner'];
    const snapshot = structuredClone(run);
    const { baseline, choices } = previewRelics(run, catalog);
    expect(run).toEqual(snapshot);
    expect(baseline.result.win).toBe(true);
    expect(choices[1].gold - baseline.gold).toBe(4);
    expect(choices[0].result.damage).toBeGreaterThan(baseline.result.damage);
    expect(chooseRelic(run, 'seal_script')).toBe(true);
    expect(prepareBattle(run, catalog).events.at(-1)).toEqual(choices[0].result);
    settleTurn(run, choices[0].result, catalog, createMulberry32(run.rngState));
    expect(run.gold).toBe(choices[0].gold);
  });
});
