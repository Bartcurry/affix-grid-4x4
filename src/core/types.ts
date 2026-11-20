export type Star = 1 | 2 | 3;
export type Rarity = 'common' | 'rare' | 'epic';
export type Archetype = 'chain' | 'poison' | 'gold' | 'amplify';
export type RelicId =
  | 'whetstone' | 'chain_ring' | 'moss_bowl' | 'red_lens' | 'copper_ledger' | 'gate_tithe'
  | 'jade_abacus' | 'taixu_needle' | 'li_fire_token' | 'huagong_powder' | 'bagua_mirror'
  | 'spirit_gourd' | 'tianji_compass' | 'xuanbing_silk' | 'qiankun_pouch';
export type OpeningId = 'chain' | 'poison' | 'gold' | 'amplify';
export type Scope = 'SELF' | 'RIGHT' | 'LEFT' | 'DOWN' | 'ADJACENT_4' | 'SAME_ROW' | 'SAME_COL' | 'ROW_COL' | 'ALL';
export type Timing = 'ON_ACTIVATE' | 'ON_NEIGHBOR_ACTIVATE' | 'ON_ROW_COL_ACTIVATE' | 'ON_ANY_CRIT' | 'ON_ROW_CRIT' | 'ON_TURN_END';
export type Scale = 'NONE' | 'CHAIN_BONUS' | 'PLAYER_GOLD' | 'TOTAL_TRIGGERS_THIS_TURN' | 'ADJACENT_TAG_COUNT' | 'BOSS_POISON' | 'BOSS_POISON_TIER';
export type EffectName = 'DEAL_DAMAGE' | 'ADD_POISON' | 'MULTIPLY_POISON' | 'DETONATE_POISON' |
  'GAIN_GOLD' | 'SPEND_GOLD_BUFF' | 'ADD_TEMP_MULT' | 'ADD_TEMP_CRIT' | 'ADD_CHARGE' | 'RELEASE_CHARGE_DMG' | 'RETRIGGER_TARGET' |
  'BURST_POISON' | 'SACRIFICE_SHIELD_BUFF' | 'AMPLIFY_POISON_PERCENT';

export type TileModifier = 'li_fire' | 'xuan_ice' | 'spirit_gathering';
export type TileModifierMap = Record<number, TileModifier>;

export interface Effect {
  effect: EffectName;
  target: Scope | 'BOSS';
  value: {
    base: number;
    scaleBy?: Scale;
    chainMult?: number;
    repeatCount?: number;
    matchTag?: string;
    bonusPerMatch?: number;
    retainRatio?: number;
    goldCost?: number;
    tierDivisor?: number;
    maxCap?: number;
    minGoldThreshold?: number;
    burstPercent?: number;
    fullRateGold?: number;
    excessGoldRate?: number;
  };
  secondaryEffect?: Effect;
}

export interface Rule extends Effect { event: Timing }
export interface RuneConfig {
  id: string;
  name: string;
  rarity: Rarity;
  archetype: Archetype;
  tags: readonly string[];
  cost: number;
  color: string;
  symbol: string;
  desc: string;
  triggers: readonly Rule[];
}

export interface Rune { configId: string; star: Star; bonusPower?: number }
export type Slots = (Rune | null)[];
export interface RuneState { triggersThisTurn: number; tempMult: number; tempCritChance: number; chargeStacks: number }
export interface Slot { zone: 'board' | 'bench'; index: number }
export interface Offer { configId: string; locked: boolean }
export interface Run {
  seed: string;
  rngState: number;
  tileModifiers: TileModifierMap;
  opening: OpeningId;
  shopFocus: Archetype | 'any';
  wave: number;
  gold: number;
  shield: number;
  board: Slots;
  bench: Slots;
  shop: (Offer | null)[];
  freeRefreshes: number;
  attempts: number;
  endless: boolean;
  status: 'active' | 'victory' | 'defeat';
  lastDamage: number;
  lastPoison: number;
  bestCombo: number;
  pendingLoss: boolean;
  relics: RelicId[];
  pendingRelics: RelicId[];
  enableSynergies?: boolean;
  lastCellDamage?: number[];
}

export type BattleEvent =
  | { type: 'CELL_ACTIVATE'; index: number; isChain: boolean; depth: number; combo: number }
  | { type: 'CHAIN_LINK'; from: number; to: number; tutorial?: boolean }
  | { type: 'DAMAGE'; source: number | null; amount: number; hp: number; crit: boolean; kind: 'rune' | 'poison' | 'tutorial'; enemyDelta?: number }
  | { type: 'POISON'; source: number | null; poison: number }
  | { type: 'GOLD'; source: number; gold: number; delta: number }
  | { type: 'RUNE_STATE'; index: number; state: RuneState }
  | { type: 'TURN_RESULT'; damage: number; combo: number; hp: number; poison: number; gold: number; win: boolean };

export type TurnResult = Extract<BattleEvent, { type: 'TURN_RESULT' }>;
export type Random = () => number;
export type Catalog = Readonly<Record<string, RuneConfig>>;
export const STAR_MULT = { 1: 1, 2: 2.2, 3: 5 } as const;
export const initialRuneState = (): RuneState => ({ triggersThisTurn: 0, tempMult: 1, tempCritChance: 0.05, chargeStacks: 0 });
