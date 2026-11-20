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

const originalFormations: readonly Formation[] = [
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

const newFormations: readonly Formation[] = [
  { title: '印落攻城', enemy: 'regent', cells: [0, 1, 4, 5, 6, 9],
    pieces: ['falling_bell', 'red_seal', 'blood_prism', 'prism_right', 'spark_orb', 'combo_finisher'],
    clue: '前三次直伤减半。让棱镜和镜子先动，再让叠过加成的火花和共鸣器出手。' },
  { title: '钱到钟响', enemy: 'flanks', cells: [1, 2, 5, 6, 9, 10], gold: 18,
    pieces: ['copper_mine', 'coin_mold', 'alchemy_bell', 'gold_cannon', 'greed_amplifier', 'prism_right'],
    clue: '手里先有 25 金，点金铃才会给下方加伤。把重炮留在中间两列。' },
  { title: '毒牙换钱', enemy: 'cistern', cells: [0, 1, 2, 5, 6, 7], gold: 20,
    pieces: ['venom_drop', 'plague_crown', 'gilded_fang', 'toxic_detonator', 'gold_cannon', 'echo_stone'],
    clue: '毒牙在毒多时产钱。试试等它把钱赚到手，再让重炮开火。' },
  { title: '电满再放', enemy: 'armor', cells: [1, 4, 5, 6, 9, 10],
    pieces: ['relay_cross', 'overclock_core', 'echo_stone', 'falling_bell', 'spark_orb', 'ember_amp'],
    clue: '超频核心靠同行同列积攒充能。让小伤害破掉铁甲，再把攒下的充能打出去。' },
  { title: '四金开阵', enemy: 'bell', cells: [1, 2, 3, 6, 7, 10], gold: 4,
    pieces: ['coin_mold', 'tax_collector', 'prism_right', 'copper_mine', 'gold_cannon', 'falling_bell'],
    clue: '祭坛每次要花 4 金。把会反复赚金的钱模接进连锁，再考虑祭坛跟谁相邻。' },
  { title: '竖着打石狮', enemy: 'flanks', cells: [1, 5, 9, 10, 13], tiles: { 5: 'li_fire' },
    pieces: ['falling_bell', 'combo_finisher', 'ember_amp', 'spark_orb', 'echo_stone'],
    clue: '离火位多触发一次。把要吃加成的符文放到增幅之后，落铃能把连锁带到下一行。' },
  { title: '苔上点火', enemy: 'cistern', cells: [1, 4, 5, 6, 9, 13],
    pieces: ['venom_drop', 'moss_brick', 'plague_spreader', 'plague_crown', 'toxic_fuse', 'falling_bell'],
    clue: '苔砖靠邻居叠毒。毒火引信需要先攒毒，再让正上方的落铃把它点着。' },
];
const expandedFormations = [...newFormations, ...originalFormations];

export type DailyPuzzle = { day: string; formation: Formation; hp: number; pieces: string[]; par: number; targetDamage: number; peakDamage: number };
export interface DailyRecord { moves: number; damage: number; peakDamage?: number }
export interface DailyInvite { day: string; score?: DailyRecord }
export type DailyGoal = 'clear' | 'peak';
const dayMs = 86_400_000;
const epoch = '2026-11-14';
const expandedEpoch = '2026-11-21';
const versionFor = (day: string) => day < expandedEpoch ? 'v2' : 'v3';
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

export function dailyLink(page: string, day: string, score?: DailyRecord) {
  const url = new URL(page);
  url.search = '';
  url.hash = '';
  const version = versionFor(day);
  const payload: (string | number)[] = [version, day];
  if (version === 'v3' && score) payload.push(score.moves, score.damage, score.peakDamage ?? score.damage);
  url.searchParams.set('daily', payload.join('.'));
  return url.href;
}

export function readDailyRecord(value: unknown): DailyRecord | undefined {
  if (!value || typeof value !== 'object') return;
  const { moves, damage, peakDamage } = value as DailyRecord;
  if (!(Number.isSafeInteger(moves) && moves > 0 && Number.isSafeInteger(damage) && damage > 0)) return;
  return { moves, damage, ...(typeof peakDamage === 'number' && Number.isSafeInteger(peakDamage) &&
    peakDamage > damage ? { peakDamage } : {}) };
}

export function readDailyLink(raw: string | null, today = shanghaiDay()): DailyInvite | undefined {
  if (!raw || raw.length > 80) return;
  const [version, day, ...claim] = raw.split('.');
  if (!validDailyDate(day) || day > today || version !== versionFor(day)) return;
  if (version === 'v2') return claim.length ? undefined : { day };
  if (claim.length !== 3 || claim.some(value => !/^\d+$/.test(value))) return { day };
  const [moves, damage, peakDamage] = claim.map(Number);
  const score = readDailyRecord({ moves, damage, peakDamage });
  return score ? { day, score } : { day };
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
type Analysis = {
  hp: number; peakDamage: number; pool: Pick<DailyPuzzle, 'pieces' | 'par' | 'targetDamage'>[];
  routes: Map<string, Route>; peakRoutes: Map<string, Route>; damageAt: Map<string, number>;
};
const cache = new WeakMap<Catalog, Map<Formation, Analysis>>();

function findRoutes(positions: { pieces: string[]; damage: number }[], target: number) {
  const routes = new Map<string, Route>();
  const queue = positions.filter(position => position.damage >= target).map(({ pieces, damage }) => {
    routes.set(signature(pieces), { moves: 0, damage });
    return pieces;
  });
  // When two routes take the same number of swaps, propagate the higher score.
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
  return routes;
}

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
  const peakDamage = positions.at(-1)!.damage;
  const routes = findRoutes(positions, hp);
  const eligible = all.flatMap(pieces => {
    const route = routes.get(signature(pieces))!;
    return route.moves ? [{ pieces, par: route.moves, targetDamage: route.damage }] : [];
  });
  const multiStep = eligible.filter(position => position.par >= 2);
  const analysis = { hp, peakDamage, pool: multiStep.length ? multiStep : eligible, routes,
    peakRoutes: findRoutes(positions, peakDamage), damageAt: new Map(positions.map(position => [signature(position.pieces), position.damage])) };
  analyses.set(formation, analysis);
  return analysis;
}

function choosePuzzle(day: string, formation: Formation, offset: number, separateGoals: boolean, catalog: Catalog): DailyPuzzle | undefined {
  const { hp, pool, peakDamage } = analyze(formation, catalog);
  const distinct = separateGoals ? pool.filter(position => position.targetDamage < peakDamage) : [];
  const available = distinct.length > 1 ? distinct : pool;
  if (!available.length) return;
  const setup = available[offset % available.length];
  return { day, formation, hp, peakDamage, ...setup, pieces: [...setup.pieces] };
}

export function dailyPuzzle(day: string, catalog: Catalog): DailyPuzzle | undefined {
  if (!validDailyDate(day)) return;
  const expanded = day >= expandedEpoch;
  const index = (Date.parse(day) - Date.parse(expanded ? expandedEpoch : epoch)) / dayMs;
  const formations = expanded ? expandedFormations : originalFormations;
  const formationIndex = index % formations.length;
  return choosePuzzle(day, formations[formationIndex], Math.floor(index / formations.length) + formationIndex * 17, expanded, catalog);
}

export function relayStage(day: string, weekIndex: number, stage: number, catalog: Catalog) {
  const formation = expandedFormations[(weekIndex + stage * 5) % expandedFormations.length];
  return choosePuzzle(day, formation, weekIndex * 3 + stage * 17 + 1, true, catalog);
}

export function dailyDamageByBudget(puzzle: DailyPuzzle, extra: number, catalog: Catalog) {
  const { damageAt } = analyze(puzzle.formation, catalog);
  const seen = new Set([signature(puzzle.pieces)]);
  let frontier = [puzzle.pieces];
  let best = 0;
  const scores: number[] = [];
  for (let depth = 0; depth <= puzzle.par + extra; depth++) {
    for (const pieces of frontier) best = Math.max(best, damageAt.get(signature(pieces))!);
    if (depth >= puzzle.par) scores.push(best);
    if (depth === puzzle.par + extra) break;
    frontier = frontier.flatMap(swaps).filter(pieces => {
      const key = signature(pieces);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  return scores;
}

export function dailyHint(puzzle: DailyPuzzle, pieces: readonly string[], catalog: Catalog, goal: DailyGoal = 'clear') {
  const analysis = analyze(puzzle.formation, catalog);
  const routes = goal === 'peak' ? analysis.peakRoutes : analysis.routes;
  const route = routes.get(signature(pieces));
  if (!route?.moves) return;
  const next = swaps(pieces).find(candidate => {
    const after = routes.get(signature(candidate));
    return after?.moves === route.moves - 1 && after.damage === route.damage;
  });
  return next ? { index: pieces.findIndex((id, index) => id !== next[index]), remaining: route.moves } : undefined;
}

export function betterDailyRecord(next: DailyRecord, prior?: DailyRecord) {
  if (!prior) return next;
  const best = next.moves < prior.moves || (next.moves === prior.moves && next.damage > prior.damage) ? next : prior;
  const peak = Math.max(next.peakDamage ?? next.damage, prior.peakDamage ?? prior.damage);
  return peak > (best.peakDamage ?? best.damage) ? { ...best, peakDamage: peak } : best;
}

export function dailyInviteScore(puzzle: DailyPuzzle, score?: DailyRecord) {
  if (!score || score.moves < puzzle.par || score.damage < puzzle.hp || (score.peakDamage ?? score.damage) > puzzle.peakDamage) return;
  return score.moves === puzzle.par && score.damage > puzzle.targetDamage ? undefined : score;
}

export function dailyMastery(puzzle: DailyPuzzle, record?: DailyRecord) {
  const score = dailyInviteScore(puzzle, record);
  const fast = score?.moves === puzzle.par && score.damage === puzzle.targetDamage;
  const peak = !!score && (score.peakDamage ?? score.damage) === puzzle.peakDamage;
  return { cleared: !!score, fast, peak, complete: fast && peak };
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
