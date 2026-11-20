import { resolveTargets, toCoords } from './grid';
import { armorHitsFor, damageModifiers, type EncounterId } from './expedition';
import type { SynergyMap } from './synergy';
import { STAR_MULT, type BattleEvent, type Effect, type Random, type RelicId, type Rune, type RuneConfig, type RuneState } from './types';

export interface Fighter { rune: Rune; config: RuneConfig; state: RuneState }
export interface Combat {
  fighters: (Fighter | null)[];
  hp: number;
  poison: number;
  gold: number;
  shield: number;
  damage: number;
  combo: number;
  rng: Random;
  encounter: EncounterId;
  relics: readonly RelicId[];
  priorHits: number;
  lastRuneColumn?: number;
  affix?: string;
  synergies?: SynergyMap;
  benchCount: number;
  spiritGourdTriggered?: boolean;
  emit(event: BattleEvent): boolean;
  room(count?: number): boolean;
  activate(index: number, depth: number, from?: number, suppressCrit?: boolean): void;
  notifyCrit(depth: number, sourceIndex?: number): void;
}

export interface EffectContext { index: number; isChain: boolean; depth: number; suppressCrit: boolean }

export function dealDamage(combat: Combat, source: number | null, value: number, kind: 'rune' | 'poison' | 'tutorial', crit = false, isChain = false) {
  const { relic, enemy } = damageModifiers(combat.encounter, combat.relics, kind, source, isChain, crit, combat.priorHits, combat.affix, combat.benchCount);
  let finalEnemy = enemy;
  const sealColumn = combat.encounter === 'regent_seal' && kind === 'rune' && source !== null ? toCoords(source).col : undefined;
  const gateBlocked = sealColumn !== undefined && combat.priorHits >= armorHitsFor(combat.encounter) && sealColumn === combat.lastRuneColumn;
  if (combat.affix === 'shield_tax' && combat.gold < 10) {
    finalEnemy *= 0.8;
  }
  let critMult = crit ? 2 : 1;
  if (crit && combat.synergies) {
    if (combat.synergies.amplify.tier === 2) critMult = 4;
    else if (combat.synergies.amplify.tier === 1) critMult = 3;
  }
  let chainSynergyMult = 1;
  if (isChain && combat.synergies) {
    if (combat.synergies.chain.tier === 2) chainSynergyMult = 1.75;
    else if (combat.synergies.chain.tier === 1) chainSynergyMult = 1.35;
  }
  let jadeAbacusMult = 1;
  if (kind === 'rune' && source !== null && toCoords(source).row === 0 && combat.relics.includes('jade_abacus') && combat.priorHits === 0) {
    jadeAbacusMult = 1 + Math.min(0.90, Math.floor(combat.gold / 5) * 0.15);
  }

  const boosted = value * critMult * relic * chainSynergyMult * jadeAbacusMult;
  const normalAmount = Math.ceil(boosted * finalEnemy);
  const amount = gateBlocked ? Math.ceil(boosted * finalEnemy * .7) : normalAmount;
  const enemyDelta = amount - Math.ceil(boosted);
  const hp = Math.max(0, combat.hp - amount);
  if (combat.emit({ type: 'DAMAGE', source, amount, crit, hp, kind, ...(enemyDelta ? { enemyDelta } : {}),
    ...(amount < normalAmount ? { gateBlocked: true } : {}) })) {
    if (kind === 'rune' && amount > 0) {
      combat.priorHits++;
      combat.lastRuneColumn = sealColumn;
    }
    combat.hp = hp;
    combat.damage += amount;
    return true;
  }
  return false;
}

function setPoison(combat: Combat, source: number, poison: number) {
  const isIncrease = poison > combat.poison;
  if (combat.emit({ type: 'POISON', source, poison })) {
    combat.poison = poison;
    if (isIncrease && combat.synergies && combat.synergies.poison.tier >= 1 && combat.room()) {
      const burstRatio = combat.synergies.poison.tier === 2 ? 0.30 : 0.12;
      const burstDmg = Math.max(1, Math.floor(combat.poison * burstRatio));
      dealDamage(combat, source, burstDmg, 'poison', false);
    }
  }
}

function setGold(combat: Combat, source: number, delta: number) {
  if (combat.emit({ type: 'GOLD', source, delta, gold: combat.gold + delta })) {
    combat.gold += delta;
    if (delta > 0 && combat.synergies && combat.synergies.gold.tier === 2 && combat.room()) {
      dealDamage(combat, source, delta * 5, 'rune', false);
    }
  }
}

function changeState(combat: Combat, index: number, changes: Partial<RuneState>) {
  const fighter = combat.fighters[index];
  if (!fighter) return;
  const state = { ...fighter.state, ...changes };
  if (combat.emit({ type: 'RUNE_STATE', index, state })) fighter.state = state;
}

export function executeEffect(combat: Combat, rule: Effect, context: EffectContext) {
  const { index, isChain, depth, suppressCrit } = context;
  const fighter = combat.fighters[index];
  if (!fighter || !combat.room()) return;
  const { star } = fighter.rune;
  const { value, target } = rule;
  const targets = target === 'BOSS' ? [] : resolveTargets(index, target);
  let base = value.base;
  const bonusPower = fighter.rune.bonusPower ?? 0;
  if (value.scaleBy !== 'PLAYER_GOLD') {
    if (['MULTIPLY_POISON', 'ADD_TEMP_MULT'].includes(rule.effect)) {
      base += bonusPower * 0.05;
    } else if (!['RETRIGGER_TARGET', 'ADD_CHARGE'].includes(rule.effect)) {
      base += bonusPower;
    }
  }
  switch (value.scaleBy) {
    case 'CHAIN_BONUS': if (isChain) base *= value.chainMult ?? 1; break;
    case 'PLAYER_GOLD': {
      const fullRateGold = Math.min(combat.gold, value.fullRateGold ?? combat.gold);
      const excessGold = combat.gold - fullRateGold;
      base = value.base * fullRateGold + (value.excessGoldRate ?? value.base) * excessGold + bonusPower;
      break;
    }
    case 'TOTAL_TRIGGERS_THIS_TURN': base *= combat.combo; break;
    case 'BOSS_POISON': base *= combat.poison; break;
    case 'BOSS_POISON_TIER': {
      const divisor = value.tierDivisor ?? 12;
      const maxCap = value.maxCap ?? 6;
      base = Math.min(maxCap, Math.floor(combat.poison / divisor));
      break;
    }
    case 'ADJACENT_TAG_COUNT': {
      for (const neighbor of resolveTargets(index, 'ADJACENT_4')) {
        if (combat.fighters[neighbor]?.config.tags.includes(value.matchTag ?? '')) base += value.bonusPerMatch ?? 0;
      }
      break;
    }
  }
  let goldSynergyMult = 1;
  if (combat.synergies && combat.synergies.gold.tier >= 1 && value.scaleBy !== 'PLAYER_GOLD') {
    goldSynergyMult = 1 + Math.min(0.20, Math.floor(combat.gold / 10) * 0.05);
  }
  const scaled = base * STAR_MULT[star] * (rule.effect === 'DEAL_DAMAGE' ? goldSynergyMult : 1);
  const hit = (amount: number, canCrit = true, afterHit?: () => void) => {
    if (!combat.room(afterHit ? 2 : 1)) return;
    const crit = canCrit && combat.rng() < fighter.state.tempCritChance;
    if (!dealDamage(combat, index, amount * fighter.state.tempMult, 'rune', crit, isChain)) return;
    afterHit?.();
    if (crit && !suppressCrit) {
      if (combat.relics.includes('xuanbing_silk')) {
        for (const target of resolveTargets(index, 'ADJACENT_4')) {
          changeState(combat, target, { tempCritChance: 1.0 });
        }
      }
      if (combat.synergies && combat.synergies.amplify.tier === 2) {
        for (let i = 0; i < combat.fighters.length; i++) {
          const f = combat.fighters[i];
          if (f) changeState(combat, i, { tempMult: f.state.tempMult + 0.25 });
        }
      }
      combat.notifyCrit(depth, index);
    }
  };
  switch (rule.effect) {
    case 'DEAL_DAMAGE': hit(scaled); break;
    case 'ADD_POISON': setPoison(combat, index, combat.poison + Math.ceil(scaled)); break;
    case 'MULTIPLY_POISON':
      if (combat.poison > 0) {
        const affected = Math.min(combat.poison, [0, 1500, 2500, 4000][star]);
        setPoison(combat, index, combat.poison - affected + Math.ceil(affected * [0, 1.6, 2, 2.6][star]));
      }
      break;
    case 'DETONATE_POISON':
      if (combat.poison > 0) hit(combat.poison * [0, 2.5, 3.5, 5][star], false,
        () => setPoison(combat, index, Math.floor(combat.poison * (value.retainRatio ?? 0))));
      break;
    case 'BURST_POISON':
      if (isChain && combat.poison > 0) {
        const burst = Math.floor(combat.poison * (value.burstPercent ?? 0.15));
        if (burst > 0) hit(burst * (value.base ?? 2) * STAR_MULT[star], false);
      }
      break;
    case 'AMPLIFY_POISON_PERCENT':
      if (combat.poison > 0) {
        const bonus = Math.ceil(combat.poison * (value.base ?? 0.25) * STAR_MULT[star]);
        setPoison(combat, index, combat.poison + bonus);
      }
      break;
    case 'SACRIFICE_SHIELD_BUFF':
      if (fighter.state.triggersThisTurn === 1 && combat.shield >= 2) {
        combat.shield -= 1;
        for (const targetIndex of targets) {
          const targetFighter = combat.fighters[targetIndex];
          if (!targetFighter) continue;
          changeState(combat, targetIndex, { tempMult: targetFighter.state.tempMult * 2 });
        }
      }
      break;
    case 'GAIN_GOLD': setGold(combat, index, Math.ceil(scaled) + Number(scaled > 0 && combat.relics.includes('copper_ledger'))); break;
    case 'SPEND_GOLD_BUFF': {
      const cost = value.goldCost ?? 0;
      if (combat.gold < cost || !combat.room(2)) break;
      setGold(combat, index, -cost);
      hit(scaled, false);
      if (rule.secondaryEffect) executeEffect(combat, rule.secondaryEffect, context);
      break;
    }
    case 'ADD_TEMP_MULT':
    case 'ADD_TEMP_CRIT':
    case 'ADD_CHARGE':
      if (value.minGoldThreshold !== undefined && combat.gold < value.minGoldThreshold) break;
      for (const targetIndex of targets) {
        const targetFighter = combat.fighters[targetIndex];
        if (!targetFighter) continue;
        if (value.matchTag && !targetFighter.config.tags.includes(value.matchTag)) continue;
        const state = targetFighter.state;
        if (rule.effect === 'ADD_TEMP_MULT') changeState(combat, targetIndex, { tempMult: state.tempMult + scaled });
        if (rule.effect === 'ADD_TEMP_CRIT') changeState(combat, targetIndex, { tempCritChance: Math.min(1, state.tempCritChance + scaled) });
        if (rule.effect === 'ADD_CHARGE') changeState(combat, targetIndex, { chargeStacks: state.chargeStacks + base });
      }
      break;
    case 'RELEASE_CHARGE_DMG':
      if (fighter.state.chargeStacks > 0) hit(fighter.state.chargeStacks * scaled, true,
        () => changeState(combat, index, { chargeStacks: 0 }));
      break;
    case 'RETRIGGER_TARGET': {
      if (combat.affix === 'odd_row_frenzy' && toCoords(index).row % 2 === 1) break;
      for (const targetIndex of targets) {
        for (let repeat = 0; repeat < (value.repeatCount ?? 1) + Number(star === 3); repeat++) {
          combat.activate(targetIndex, depth + 1, index, suppressCrit);
        }
      }
      break;
    }
  }
}
