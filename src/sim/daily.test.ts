import { describe, expect, it } from 'vitest';
import { betterDailyRecord, dailyHint, dailyLink, dailyPuzzle, dailyStreak, readDailyLink, recentDailyDates, runDaily, shanghaiDay } from '../core/daily';
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
    expect(readDailyLink(url.searchParams.get('daily'), '2026-11-20')).toBe('2026-11-20');
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

  it('uses damage only to break move-count ties and keeps a streak before today is solved', () => {
    const best = { moves: 2, damage: 110 };
    expect(betterDailyRecord({ moves: 3, damage: 120 }, best)).toBe(best);
    expect(betterDailyRecord({ moves: 2, damage: 115 }, best).damage).toBe(115);
    const scores = new Map([['2026-11-19', best], ['2026-11-18', best], ['2026-11-16', best]]);
    expect(dailyStreak(scores, '2026-11-20')).toBe(2);
    scores.set('2026-11-20', best);
    expect(dailyStreak(scores, '2026-11-20')).toBe(3);
  });
});
