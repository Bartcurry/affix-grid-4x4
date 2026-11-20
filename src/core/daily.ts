import { simulateBattle } from './battleEngine';
import type { EncounterId } from './expedition';
import { createMulberry32 } from './rng';
import type { BattleEvent, Catalog, Slots, TileModifierMap } from './types';

export interface DailyTemplate {
  title: string;
  enemy: EncounterId;
  hp: number;
  cells: readonly number[];
  pieces: readonly string[];
  clue: string;
  gold?: number;
  tileModifiers?: TileModifierMap;
}

export const classicDailyTemplates: readonly DailyTemplate[] = [
  { title: '井底回声', enemy: 'armor', hp: 61, cells: [0, 1, 4, 5], pieces: ['falling_bell', 'spark_orb', 'prism_right', 'echo_stone'],
    clue: '铁壳卫的前两次受击减伤。小伤害先打，别让电火花替它们破甲。' },
  { title: '药炉余火', enemy: 'cistern', hp: 60, cells: [0, 1, 2, 3], pieces: ['venom_drop', 'venom_drop', 'catalyst_flask', 'toxic_detonator'],
    clue: '倒药的顺序比瓶子更重要。漏毒翁还会吃额外的回合末剧毒伤害。' },
  { title: '狮口讨钱', enemy: 'flanks', hp: 21, cells: [0, 1, 2, 3], pieces: ['copper_mine', 'coin_mold', 'gold_cannon', 'echo_stone'],
    clue: '先赚金币再开炮。重炮在中间两列更疼，回响只找左边。' },
  { title: '落铃试音', enemy: 'bell', hp: 78, cells: [1, 2, 5, 6], pieces: ['falling_bell', 'falling_bell', 'spark_orb', 'prism_right'],
    clue: '回音钟怕连锁。先找一个落铃可以敲中的位置，再让折射镜把连锁接过去。' },
  { title: '朱印借火', enemy: 'sentry', hp: 65, cells: [0, 1, 4, 5], pieces: ['red_seal', 'prism_right', 'spark_orb', 'ember_amp'],
    clue: '火漆印加成正下方，棱镜加成邻居。想让电火花吃到加成，它们得先动。' },
  { title: '石门留毒', enemy: 'regent', hp: 45, cells: [0, 1, 2, 3], pieces: ['venom_drop', 'moss_brick', 'echo_stone', 'toxic_detonator'],
    clue: '毒伤能绕开前三次减半的护甲。苔砖要贴着常被触发的符文。' },
];

export const newDailyTemplates: readonly DailyTemplate[] = [
  { title: '离火留声', enemy: 'bell', hp: 140, cells: [1, 2, 5, 6, 9],
    pieces: ['prism_right', 'spark_orb', 'falling_bell', 'echo_stone', 'ember_amp'], tileModifiers: { 5: 'li_fire' },
    clue: '离火位会多触发一次。试试让这个额外触发也能接到电火花。' },
  { title: '开炉凑二十五', enemy: 'flanks', hp: 100, cells: [0, 1, 2, 5, 6], gold: 21,
    pieces: ['copper_mine', 'coin_mold', 'gold_cannon', 'alchemy_bell', 'greed_amplifier'],
    clue: '开局只有 21 金。点金铃触发前先凑到 25 金，它就能给下方的符文加伤。' },
  { title: '半扇城门', enemy: 'last_gate', hp: 180, cells: [1, 2, 5, 9, 10],
    pieces: ['spark_orb', 'falling_bell', 'overclock_core', 'combo_finisher', 'prism_right'],
    clue: '半血破门后，后两排更强。用前面的连锁先把门打开，再让后排收尾。' },
  { title: '苔阶引信', enemy: 'cistern', hp: 225, cells: [5, 6, 9, 10, 14],
    pieces: ['moss_brick', 'venom_drop', 'toxic_fuse', 'relay_cross', 'falling_bell'],
    clue: '让苔砖贴着多次触发的符文。毒火引信只有被连锁时才会引爆，毒层还能留给回合末。' },
];

export const dailyTemplates = [...newDailyTemplates, ...classicDailyTemplates];

export type DailyPuzzle = { day: string; template: DailyTemplate; pieces: string[]; par: number; targetDamage: number };
const dayMs = 86_400_000;
const releaseDay = '2026-11-20';
const expandedDay = '2026-11-26';
const signature = (pieces: readonly string[]) => pieces.join('|');

export function shanghaiDay(now = new Date()): string {
  return new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
}

export function validDailyDate(day: unknown): day is string {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day) || day < releaseDay || day > '2099-12-31') return false;
  const value = Date.parse(day);
  return Number.isFinite(value) && new Date(value).toISOString().slice(0, 10) === day;
}

export function runDaily(template: DailyTemplate, pieces: readonly string[], catalog: Catalog) {
  const board: Slots = Array(16).fill(null);
  template.cells.forEach((cell, index) => { board[cell] = { configId: pieces[index], star: 1 }; });
  const events: BattleEvent[] = simulateBattle({ board, hp: template.hp, gold: template.gold ?? 0, encounter: template.enemy,
    tileModifiers: template.tileModifiers }, catalog, () => 1);
  const result = events.at(-1);
  if (result?.type !== 'TURN_RESULT') throw new Error('Missing daily result');
  return { board, events, result };
}

function swaps(pieces: readonly string[]) {
  const alternatives: string[][] = [];
  for (let left = 0; left < pieces.length; left++) {
    for (let right = left + 1; right < pieces.length; right++) {
      if (pieces[left] === pieces[right]) continue;
      const next = [...pieces];
      [next[left], next[right]] = [next[right], next[left]];
      alternatives.push(next);
    }
  }
  return alternatives;
}

type Route = { moves: number; damage: number };
type DailyAnalysis = {
  pool: Pick<DailyPuzzle, 'pieces' | 'par' | 'targetDamage'>[];
  routes: Map<string, Route>;
};
const analyses = new WeakMap<Catalog, Map<DailyTemplate, DailyAnalysis>>();

function analyzeDaily(template: DailyTemplate, catalog: Catalog) {
  let cached = analyses.get(catalog);
  if (!cached) { cached = new Map(); analyses.set(catalog, cached); }
  const prior = cached.get(template);
  if (prior) return prior;
  const all = [[...template.pieces] as string[]];
  const seen = new Set([signature(all[0])]);
  for (const pieces of all) for (const next of swaps(pieces)) {
    const key = signature(next);
    if (!seen.has(key)) { seen.add(key); all.push(next); }
  }
  const routes = new Map<string, Route>();
  const search = all.filter(pieces => {
    const { result } = runDaily(template, pieces, catalog);
    if (result.win) routes.set(signature(pieces), { moves: 0, damage: result.damage });
    return result.win;
  });
  // Finish a layer before reading the next so equal-length routes can improve damage.
  for (const pieces of search) {
    const route = routes.get(signature(pieces))!;
    const moves = route.moves + 1;
    for (const next of swaps(pieces)) {
      const key = signature(next);
      const prior = routes.get(key);
      if (!prior) {
        routes.set(key, { moves, damage: route.damage });
        search.push(next);
      } else if (prior.moves === moves) prior.damage = Math.max(prior.damage, route.damage);
    }
  }
  const eligible = all.flatMap(pieces => {
    const route = routes.get(signature(pieces));
    return route && route.moves > 0 ? [{ pieces, par: route.moves, targetDamage: route.damage }] : [];
  });
  const twoStep = eligible.filter(puzzle => puzzle.par >= 2);
  const analysis = { pool: twoStep.length ? twoStep : eligible, routes };
  cached.set(template, analysis);
  return analysis;
}

export function dailyPuzzle(day: string, catalog: Catalog): DailyPuzzle | null {
  if (!validDailyDate(day)) return null;
  const expanded = day >= expandedDay;
  const schedule = expanded ? dailyTemplates : classicDailyTemplates;
  const dayIndex = (Date.parse(day) - Date.parse(expanded ? expandedDay : releaseDay)) / dayMs;
  const templateIndex = dayIndex % schedule.length;
  const template = schedule[templateIndex];
  const { pool } = analyzeDaily(template, catalog);
  if (!pool.length) return null;
  const rng = createMulberry32(templateIndex + 983);
  const start = Math.floor(rng() * pool.length);
  const setup = pool[(start + Math.floor(dayIndex / schedule.length)) % pool.length];
  return { day, template, ...setup, pieces: [...setup.pieces] };
}

export function dailyHint(template: DailyTemplate, pieces: readonly string[], catalog: Catalog) {
  const { routes } = analyzeDaily(template, catalog);
  const route = routes.get(signature(pieces));
  if (!route?.moves) return null;
  const next = swaps(pieces).find(candidate => {
    const after = routes.get(signature(candidate));
    return after?.moves === route.moves - 1 && after.damage === route.damage;
  });
  return next ? { index: pieces.findIndex((id, index) => id !== next[index]), remaining: route.moves } : null;
}

export interface DailyRecord { moves: number; damage: number }
export function newDailyRecord(previous: DailyRecord | undefined, next: DailyRecord) {
  return !previous || next.moves < previous.moves || (next.moves === previous.moves && next.damage > previous.damage) ? next : previous;
}

const dayOffset = (day: string, offset: number) => new Date(Date.parse(day) + offset * dayMs).toISOString().slice(0, 10);

export function recentDailyDates(today: string) {
  if (!validDailyDate(today)) return [];
  return Array.from({ length: 7 }, (_, index) => dayOffset(today, index - 6)).filter(validDailyDate);
}

export function dailyStreak(records: ReadonlyMap<string, DailyRecord>, today: string) {
  if (!validDailyDate(today)) return 0;
  let day = records.has(today) ? today : dayOffset(today, -1);
  let count = 0;
  while (day >= releaseDay && records.has(day)) {
    count++;
    day = dayOffset(day, -1);
  }
  return count;
}

const sharedPage = 'https://bartcurry.github.io/affix-grid-4x4/';
export function dailyLink(day: string): string {
  const url = new URL(sharedPage);
  url.searchParams.set('daily', day);
  return url.href;
}
