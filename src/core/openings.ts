import type { OpeningId, Run } from './types';

export const openings = {
  chain: {
    name: '借火', label: '连锁', title: '借火 · 燎原连锁',
    hook: '雷火连环，无休递增', slogan: '引信相连 · 瞬息万钧 · 连环递增',
    gold: 10, supply: 'echo_stone',
    note: '首波先别换位，原阵会多打 42 点。后面把电火花摆到镜子右边，一枚当两枚用。',
    pieces: [[0, 'spark_orb'], [1, 'prism_right']],
  },
  poison: {
    name: '养苔', label: '剧毒', title: '养苔 · 蚀骨百毒',
    hook: '叠层蚀骨，刹那倾颓', slogan: '百蛊潜滋 · 叠层蚀骨 · 刹那毒爆',
    gold: 5, supply: 'moss_brick',
    note: '先放毒，再催化，最后引爆。调换顺序，伤害就不一样。',
    pieces: [[0, 'venom_drop'], [1, 'venom_drop'], [2, 'catalyst_flask'], [3, 'toxic_detonator']],
  },
  gold: {
    name: '攒钱', label: '金币', title: '攒钱 · 富甲九州',
    hook: '腰缠万贯，重炮破天', slogan: '点石成金 · 财通神明 · 万贯重炮',
    gold: 11, supply: 'greed_amplifier',
    note: '矿脉先产钱，重炮再按你手里的金币开火。回响之石还能多打两炮。',
    pieces: [[0, 'copper_mine'], [1, 'gold_cannon'], [2, 'echo_stone']],
  },
  amplify: {
    name: '落印', label: '增幅', title: '落印 · 天衍暴亟',
    hook: '阵眼加持，一击破晓', slogan: '神印天成 · 天衍神念 · 暴烈无双',
    gold: 7, supply: 'ember_amp',
    note: '火漆印加成下方的电火花，再用左边的折射镜让它多打一次。',
    pieces: [[1, 'red_seal'], [2, 'spark_orb'], [4, 'prism_right'], [5, 'spark_orb']],
  },
} as const satisfies Record<OpeningId, {
  name: string;
  label: string;
  title: string;
  hook: string;
  slogan: string;
  gold: number;
  supply: string;
  note: string;
  pieces: readonly (readonly [number, string])[];
}>;

export const openingIds = Object.keys(openings) as OpeningId[];
export const isOpening = (value: unknown): value is OpeningId => typeof value === 'string' && Object.hasOwn(openings, value);

export interface OpeningRecord { cleared: number; combo: number }
export type RunRecords = Partial<Record<OpeningId, OpeningRecord>>;

export function updateRecords(records: RunRecords, run: Pick<Run, 'opening' | 'wave' | 'status' | 'bestCombo'>): RunRecords {
  const prior = records[run.opening];
  const cleared = Math.max(prior?.cleared ?? 0, run.wave - Number(run.status !== 'victory'));
  const combo = Math.max(prior?.combo ?? 0, run.bestCombo);
  if ((!cleared && !combo) || (prior?.cleared === cleared && prior?.combo === combo)) return records;
  return { ...records, [run.opening]: { cleared, combo } };
}
