import { bossHealth, simulateBattle } from './battleEngine';
import { affixAt, encounterAt } from './expedition';
import { resolveTargets } from './grid';
import { createMulberry32 } from './rng';
import { runeAt } from './shopEngine';
import type { Catalog, RuneConfig, Run, Scope, Slot } from './types';

export function usesTutorial(run: Pick<Run, 'wave' | 'board' | 'opening'>) {
  return run.opening === 'chain' && run.wave === 1 && run.board[0]?.configId === 'spark_orb' && run.board[1]?.configId === 'prism_right';
}

export function planTurn(run: Pick<Run, 'wave' | 'attempts' | 'board' | 'gold' | 'relics' | 'opening' | 'tileModifiers' | 'shield' | 'rngState'>, catalog: Catalog) {
  const hp = bossHealth(run.wave);
  const deepBoard = run.board.map(r => r ? { ...r } : null);
  const encounter = encounterAt(run.wave);
  const affix = affixAt(run.wave)?.id;
  const stateSeed = typeof run.rngState === 'number' && Number.isSafeInteger(run.rngState) && run.rngState > 0 ? run.rngState : 1;

  // 1. Guaranteed minimum damage without crits (pure function, does NOT touch run.rngState)
  const noCritEvents = simulateBattle({
    board: deepBoard.map(r => r ? { ...r } : null),
    hp, gold: run.gold, seed: stateSeed, tutorial: usesTutorial(run),
    encounter, relics: run.relics, tileModifiers: run.tileModifiers, affix, shield: run.shield ?? 3,
  }, catalog, () => 1.0);
  const minResult = noCritEvents.at(-1);

  // 2. Maximum ceiling damage with all crits landing (pure function)
  const maxCritEvents = simulateBattle({
    board: deepBoard.map(r => r ? { ...r } : null),
    hp, gold: run.gold, seed: stateSeed, tutorial: usesTutorial(run),
    encounter, relics: run.relics, tileModifiers: run.tileModifiers, affix, shield: run.shield ?? 3,
  }, catalog, () => 0.0);
  const maxResult = maxCritEvents.at(-1);

  // 3. Expected deterministic simulation using independent mulberry32 PRNG (does NOT touch run.rngState)
  const events = simulateBattle({
    board: deepBoard.map(r => r ? { ...r } : null),
    hp, gold: run.gold, seed: stateSeed, tutorial: usesTutorial(run),
    encounter, relics: run.relics, tileModifiers: run.tileModifiers, affix, shield: run.shield ?? 3,
  }, catalog, createMulberry32(stateSeed));
  const result = events.at(-1);
  if (result?.type !== 'TURN_RESULT' || minResult?.type !== 'TURN_RESULT' || maxResult?.type !== 'TURN_RESULT') throw new Error('Missing battle result');

  const minDamage = minResult.damage;
  const maxDamage = maxResult.damage;
  const expectedDamage = result.damage;
  let verdict: 'win' | 'close' | 'gap' = 'gap';
  let verdictText = '伤害不足';

  if (minDamage >= hp) {
    verdict = 'win';
    verdictText = '可击杀';
  } else if (expectedDamage >= hp || maxDamage >= hp) {
    verdict = 'close';
    verdictText = '接近斩杀';
  } else if (expectedDamage >= hp * 0.75) {
    verdict = 'close';
    verdictText = '接近斩杀';
  } else {
    verdict = 'gap';
    verdictText = '伤害不足';
  }

  const byCell = run.board.map(() => ({ damage: 0, activations: 0 }));
  let poisonDamage = 0;
  let tutorialDamage = 0;
  let enemyDelta = 0;
  for (const event of events) {
    if (event.type === 'CELL_ACTIVATE') byCell[event.index].activations++;
    if (event.type !== 'DAMAGE') continue;
    enemyDelta += event.enemyDelta ?? 0;
    if (event.kind === 'poison') poisonDamage += event.amount;
    else if (event.kind === 'tutorial') tutorialDamage += event.amount;
    else if (event.source !== null) byCell[event.source].damage += event.amount;
  }
  return {
    hp, events, result, byCell, poisonDamage, tutorialDamage, enemyDelta,
    minDamage, expectedDamage, verdict, verdictText,
  };
}

export function previewPlacement(run: Run, from: Slot, to: Slot) {
  if ((from.zone === to.zone && from.index === to.index) || (from.zone === 'bench' && to.zone === 'bench')) return null;
  if (!Number.isInteger(to.index) || to.index < 0 || to.index >= run[to.zone].length) return null;
  const moved = runeAt(run, from);
  if (!moved) return null;
  const board = run.board.map(r => r ? { ...r } : null);
  if (from.zone === 'board') board[from.index] = runeAt(run, to);
  if (to.zone === 'board') board[to.index] = moved;
  return { ...run, board };
}

export function runeFootprint(config: RuneConfig, index: number) {
  const links = new Set<number>();
  const effects = new Set<number>();
  const collect = (target: Scope | 'BOSS', into: Set<number>) => {
    if (target === 'BOSS' || target === 'SELF') return;
    for (const cell of resolveTargets(index, target)) if (cell !== index) into.add(cell);
  };
  for (const rule of config.triggers) {
    collect(rule.target, rule.effect === 'RETRIGGER_TARGET' ? links : effects);
    if (rule.secondaryEffect) collect(rule.secondaryEffect.target, effects);
    if (rule.event === 'ON_ROW_COL_ACTIVATE') collect('ROW_COL', effects);
    if (rule.event === 'ON_NEIGHBOR_ACTIVATE' || rule.value.scaleBy === 'ADJACENT_TAG_COUNT') collect('ADJACENT_4', effects);
    if (rule.event === 'ON_ROW_CRIT') collect('SAME_ROW', effects);
  }
  return { links, effects };
}
