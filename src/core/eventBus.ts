import { dealDamage, executeEffect, type Combat } from './effectExecutor';
import { CELL_COUNT, resolveTargets } from './grid';
import type { EncounterId } from './expedition';
import { type BattleEvent, type Catalog, type Random, type RelicId, type Slots, type TileModifierMap, type Timing, initialRuneState } from './types';

export const MAX_CELL_TRIGGERS = 8;
export const MAX_DEPTH = 24;
export const MAX_EVENTS = 300;

export function createEventBus(board: Readonly<Slots>, catalog: Catalog, hp: number, gold: number, poison: number, rng: Random,
  tutorial: boolean, encounter: EncounterId, relics: readonly RelicId[], tileModifiers?: TileModifierMap, affix?: string, shield = 3) {
  const events: BattleEvent[] = [];
  const maxCellTriggers = affix === 'limit_triggers' ? 6 : MAX_CELL_TRIGGERS;
  const activeModifiers = tutorial ? undefined : tileModifiers;
  const fighters = Array.from({ length: CELL_COUNT }, (_, index) => {
    const rune = board[index];
    if (!rune || !catalog[rune.configId]) return null;
    const state = initialRuneState();
    if (activeModifiers?.[index] === 'xuan_ice') state.tempCritChance += 0.45;
    if (rune.configId === 'storm_gambler') state.tempCritChance += 0.25;
    return { rune, config: catalog[rune.configId], state };
  });

  let limit = MAX_EVENTS - 3;
  let tutorialPending = tutorial && fighters[0]?.rune.configId === 'spark_orb' && fighters[1]?.rune.configId === 'prism_right';

  const combat: Combat = {
    fighters, hp, gold, poison, shield, rng, encounter, relics, priorHits: 0, damage: 0, combo: 0, affix,
    breachHp: encounter === 'last_gate' ? Math.floor(hp / 2) : 0,
    breached: false,
    emit(event) {
      if (!combat.room()) return false;
      events.push(event);
      return true;
    },
    room: (count = 1) => events.length + count <= limit,
    activate(index, depth, from, suppressCrit = false, isExtra = false) {
      const fighter = fighters[index];
      if (!fighter || fighter.state.triggersThisTurn >= maxCellTriggers || depth >= MAX_DEPTH ||
        events.length + (from === undefined ? 1 : 2) > limit) return;

      if (from !== undefined) combat.emit({ type: 'CHAIN_LINK', from, to: index });
      fighter.state.triggersThisTurn++;
      combat.emit({ type: 'CELL_ACTIVATE', index, depth, isChain: from !== undefined, combo: ++combat.combo });
      dispatch(index, 'ON_ACTIVATE', from !== undefined, depth, suppressCrit);

      if (index === 1 && tutorialPending && events.length + 2 <= limit) {
        tutorialPending = false;
        combat.emit({ type: 'CHAIN_LINK', from: 1, to: 0, tutorial: true });
        dealDamage(combat, 0, 42, 'tutorial');
      }

      for (const target of resolveTargets(index, 'ADJACENT_4')) {
        dispatch(target, 'ON_NEIGHBOR_ACTIVATE', from !== undefined, depth, suppressCrit);
        if (activeModifiers?.[target] === 'spirit_gathering') {
          const targetFighter = fighters[target];
          if (targetFighter) targetFighter.rune.bonusPower = (targetFighter.rune.bonusPower ?? 0) + 2;
        }
      }

      for (const target of resolveTargets(index, 'ROW_COL')) {
        dispatch(target, 'ON_ROW_COL_ACTIVATE', from !== undefined, depth, suppressCrit);
      }

      // Li Fire tile modifier: extra trigger 1 time
      if (!isExtra && activeModifiers?.[index] === 'li_fire' && fighter.state.triggersThisTurn < maxCellTriggers && combat.room()) {
        fighter.state.triggersThisTurn++;
        combat.emit({ type: 'CELL_ACTIVATE', index, depth, isChain: true, combo: ++combat.combo });
        dispatch(index, 'ON_ACTIVATE', true, depth, suppressCrit);
        for (const target of resolveTargets(index, 'ADJACENT_4')) {
          dispatch(target, 'ON_NEIGHBOR_ACTIVATE', true, depth, suppressCrit);
          if (activeModifiers?.[target] === 'spirit_gathering') {
            const targetFighter = fighters[target];
            if (targetFighter) targetFighter.rune.bonusPower = (targetFighter.rune.bonusPower ?? 0) + 2;
          }
        }
        for (const target of resolveTargets(index, 'ROW_COL')) {
          dispatch(target, 'ON_ROW_COL_ACTIVATE', true, depth, suppressCrit);
        }
      }
    },
    notifyCrit(depth, sourceIndex) {
      for (let index = 0; index < CELL_COUNT && combat.room(); index++) {
        dispatch(index, 'ON_ANY_CRIT', false, depth, true);
      }
      if (sourceIndex !== undefined) {
        const sourceRow = Math.floor(sourceIndex / 4);
        for (let col = 0; col < 4 && combat.room(); col++) {
          const target = sourceRow * 4 + col;
          dispatch(target, 'ON_ROW_CRIT', false, depth, true);
        }
      }
    },
  };

  function dispatch(index: number, timing: Timing, isChain: boolean, depth: number, suppressCrit: boolean) {
    if (!combat.room()) return;
    for (const rule of fighters[index]?.config.triggers ?? []) {
      if (rule.event === timing) executeEffect(combat, rule, { index, isChain, depth, suppressCrit });
    }
  }

  function finish() {
    for (let index = 0; index < CELL_COUNT; index++) dispatch(index, 'ON_TURN_END', false, 0, false);
    limit = MAX_EVENTS;
    if (combat.poison > 0) {
      dealDamage(combat, null, combat.poison, 'poison');
      const decayRatio = combat.affix === 'decay_surge' ? 0.65 : 0.8;
      combat.poison = Math.floor(combat.poison * decayRatio);
      combat.emit({ type: 'POISON', source: null, poison: combat.poison });
    }
    combat.emit({ type: 'TURN_RESULT', damage: combat.damage, combo: combat.combo, hp: combat.hp,
      poison: combat.poison, gold: combat.gold, win: combat.hp <= 0 });
    return events;
  }

  return { activate: combat.activate, finish };
}
