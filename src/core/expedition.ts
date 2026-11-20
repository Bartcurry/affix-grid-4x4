import { toCoords } from './grid';
import type { RelicId } from './types';

export const encounters = {
  sentry: { name: '守门核心', hint: '标准核心，专注输出即可。' },
  armor: { name: '铁壳卫', hint: '前2次受击高减伤，建议备多段连锁。' },
  cistern: { name: '漏毒翁', hint: '符文伤害少一成，剧毒伤害多五成。' },
  flanks: { name: '石狮', hint: '外侧两列减伤三成，中间两列增伤一成。' },
  bell: { name: '回音钟', hint: '连锁伤害增四分之一，普通伤害少一成。' },
  regent: { name: '闭门王', hint: '前3次受击减半，连锁伤害增两成。' },
} as const;

export type EncounterId = keyof typeof encounters;
const campaign: readonly EncounterId[] = [
  'sentry', 'sentry', 'sentry', 'armor', 'sentry', 'cistern', 'armor', 'flanks', 'bell', 'sentry',
  'flanks', 'cistern', 'armor', 'bell', 'flanks', 'armor', 'cistern', 'bell', 'flanks', 'regent',
];
const endless: readonly EncounterId[] = ['armor', 'cistern', 'flanks', 'bell', 'regent'];
export const encounterAt = (wave: number): EncounterId => campaign[wave - 1] ?? endless[(wave - 21) % endless.length] ?? 'sentry';

export function upcomingEncounter(currentWave: number, offset = 2): { wave: number; encounter: EncounterId; name: string; hint: string } {
  const targetWave = currentWave + offset;
  const encounter = encounterAt(targetWave);
  const info = encounters[encounter];
  return {
    wave: targetWave,
    encounter,
    name: info.name,
    hint: info.hint,
  };
}

export interface EndlessAffix {
  id: string;
  name: string;
  desc: string;
}

export const endlessAffixes: readonly EndlessAffix[] = [
  { id: 'limit_triggers', name: '天劫·凝滞', desc: '单格触发上限降为 6 次。' },
  { id: 'odd_row_frenzy', name: '天劫·离火', desc: '奇数行伤害 +60%，但无法主动触发连锁。' },
  { id: 'shield_tax', name: '天劫·劫金', desc: '金币充裕方可破阵，当前金币若不足 10 则伤害减少 20%。' },
  { id: 'decay_surge', name: '天劫·蚀骨', desc: '剧毒伤害提高 40%，但回合末衰减提速。' },
  { id: 'mirror_mist', name: '天劫·幻镜', desc: 'Boss受到暴击伤害降低 25%，但受到非暴击伤害提高 20%。' },
  { id: 'spirit_drain', name: '天劫·噬灵', desc: '偶数列伤害降低 15%，奇数列伤害提升 25%。' },
];

export function affixAt(wave: number): EndlessAffix | null {
  if (wave < 25) return null;
  const tier = Math.floor((wave - 25) / 5);
  return endlessAffixes[tier % endlessAffixes.length];
}

export const relics = {
  whetstone: { name: '磨刀石', text: '第一排符文造成的伤害增加 30%。' },
  chain_ring: { name: '串铃', text: '连锁触发时，符文伤害增加 22%。' },
  moss_bowl: { name: '苔碗', text: '回合末的剧毒伤害增加 50%。' },
  red_lens: { name: '朱砂镜', text: '暴击伤害再增加 20%。' },
  copper_ledger: { name: '铜钱簿', text: '每次符文产出金币时，多得 1 金。' },
  gate_tithe: { name: '过门钱', text: '每打过一波，额外拿 4 金。' },
  jade_abacus: { name: '青玉算盘', text: '开战持有金币每满 5 金，第一排首个激活的符文伤害 +15%（最高+90%）；且每轮首次刷新免费。' },
  taixu_needle: { name: '太虚神针', text: '产生暴击时，符文暴击伤害提升 25% 并追加纯阳破甲。' },
  li_fire_token: { name: '离火玄令', text: '棋盘【离火位】额外触发次数+1（变为触发2次）；第四排符文伤害 +25%。' },
  huagong_powder: { name: '化功散', text: '敌人受到剧毒伤害时增伤 25%，持续至本波结束。' },
  bagua_mirror: { name: '八卦玄光镜', text: '布置在棋盘四个角落（格1、4、13、16）的符文，伤害提升 35%。' },
  spirit_gourd: { name: '紫金葫芦', text: '战斗中达到 5 连击或以上时额外产出 1 金；过关且持金≥20时额外送 1 次免费刷新。' },
  tianji_compass: { name: '天机罗盘', text: '符文铺出现法阵主羁绊符文概率大幅提高；初始多得 6 枚金币。' },
  xuanbing_silk: { name: '玄冰天蚕丝', text: '暴击时激荡寒气，使相邻符文本回合暴击率提升至 100%。' },
  qiankun_pouch: { name: '乾坤宝袋', text: '备战区中每存放 1 枚闲置符文，全盘上阵符文伤害提升 6%（最高+24%）。' },
} satisfies Record<RelicId, { name: string; text: string }>;

const altars: readonly (readonly RelicId[])[] = [
  ['whetstone', 'chain_ring', 'moss_bowl', 'red_lens', 'copper_ledger', 'gate_tithe', 'jade_abacus', 'taixu_needle', 'li_fire_token'],
  ['copper_ledger', 'red_lens', 'gate_tithe', 'moss_bowl', 'whetstone', 'chain_ring', 'huagong_powder', 'bagua_mirror', 'spirit_gourd'],
  ['moss_bowl', 'chain_ring', 'red_lens', 'whetstone', 'gate_tithe', 'copper_ledger', 'tianji_compass', 'xuanbing_silk', 'qiankun_pouch'],
  ['gate_tithe', 'whetstone', 'copper_ledger', 'red_lens', 'moss_bowl', 'chain_ring', 'jade_abacus', 'taixu_needle', 'li_fire_token'],
];

export function relicChoices(waveCleared: number, owned: readonly RelicId[]): RelicId[] {
  if (waveCleared <= 0 || waveCleared % 4 !== 0 || waveCleared === 20) return [];
  const altarIndex = waveCleared > 20
    ? (Math.floor(waveCleared / 4) - 1) % altars.length
    : waveCleared / 4 - 1;
  const options = altars[altarIndex];
  return options?.filter(id => !owned.includes(id)).slice(0, 3) ?? [];
}

export function damageModifiers(encounter: EncounterId, owned: readonly RelicId[], kind: 'rune' | 'poison' | 'tutorial',
  source: number | null, isChain: boolean, crit: boolean, priorHits: number, affix?: string, benchCount = 0) {
  let relic = 1;
  let enemy = 1;
  if (kind === 'rune' && source !== null) {
    const { row, col } = toCoords(source);
    if (row === 0 && owned.includes('whetstone')) relic *= 1.3;
    if (isChain && owned.includes('chain_ring')) relic *= 1.22;
    if (crit && owned.includes('red_lens')) relic *= 1.2;
    if (owned.includes('bagua_mirror') && (source === 0 || source === 3 || source === 12 || source === 15)) relic *= 1.35;
    if (owned.includes('li_fire_token') && row === 3) relic *= 1.25;
    if (crit && owned.includes('taixu_needle')) relic *= 1.25;
    if (owned.includes('qiankun_pouch') && benchCount > 0) relic *= (1 + Math.min(4, benchCount) * 0.06);

    if (encounter === 'armor' && priorHits < 2) enemy *= .5;
    if (encounter === 'cistern') enemy *= .9;
    if (encounter === 'flanks') enemy *= col === 0 || col === 3 ? .7 : 1.1;
    if (encounter === 'bell') enemy *= isChain ? 1.25 : .9;
    if (encounter === 'regent') {
      if (priorHits < 3) enemy *= .5;
      if (isChain) enemy *= 1.2;
    }
    if (affix === 'odd_row_frenzy' && row % 2 === 1) {
      enemy *= 1.6;
    }
    if (affix === 'mirror_mist') {
      enemy *= crit ? 0.75 : 1.2;
    }
    if (affix === 'spirit_drain') {
      enemy *= (col % 2 === 1) ? 1.25 : 0.85;
    }
  } else if (kind === 'poison') {
    if (owned.includes('moss_bowl')) relic *= 1.5;
    if (owned.includes('huagong_powder')) relic *= 1.25;
    if (encounter === 'cistern') enemy *= 1.5;
    if (affix === 'decay_surge') enemy *= 1.4;
  }
  return { relic, enemy };
}
