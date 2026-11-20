import { describe, expect, it } from 'vitest';
import { battleTarget, bountyWaves, offersBounties } from '../core/bounties';
import { encodeBoardToken, readSharedBoard, sameBattleSetup } from '../core/boardShare';
import { createMulberry32 } from '../core/rng';
import { newRun, resolveLoss, selectBounty, settleTurn, UndoStack, victoryPayout } from '../core/shopEngine';
import { planTurn } from '../core/tactics';
import type { TurnResult } from '../core/types';
import { catalog } from '../data/catalog';
import { migrateSave } from '../platform/webMockAdapter';

const clear: TurnResult = { type: 'TURN_RESULT', damage: 20_000, gold: 22, combo: 6, poison: 0, hp: 0, win: true };
const rng = () => createMulberry32(667);

function atWave(wave: number) {
  const run = newRun(catalog, rng());
  run.wave = wave;
  return run;
}

describe('campaign bounties', () => {
  it('offers two different opponents at each node and retains the original path', () => {
    for (const wave of bountyWaves) {
      const run = atWave(wave);
      const normal = battleTarget(wave);
      const standard = battleTarget(wave, 'standard');
      const alternate = battleTarget(wave, 'alternate');
      expect(new Set([normal.encounter, standard.encounter, alternate.encounter]).size).toBe(3);
      expect(standard.hp).toBeGreaterThan(normal.hp);
      expect(alternate.hp).toBeGreaterThan(normal.hp);
      expect(offersBounties(run)).toBe(true);
      expect(selectBounty({ ...run, bountyRule: undefined }, 'standard')).toBe(false);
      expect(selectBounty({ ...run, pendingLoss: true }, 'standard')).toBe(false);
      expect(selectBounty({ ...run, endless: true }, 'alternate')).toBe(false);
      expect(selectBounty({ ...run, wave: wave + 1 }, 'alternate')).toBe(false);
    }
  });

  it('reproduces an alternate battle exactly in saved games, formation links, retries and undo', () => {
    const run = atWave(5);
    run.board = [null, { configId: 'spark_orb', star: 3, bonusPower: 47 }, ...Array(14).fill(null)];
    run.rngState = 667;
    run.tileModifiers = { 13: 'spirit_gathering', 14: 'xuan_ice', 15: 'li_fire' };
    const undo = new UndoStack();
    const original = planTurn(run, catalog);
    undo.push(run);
    expect(selectBounty(run, 'standard')).toBe(true);
    expect(planTurn(run, catalog).result.win).toBe(false);
    expect(undo.pop(run)).toBe(true);
    expect(planTurn(run, catalog)).toEqual(original);
    expect(selectBounty(run, 'alternate')).toBe(true);
    const planned = planTurn(run, catalog);
    expect(planned.result.win).toBe(true);
    const restored = migrateSave({ run }, catalog).run;
    expect(restored.bountyRoute).toBe('alternate');
    expect(planTurn(restored, catalog)).toEqual(planned);
    const linked = readSharedBoard(encodeBoardToken(run)!, catalog)!;
    expect(planTurn(linked, catalog)).toEqual(planned);
    expect(sameBattleSetup(run, { ...linked, bountyRoute: undefined })).toBe(false);
    settleTurn(run, { ...clear, win: false, hp: 50 }, catalog, rng());
    expect(run.bountiesCleared).toBeUndefined();
    expect(run.bountyRoute).toBe('alternate');
    resolveLoss(run, false);
    expect(run.bountyRoute).toBe('alternate');
    expect(selectBounty(run)).toBe(true);
    expect(run.bountyRoute).toBeUndefined();
  });

  it('pays each reward once and accounts for blocked repair and engraving perks', () => {
    const early = atWave(5);
    expect(selectBounty(early, 'alternate')).toBe(true);
    const earlyPayout = victoryPayout(early, clear.gold, catalog);
    expect(earlyPayout).toMatchObject({ bounty: 4, perk: 'refresh' });
    settleTurn(early, clear, catalog, rng());
    expect(early).toMatchObject({ wave: 6, gold: clear.gold + earlyPayout.total, freeRefreshes: 3, bountiesCleared: 1 });
    expect(early.bountyRoute).toBeUndefined();
    expect(victoryPayout(early, clear.gold, catalog).bounty).toBeUndefined();

    const middle = atWave(10);
    expect(selectBounty(middle, 'alternate')).toBe(true);
    expect(victoryPayout(middle, clear.gold, catalog)).toMatchObject({ bounty: 7 });
    expect(victoryPayout(middle, clear.gold, catalog).perk).toBeUndefined();
    middle.shield = 2;
    settleTurn(middle, clear, catalog, rng());
    expect(middle).toMatchObject({ wave: 11, shield: 3, bountiesCleared: 1 });

    const late = atWave(15);
    expect(selectBounty(late, 'alternate')).toBe(true);
    expect(victoryPayout(late, clear.gold, catalog).perk).toBeUndefined();
    const rune = { configId: 'gold_cannon', star: 2, bonusPower: 7 } as const;
    late.board[13] = rune;
    settleTurn(late, clear, catalog, rng());
    expect(late.board[13]).toEqual({ ...rune, bonusPower: 19 });
    expect(late.bountyRoute).toBeUndefined();
    expect(late.bountiesCleared).toBe(1);
  });
});
