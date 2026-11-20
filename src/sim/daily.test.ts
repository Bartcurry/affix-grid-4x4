import { describe, expect, it } from 'vitest';
import { betterDailyRecord, dailyHint, dailyInviteScore, dailyLink, dailyPuzzle, dailyStreak, readDailyLink, readDailyRecord, recentDailyDates, runDaily, shanghaiDay } from '../core/daily';
import { catalog } from '../data/catalog';

function layer(positions: string[][]) {
  const results = new Map<string, string[]>();
  for (const pieces of positions) for (let i = 0; i < pieces.length; i++) for (let j = i + 1; j < pieces.length; j++) {
    if (pieces[i] === pieces[j]) continue;
    const swapped = [...pieces];
    [swapped[i], swapped[j]] = [swapped[j], swapped[i]];
    results.set(swapped.join('|'), swapped);
  }
  return [...results.values()];
}

describe('daily formations', () => {
  it('uses Beijing midnight and keeps old or future links away from the current rules', () => {
    expect(shanghaiDay(new Date('2026-11-20T15:59:59Z'))).toBe('2026-11-20');
    expect(shanghaiDay(new Date('2026-11-20T16:00:00Z'))).toBe('2026-11-21');
    const url = new URL(dailyLink('https://example.com/game/?challenge=old#board', '2026-11-20'));
    expect(url.pathname).toBe('/game/');
    expect(url.hash).toBe('');
    expect(readDailyLink(url.searchParams.get('daily'), '2026-11-20')).toEqual({ day: '2026-11-20' });
    expect(readDailyLink('2026-11-20', '2026-11-20')).toBeUndefined();
    expect(readDailyLink('v2.2026-11-21', '2026-11-20')).toBeUndefined();
    expect(readDailyLink('v2.2026-11-31', '2026-12-01')).toBeUndefined();
  });

  it('provides seven distinct formations with exact shortest solves and a different setup the next week', () => {
    const dates = recentDailyDates('2026-11-20');
    const puzzles = dates.map(day => dailyPuzzle(day, catalog)!);
    expect(new Set(puzzles.map(puzzle => puzzle.formation.title)).size).toBe(7);
    for (const puzzle of puzzles) {
      expect(dailyPuzzle(puzzle.day, catalog)).toEqual(puzzle);
      expect(puzzle.par).toBeGreaterThanOrEqual(2);
      const nextWeek = new Date(Date.parse(puzzle.day) + 7 * 86_400_000).toISOString().slice(0, 10);
      expect(dailyPuzzle(nextWeek, catalog)?.pieces).not.toEqual(puzzle.pieces);
      let setups = [puzzle.pieces];
      for (let step = 0; step <= puzzle.par; step++) {
        const wins = setups.map(pieces => runDaily(puzzle.formation, puzzle.hp, pieces, catalog)).filter(result => result.win);
        if (step < puzzle.par) expect(wins, puzzle.day).toHaveLength(0);
        else expect(Math.max(...wins.map(win => win.damage)), puzzle.day).toBe(puzzle.targetDamage);
        setups = layer(setups);
      }
      const hint = dailyHint(puzzle, puzzle.pieces, catalog);
      expect(hint?.remaining).toBe(puzzle.par);
      expect(hint?.index).toBeGreaterThanOrEqual(0);
    }
  });

  it('checks both targets across the 14-format schedule and rotates each starting board', () => {
    const dayAt = (offset: number) => new Date(Date.UTC(2026, 10, 21 + offset)).toISOString().slice(0, 10);
    const puzzles = Array.from({ length: 14 }, (_, offset) => dailyPuzzle(dayAt(offset), catalog)!);
    expect(new Set(puzzles.map(puzzle => puzzle.formation.title)).size).toBe(14);
    for (const [offset, puzzle] of puzzles.entries()) {
      const later = dailyPuzzle(dayAt(offset + 14), catalog)!;
      expect(later.formation.title).toBe(puzzle.formation.title);
      expect(later.pieces).not.toEqual(puzzle.pieces);
      const seen = new Set<string>([puzzle.pieces.join('|')]);
      let frontier = [puzzle.pieces];
      let shortestWin: number | undefined;
      let fastestDamage = 0;
      let maxDamage = 0;
      let peakMove = 0;
      for (let depth = 0; frontier.length; depth++) {
        for (const pieces of frontier) {
          const { damage, win } = runDaily(puzzle.formation, puzzle.hp, pieces, catalog);
          if (win) {
            shortestWin ??= depth;
            if (shortestWin === depth) fastestDamage = Math.max(fastestDamage, damage);
          }
          if (damage > maxDamage) { maxDamage = damage; peakMove = depth; }
        }
        frontier = layer(frontier).filter(pieces => {
          const key = pieces.join('|');
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }
      expect([shortestWin, fastestDamage, maxDamage], puzzle.day).toEqual([puzzle.par, puzzle.targetDamage, puzzle.peakDamage]);
      expect(puzzle.peakDamage).toBeGreaterThan(puzzle.targetDamage);
      expect(peakMove).toBeGreaterThan(puzzle.par);
      expect(dailyHint(puzzle, puzzle.pieces, catalog)?.remaining).toBe(puzzle.par);
      expect(dailyHint(puzzle, puzzle.pieces, catalog, 'peak')?.remaining).toBe(peakMove);
    }
  });

  it('keeps the fast clear and the highest damage even when they come from different attempts', () => {
    const best = { moves: 2, damage: 110 };
    const peak = betterDailyRecord({ moves: 3, damage: 120 }, best);
    expect(peak).toEqual({ ...best, peakDamage: 120 });
    expect(betterDailyRecord({ moves: 2, damage: 115 }, peak)).toEqual({ moves: 2, damage: 115, peakDamage: 120 });
    expect(betterDailyRecord(best, { moves: 3, damage: 120 })).toEqual(peak);
    expect(readDailyRecord(best)).toEqual(best);
    expect(readDailyRecord({ ...best, peakDamage: 109 })).toEqual(best);
    expect(betterDailyRecord({ moves: 2, damage: 115 }, best).damage).toBe(115);
  });

  it('shares both scores with the exact puzzle date and hides claims outside the puzzle limits', () => {
    const day = '2026-11-21';
    const puzzle = dailyPuzzle(day, catalog)!;
    const score = { moves: puzzle.par, damage: puzzle.targetDamage, peakDamage: puzzle.peakDamage };
    const url = new URL(dailyLink('https://example.com/game/', day, score));
    const raw = url.searchParams.get('daily');
    expect(raw).toMatch(/^v3\./);
    expect(readDailyLink(raw, '2026-11-20')).toBeUndefined();
    expect(readDailyLink(raw, day)).toEqual({ day, score });
    expect(dailyInviteScore(puzzle, score)).toEqual(score);
    expect(dailyInviteScore(puzzle, { ...score, moves: puzzle.par - 1 })).toBeUndefined();
    expect(dailyInviteScore(puzzle, { ...score, peakDamage: puzzle.peakDamage + 1 })).toBeUndefined();
    expect(dailyInviteScore(puzzle, { ...score, damage: puzzle.peakDamage })).toBeUndefined();
    expect(readDailyLink(`v3.${day}.x.100.9999`, day)).toEqual({ day });
    expect(readDailyLink(`v2.${day}`, day)).toBeUndefined();
  });

  it('keeps a streak before today is solved', () => {
    const best = { moves: 2, damage: 110 };
    const scores = new Map([['2026-11-19', best], ['2026-11-18', best], ['2026-11-16', best]]);
    expect(dailyStreak(scores, '2026-11-20')).toBe(2);
    scores.set('2026-11-20', best);
    expect(dailyStreak(scores, '2026-11-20')).toBe(3);
  });
});
