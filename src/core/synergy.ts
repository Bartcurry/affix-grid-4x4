import type { Catalog, Slots } from './types';

export type SynergyType = 'chain' | 'poison' | 'gold' | 'amplify';

export interface SynergyInfo {
  type: SynergyType;
  name: string;
  count: number;
  tier: 0 | 1 | 2; // 0: inactive (<3), 1: 3-piece (3-4), 2: 5-piece (>=5)
  tier1Threshold: number;
  tier2Threshold: number;
  tier1Desc: string;
  tier2Desc: string;
  activeDesc: string;
}

export type SynergyMap = Record<SynergyType, SynergyInfo>;

export function countSynergies(board: Readonly<Slots>, catalog: Catalog): SynergyMap {
  const counts: Record<SynergyType, number> = {
    chain: 0,
    poison: 0,
    gold: 0,
    amplify: 0,
  };

  for (const rune of board) {
    if (!rune) continue;
    const config = catalog[rune.configId];
    if (!config) continue;

    if (config.archetype === 'chain' || config.tags.includes('chain')) {
      counts.chain++;
    }
    if (config.archetype === 'poison' || config.tags.includes('poison')) {
      counts.poison++;
    }
    if (config.archetype === 'gold' || config.tags.includes('gold')) {
      counts.gold++;
    }
    if (config.archetype === 'amplify' || config.tags.includes('amplify') || config.tags.includes('crit')) {
      counts.amplify++;
    }
  }

  return {
    chain: {
      type: 'chain',
      name: '燎原天网',
      count: counts.chain,
      tier: counts.chain >= 5 ? 2 : counts.chain >= 3 ? 1 : 0,
      tier1Threshold: 3,
      tier2Threshold: 5,
      tier1Desc: '连锁伤害 +35%',
      tier2Desc: '连锁伤害 +75%，连锁触发时向相邻格激发电弧追加触发',
      activeDesc: counts.chain >= 5 ? '【5件套】连锁伤害+75%，电弧追加连锁' : counts.chain >= 3 ? '【3件套】连锁伤害+35%' : '未激活（需 3/5 件）',
    },
    poison: {
      type: 'poison',
      name: '蚀骨万蛊',
      count: counts.poison,
      tier: counts.poison >= 5 ? 2 : counts.poison >= 3 ? 1 : 0,
      tier1Threshold: 3,
      tier2Threshold: 5,
      tier1Desc: '剧毒结算伤害 +35%，释放剧毒时追加当前毒层 12% 穿透毒爆',
      tier2Desc: '回合末毒层保留 90%（衰减仅10%），毒爆伤害提升至 30%',
      activeDesc: counts.poison >= 5 ? '【5件套】毒层保留90%，毒爆30%' : counts.poison >= 3 ? '【3件套】毒伤+35%，毒爆12%' : '未激活（需 3/5 件）',
    },
    gold: {
      type: 'gold',
      name: '富甲九州',
      count: counts.gold,
      tier: counts.gold >= 5 ? 2 : counts.gold >= 3 ? 1 : 0,
      tier1Threshold: 3,
      tier2Threshold: 5,
      tier1Desc: '利息丰饶（每 8 金得 1 金利息）；每持 10 金符文伤害 +5%（最高+20%）',
      tier2Desc: '战斗中每次得金时，每得 1 金追加 5 点金石震荡伤害',
      activeDesc: counts.gold >= 5 ? '【5件套】8金起息，得金追加5点伤害' : counts.gold >= 3 ? '【3件套】利息门槛放宽（8金1息），每持10金伤害+5%' : '未激活（需 3/5 件）',
    },
    amplify: {
      type: 'amplify',
      name: '天衍暴亟',
      count: counts.amplify,
      tier: counts.amplify >= 5 ? 2 : counts.amplify >= 3 ? 1 : 0,
      tier1Threshold: 3,
      tier2Threshold: 5,
      tier1Desc: '暴击伤害倍率翻倍（3.0x），全盘符文初始暴击率 +15%',
      tier2Desc: '暴击倍率提升至 4.0x，每次暴击使全盘符文伤害倍率额外 +0.25',
      activeDesc: counts.amplify >= 5 ? '【5件套】暴击4.0x，每次暴击全盘倍率+0.25' : counts.amplify >= 3 ? '【3件套】暴击3.0x，初始暴击率+15%' : '未激活（需 3/5 件）',
    },
  };
}
