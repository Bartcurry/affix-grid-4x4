import { bossHealth } from './battleEngine';
import { encounterAt, type EncounterId } from './expedition';

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

export const trialCount = trials.size;
export const trialAt = (wave: number) => trials.get(wave);

export function battleTarget(wave: number, trialWave?: number) {
  const trial = trialWave === wave ? trialAt(wave) : undefined;
  const health = bossHealth(wave);
  return {
    trial,
    encounter: trial?.encounter ?? encounterAt(wave),
    hp: trial ? Math.round(health * trial.healthPercent / 100) : health,
  };
}
