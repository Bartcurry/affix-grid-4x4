import { isOpening, runScore, type OpeningRecord } from './openings';
import { decodeSeed, encodeSeed } from './rng';
import type { OpeningId, Run } from './types';

export const challengeParam = 'challenge';
const classicVersion = 'v2';
const expandedVersion = 'v3';

export interface Challenge extends OpeningRecord {
  opening: OpeningId;
  seed: string;
  relicRule?: 1;
}

const version = (challenge: Challenge) => challenge.relicRule === 1 ? expandedVersion : classicVersion;

export function challengeFromRun(run: Run): Challenge {
  return { opening: run.opening, seed: encodeSeed(decodeSeed(run.seed)), ...runScore(run), ...(run.relicRule === 1 ? { relicRule: 1 } : {}) };
}

export function readChallenge(value: string | null): Challenge | null {
  if (!value || value.length > 64) return null;
  const parts = value.split('.');
  const [revision, opening, seed, rawCleared, rawCombo] = parts;
  if (parts.length !== 5 || (revision !== classicVersion && revision !== expandedVersion) || !isOpening(opening) || !/^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/.test(seed) ||
    encodeSeed(decodeSeed(seed)) !== seed || !/^\d+$/.test(rawCleared) || !/^\d+$/.test(rawCombo)) return null;
  const cleared = Number(rawCleared);
  const combo = Number(rawCombo);
  if (!Number.isSafeInteger(cleared) || !Number.isSafeInteger(combo)) return null;
  return { opening, seed, cleared, combo, ...(revision === expandedVersion ? { relicRule: 1 } : {}) };
}

export function challengeUrl(page: string, challenge: Challenge): string | null {
  const url = new URL(page);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  url.search = '';
  url.hash = '';
  url.searchParams.set(challengeParam, [version(challenge), challenge.opening, challenge.seed, challenge.cleared, challenge.combo].join('.'));
  return url.href;
}

export function challengeSaveKey(challenge: Challenge) {
  return `affix-grid-4x4.challenge.${version(challenge)}.${challenge.opening}.${challenge.seed}`;
}

export function compareScores(player: OpeningRecord, target: OpeningRecord) {
  return Math.sign(player.cleared - target.cleared || player.combo - target.combo);
}
