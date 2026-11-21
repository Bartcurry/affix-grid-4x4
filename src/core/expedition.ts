import { toCoords } from './grid';
import { createMulberry32 } from './rng';
import type { RelicId } from './types';

export const encounters = {
  sentry: { name: '守门核心', trait: '无额外抗性', tip: '法阵从左到右、从上到下触发。把产金、叠毒或增幅的符文排在吃加成的符文前面。' },
  armor: { name: '铁壳卫', trait: '前两次符文伤害减半', tip: '让小伤害先打掉两层护甲，再轮到主力。单纯产金或叠毒不会消耗护甲。' },
  cistern: { name: '漏毒翁', trait: '剧毒 +50% · 符文直伤 −10%', tip: '先叠毒，再触发催化或引爆。回合末的毒和剧毒羁绊的毒爆都能吃到剧毒加成。' },
  flanks: { name: '石狮', trait: '中间两列 +10% · 外侧两列 −30%', tip: '试着把主力挪到第 2、3 列，再检查折射镜是否还指着它。列加成只影响符文直伤。' },
  bell: { name: '回音钟', trait: '连锁直伤 +25% · 其他直伤 −10%', tip: '让折射镜、落铃或十字中继器把主力再叫醒一次，连锁那一击会多打伤害。' },
  regent: { name: '闭门王', trait: '前三次符文伤害减半 · 连锁直伤 +20%', tip: '先用小伤害打掉三层护甲，再用连锁带起主力。破甲暴击可以穿过减伤，并消耗一层。' },
  regent_seal: { name: '闭门王', trait: '三层护甲 · 破甲后同列连打 −30%', tip: '前三次符文直伤减半。破甲后，同列连打少 30% 直伤。换列出手、回合末毒伤和共鸣毒爆都能绕开轮锁。连锁直伤仍提高 20%。' },
} as const;

export type EncounterId = keyof typeof encounters;
const campaign: readonly EncounterId[] = [
  'sentry', 'sentry', 'sentry', 'armor', 'sentry', 'cistern', 'armor', 'flanks', 'bell', 'sentry',
  'flanks', 'cistern', 'armor', 'bell', 'flanks', 'armor', 'cistern', 'bell', 'flanks', 'regent',
];
const endless: readonly EncounterId[] = ['armor', 'cistern', 'flanks', 'bell', 'regent'];
export const encounterAt = (wave: number): EncounterId => campaign[wave - 1] ?? endless[(wave - 21) % endless.length] ?? 'sentry';
export const armorHitsFor = (encounter: EncounterId) => encounter === 'regent' || encounter === 'regent_seal' ? 3 : encounter === 'armor' ? 2 : 0;

export interface EndlessAffix {
  id: string;
  name: string;
  desc: string;
  tip: string;
}

export const endlessAffixes: readonly EndlessAffix[] = [
  { id: 'limit_triggers', name: '天劫·凝滞', desc: '单格触发上限降为 6 次。', tip: '把连锁分给两枚输出符文，试试能否少碰到单格上限。' },
  { id: 'odd_row_frenzy', name: '天劫·离火', desc: '第 2、4 行的符文直伤 +60%，这些符文无法主动触发连锁。', tip: '让镜子和中继留在第 1、3 行，把主力放到能吃加成的行。' },
  { id: 'shield_tax', name: '天劫·劫金', desc: '每次造成伤害时，手中金币不足 10 则该次伤害减少 20%。', tip: '开战前留 10 金，或让矿脉先出手。' },
  { id: 'decay_surge', name: '天劫·蚀骨', desc: '剧毒伤害提高 40%，回合末剩余毒层更少。', tip: '先把当波的毒层叠起来，再试算引爆和回合末毒伤。' },
  { id: 'mirror_mist', name: '天劫·幻镜', desc: '符文暴击伤害 −25%，未暴击的符文直伤 +20%。', tip: '试着把输出移出玄冰位，比较前后实际伤害。' },
  { id: 'spirit_drain', name: '天劫·噬灵', desc: '第 2、4 列的符文直伤 +25%，第 1、3 列 −15%。', tip: '把主力挪到第 2、4 列后，检查连锁是否还指着它。' },
];

export function affixAt(wave: number): EndlessAffix | null {
  if (wave < 25) return null;
  const tier = Math.floor((wave - 25) / 5);
  return endlessAffixes[tier % endlessAffixes.length];
}

export const endlessCampAt = (wave: number) => wave === 21 || wave >= 25 && wave % 5 === 0;

export function endlessSegment(wave: number) {
  const from = Math.max(21, Math.floor(wave / 5) * 5);
  const next = (Math.floor(wave / 5) + 1) * 5;
  return { from, through: Math.min(Number.MAX_SAFE_INTEGER, next - 1), next: Number.isSafeInteger(next) ? next : undefined };
}

export function endlessRoute(wave: number) {
  const start = Math.max(25, endlessSegment(wave).from);
  return endlessAffixes.flatMap((_, i) => {
    const from = start + i * 5;
    if (!Number.isSafeInteger(from)) return [];
    return [{ ...endlessSegment(from), affix: affixAt(from)! }];
  });
}

export const relics = {
  whetstone: { name: '磨刀石', text: '第一排符文造成的伤害增加 30%。' },
  chain_ring: { name: '串铃', text: '连锁触发时，符文伤害增加 22%。' },
  moss_bowl: { name: '苔碗', text: '回合末的剧毒伤害增加 50%。' },
  red_lens: { name: '朱砂镜', text: '暴击伤害再增加 20%。' },
  copper_ledger: { name: '铜钱簿', text: '每次符文产出金币时，多得 1 金。' },
  gate_tithe: { name: '过门钱', text: '每打过一波，额外拿 4 金。' },
  jade_abacus: { name: '青玉算盘', text: '首个符文命中来自第一排时，手里每 5 金让这一击多打 15%（最多 +90%）。每波多 1 次免费刷新。' },
  taixu_needle: { name: '太虚神针', text: '产生暴击时，符文暴击伤害提升 25% 并追加纯阳破甲。' },
  li_fire_token: { name: '离火玄令', text: '棋盘【离火位】额外触发次数+1（变为触发2次）；第四排符文伤害 +25%。' },
  huagong_powder: { name: '化功散', text: '羁绊毒爆和回合末剧毒的伤害都提高 25%。' },
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

const revisedAltars: readonly (readonly (readonly RelicId[])[])[] = [
  [['chain_ring', 'whetstone'], ['moss_bowl'], ['jade_abacus']],
  [['bagua_mirror'], ['huagong_powder'], ['red_lens', 'gate_tithe', 'copper_ledger']],
  [['xuanbing_silk'], ['spirit_gourd'], ['qiankun_pouch']],
  [['tianji_compass'], ['taixu_needle'], ['li_fire_token']],
];

export function relicChoices(waveCleared: number, owned: readonly RelicId[], seed?: number): RelicId[] {
  if (waveCleared <= 0 || waveCleared % 4 !== 0 || waveCleared === 20) return [];
  const altarIndex = waveCleared > 20
    ? (Math.floor(waveCleared / 4) - 1) % altars.length
    : waveCleared / 4 - 1;
  const options = altars[altarIndex];
  if (seed !== undefined) {
    const rng = createMulberry32(seed ^ Math.imul(waveCleared, 0x9e3779b1));
    const offered = revisedAltars[altarIndex].flatMap(pool => {
      const available = pool.filter(id => !owned.includes(id));
      return available.length ? [available[Math.floor(rng() * available.length)]] : [];
    });
    for (const id of [...options, ...(Object.keys(relics) as RelicId[])]) {
      if (offered.length === 3) break;
      if (!owned.includes(id) && !offered.includes(id)) offered.push(id);
    }
    return offered;
  }
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

    const hasPierce = crit && owned.includes('taixu_needle');
    if (priorHits < armorHitsFor(encounter) && !hasPierce) enemy *= .5;
    if (encounter === 'cistern') enemy *= .9;
    if (encounter === 'flanks') enemy *= col === 0 || col === 3 ? .7 : 1.1;
    if (encounter === 'bell') enemy *= isChain ? 1.25 : .9;
    if ((encounter === 'regent' || encounter === 'regent_seal') && isChain) enemy *= 1.2;
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
