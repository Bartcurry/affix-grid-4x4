import type { Scope } from './types';

export const GRID_SIZE = 4;
export const CELL_COUNT = GRID_SIZE ** 2;

export function toIndex(row: number, col: number): number {
  return Number.isInteger(row) && Number.isInteger(col) && row >= 0 && row < GRID_SIZE && col >= 0 && col < GRID_SIZE
    ? row * GRID_SIZE + col : -1;
}

export const toCoords = (index: number) => ({ row: Math.floor(index / GRID_SIZE), col: index % GRID_SIZE });

const all = Array.from({ length: CELL_COUNT }, (_, index) => index);
const scopes: Scope[] = ['SELF', 'LEFT', 'RIGHT', 'ADJACENT_4', 'SAME_ROW', 'SAME_COL', 'ROW_COL', 'ALL'];
const targets = Object.fromEntries(scopes.map(scope => [scope, all.map(index => {
  const { row, col } = toCoords(index);
  switch (scope) {
    case 'SELF': return [index];
    case 'LEFT': return [toIndex(row, col - 1)].filter(target => target >= 0);
    case 'RIGHT': return [toIndex(row, col + 1)].filter(target => target >= 0);
    case 'ADJACENT_4': return [toIndex(row - 1, col), toIndex(row + 1, col), toIndex(row, col - 1), toIndex(row, col + 1)].filter(target => target >= 0);
    case 'SAME_ROW': return all.filter(target => toCoords(target).row === row);
    case 'SAME_COL': return all.filter(target => toCoords(target).col === col);
    case 'ROW_COL': return all.filter(target => target !== index && (toCoords(target).row === row || toCoords(target).col === col));
    case 'ALL': return all;
  }
})])) as Record<Scope, number[][]>;

export const resolveTargets = (index: number, scope: Scope): readonly number[] => targets[scope][index] ?? [];
