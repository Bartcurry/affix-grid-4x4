import { boardShareUrl, type SharedBoard } from './boardShare';
import { CELL_COUNT } from './grid';
import { BENCH_SIZE } from './shopEngine';
import { simulateFormation } from './tactics';
import type { Catalog, Slot } from './types';

export const formationDuelParam = 'duel';
export const maxDuelMoves = 4;
const slots = '0123456789ABCDEFGHIJ';

export interface FormationDuel { moves: number; damage: number }

function slotCode({ zone, index }: Slot) {
  const length = zone === 'board' ? CELL_COUNT : BENCH_SIZE;
  return Number.isInteger(index) && index >= 0 && index < length
    ? slots[index + (zone === 'board' ? 0 : CELL_COUNT)] : undefined;
}

function duelSlot(code: string): Slot {
  const position = slots.indexOf(code);
  return position < CELL_COUNT ? { zone: 'board', index: position } : { zone: 'bench', index: position - CELL_COUNT };
}

export function formationDuelUrl(page: string, original: SharedBoard, moves: readonly (readonly [Slot, Slot])[]) {
  if (!moves.length || moves.length > maxDuelMoves) return;
  let path = '';
  for (const [from, to] of moves) {
    const source = slotCode(from);
    const target = slotCode(to);
    if (!source || !target || source === target) return;
    path += source + target;
  }
  const shared = boardShareUrl(page, original);
  if (!shared) return;
  const url = new URL(shared);
  url.searchParams.set(formationDuelParam, `v1.${path}`);
  return url.href;
}

export function readFormationDuel(raw: string | null, original: SharedBoard, catalog: Catalog): FormationDuel | undefined {
  if (!raw || raw.length > 3 + maxDuelMoves * 2 || !/^v1\.(?:[0-9A-J]{2})+$/.test(raw)) return;
  const path = raw.slice(3);
  const changed = { ...original, board: [...original.board], bench: [...original.bench] };
  for (let offset = 0; offset < path.length; offset += 2) {
    const from = duelSlot(path[offset]);
    const to = duelSlot(path[offset + 1]);
    const piece = changed[from.zone][from.index];
    if (!piece || path[offset] === path[offset + 1]) return;
    changed[from.zone][from.index] = changed[to.zone][to.index];
    changed[to.zone][to.index] = piece;
  }
  const baseline = simulateFormation(original, catalog).events.at(-1);
  const result = simulateFormation(changed, catalog).events.at(-1);
  if (baseline?.type !== 'TURN_RESULT' || result?.type !== 'TURN_RESULT' || !Number.isSafeInteger(result.damage) ||
    result.damage <= baseline.damage) return;
  return { moves: path.length / 2, damage: result.damage };
}
