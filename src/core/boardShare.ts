import { relics } from './expedition';
import { CELL_COUNT } from './grid';
import { trialAt } from './trials';
import type { BattleJournal, BattleReplay, Catalog, RelicId, Run, Rune, Slots, TileModifier, TileModifierMap } from './types';

export const boardSharePrefix = '#board=';
export type SharedBoard = Pick<Run, 'wave' | 'gold' | 'shield' | 'rngState' | 'board' | 'relics' | 'tileModifiers' | 'trialWave' | 'trialRoute'>;
const revision = 's1';
const alternateRevision = 's2';
const runeTuple = (rune: Rune | null) => rune ? [rune.configId, rune.star, rune.bonusPower ?? 0] : null;
const tileTypes = new Set<TileModifier>(['li_fire', 'xuan_ice', 'spirit_gathering']);
const whole = (value: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= maximum;

function readReplay(rngState: unknown, shield: unknown, owned: unknown, tiles: unknown): BattleReplay | undefined {
  if (!whole(rngState, 0, 0xffffffff) || !whole(shield, 0, 3) || !Array.isArray(owned) || owned.length > Object.keys(relics).length ||
    !owned.every(id => typeof id === 'string' && Object.hasOwn(relics, id)) || new Set(owned).size !== owned.length ||
    !Array.isArray(tiles) || tiles.length > CELL_COUNT) return;
  const tileModifiers: TileModifierMap = {};
  for (const tile of tiles) {
    if (!Array.isArray(tile) || tile.length !== 2 || !whole(tile[0], 0, CELL_COUNT - 1) ||
      !tileTypes.has(tile[1]) || Object.hasOwn(tileModifiers, tile[0])) return;
    tileModifiers[tile[0]] = tile[1];
  }
  return { rngState, shield, relics: owned as RelicId[], tileModifiers };
}

export function readJournalReplay(raw: unknown) {
  if (!raw || typeof raw !== 'object') return;
  const { rngState, shield, relics, tileModifiers } = raw as BattleReplay;
  if (!tileModifiers || typeof tileModifiers !== 'object' || Array.isArray(tileModifiers)) return;
  return readReplay(rngState, shield, relics, Object.entries(tileModifiers).map(([cell, modifier]) => [Number(cell), modifier]));
}

export function boardFromJournal(journal?: BattleJournal): SharedBoard | undefined {
  if (!journal?.replay || !whole(journal.wave, 1) || !whole(journal.gold, 0) ||
    !journal.board.some(Boolean) || journal.board.some(rune => rune && !whole(rune.bonusPower ?? 0, 0))) return;
  const { wave, gold, board, trialWave, trialRoute, replay } = journal;
  return { ...replay, wave, gold, board, trialWave, trialRoute };
}

export function boardShareUrl(page: string, run: SharedBoard): string | null {
  const url = new URL(page);
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !run.board.some(Boolean)) return null;
  const route = run.trialWave === run.wave ? run.trialRoute === 'alternate' ? 2 : 1 : 0;
  const raw = [route === 2 ? alternateRevision : revision, run.wave, run.gold, run.shield, run.rngState, route, run.relics,
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
    if ((version !== revision && version !== alternateRevision) || !whole(wave, 1) || !whole(gold, 0) ||
      !(version === alternateRevision ? trial === 2 : whole(trial, 0, 1)) || (trial && !trialAt(wave, trial === 2 ? 'alternate' : undefined)) ||
      !Array.isArray(pieces) || pieces.length !== CELL_COUNT) return null;
    const replay = readReplay(rngState, shield, owned, tiles);
    if (!replay) return null;
    const board: Slots = [];
    for (const piece of pieces) {
      if (piece === null) { board.push(null); continue; }
      if (!Array.isArray(piece) || piece.length !== 3 || typeof piece[0] !== 'string' || !Object.hasOwn(catalog, piece[0]) ||
        !whole(piece[1], 1, 3) || !whole(piece[2], 0)) return null;
      board.push({ configId: piece[0], star: piece[1] as Rune['star'], ...(piece[2] ? { bonusPower: piece[2] } : {}) });
    }
    if (!board.some(Boolean)) return null;
    return { ...replay, wave, gold, board, trialWave: trial ? wave : undefined,
      ...(trial === 2 ? { trialRoute: 'alternate' } : {}) };
  } catch {
    return null;
  }
}
