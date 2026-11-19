import { describe, expect, it } from 'vitest';
import { dailyLink, dailyPuzzle, newDailyRecord, runDaily, shanghaiDay, validDailyDate } from '../core/daily';
import { catalog } from '../data/catalog';

function combinations(pieces: string[], depth: number): string[][] {
  if (!depth) return [pieces];
  const ordered = new Map<string, string[]>();
  for (let left = 0; left < pieces.length; left++) for (let right = left + 1; right < pieces.length; right++) {
    if (pieces[left] === pieces[right]) continue;
    const next = [...pieces];
    [next[left], next[right]] = [next[right], next[left]];
    for (const branch of combinations(next, depth - 1)) ordered.set(branch.join('|'), branch);
  }
  return [...ordered.values()];
}

describe('daily puzzles', () => {
  it('uses midnight in Shanghai and rejects malformed share dates', () => {
    expect(shanghaiDay(new Date('2026-11-20T15:59:59Z'))).toBe('2026-11-20');
    expect(shanghaiDay(new Date('2026-11-20T16:00:00Z'))).toBe('2026-11-21');
    expect(validDailyDate('2028-02-29')).toBe(true);
    expect(validDailyDate('2026-02-31')).toBe(false);
    expect(dailyPuzzle('2026-11-19', catalog)).toBeNull();
    expect(new URL(dailyLink('2026-11-20')).searchParams.get('daily')).toBe('2026-11-20');
  });

  it('rotates templates and returns the same unsolved position with an exact shortest solution', () => {
    const puzzles = [20, 21, 22, 23, 24, 25].map(day => dailyPuzzle(`2026-11-${day}`, catalog)!);
    expect(new Set(puzzles.map(puzzle => puzzle?.template.title)).size).toBe(6);
    for (const puzzle of puzzles) {
      expect(puzzle).not.toBeNull();
      expect(dailyPuzzle(puzzle.day, catalog)).toEqual(puzzle);
      expect(puzzle.par).toBeGreaterThanOrEqual(2);
      for (let depth = 0; depth <= puzzle.par; depth++) {
        const canWin = combinations(puzzle.pieces, depth).some(pieces => runDaily(puzzle.template, pieces, catalog).result.win);
        expect(canWin, `${puzzle.day} after ${depth} moves`).toBe(depth === puzzle.par);
      }
    }
    expect(dailyPuzzle('2026-11-26', catalog)?.pieces).not.toEqual(puzzles[0].pieces);
  });

  it('never replaces a faster local result with extra damage from more moves', () => {
    const best = { moves: 2, damage: 74 };
    expect(newDailyRecord(best, { moves: 3, damage: 99 })).toBe(best);
    expect(newDailyRecord(best, { moves: 2, damage: 72 })).toBe(best);
    expect(newDailyRecord(best, { moves: 2, damage: 75 })).toEqual({ moves: 2, damage: 75 });
  });
});
