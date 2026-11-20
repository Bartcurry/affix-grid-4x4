import { bossHealth } from './battleEngine';
import { encounterAt, type EncounterId } from './expedition';
import type { Run } from './types';

export type TrialChoice = 'normal' | 'standard' | 'alternate';

interface Trial {
  name: string;
  encounter: EncounterId;
  healthPercent: number;
  reward: number;
}

const trials = new Map<number, Trial>([
  [5, { name: '铁壳加试', encounter: 'armor', healthPercent: 120, reward: 6 }],
  [10, { name: '毒窟加试', encounter: 'cistern', healthPercent: 125, reward: 9 }],
  [15, { name: '钟楼加试', encounter: 'bell', healthPercent: 130, reward: 12 }],
]);

const alternates = new Map<number, Trial>([
  [5, { name: '石狮侧门', encounter: 'flanks', healthPercent: 112, reward: 5 }],
  [10, { name: '钟桥竞速', encounter: 'bell', healthPercent: 135, reward: 10 }],
  [15, { name: '内门夺金', encounter: 'regent', healthPercent: 135, reward: 14 }],
]);

export const trialCount = trials.size;
export const trialAt = (wave: number, route?: 'alternate') => (route === 'alternate' ? alternates : trials).get(wave);

export type BountyExtra = 'refresh' | 'repair' | 'engrave';
export const bountyRefreshes = 2;
export const bountyRuneCell = 13;
export const bountyRunePower = 12;
export const bountyExtraText: Record<BountyExtra, string> = {
  refresh: `下波多 ${bountyRefreshes} 次免费刷新`,
  repair: '修复 1 点护盾',
  engrave: `第 ${bountyRuneCell + 1} 格符文永久威力 +${bountyRunePower}`,
};
const alternatePayout = new Map<number, { gold: number; extra: BountyExtra }>([
  [5, { gold: 4, extra: 'refresh' }],
  [10, { gold: 7, extra: 'repair' }],
  [15, { gold: 10, extra: 'engrave' }],
]);

export function bountyRewardAt(wave: number, route?: 'alternate', rule?: 1): { gold: number; extra?: BountyExtra } {
  const upgrade = route === 'alternate' && rule === 1 ? alternatePayout.get(wave) : undefined;
  return upgrade ?? { gold: trialAt(wave, route)?.reward ?? 0 };
}

export function bountyExtraBlock(extra: BountyExtra, run: Pick<Run, 'shield' | 'board'>) {
  if (extra === 'repair' && run.shield >= 3) return '护盾已满';
  if (extra === 'engrave' && !run.board[bountyRuneCell]) return `第 ${bountyRuneCell + 1} 格为空`;
}

export function trialOptions(run: Pick<Run, 'wave' | 'trialRule'>) {
  return [trialAt(run.wave), ...(run.trialRule ? [trialAt(run.wave, 'alternate')] : [])].filter(trial => trial !== undefined);
}

export function battleTarget(wave: number, trialWave?: number, trialRoute?: 'alternate') {
  const trial = trialWave === wave ? trialAt(wave, trialRoute) : undefined;
  const health = bossHealth(wave);
  return {
    trial,
    encounter: trial?.encounter ?? encounterAt(wave),
    hp: trial ? Math.round(health * trial.healthPercent / 100) : health,
  };
}
