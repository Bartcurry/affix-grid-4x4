import { isOpening, runScore, type OpeningRecord } from './openings';
import { decodeSeed, encodeSeed } from './rng';
import type { OpeningId, Run } from './types';

export const challengeParam = 'challenge';
const legacyVersion = 'v7';
const altarVersion = 'v8';

export interface Challenge extends OpeningRecord {
  opening: OpeningId;
  seed: string;
  altarRule?: 1;
}

const version = (challenge: Challenge) => challenge.altarRule === 1 ? altarVersion : legacyVersion;

export function challengeFromRun(run: Run): Challenge {
  return { opening: run.opening, seed: encodeSeed(decodeSeed(run.seed)), ...runScore(run),
    ...(run.altarRule === 1 ? { altarRule: 1 } : {}) };
}

export function readChallenge(raw: string | null): Challenge | undefined {
  if (!raw || raw.length > 64) return;
  const [revision, opening, seed, waves, combo, ...remainder] = raw.split('.');
  if ((revision !== legacyVersion && revision !== altarVersion) || remainder.length || !isOpening(opening) ||
      !/^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/.test(seed) || seed !== encodeSeed(decodeSeed(seed)) ||
      !/^\d+$/.test(waves) || !/^\d+$/.test(combo)) return;
  const score = { cleared: Number(waves), combo: Number(combo) };
  if (!Number.isSafeInteger(score.cleared) || !Number.isSafeInteger(score.combo)) return;
  return { opening, seed, ...score, ...(revision === altarVersion ? { altarRule: 1 } : {}) };
}

export function challengeUrl(page: string, challenge: Challenge): string {
  const url = new URL(page);
  url.search = '';
  url.hash = '';
  url.searchParams.set(challengeParam, [version(challenge), challenge.opening, challenge.seed, challenge.cleared, challenge.combo].join('.'));
  return url.href;
}

export function challengeSaveKey(challenge: Challenge) {
  return `affix-grid-4x4.challenge.${version(challenge)}.${challenge.opening}.${challenge.seed}`;
}

export function matchesChallenge(run: Run, challenge: Challenge) {
  return run.enableSynergies !== false && run.opening === challenge.opening && run.altarRule === challenge.altarRule &&
    encodeSeed(decodeSeed(run.seed)) === challenge.seed;
}

export function challengeProgress(player: OpeningRecord, target: OpeningRecord) {
  const waves = player.cleared - target.cleared;
  const combo = player.combo - target.combo;
  if (waves > 0 || (waves === 0 && combo > 0)) return { reached: true, text: '你超过了这个战绩。' };
  if (!waves && !combo) return { reached: true, text: '你追平了这个战绩。' };
  return { reached: false, text: waves < 0 ? `再过 ${-waves} 波就追上了。` : `波数已追平，再多 ${-combo} 连击。` };
}
