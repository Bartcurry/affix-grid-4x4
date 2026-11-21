import { relics } from './expedition';
import { bountyAt } from './bounties';
import { CELL_COUNT } from './grid';
import { isOpening } from './openings';
import { BENCH_SIZE } from './shopEngine';
import type { BountyRoute, Catalog, RelicId, Run, Rune, Slots, TileModifier, TileModifierMap } from './types';

export const boardShareParam = 'board';
const revision = 's3';
const bountyRevision = 's4';
const finaleRevision = 's5';
const expertRevision = 's6';
const tileTypes = new Set<TileModifier>(['li_fire', 'xuan_ice', 'spirit_gathering']);
const maxTokenLength = 2590;
const tuple = (rune: Rune | null) => rune ? [rune.configId, rune.star, rune.bonusPower ?? 0] : null;
const integer = (value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;

export type SharedBoard = Pick<Run, 'opening' | 'wave' | 'gold' | 'shield' | 'board' | 'bench' |
  'rngState' | 'relics' | 'tileModifiers' | 'enableSynergies' | 'bountyRoute' | 'finaleRule' | 'difficulty'>;

const pieceKey = (piece: Rune | null) => JSON.stringify(tuple(piece));

export function sameBattleSetup(a: SharedBoard, b: SharedBoard) {
  return a.wave === b.wave && a.gold === b.gold && a.shield === b.shield && a.rngState === b.rngState &&
    (a.difficulty === 'expert') === (b.difficulty === 'expert') &&
    (a.wave !== 20 || a.finaleRule === b.finaleRule) &&
    a.opening === b.opening && a.bountyRoute === b.bountyRoute && (a.enableSynergies !== false) === (b.enableSynergies !== false) &&
    [...a.relics].sort().join('|') === [...b.relics].sort().join('|') &&
    a.board.every((_, index) => a.tileModifiers[index] === b.tileModifiers[index]) &&
    [...a.board, ...a.bench].map(pieceKey).sort().join('|') === [...b.board, ...b.bench].map(pieceKey).sort().join('|');
}

export function sameFormation(a: SharedBoard, b: SharedBoard) {
  return a.board.every((piece, index) => pieceKey(piece) === pieceKey(b.board[index])) &&
    a.bench.every((piece, index) => pieceKey(piece) === pieceKey(b.bench[index]));
}

export function encodeBoardToken(run: SharedBoard) {
  try {
    const route = run.bountyRoute;
    const finale = run.wave === 20 && run.finaleRule === 1;
    const expert = run.difficulty === 'expert';
    const raw = [expert ? expertRevision : route ? bountyRevision : finale ? finaleRevision : revision, run.opening, run.wave, run.gold, run.shield, run.rngState, run.enableSynergies !== false, run.relics,
      Object.entries(run.tileModifiers).map(([index, tile]) => [Number(index), tile]), run.board.map(tuple), run.bench.map(tuple),
      ...(expert ? [route ?? null, finale] : route ? [route] : [])];
    const token = btoa(JSON.stringify(raw)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
    return token.length <= maxTokenLength ? token : undefined;
  } catch {
    return;
  }
}

export function boardShareUrl(page: string, run: SharedBoard) {
  const url = new URL(page);
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || (!run.board.some(Boolean) && !run.bench.some(Boolean))) return;
  const token = encodeBoardToken(run);
  if (!token) return;
  url.search = '';
  url.hash = '';
  url.searchParams.set(boardShareParam, token);
  return url.href;
}

export function readSharedBoard(token: string | null, catalog: Catalog, allowEmpty = false): SharedBoard | undefined {
  if (!token || token.length > maxTokenLength || !/^[A-Za-z0-9_-]+$/.test(token)) return;
  try {
    const raw: unknown = JSON.parse(atob(token.replaceAll('-', '+').replaceAll('_', '/')));
    if (!Array.isArray(raw)) return;
    const [version, opening, wave, gold, shield, rngState, enableSynergies, owned, tiles, rawBoard, rawBench, route, sealed] = raw;
    const standard = version === revision && raw.length === 11;
    const bounty = version === bountyRevision && raw.length === 12 && bountyAt(wave, route);
    const finale = version === finaleRevision && raw.length === 11 && wave === 20;
    const expert = version === expertRevision && raw.length === 13 && (route === null || !!bountyAt(wave, route)) &&
      typeof sealed === 'boolean' && (!sealed || wave === 20);
    if ((!standard && !bounty && !finale && !expert) || !isOpening(opening) || !integer(wave, 1) || !integer(gold, 0) || !integer(shield, 0, 3) ||
      !integer(rngState, 0, 0xffffffff) || typeof enableSynergies !== 'boolean' ||
      !Array.isArray(owned) || owned.length > Object.keys(relics).length || new Set(owned).size !== owned.length ||
      !owned.every(id => typeof id === 'string' && Object.hasOwn(relics, id)) ||
      !Array.isArray(tiles) || tiles.length > CELL_COUNT) return;
    const tileModifiers: TileModifierMap = {};
    for (const tile of tiles) {
      if (!Array.isArray(tile) || tile.length !== 2 || !integer(tile[0], 0, CELL_COUNT - 1) ||
        !tileTypes.has(tile[1]) || Object.hasOwn(tileModifiers, tile[0])) return;
      tileModifiers[tile[0]] = tile[1];
    }
    const board = readSlots(rawBoard, CELL_COUNT, catalog);
    const bench = readSlots(rawBench, BENCH_SIZE, catalog);
    if (!board || !bench || (!allowEmpty && !board.some(Boolean) && !bench.some(Boolean))) return;
    return { opening, wave, gold, shield, rngState, enableSynergies, relics: owned as RelicId[], tileModifiers, board, bench,
      ...(expert ? { difficulty: 'expert' as const } : {}),
      ...(bounty || (expert && route !== null) ? { bountyRoute: route as BountyRoute } : {}),
      ...(finale || (expert && sealed) ? { finaleRule: 1 as const } : {}) };
  } catch {
    return;
  }
}

function readSlots(raw: unknown, length: number, catalog: Catalog): Slots | undefined {
  if (!Array.isArray(raw) || raw.length !== length) return;
  const slots: Slots = [];
  for (const item of raw) {
    if (item === null) { slots.push(null); continue; }
    if (!Array.isArray(item) || item.length !== 3 || typeof item[0] !== 'string' || !Object.hasOwn(catalog, item[0]) ||
      !integer(item[1], 1, 3) || !integer(item[2], 0)) return;
    slots.push({ configId: item[0], star: item[1] as Rune['star'], ...(item[2] ? { bonusPower: item[2] } : {}) });
  }
  return slots;
}
