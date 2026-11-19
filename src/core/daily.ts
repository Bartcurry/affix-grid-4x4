import { simulateBattle } from './battleEngine';
import type { EncounterId } from './expedition';
import { createMulberry32 } from './rng';
import type { BattleEvent, Catalog, Slots } from './types';

export const dailyTemplates = [
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
] as const satisfies readonly { title: string; enemy: EncounterId; hp: number; cells: readonly number[]; pieces: readonly string[]; clue: string }[];

type Template = typeof dailyTemplates[number];
export type DailyPuzzle = { day: string; template: Template; pieces: string[]; par: number };
const dayMs = 86_400_000;
const releaseDay = '2026-11-20';
const signature = (pieces: readonly string[]) => pieces.join('|');

export function shanghaiDay(now = new Date()): string {
  return new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
}

export function validDailyDate(day: unknown): day is string {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day) || day < releaseDay || day > '2099-12-31') return false;
  const value = Date.parse(day);
  return Number.isFinite(value) && new Date(value).toISOString().slice(0, 10) === day;
}

export function runDaily(template: Template, pieces: readonly string[], catalog: Catalog) {
  const board: Slots = Array(16).fill(null);
  template.cells.forEach((cell, index) => { board[cell] = { configId: pieces[index], star: 1 }; });
  const events: BattleEvent[] = simulateBattle({ board, hp: template.hp, gold: 0, encounter: template.enemy }, catalog, () => 1);
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

const pools = new WeakMap<Catalog, Map<Template, { pieces: string[]; par: number }[]>>();

function puzzlePool(template: Template, catalog: Catalog) {
  let cached = pools.get(catalog);
  if (!cached) { cached = new Map(); pools.set(catalog, cached); }
  const prior = cached.get(template);
  if (prior) return prior;
  const all = [[...template.pieces] as string[]];
  const seen = new Set([signature(all[0])]);
  for (const pieces of all) for (const next of swaps(pieces)) {
    const key = signature(next);
    if (!seen.has(key)) { seen.add(key); all.push(next); }
  }
  const winners = all.filter(pieces => runDaily(template, pieces, catalog).result.win);
  const distances = new Map(winners.map(pieces => [signature(pieces), 0]));
  for (const pieces of winners) for (const next of swaps(pieces)) {
    const key = signature(next);
    if (distances.has(key)) continue;
    distances.set(key, distances.get(signature(pieces))! + 1);
    winners.push(next);
  }
  const eligible = all.flatMap(pieces => {
    const par = distances.get(signature(pieces)) ?? 0;
    return par > 0 ? [{ pieces, par }] : [];
  });
  const twoStep = eligible.filter(puzzle => puzzle.par >= 2);
  const pool = twoStep.length ? twoStep : eligible;
  cached.set(template, pool);
  return pool;
}

export function dailyPuzzle(day: string, catalog: Catalog): DailyPuzzle | null {
  if (!validDailyDate(day)) return null;
  const dayIndex = Math.floor((Date.parse(day) - Date.parse(releaseDay)) / dayMs);
  const templateIndex = dayIndex % dailyTemplates.length;
  const template = dailyTemplates[templateIndex];
  const pool = puzzlePool(template, catalog);
  if (!pool.length) return null;
  const rng = createMulberry32(templateIndex + 983);
  const start = Math.floor(rng() * pool.length);
  const setup = pool[(start + Math.floor(dayIndex / dailyTemplates.length)) % pool.length];
  return { day, template, pieces: [...setup.pieces], par: setup.par };
}

export interface DailyRecord { moves: number; damage: number }
export function newDailyRecord(previous: DailyRecord | undefined, next: DailyRecord) {
  return !previous || next.moves < previous.moves || (next.moves === previous.moves && next.damage > previous.damage) ? next : previous;
}

const sharedPage = 'https://bartcurry.github.io/affix-grid-4x4/';
export function dailyLink(day: string): string {
  const url = new URL(sharedPage);
  url.searchParams.set('daily', day);
  return url.href;
}
