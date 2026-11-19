import { isOpening, runScore, type OpeningRecord } from './openings';
import { decodeSeed, encodeSeed } from './rng';
import type { OpeningId, Run } from './types';

export const challengeParam = 'challenge';
// Increment when shared seeds no longer produce comparable runs.
const version = 'v2';

export interface Challenge extends OpeningRecord {
  opening: OpeningId;
  seed: string;
}

export function challengeFromRun(run: Run): Challenge {
  return { opening: run.opening, seed: encodeSeed(decodeSeed(run.seed)), ...runScore(run) };
}

export function readChallenge(value: string | null): Challenge | null {
  if (!value || value.length > 64) return null;
  const parts = value.split('.');
  const [revision, opening, seed, rawCleared, rawCombo] = parts;
  if (parts.length !== 5 || revision !== version || !isOpening(opening) || !/^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/.test(seed) ||
    encodeSeed(decodeSeed(seed)) !== seed || !/^\d+$/.test(rawCleared) || !/^\d+$/.test(rawCombo)) return null;
  const cleared = Number(rawCleared);
  const combo = Number(rawCombo);
  return Number.isSafeInteger(cleared) && Number.isSafeInteger(combo) ? { opening, seed, cleared, combo } : null;
}

export function challengeUrl(page: string, challenge: Challenge): string | null {
  const url = new URL(page);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  url.search = '';
  url.hash = '';
  url.searchParams.set(challengeParam, [version, challenge.opening, challenge.seed, challenge.cleared, challenge.combo].join('.'));
  return url.href;
}

export function challengeSaveKey(challenge: Challenge) {
  return `affix-grid-4x4.challenge.${version}.${challenge.opening}.${challenge.seed}`;
}

export function compareScores(player: OpeningRecord, target: OpeningRecord) {
  return Math.sign(player.cleared - target.cleared || player.combo - target.combo);
}
