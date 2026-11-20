import { describe, expect, it } from 'vitest';
import { challengeFromRun, challengeParam, challengeProgress, challengeSaveKey, challengeUrl, compareScores, matchesChallenge, readChallenge } from '../core/challenge';
import { createMulberry32, decodeSeed } from '../core/rng';
import { newRun } from '../core/shopEngine';
import { catalog } from '../data/catalog';

describe('shared campaign challenges', () => {
  it('carries a handwritten seed, opening and score through a project Pages URL', () => {
    const typed = '立冬后的第一局';
    const original = newRun(catalog, createMulberry32(decodeSeed(typed)), 'poison', typed);
    const challenge = challengeFromRun({ ...original, wave: 15, bestCombo: 29 });
    const address = challengeUrl('https://example.org/affix-grid-4x4/?daily=2026-11-20#board', challenge)!;
    const url = new URL(address);
    expect(url.pathname).toBe('/affix-grid-4x4/');
    expect([...url.searchParams.keys()]).toEqual([challengeParam]);
    expect(url.hash).toBe('');
    const invitation = readChallenge(url.searchParams.get(challengeParam))!;
    expect(invitation).toEqual({ opening: 'poison', seed: challenge.seed, cleared: 14, combo: 29, relicRule: 1, trialRule: 1, endlessRule: 1, bountyRewardRule: 1 });
    const guest = newRun(catalog, createMulberry32(decodeSeed(invitation.seed)), invitation.opening, invitation.seed);
    expect(guest).toEqual({ ...original, seed: invitation.seed });
    expect(challengeUrl('file:///C:/private/preview.html', challenge)).toBeNull();
  });

  it('rejects unsupported or malformed invites and continues the same slot when a target changes', () => {
    const own = newRun(catalog, createMulberry32(667), 'chain');
    const challenge = challengeFromRun(own);
    for (const raw of [null, `v1.chain.${challenge.seed}.3.6`, `v2.bad.${challenge.seed}.3.6`, 'v2.chain.YYYY-YYYY.3.6',
      `v2.chain.${challenge.seed}.-1.6`, `v2.chain.${challenge.seed}.3.Infinity`, `v2.chain.${challenge.seed}.9007199254740992.6`]) {
      expect(readChallenge(raw)).toBeNull();
    }
    expect(challengeSaveKey(challenge)).toBe(challengeSaveKey({ ...challenge, cleared: 15, combo: 1 }));
    expect(challengeSaveKey(challenge)).not.toBe(challengeSaveKey({ ...challenge, opening: 'gold' }));
  });

  it('preserves older invitation rules and save slots', () => {
    const current = challengeFromRun(newRun(catalog, createMulberry32(667), 'chain'));
    const { seed } = current;
    const classic = readChallenge(`v2.chain.${seed}.7.22`)!;
    const expanded = readChallenge(`v3.chain.${seed}.7.22`)!;
    const bounties = readChallenge(`v4.chain.${seed}.7.22`)!;
    const camps = readChallenge(`v5.chain.${seed}.7.22`)!;
    expect(classic).toEqual({ opening: 'chain', seed, cleared: 7, combo: 22 });
    expect(expanded).toEqual({ ...classic, relicRule: 1 });
    expect(bounties).toEqual({ ...expanded, trialRule: 1 });
    expect(camps).toEqual({ ...bounties, endlessRule: 1 });
    expect(challengeSaveKey(classic)).toBe(`affix-grid-4x4.challenge.v2.chain.${seed}`);
    expect(challengeSaveKey(expanded)).toBe(`affix-grid-4x4.challenge.v3.chain.${seed}`);
    expect(challengeSaveKey(bounties)).toBe(`affix-grid-4x4.challenge.v4.chain.${seed}`);
    expect(challengeSaveKey(camps)).toBe(`affix-grid-4x4.challenge.v5.chain.${seed}`);
    expect(challengeSaveKey(current)).toBe(`affix-grid-4x4.challenge.v6.chain.${seed}`);
    expect(new URL(challengeUrl('https://example.org/', classic)!).searchParams.get(challengeParam)).toBe(`v2.chain.${seed}.7.22`);
  });

  it('ranks cleared waves before the combo tiebreak', () => {
    const target = { cleared: 6, combo: 9 };
    expect(compareScores({ cleared: 5, combo: 90 }, target)).toBe(-1);
    expect(compareScores({ cleared: 7, combo: 4 }, target)).toBe(1);
    expect(compareScores({ cleared: 6, combo: 10 }, target)).toBe(1);
    expect(compareScores({ cleared: 6, combo: 8 }, target)).toBe(-1);
    expect(compareScores(target, target)).toBe(0);
  });

  it('matches written seeds to their shared form only with the same opening and rules', () => {
    const seed = 'shared-seed';
    const run = newRun(catalog, createMulberry32(decodeSeed(seed)), 'poison', seed);
    const target = { ...challengeFromRun(run), cleared: 8, combo: 35 };
    expect(matchesChallenge(run, target)).toBe(true);
    expect(matchesChallenge({ ...run, opening: 'gold' }, target)).toBe(false);
    expect(matchesChallenge({ ...run, endlessRule: undefined }, target)).toBe(false);
    expect(matchesChallenge({ ...run, bountyRewardRule: undefined }, target)).toBe(false);
  });

  it('distinguishes catching up in waves from catching up in combo', () => {
    const target = { cleared: 4, combo: 12 };
    expect(challengeProgress({ cleared: 3, combo: 20 }, target)).toMatchObject({ rank: -1, short: '还差 1 波' });
    expect(challengeProgress({ cleared: 4, combo: 10 }, target)).toMatchObject({ rank: -1, short: '还差 2 连击' });
    expect(challengeProgress(target, target)).toMatchObject({ rank: 0, short: '已追平' });
    expect(challengeProgress({ cleared: 5, combo: 4 }, target)).toMatchObject({ rank: 1, short: '已领先' });
  });
});
