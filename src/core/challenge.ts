import { isOpening, runScore, type OpeningRecord } from './openings';
import { decodeSeed, encodeSeed } from './rng';
import type { OpeningId, Run } from './types';

export const challengeParam = 'challenge';
const classicVersion = 'v2';
const expandedVersion = 'v3';
const splitBountyVersion = 'v4';
const campVersion = 'v5';
const bountyRewardVersion = 'v6';
const versions = [classicVersion, expandedVersion, splitBountyVersion, campVersion, bountyRewardVersion];

export interface Challenge extends OpeningRecord {
  opening: OpeningId;
  seed: string;
  relicRule?: 1;
  trialRule?: 1;
  endlessRule?: 1;
  bountyRewardRule?: 1;
}

const version = (challenge: Challenge) => {
  if (!challenge.relicRule) return classicVersion;
  if (!challenge.trialRule) return expandedVersion;
  if (!challenge.endlessRule) return splitBountyVersion;
  return challenge.bountyRewardRule === 1 ? bountyRewardVersion : campVersion;
};

export function challengeFromRun(run: Run): Challenge {
  return { opening: run.opening, seed: encodeSeed(decodeSeed(run.seed)), ...runScore(run),
    ...(run.relicRule === 1 ? { relicRule: 1 } : {}), ...(run.trialRule === 1 ? { trialRule: 1 } : {}),
    ...(run.endlessRule === 1 ? { endlessRule: 1 } : {}), ...(run.bountyRewardRule === 1 ? { bountyRewardRule: 1 } : {}) };
}

export function readChallenge(value: string | null): Challenge | null {
  if (!value || value.length > 64) return null;
  const parts = value.split('.');
  const [revision, opening, seed, rawCleared, rawCombo] = parts;
  const rules = versions.indexOf(revision);
  if (parts.length !== 5 || rules < 0 || !isOpening(opening) || !/^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/.test(seed) ||
    encodeSeed(decodeSeed(seed)) !== seed || !/^\d+$/.test(rawCleared) || !/^\d+$/.test(rawCombo)) return null;
  const cleared = Number(rawCleared);
  const combo = Number(rawCombo);
  if (!Number.isSafeInteger(cleared) || !Number.isSafeInteger(combo)) return null;
  return { opening, seed, cleared, combo, ...(rules >= 1 ? { relicRule: 1 } : {}), ...(rules >= 2 ? { trialRule: 1 } : {}),
    ...(rules >= 3 ? { endlessRule: 1 } : {}), ...(rules >= 4 ? { bountyRewardRule: 1 } : {}) };
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

export function matchesChallenge(run: Run, target: Challenge) {
  return challengeSaveKey(challengeFromRun(run)) === challengeSaveKey(target);
}

export function challengeProgress(player: OpeningRecord, target: OpeningRecord) {
  const rank = compareScores(player, target);
  if (rank > 0) return { rank, short: '已领先', text: '你超过了这个战绩。' };
  if (rank === 0) return { rank, short: '已追平', text: '你追平了这个战绩。' };
  const missing = target.cleared - player.cleared;
  if (missing > 0) return { rank, short: `还差 ${missing} 波`, text: `还差 ${missing} 波追上对方，波数相同再比连击。` };
  const combo = target.combo - player.combo;
  return { rank, short: `还差 ${combo} 连击`, text: `波数已追平，再多 ${combo} 连击。` };
}
