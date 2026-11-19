import { resolveTargets } from './grid';
import { STAR_MULT, type BattleEvent, type Effect, type Random, type Rune, type RuneConfig, type RuneState } from './types';

export interface Fighter { rune: Rune; config: RuneConfig; state: RuneState }
export interface Combat {
  fighters: (Fighter | null)[];
  hp: number;
  poison: number;
  gold: number;
  damage: number;
  combo: number;
  rng: Random;
  emit(event: BattleEvent): boolean;
  room(count?: number): boolean;
  activate(index: number, depth: number, from?: number, suppressCrit?: boolean): void;
  notifyCrit(depth: number): void;
}

export interface EffectContext { index: number; isChain: boolean; depth: number; suppressCrit: boolean }

export function dealDamage(combat: Combat, source: number | null, value: number, kind: 'rune' | 'poison' | 'tutorial', crit = false) {
  const amount = Math.ceil(value * (crit ? 2 : 1));
  const hp = Math.max(0, combat.hp - amount);
  if (combat.emit({ type: 'DAMAGE', source, amount, crit, hp, kind })) {
    combat.hp = hp;
    combat.damage += amount;
    return true;
  }
  return false;
}

function setPoison(combat: Combat, source: number, poison: number) {
  if (combat.emit({ type: 'POISON', source, poison })) combat.poison = poison;
}

function setGold(combat: Combat, source: number, delta: number) {
  if (combat.emit({ type: 'GOLD', source, delta, gold: combat.gold + delta })) combat.gold += delta;
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
  switch (value.scaleBy) {
    case 'CHAIN_BONUS': if (isChain) base *= value.chainMult ?? 1; break;
    case 'PLAYER_GOLD': base *= combat.gold; break;
    case 'TOTAL_TRIGGERS_THIS_TURN': base *= combat.combo; break;
    case 'BOSS_POISON': base *= combat.poison; break;
    case 'ADJACENT_TAG_COUNT': {
      for (const neighbor of resolveTargets(index, 'ADJACENT_4')) {
        if (combat.fighters[neighbor]?.config.tags.includes(value.matchTag ?? '')) base += value.bonusPerMatch ?? 0;
      }
      break;
    }
  }
  const scaled = base * STAR_MULT[star];
  const hit = (amount: number, canCrit = true, afterHit?: () => void) => {
    if (!combat.room(afterHit ? 2 : 1)) return;
    const crit = canCrit && combat.rng() < fighter.state.tempCritChance;
    if (!dealDamage(combat, index, amount * fighter.state.tempMult, 'rune', crit)) return;
    afterHit?.();
    if (crit && !suppressCrit) combat.notifyCrit(depth);
  };
  switch (rule.effect) {
    case 'DEAL_DAMAGE': hit(scaled); break;
    case 'ADD_POISON': setPoison(combat, index, combat.poison + Math.ceil(scaled)); break;
    case 'MULTIPLY_POISON':
      if (combat.poison > 0) setPoison(combat, index, Math.ceil(combat.poison * [0, 1.6, 2, 2.6][star]));
      break;
    case 'DETONATE_POISON':
      if (combat.poison > 0) hit(combat.poison * [0, 2.5, 3.5, 5][star], false,
        () => setPoison(combat, index, Math.floor(combat.poison * (value.retainRatio ?? 0))));
      break;
    case 'GAIN_GOLD': setGold(combat, index, Math.ceil(scaled)); break;
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
      for (const targetIndex of targets) {
        const state = combat.fighters[targetIndex]?.state;
        if (!state) continue;
        if (rule.effect === 'ADD_TEMP_MULT') changeState(combat, targetIndex, { tempMult: state.tempMult + scaled });
        if (rule.effect === 'ADD_TEMP_CRIT') changeState(combat, targetIndex, { tempCritChance: Math.min(1, state.tempCritChance + scaled) });
        if (rule.effect === 'ADD_CHARGE') changeState(combat, targetIndex, { chargeStacks: state.chargeStacks + base });
      }
      break;
    case 'RELEASE_CHARGE_DMG':
      if (fighter.state.chargeStacks > 0) hit(fighter.state.chargeStacks * scaled, true,
        () => changeState(combat, index, { chargeStacks: 0 }));
      break;
    case 'RETRIGGER_TARGET':
      for (const targetIndex of targets) {
        for (let repeat = 0; repeat < (value.repeatCount ?? 1) + Number(star === 3); repeat++) {
          combat.activate(targetIndex, depth + 1, index, suppressCrit);
        }
      }
      break;
  }
}
