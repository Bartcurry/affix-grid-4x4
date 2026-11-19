import { describe, expect, it } from 'vitest';
import { dailyLink, dailyPuzzle, dailyStreak, newDailyRecord, recentDailyDates, runDaily, shanghaiDay, validDailyDate } from '../core/daily';
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

  it('keeps the first schedule and adds four solvable five-rune puzzles with exact distances', () => {
    expect(dailyPuzzle('2026-11-20', catalog)).toMatchObject({ template: { title: '井底回声', hp: 61 } });
    expect(dailyPuzzle('2026-11-25', catalog)).toMatchObject({ template: { title: '石门留毒', hp: 45 } });
    const expanded = [26, 27, 28, 29].map(day => dailyPuzzle(`2026-11-${day}`, catalog)!);
    expect(expanded.map(puzzle => puzzle.template.title)).toEqual(['离火留声', '开炉凑二十五', '半扇城门', '苔阶引信']);
    for (const puzzle of expanded) {
      expect(puzzle.pieces).toHaveLength(5);
      expect(puzzle.par).toBeGreaterThanOrEqual(2);
      for (let depth = 0; depth <= puzzle.par; depth++) {
        expect(combinations(puzzle.pieces, depth).some(pieces => runDaily(puzzle.template, pieces, catalog).result.win), puzzle.day)
          .toBe(depth === puzzle.par);
      }
    }
    const [fire, gold, gate, poison] = expanded;
    const winning = expanded.map(puzzle => combinations(puzzle.pieces, puzzle.par).map(pieces => runDaily(puzzle.template, pieces, catalog)).filter(attempt => attempt.result.win));
    expect(winning[0].some(attempt => attempt.events.some(event => event.type === 'CELL_ACTIVATE' && event.index === 5 && event.isChain))).toBe(true);
    expect(gold.template.gold).toBe(21);
    expect(winning[1].every(attempt => attempt.events.some(event => event.type === 'RUNE_STATE' && attempt.board[event.index]?.configId === 'gold_cannon' && event.state.tempMult > 1))).toBe(true);
    expect(winning[2].every(attempt => attempt.events.some(event => event.type === 'DAMAGE' && event.breach))).toBe(true);
    expect(winning[3].every(attempt => attempt.events.some(event => event.type === 'DAMAGE' && event.source !== null && attempt.board[event.source]?.configId === 'toxic_fuse'))).toBe(true);
    expect(fire.template.tileModifiers?.[5]).toBe('li_fire');
    expect(gate.template.enemy).toBe('last_gate');
    expect(poison.template.pieces).toContain('toxic_fuse');
  });

  it('shows only released dates in the archive and bridges a missing day when solved', () => {
    expect(recentDailyDates('2026-11-19')).toEqual([]);
    expect(recentDailyDates('2026-11-21')).toEqual(['2026-11-20', '2026-11-21']);
    expect(recentDailyDates('2026-12-02')).toEqual(['2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02']);
    const score = { moves: 2, damage: 150 };
    const records = new Map([['2026-11-28', score], ['2026-11-30', score], ['2026-12-01', score], ['2026-12-03', score]]);
    expect(dailyStreak(records, '2026-12-02')).toBe(2);
    records.set('2026-11-29', score);
    expect(dailyStreak(records, '2026-12-02')).toBe(4);
    records.set('2026-12-02', score);
    expect(dailyStreak(records, '2026-12-02')).toBe(5);
  });
});
