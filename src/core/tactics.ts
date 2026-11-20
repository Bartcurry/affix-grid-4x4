import { simulateBattle } from './battleEngine';
import { affixAt } from './expedition';
import { resolveTargets } from './grid';
import { createMulberry32 } from './rng';
import { runeAt } from './shopEngine';
import { battleTarget } from './trials';
import type { Catalog, RuneConfig, Run, Scope, Slot } from './types';

type BattleSetup = Pick<Run, 'wave' | 'trialWave' | 'trialRoute' | 'board' | 'gold' | 'relics' | 'tileModifiers' | 'shield' | 'rngState'>;

function battleInput(run: BattleSetup) {
  const { hp, encounter } = battleTarget(run.wave, run.trialWave, run.trialRoute);
  return {
    board: run.board.map(rune => rune ? { ...rune } : null), hp, gold: run.gold,
    encounter, relics: run.relics, tileModifiers: run.tileModifiers,
    affix: affixAt(run.wave)?.id, shield: run.shield,
  };
}

export function prepareBattle(run: BattleSetup, catalog: Catalog) {
  const input = battleInput(run);
  const rng = createMulberry32(run.rngState);
  const events = simulateBattle(input, catalog, rng);
  return { board: input.board, events, rngState: rng.getState(), hp: input.hp };
}

export function planTurn(run: BattleSetup, catalog: Catalog) {
  const { events, hp } = prepareBattle(run, catalog);
  const minResult = simulateBattle(battleInput(run), catalog, () => 1).at(-1);
  const maxResult = simulateBattle(battleInput(run), catalog, () => 0).at(-1);
  const result = events.at(-1);
  if (result?.type !== 'TURN_RESULT' || minResult?.type !== 'TURN_RESULT' || maxResult?.type !== 'TURN_RESULT') throw new Error('Missing battle result');

  const minDamage = minResult.damage;
  const maxDamage = maxResult.damage;
  const expectedDamage = result.damage;
  let verdict: 'win' | 'close' | 'gap' = 'gap';
  let verdictText = '伤害不足';

  if (minDamage >= hp && result.win) {
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
