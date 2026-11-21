import { dailyDamageByBudget, relayStage, runDaily, shanghaiDay, validDailyDate, type DailyPuzzle } from './daily';
import { campaignUrl } from './sitePaths';
import type { Catalog } from './types';

const firstWeek = '2026-11-16';
const weekMs = 7 * 86_400_000;
const extraMoves = 2;
export const relayParam = 'relay';

export type RelayMove = [number, number];
export type RelayScore = { damage: number; moves: number };
export type RelayDraft = { spent: RelayMove[][]; current: RelayMove[] };
export type Relay = {
  day: string;
  stages: DailyPuzzle[];
  minimum: number;
  budget: number;
  ceilings: number[];
  remainingCeilings: number[][];
};

export function relayWeek(day = shanghaiDay()) {
  const time = Date.parse(day);
  const elapsed = Math.floor((time - Date.parse(firstWeek)) / weekMs);
  return new Date(Date.parse(firstWeek) + elapsed * weekMs).toISOString().slice(0, 10);
}

function validWeek(day: unknown): day is string {
  return validDailyDate(day) && day >= firstWeek && relayWeek(day) === day;
}

export function weeklyRelay(day: string, catalog: Catalog): Relay | undefined {
  if (!validWeek(day)) return;
  const weekIndex = (Date.parse(day) - Date.parse(firstWeek)) / weekMs;
  const stages = [0, 1, 2].flatMap(index => relayStage(day, weekIndex, index, catalog) ?? []);
  if (stages.length !== 3) return;
  const minimum = stages.reduce((total, stage) => total + stage.par, 0);
  const remainingCeilings = Array<number[]>(stages.length + 1);
  remainingCeilings[stages.length] = Array<number>(extraMoves + 1).fill(0);
  for (let index = stages.length - 1; index >= 0; index--) {
    const scores = dailyDamageByBudget(stages[index], extraMoves, catalog);
    const later = remainingCeilings[index + 1];
    remainingCeilings[index] = later.map((_, allowance) => Math.max(...scores.slice(0, allowance + 1)
      .map((score, used) => score + later[allowance - used])));
  }
  return { day, stages, minimum, budget: minimum + extraMoves, ceilings: remainingCeilings[0], remainingCeilings };
}

export function relayOutlook(relay: Relay, locked: number, score: RelayScore): RelayScore {
  const reserved = relay.stages.slice(locked).reduce((total, stage) => total + stage.par, 0);
  const remaining = relay.remainingCeilings[locked];
  const maximum = remaining[relay.budget - score.moves - reserved];
  return { damage: score.damage + maximum, moves: score.moves + reserved + remaining.indexOf(maximum) };
}

export function compareRelayScores(left: RelayScore, right: RelayScore) {
  return left.damage - right.damage || right.moves - left.moves;
}

export function stageAllowance(relay: Relay, spent: readonly RelayMove[][]) {
  const used = spent.reduce((total, path) => total + path.length, 0);
  const reserved = relay.stages.slice(spent.length + 1).reduce((total, stage) => total + stage.par, 0);
  return relay.budget - used - reserved;
}

export function relayPosition(stage: DailyPuzzle, moves: readonly RelayMove[]) {
  const pieces = [...stage.pieces];
  for (const [a, b] of moves) {
    if (!Number.isInteger(a) || a < 0 || a >= pieces.length || !Number.isInteger(b) || b < 0 || b >= pieces.length || pieces[a] === pieces[b]) return;
    [pieces[a], pieces[b]] = [pieces[b], pieces[a]];
  }
  return pieces;
}

export function restoreRelayDraft(relay: Relay, raw: unknown, catalog: Catalog) {
  if (!raw || typeof raw !== 'object') return;
  const { spent, current } = raw as RelayDraft;
  const isPath = (path: unknown): path is RelayMove[] =>
    Array.isArray(path) && path.every(move => Array.isArray(move) && move.length === 2);
  if (!Array.isArray(spent) || spent.length > relay.stages.length || !isPath(current)) return;
  const results: RelayScore[] = [];
  for (let index = 0; index < spent.length; index++) {
    const stage = relay.stages[index];
    const path = spent[index];
    if (!isPath(path) || path.length > stageAllowance(relay, spent.slice(0, index))) return;
    const pieces = relayPosition(stage, path);
    if (!pieces) return;
    const outcome = runDaily(stage.formation, stage.hp, pieces, catalog);
    if (!outcome.win) return;
    results.push({ damage: outcome.damage, moves: path.length });
  }
  const stage = relay.stages[spent.length];
  if (stage ? current.length > stageAllowance(relay, spent) || !relayPosition(stage, current) : current.length !== 0) return;
  return { draft: { spent, current }, results };
}

export function validRelayScore(relay: Relay, score?: RelayScore) {
  if (!score || !Number.isSafeInteger(score.moves) || !Number.isSafeInteger(score.damage) ||
    score.moves < relay.minimum || score.moves > relay.budget) return;
  const requiredDamage = relay.stages.reduce((total, stage) => total + stage.hp, 0);
  return score.damage >= requiredDamage && score.damage <= relay.ceilings[score.moves - relay.minimum] ? score : undefined;
}

export function readRelayLink(raw: string | null, today = shanghaiDay()) {
  if (!raw || raw.length > 65) return;
  const [version, day, moves, damage, ...rest] = raw.split('.');
  if (version !== 'v1' || !validWeek(day) || day > today || rest.length) return;
  const score = /^\d+$/.test(moves ?? '') && /^\d+$/.test(damage ?? '') ? { moves: Number(moves), damage: Number(damage) } : undefined;
  return { day, score };
}

export function relayLink(page: string, day: string, score?: RelayScore) {
  const url = campaignUrl(page);
  url.search = '';
  url.hash = '';
  url.searchParams.set(relayParam, score ? `v1.${day}.${score.moves}.${score.damage}` : `v1.${day}`);
  return url.href;
}
