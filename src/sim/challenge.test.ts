import { describe, expect, it } from 'vitest';
import { challengeFromRun, challengeParam, challengeSaveKey, challengeUrl, compareScores, readChallenge } from '../core/challenge';
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
    expect(invitation).toEqual({ opening: 'poison', seed: challenge.seed, cleared: 14, combo: 29 });
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

  it('ranks cleared waves before the combo tiebreak', () => {
    const target = { cleared: 6, combo: 9 };
    expect(compareScores({ cleared: 5, combo: 90 }, target)).toBe(-1);
    expect(compareScores({ cleared: 7, combo: 4 }, target)).toBe(1);
    expect(compareScores({ cleared: 6, combo: 10 }, target)).toBe(1);
    expect(compareScores({ cleared: 6, combo: 8 }, target)).toBe(-1);
    expect(compareScores(target, target)).toBe(0);
  });
});
