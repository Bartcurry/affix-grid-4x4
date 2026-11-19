import { bossHealth, simulateBattle } from './battleEngine';
import { encounterAt } from './expedition';
import { resolveTargets } from './grid';
import { runeAt } from './shopEngine';
import type { Catalog, RuneConfig, Run, Scope, Slot } from './types';

export function usesTutorial(run: Pick<Run, 'wave' | 'board' | 'opening'>) {
  return run.opening === 'chain' && run.wave === 1 && run.board[0]?.configId === 'spark_orb' && run.board[1]?.configId === 'prism_right';
}

export function planTurn(run: Pick<Run, 'wave' | 'attempts' | 'board' | 'gold' | 'relics' | 'opening'>, catalog: Catalog) {
  const hp = bossHealth(run.wave);
  const seed = Math.imul(run.wave, 8191) ^ Math.imul(run.attempts + 1, 131071);
  const events = simulateBattle({ board: run.board, hp, gold: run.gold, seed, tutorial: usesTutorial(run),
    encounter: encounterAt(run.wave), relics: run.relics }, catalog);
  const result = events.at(-1);
  if (result?.type !== 'TURN_RESULT') throw new Error('Missing battle result');
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
  return { hp, events, result, byCell, poisonDamage, tutorialDamage, enemyDelta };
}

export function previewPlacement(run: Run, from: Slot, to: Slot) {
  if ((from.zone === to.zone && from.index === to.index) || (from.zone === 'bench' && to.zone === 'bench')) return null;
  if (!Number.isInteger(to.index) || to.index < 0 || to.index >= run[to.zone].length) return null;
  const moved = runeAt(run, from);
  if (!moved) return null;
  const board = [...run.board];
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
  }
  return { links, effects };
}
