import type { OpeningId, Run } from './types';

export const openings = {
  chain: {
    name: '借火', label: '连锁', gold: 10, supply: 'echo_stone',
    note: '把镜子留在电火花左边。镜子让它先打一次，轮到它时还会再打一次。',
    pieces: [[0, 'prism_right'], [1, 'spark_orb']],
  },
  poison: {
    name: '养苔', label: '剧毒', gold: 5, supply: 'moss_brick',
    note: '先放毒，再催化，最后引爆。调换顺序，伤害就不一样。',
    pieces: [[0, 'venom_drop'], [1, 'venom_drop'], [2, 'catalyst_flask'], [3, 'toxic_detonator']],
  },
  gold: {
    name: '攒钱', label: '金币', gold: 11, supply: 'greed_amplifier',
    note: '矿脉先产钱，重炮再按你手里的金币开火。回响之石还能多打两炮。',
    pieces: [[0, 'copper_mine'], [1, 'gold_cannon'], [2, 'echo_stone']],
  },
  amplify: {
    name: '落印', label: '增幅', gold: 7, supply: 'ember_amp',
    note: '火漆印加成下方的电火花，再用左边的折射镜让它多打一次。',
    pieces: [[1, 'red_seal'], [2, 'spark_orb'], [4, 'prism_right'], [5, 'spark_orb']],
  },
} as const satisfies Record<OpeningId, { name: string; label: string; gold: number; supply: string; note: string; pieces: readonly (readonly [number, string])[] }>;

export const openingIds = Object.keys(openings) as OpeningId[];
export const isOpening = (value: unknown): value is OpeningId => typeof value === 'string' && Object.hasOwn(openings, value);

export interface OpeningRecord { cleared: number; combo: number }
export type RunRecords = Partial<Record<OpeningId, OpeningRecord>>;

export function runScore(run: Pick<Run, 'wave' | 'status' | 'bestCombo'>): OpeningRecord {
  return { cleared: run.wave - Number(run.status !== 'victory'), combo: run.bestCombo };
}

export function updateRecords(records: RunRecords, run: Pick<Run, 'opening' | 'wave' | 'status' | 'bestCombo'>): RunRecords {
  const prior = records[run.opening];
  const score = runScore(run);
  const cleared = Math.max(prior?.cleared ?? 0, score.cleared);
  const combo = Math.max(prior?.combo ?? 0, score.combo);
  if ((!cleared && !combo) || (prior?.cleared === cleared && prior?.combo === combo)) return records;
  return { ...records, [run.opening]: { cleared, combo } };
}
