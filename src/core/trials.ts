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
