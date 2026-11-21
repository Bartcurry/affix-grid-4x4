import { describe, expect, it } from 'vitest';
import { challengeFromRun, challengeProgress, challengeSaveKey, challengeUrl, matchesChallenge, readChallenge } from '../core/challenge';
import { battleTargetFor } from '../core/bounties';
import { createMulberry32, decodeSeed } from '../core/rng';
import { newRun, resolveLoss, settleTurn, startEndless, victoryPayout } from '../core/shopEngine';
import { planTurn } from '../core/tactics';
import { catalog } from '../data/catalog';
import { migrateSave } from '../platform/webMockAdapter';

describe('same-seed challenges', () => {
  it('encodes a handwritten seed and reproduces the newest setup and first battle', () => {
    const seed = '借火借到家';
    const host = newRun(catalog, createMulberry32(decodeSeed(seed)), 'gold', seed);
    const score = challengeFromRun({ ...host, wave: 7, bestCombo: 22 });
    const address = new URL(challengeUrl('https://example.org/game/?other=1#old', score));
    expect(address.pathname).toBe('/game/');
    expect(address.hash).toBe('');
    const invite = readChallenge(address.searchParams.get('challenge'));
    expect(invite).toEqual(score);
    const guest = newRun(catalog, createMulberry32(decodeSeed(score.seed)), score.opening, score.seed);
    expect(guest).toEqual({ ...host, seed: score.seed });
    expect(planTurn(guest, catalog).events).toEqual(planTurn(host, catalog).events);
    expect(matchesChallenge(host, score)).toBe(true);
    expect(matchesChallenge({ ...host, enableSynergies: false }, score)).toBe(false);
    expect(challengeSaveKey(score)).toBe(challengeSaveKey({ ...score, cleared: 50 }));
    expect(challengeSaveKey(score)).not.toBe(challengeSaveKey({ ...score, opening: 'poison' }));
    const previous = readChallenge(`v7.gold.${score.seed}.6.22`)!;
    const altar = readChallenge(`v8.gold.${score.seed}.6.22`)!;
    const bounties = readChallenge(`v9.gold.${score.seed}.6.22`)!;
    const camp = readChallenge(`v10.gold.${score.seed}.6.22`)!;
    const reforge = readChallenge(`v11.gold.${score.seed}.6.22`)!;
    const finale = readChallenge(`v12.gold.${score.seed}.6.22`)!;
    const beforeFinale = { ...host, finaleRule: undefined, engravingRule: undefined };
    expect(previous.altarRule).toBeUndefined();
    expect(invite?.altarRule).toBe(1);
    expect(invite?.bountyRule).toBe(1);
    expect(invite?.endlessRule).toBe(1);
    expect(invite?.reforgeRule).toBe(1);
    expect(invite?.finaleRule).toBe(1);
    expect(invite?.engravingRule).toBe(1);
    expect(address.searchParams.get('challenge')).toMatch(/^v14\./);
    expect(camp.reforgeRule).toBeUndefined();
    expect(altar.altarRule).toBe(1);
    expect(altar.bountyRule).toBeUndefined();
    expect(matchesChallenge(host, previous)).toBe(false);
    expect(matchesChallenge({ ...beforeFinale, altarRule: undefined, bountyRule: undefined, endlessRule: undefined, reforgeRule: undefined }, previous)).toBe(true);
    expect(matchesChallenge(host, altar)).toBe(false);
    expect(matchesChallenge({ ...beforeFinale, bountyRule: undefined, endlessRule: undefined, reforgeRule: undefined }, altar)).toBe(true);
    expect(matchesChallenge({ ...beforeFinale, endlessRule: undefined, reforgeRule: undefined }, bounties)).toBe(true);
    expect(matchesChallenge({ ...beforeFinale, reforgeRule: undefined }, camp)).toBe(true);
    expect(matchesChallenge(beforeFinale, reforge)).toBe(true);
    expect(challengeSaveKey(previous)).not.toBe(challengeSaveKey(score));
    expect(challengeSaveKey(altar)).not.toBe(challengeSaveKey(score));
    expect(challengeSaveKey(bounties)).not.toBe(challengeSaveKey(score));
    expect(challengeSaveKey(camp)).not.toBe(challengeSaveKey(score));
    expect(challengeSaveKey(reforge)).not.toBe(challengeSaveKey(score));
    expect(matchesChallenge({ ...host, engravingRule: undefined }, finale)).toBe(true);
    expect(matchesChallenge(host, finale)).toBe(false);
    expect(challengeSaveKey(finale)).not.toBe(challengeSaveKey(score));
  });

  it('rejects old, malformed and oversized scores and ranks waves before combo', () => {
    const { seed } = challengeFromRun(newRun(catalog, createMulberry32(667)));
    for (const raw of [null, `v6.chain.${seed}.2.8`, `v7.chain.${seed}.0`,
      `v7.chain.${seed}.2.-2`, `v7.chain.${seed}.9007199254740992.1`, 'v7.chain.AAAA-AAAA.1.8']) {
      expect(readChallenge(raw)).toBeUndefined();
    }
    expect(challengeProgress({ cleared: 4, combo: 2 }, { cleared: 3, combo: 120 }).reached).toBe(true);
    expect(challengeProgress({ cleared: 3, combo: 2 }, { cleared: 3, combo: 5 }).text).toContain('再多 3 连击');
  });

  it('keeps beginner support, saves and same-seed challenges separate from standard runs', () => {
    const standard = newRun(catalog, createMulberry32(667));
    const beginner = newRun(catalog, createMulberry32(667), 'chain', undefined, 'beginner');
    expect(beginner.shop).toEqual(standard.shop);
    expect(beginner.freeRefreshes).toBe(2);
    expect(standard.freeRefreshes).toBe(1);
    const score = challengeFromRun(beginner);
    const invite = new URL(challengeUrl('https://example.org/game/', score)).searchParams.get('challenge');
    expect(invite).toBe(`v17.chain.${score.seed}.0.0.beginner`);
    expect(readChallenge(invite)).toEqual(score);
    const older = readChallenge(`v13.chain.${score.seed}.0.0`)!;
    expect(older.difficulty).toBe('beginner');
    expect(older.engravingRule).toBeUndefined();
    const legacy = newRun(catalog, createMulberry32(667), 'chain', undefined, 'beginner', 0);
    expect(matchesChallenge({ ...legacy, engravingRule: undefined }, older)).toBe(true);
    const legacyScore = readChallenge(`v15.chain.${score.seed}.0.0`)!;
    expect(matchesChallenge(legacy, legacyScore)).toBe(true);
    expect(matchesChallenge(beginner, legacyScore)).toBe(false);
    expect(challengeSaveKey(score)).not.toBe(challengeSaveKey(legacyScore));
    expect(planTurn(migrateSave({ run: legacy }, catalog).run, catalog)).toMatchObject({ hp: 60, tutorialDamage: 42 });
    expect(readChallenge(invite!.replace('.beginner', ''))).toBeUndefined();
    expect(readChallenge(invite!.replace('.chain.', '.gold.'))).toBeUndefined();
    expect(matchesChallenge(standard, score)).toBe(false);
    expect(challengeSaveKey(score)).not.toBe(challengeSaveKey(challengeFromRun(standard)));

    const win = planTurn(beginner, catalog).result;
    expect(win.win).toBe(true);
    const rng = createMulberry32(beginner.rngState);
    settleTurn(beginner, { ...win, win: false }, catalog, rng);
    resolveLoss(beginner, false);
    expect(beginner.shield).toBe(2);
    expect(beginner.freeRefreshes).toBe(2);
    settleTurn(standard, { ...win, win: false }, catalog, createMulberry32(standard.rngState));
    resolveLoss(standard, false);
    settleTurn(standard, win, catalog, createMulberry32(standard.rngState));
    settleTurn(beginner, win, catalog, rng);
    expect(standard.shield).toBe(2);
    expect(standard.freeRefreshes).toBe(1);
    expect(beginner.shield).toBe(3);
    expect(beginner.freeRefreshes).toBe(2);
    const migrated = migrateSave({ run: beginner, records: { chain: { cleared: 7, combo: 32 } } }, catalog);
    expect(migrated.run.difficulty).toBe('beginner');
    expect(migrated.run.firstWaveRule).toBe(1);
    expect(migrated.records.chain).toEqual({ cleared: 7, combo: 32 });
    expect(migrated.beginnerRecords?.chain).toEqual({ cleared: 1, combo: win.combo });

    Object.assign(beginner, { wave: 20, status: 'victory', shield: 1 });
    startEndless(beginner, catalog, rng);
    expect(beginner.shield).toBe(1);
    expect(beginner.freeRefreshes).toBe(1);
  });

  it('preserves synergy payouts and the last damage breakdown after reloading', () => {
    const run = newRun(catalog, createMulberry32(667), 'gold');
    run.board[2] = { configId: 'greed_amplifier', star: 1 };
    run.lastCellDamage = Array.from({ length: 16 }, (_, index) => index);
    const original = victoryPayout(run, 40, catalog);
    expect(original.total).toBeGreaterThan(victoryPayout({ ...run, enableSynergies: false }, 40, catalog).total);
    const restored = migrateSave({ run }, catalog).run;
    expect(restored.enableSynergies).toBe(true);
    expect(restored.lastCellDamage).toEqual(run.lastCellDamage);
    expect(victoryPayout(restored, 40, catalog)).toEqual(original);
    expect(migrateSave({ run: { ...run, enableSynergies: false } }, catalog).run.enableSynergies).toBe(false);
  });

  it('gives expert runs a tougher campaign, separate records and an exact same-seed invite', () => {
    const standard = newRun(catalog, createMulberry32(667));
    const expert = newRun(catalog, createMulberry32(667), 'chain', undefined, 'expert');
    expect(expert.shield).toBe(2);
    expect(expert.shop).toEqual(standard.shop);
    expect(expert.freeRefreshes).toBe(1);
    const first = planTurn(expert, catalog);
    expect(first.hp).toBe(planTurn(standard, catalog).hp);
    expect(first.result.win).toBe(true);
    const rng = createMulberry32(expert.rngState);
    settleTurn(expert, first.result, catalog, rng);
    expect(expert.wave).toBe(2);
    expect(expert.shield).toBe(2);
    expect(planTurn(expert, catalog).hp).toBe(89);
    expect(battleTargetFor({ ...expert, wave: 5, bountyRoute: 'alternate' }).hp).toBe(323);
    expect(battleTargetFor({ ...expert, wave: 20 }).hp).toBe(55037);
    expect(battleTargetFor({ ...expert, wave: 21 })).toEqual(battleTargetFor({ ...standard, wave: 21 }));

    const score = challengeFromRun(expert);
    const invite = new URL(challengeUrl('https://example.org/game/', score)).searchParams.get('challenge');
    expect(invite).toMatch(/^v17\.chain\..+\.expert$/);
    expect(readChallenge(invite)).toEqual(score);
    expect(matchesChallenge(expert, score)).toBe(true);
    expect(readChallenge(`v16.chain.${score.seed}.0.0`)).toMatchObject({ difficulty: 'expert', engravingRule: 1 });
    expect(matchesChallenge(standard, score)).toBe(false);
    expect(challengeSaveKey(score)).not.toBe(challengeSaveKey(challengeFromRun(standard)));
    const migrated = migrateSave({ run: expert, records: { chain: { cleared: 7, combo: 32 } } }, catalog);
    expect(migrated.run.difficulty).toBe('expert');
    expect(migrated.records.chain).toEqual({ cleared: 7, combo: 32 });
    expect(migrated.beginnerRecords).toBeUndefined();
    expect(migrated.expertRecords?.chain).toEqual({ cleared: 1, combo: first.result.combo });
  });
});
