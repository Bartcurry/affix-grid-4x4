import { relics } from './expedition';
import { CELL_COUNT } from './grid';
import { trialAt } from './trials';
import type { Catalog, RelicId, Run, Rune, Slots, TileModifier, TileModifierMap } from './types';

export const boardSharePrefix = '#board=';
export type SharedBoard = Pick<Run, 'wave' | 'gold' | 'shield' | 'rngState' | 'board' | 'relics' | 'tileModifiers' | 'trialWave'>;
const revision = 's1';
const runeTuple = (rune: Rune | null) => rune ? [rune.configId, rune.star, rune.bonusPower ?? 0] : null;
const tileTypes = new Set<TileModifier>(['li_fire', 'xuan_ice', 'spirit_gathering']);
const whole = (value: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= maximum;

export function boardShareUrl(page: string, run: SharedBoard): string | null {
  const url = new URL(page);
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !run.board.some(Boolean)) return null;
  const raw = [revision, run.wave, run.gold, run.shield, run.rngState, Number(run.trialWave === run.wave), run.relics,
    Object.entries(run.tileModifiers).map(([cell, modifier]) => [Number(cell), modifier]), run.board.map(runeTuple)];
  url.search = '';
  url.hash = `${boardSharePrefix}${btoa(JSON.stringify(raw)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')}`;
  return url.href;
}

export function readSharedBoard(hash: string, catalog: Catalog): SharedBoard | null {
  if (!hash.startsWith(boardSharePrefix) || hash.length > 2600) return null;
  const encoded = hash.slice(boardSharePrefix.length);
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) return null;
  try {
    const raw: unknown = JSON.parse(atob(encoded.replaceAll('-', '+').replaceAll('_', '/')));
    if (!Array.isArray(raw) || raw.length !== 9) return null;
    const [version, wave, gold, shield, rngState, trial, owned, tiles, pieces] = raw;
    if (version !== revision || !whole(wave, 1) || !whole(gold, 0) || !whole(shield, 0, 3) || !whole(rngState, 0, 0xffffffff) ||
      !whole(trial, 0, 1) || (trial && !trialAt(wave)) || !Array.isArray(owned) || owned.length > Object.keys(relics).length ||
      !owned.every(id => typeof id === 'string' && Object.hasOwn(relics, id)) || new Set(owned).size !== owned.length ||
      !Array.isArray(tiles) || tiles.length > CELL_COUNT || !Array.isArray(pieces) || pieces.length !== CELL_COUNT) return null;
    const tileModifiers: TileModifierMap = {};
    for (const tile of tiles) {
      if (!Array.isArray(tile) || tile.length !== 2 || !whole(tile[0], 0, CELL_COUNT - 1) ||
        !tileTypes.has(tile[1]) || Object.hasOwn(tileModifiers, tile[0])) return null;
      tileModifiers[tile[0]] = tile[1];
    }
    const board: Slots = [];
    for (const piece of pieces) {
      if (piece === null) { board.push(null); continue; }
      if (!Array.isArray(piece) || piece.length !== 3 || typeof piece[0] !== 'string' || !Object.hasOwn(catalog, piece[0]) ||
        !whole(piece[1], 1, 3) || !whole(piece[2], 0)) return null;
      board.push({ configId: piece[0], star: piece[1] as Rune['star'], ...(piece[2] ? { bonusPower: piece[2] } : {}) });
    }
    if (!board.some(Boolean)) return null;
    return { wave, gold, shield, rngState, board, relics: owned as RelicId[], tileModifiers, trialWave: trial ? wave : undefined };
  } catch {
    return null;
  }
}
