import { toCoords } from './grid';
import type { RelicId } from './types';

export const encounters = {
  sentry: { name: '守门核心', hint: '' },
  armor: { name: '铁壳卫', hint: '前两次符文伤害减半。让小伤害先破甲。' },
  cistern: { name: '漏毒翁', hint: '符文伤害少一成，回合末的剧毒伤害多五成。' },
  flanks: { name: '石狮', hint: '外侧两列伤害少三成，中间两列多一成。' },
  bell: { name: '回音钟', hint: '连锁打出的伤害多四分之一，其他符文伤害少一成。' },
  regent: { name: '闭门王', hint: '前三次符文伤害减半；连锁打出的伤害额外加两成。' },
} as const;

export type EncounterId = keyof typeof encounters;
const campaign: readonly EncounterId[] = [
  'sentry', 'sentry', 'sentry', 'armor', 'sentry', 'cistern', 'armor', 'flanks', 'bell', 'sentry',
  'flanks', 'cistern', 'armor', 'bell', 'flanks', 'armor', 'cistern', 'bell', 'flanks', 'regent',
];
const endless: readonly EncounterId[] = ['armor', 'cistern', 'flanks', 'bell', 'regent'];
export const encounterAt = (wave: number): EncounterId => campaign[wave - 1] ?? endless[(wave - 21) % endless.length] ?? 'sentry';

export const relics = {
  whetstone: { name: '磨刀石', text: '第一排符文造成的伤害增加 30%。' },
  chain_ring: { name: '串铃', text: '连锁触发时，符文伤害增加 22%。' },
  moss_bowl: { name: '苔碗', text: '回合末的剧毒伤害增加 50%。' },
  red_lens: { name: '朱砂镜', text: '暴击伤害再增加 20%。' },
  copper_ledger: { name: '铜钱簿', text: '每次符文产出金币时，多得 1 金。' },
  gate_tithe: { name: '过门钱', text: '每打过一波，额外拿 4 金。' },
} satisfies Record<RelicId, { name: string; text: string }>;

const altars: readonly (readonly RelicId[])[] = [
  ['whetstone', 'chain_ring', 'moss_bowl', 'red_lens', 'copper_ledger', 'gate_tithe'],
  ['copper_ledger', 'red_lens', 'gate_tithe', 'moss_bowl', 'whetstone', 'chain_ring'],
  ['moss_bowl', 'chain_ring', 'red_lens', 'whetstone', 'gate_tithe', 'copper_ledger'],
  ['gate_tithe', 'whetstone', 'copper_ledger', 'red_lens', 'moss_bowl', 'chain_ring'],
];

export function relicChoices(waveCleared: number, owned: readonly RelicId[]): RelicId[] {
  const options = waveCleared % 4 === 0 ? altars[waveCleared / 4 - 1] : undefined;
  return options?.filter(id => !owned.includes(id)).slice(0, 3) ?? [];
}

export function damageModifiers(encounter: EncounterId, owned: readonly RelicId[], kind: 'rune' | 'poison' | 'tutorial',
  source: number | null, isChain: boolean, crit: boolean, priorHits: number) {
  let relic = 1;
  let enemy = 1;
  if (kind === 'rune' && source !== null) {
    const { row, col } = toCoords(source);
    if (row === 0 && owned.includes('whetstone')) relic *= 1.3;
    if (isChain && owned.includes('chain_ring')) relic *= 1.22;
    if (crit && owned.includes('red_lens')) relic *= 1.2;
    if (encounter === 'armor' && priorHits < 2) enemy *= .5;
    if (encounter === 'cistern') enemy *= .9;
    if (encounter === 'flanks') enemy *= col === 0 || col === 3 ? .7 : 1.1;
    if (encounter === 'bell') enemy *= isChain ? 1.25 : .9;
    if (encounter === 'regent') {
      if (priorHits < 3) enemy *= .5;
      if (isChain) enemy *= 1.2;
    }
  } else if (kind === 'poison') {
    if (owned.includes('moss_bowl')) relic *= 1.5;
    if (encounter === 'cistern') enemy *= 1.5;
  }
  return { relic, enemy };
}
