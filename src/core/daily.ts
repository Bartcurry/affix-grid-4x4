import { simulateBattle } from './battleEngine';
import type { EncounterId } from './expedition';
import type { Catalog, Slots, TileModifierMap } from './types';

interface Formation {
  title: string;
  enemy: EncounterId;
  cells: readonly number[];
  pieces: readonly string[];
  clue: string;
  gold?: number;
  tiles?: TileModifierMap;
}

const formations: readonly Formation[] = [
  { title: '落铃过桥', enemy: 'bell', cells: [1, 2, 5, 6, 10],
    pieces: ['falling_bell', 'prism_right', 'spark_orb', 'spark_orb', 'echo_stone'],
    clue: '落铃只敲正下方。让下面的符文继续往右接，再把回响放到电火花右边。' },
  { title: '苔砖引线', enemy: 'cistern', cells: [5, 6, 9, 10, 14],
    pieces: ['moss_brick', 'venom_drop', 'toxic_fuse', 'relay_cross', 'falling_bell'],
    clue: '苔砖靠邻格触发叠毒。让引信在攒出毒之后接到连锁。' },
  { title: '凑足二十五', enemy: 'flanks', cells: [0, 1, 2, 5, 6], gold: 21,
    pieces: ['copper_mine', 'coin_mold', 'gold_cannon', 'alchemy_bell', 'greed_amplifier'],
    clue: '先凑到 25 金，再用点金铃触发正下方的重炮。石狮的中间两列也更好打。' },
  { title: '两排借势', enemy: 'sentry', cells: [0, 1, 4, 5, 9],
    pieces: ['blood_prism', 'red_seal', 'ember_amp', 'spark_orb', 'combo_finisher'],
    clue: '增幅要赶在伤害之前。把火漆印放在主力上方，把增幅棱镜贴在旁边。' },
  { title: '先卸铁甲', enemy: 'armor', cells: [0, 1, 4, 5, 6],
    pieces: ['prism_right', 'falling_bell', 'overclock_core', 'spark_orb', 'echo_stone'],
    clue: '前两次命中减半。小伤害先破甲，让超频核心晚点结算充能。' },
  { title: '毒炉开盖', enemy: 'regent', cells: [0, 1, 2, 3, 5],
    pieces: ['venom_drop', 'plague_crown', 'catalyst_flask', 'toxic_detonator', 'gilded_fang'],
    clue: '先倒毒，再催化，最后揭开引爆器。回合末的剧毒能绕开门甲。' },
  { title: '阵尾收官', enemy: 'flanks', cells: [1, 2, 5, 9, 10], tiles: { 5: 'li_fire' },
    pieces: ['combo_finisher', 'overclock_core', 'relay_cross', 'falling_bell', 'prism_right'],
    clue: '离火位会多触发一次。把触发次数留给阵尾，再交给终焉共鸣器。' },
];

export type DailyPuzzle = { day: string; formation: Formation; hp: number; pieces: string[]; par: number; targetDamage: number };
export interface DailyRecord { moves: number; damage: number }
const dayMs = 86_400_000;
const epoch = '2026-11-14';
const version = 'v2';
const signature = (pieces: readonly string[]) => pieces.join('|');
const dayOffset = (day: string, offset: number) => new Date(Date.parse(day) + offset * dayMs).toISOString().slice(0, 10);

export function shanghaiDay(now = new Date()) {
  return new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
}

export function validDailyDate(day: unknown): day is string {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day) || day < epoch || day > '2099-12-31') return false;
  const value = Date.parse(day);
  return Number.isFinite(value) && new Date(value).toISOString().slice(0, 10) === day;
}

export function dailyLink(page: string, day: string) {
  const url = new URL(page);
  url.search = '';
  url.hash = '';
  url.searchParams.set('daily', `${version}.${day}`);
  return url.href;
}

export function readDailyLink(raw: string | null, today = shanghaiDay()) {
  if (!raw?.startsWith(`${version}.`)) return;
  const day = raw.slice(version.length + 1);
  return validDailyDate(day) && day <= today ? day : undefined;
}

export function runDaily(formation: Formation, hp: number, pieces: readonly string[], catalog: Catalog) {
  const board: Slots = Array(16).fill(null);
  formation.cells.forEach((cell, index) => { board[cell] = { configId: pieces[index], star: 1 }; });
  const events = simulateBattle({ board, hp, gold: formation.gold ?? 0, encounter: formation.enemy,
    tileModifiers: formation.tiles, enableSynergies: true }, catalog, () => 1);
  const result = events.at(-1);
  if (result?.type !== 'TURN_RESULT') throw new Error('Missing daily result');
  return result;
}

function swaps(pieces: readonly string[]) {
  const alternatives: string[][] = [];
  for (let left = 0; left < pieces.length; left++) for (let right = left + 1; right < pieces.length; right++) {
    if (pieces[left] === pieces[right]) continue;
    const next = [...pieces];
    [next[left], next[right]] = [next[right], next[left]];
    alternatives.push(next);
  }
  return alternatives;
}

type Route = { moves: number; damage: number };
type Analysis = { hp: number; pool: Pick<DailyPuzzle, 'pieces' | 'par' | 'targetDamage'>[]; routes: Map<string, Route> };
const cache = new WeakMap<Catalog, Map<Formation, Analysis>>();

function analyze(formation: Formation, catalog: Catalog) {
  let analyses = cache.get(catalog);
  if (!analyses) { analyses = new Map(); cache.set(catalog, analyses); }
  const prior = analyses.get(formation);
  if (prior) return prior;
  const all = [[...formation.pieces]];
  const seen = new Set([signature(all[0])]);
  for (const pieces of all) for (const next of swaps(pieces)) {
    const key = signature(next);
    if (!seen.has(key)) { seen.add(key); all.push(next); }
  }
  // With no HP-dependent relics, these encounters keep resolving hits after reaching zero.
  const positions = all.map(pieces => ({ pieces, damage: runDaily(formation, Number.MAX_SAFE_INTEGER, pieces, catalog).damage }))
    .sort((left, right) => left.damage - right.damage);
  const hp = positions[Math.floor((positions.length - 1) * .82)].damage;
  const routes = new Map<string, Route>();
  const queue = positions.filter(position => position.damage >= hp).map(({ pieces, damage }) => {
    routes.set(signature(pieces), { moves: 0, damage });
    return pieces;
  });
  // Propagate higher damage only along paths of equal minimum length.
  for (const pieces of queue) {
    const route = routes.get(signature(pieces))!;
    const moves = route.moves + 1;
    for (const next of swaps(pieces)) {
      const key = signature(next);
      const known = routes.get(key);
      if (!known) { routes.set(key, { moves, damage: route.damage }); queue.push(next); }
      else if (known.moves === moves) known.damage = Math.max(known.damage, route.damage);
    }
  }
  const eligible = all.flatMap(pieces => {
    const route = routes.get(signature(pieces))!;
    return route.moves ? [{ pieces, par: route.moves, targetDamage: route.damage }] : [];
  });
  const multiStep = eligible.filter(position => position.par >= 2);
  const analysis = { hp, pool: multiStep.length ? multiStep : eligible, routes };
  analyses.set(formation, analysis);
  return analysis;
}

export function dailyPuzzle(day: string, catalog: Catalog): DailyPuzzle | undefined {
  if (!validDailyDate(day)) return;
  const index = (Date.parse(day) - Date.parse(epoch)) / dayMs;
  const formationIndex = index % formations.length;
  const formation = formations[formationIndex];
  const { hp, pool } = analyze(formation, catalog);
  if (!pool.length) return;
  const offset = Math.floor(index / formations.length) + formationIndex * 17;
  const setup = pool[offset % pool.length];
  return { day, formation, hp, ...setup, pieces: [...setup.pieces] };
}

export function dailyHint(puzzle: DailyPuzzle, pieces: readonly string[], catalog: Catalog) {
  const { routes } = analyze(puzzle.formation, catalog);
  const route = routes.get(signature(pieces));
  if (!route?.moves) return;
  const next = swaps(pieces).find(candidate => {
    const after = routes.get(signature(candidate));
    return after?.moves === route.moves - 1 && after.damage === route.damage;
  });
  return next ? { index: pieces.findIndex((id, index) => id !== next[index]), remaining: route.moves } : undefined;
}

export function betterDailyRecord(next: DailyRecord, prior?: DailyRecord) {
  return !prior || next.moves < prior.moves || (next.moves === prior.moves && next.damage > prior.damage) ? next : prior;
}

export function recentDailyDates(today: string) {
  return Array.from({ length: 7 }, (_, index) => dayOffset(today, -index)).filter(validDailyDate);
}

export function dailyStreak(records: ReadonlyMap<string, DailyRecord>, today: string) {
  let day = records.has(today) ? today : dayOffset(today, -1);
  let count = 0;
  while (validDailyDate(day) && records.has(day)) { count++; day = dayOffset(day, -1); }
  return count;
}
