import { bossHealth } from './battleEngine';
import { encounterAt, type EncounterId } from './expedition';
import type { BountyRoute, Run } from './types';

type BountyPerk = 'refresh' | 'repair' | 'engrave';
interface Bounty {
  name: string;
  enemy: EncounterId;
  healthPercent: number;
  gold: number;
  perk?: BountyPerk;
}

const rounds = new Map<number, Record<BountyRoute, Bounty>>([
  [5, {
    standard: { name: '铁壳加试', enemy: 'armor', healthPercent: 120, gold: 6 },
    alternate: { name: '石狮侧门', enemy: 'flanks', healthPercent: 112, gold: 4, perk: 'refresh' },
  }],
  [10, {
    standard: { name: '毒窟加试', enemy: 'cistern', healthPercent: 125, gold: 9 },
    alternate: { name: '钟桥竞速', enemy: 'bell', healthPercent: 135, gold: 7, perk: 'repair' },
  }],
  [15, {
    standard: { name: '钟楼加试', enemy: 'bell', healthPercent: 130, gold: 12 },
    alternate: { name: '内门夺金', enemy: 'regent', healthPercent: 135, gold: 10, perk: 'engrave' },
  }],
]);

export const bountyRoutes = ['standard', 'alternate'] as const;
export const bountyCount = rounds.size;
export const bountyWaves = [...rounds.keys()];
export const bountyRefreshes = 2;
export const engravingCell = 13;
export const engravingPower = 12;
export const bountyPerkText = {
  refresh: `下一波多 ${bountyRefreshes} 次免费刷新`,
  repair: '修复 1 点护盾',
  engrave: `第 ${engravingCell + 1} 格符文永久威力 +${engravingPower}`,
} satisfies Record<BountyPerk, string>;

export function bountyAt(wave: number, route: unknown) {
  return route === 'standard' || route === 'alternate' ? rounds.get(wave)?.[route] : undefined;
}

export function battleTarget(wave: number, route?: BountyRoute, finaleRule?: 1) {
  const bounty = bountyAt(wave, route);
  const hp = bossHealth(wave);
  return {
    bounty,
    encounter: bounty?.enemy ?? (wave === 20 && finaleRule === 1 ? 'regent_seal' : encounterAt(wave)),
    hp: bounty ? Math.round(hp * bounty.healthPercent / 100) : hp,
  };
}

export function offersBounties(run: Pick<Run, 'wave' | 'endless' | 'bountyRule'>) {
  return run.bountyRule === 1 && !run.endless && rounds.has(run.wave);
}

export function bountyPerkUnavailable(perk: BountyPerk, run: Partial<Pick<Run, 'shield' | 'board'>>) {
  if (perk === 'repair' && (run.shield ?? 3) >= 3) return '护盾已满';
  if (perk === 'engrave' && !run.board?.[engravingCell]) return `第 ${engravingCell + 1} 格是空的`;
}
