import { describe, expect, it, vi } from 'vitest';
import { betterDailyRecord, dailyHint, dailyInviteScore, dailyLink, dailyMastery, dailyPuzzle, dailyRouteParam, dailyStreak,
  encodeDailyRoute, fixedPuzzle, readDailyLink, readDailyRecord, recentDailyDates, replayDailyRoute, runDaily, shanghaiDay, simulateDaily } from '../core/daily';
import { catalog } from '../data/catalog';
import { drills } from '../data/drills';
import { createPuzzleDraftStore } from '../platform/puzzleDrafts';

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

describe('permanent drills', () => {
  it.each(drills)('has the stated minimum number of swaps in $id and a working opening hint', ({ formation, par, id }) => {
    const puzzle = fixedPuzzle(formation, catalog)!;
    expect(puzzle.par).toBe(par);
    let positions = [puzzle.pieces];
    for (let move = 0; move < par; move++) {
      expect(positions.some(pieces => runDaily(formation, puzzle.hp, pieces, catalog).win)).toBe(false);
      positions = layer(positions);
    }
    const highest = positions.map(pieces => ({ pieces, ...simulateDaily(formation, puzzle.hp, pieces, catalog) }))
      .sort((a, b) => b.result.damage - a.result.damage)[0];
    expect(highest.result.win).toBe(true);
    expect(highest.result.damage).toBe(puzzle.targetDamage);
    expect(dailyHint(puzzle, puzzle.pieces, catalog)?.remaining).toBe(par);
    if (id === 'gate') {
      const hits = highest.events.filter(event => event.type === 'DAMAGE');
      expect(hits.some(event => event.gateBlocked)).toBe(true);
      const finishing = hits.at(-1)!;
      expect(finishing.gateBlocked).toBeUndefined();
      expect(highest.pieces[formation.cells.indexOf(finishing.source!)]).toBe('combo_finisher');
      expect(finishing.hp).toBe(0);
    }
  });
});

describe('puzzle drafts', () => {
  it('restores exact moves across fresh clients and rejects drafts for a different board', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    });
    try {
      const day = '2026-11-21';
      const puzzle = dailyPuzzle(day, catalog)!;
      const draft = createPuzzleDraftStore('daily');
      expect(draft.save(day, puzzle, [[0, 1], [1, 5]], 'peak')).toBe(true);
      const fresh = createPuzzleDraftStore('daily');
      const restored = fresh.load(day, puzzle)!;
      expect(restored).toMatchObject({ moves: [[0, 1], [1, 5]], goal: 'peak', persistent: true });
      expect(runDaily(puzzle.formation, puzzle.hp, restored.pieces, catalog).damage).toBe(360);
      expect(fresh.load(day, { ...puzzle, hp: puzzle.hp + 1 })).toBeUndefined();
      expect(createPuzzleDraftStore('drill').load(day, puzzle)).toBeUndefined();
      expect(fresh.save(day, puzzle, [[0, 0]])).toBe(true);
      expect(fresh.load(day, puzzle)).toBeUndefined();
      fresh.save(day, puzzle, []);
      expect(values.size).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('daily formations', () => {
  it('uses Beijing midnight and keeps old or future links away from the current rules', () => {
    expect(shanghaiDay(new Date('2026-11-20T15:59:59Z'))).toBe('2026-11-20');
    expect(shanghaiDay(new Date('2026-11-20T16:00:00Z'))).toBe('2026-11-21');
    const url = new URL(dailyLink('https://example.com/game/?challenge=old#board', '2026-11-20'));
    expect(url.pathname).toBe('/game/daily.html');
    expect(url.hash).toBe('');
    expect([...url.searchParams.keys()]).toEqual(['daily']);
    expect(dailyLink('https://example.com/game/index.html', '2026-11-20')).toBe(url.href);
    expect(dailyLink('https://example.com/game/daily.html?relay=old', '2026-11-20')).toBe(url.href);
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

  it('checks both targets across the 18-format schedule and rotates each starting board', () => {
    const dayAt = (offset: number) => new Date(Date.UTC(2026, 10, 22 + offset)).toISOString().slice(0, 10);
    const puzzles = Array.from({ length: 18 }, (_, offset) => dailyPuzzle(dayAt(offset), catalog)!);
    expect(new Set(puzzles.map(puzzle => puzzle.formation.title)).size).toBe(18);
    for (const [offset, puzzle] of puzzles.entries()) {
      const later = dailyPuzzle(dayAt(offset + 18), catalog)!;
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

  it('applies the four new battle rules and opens them on their scheduled dates', () => {
    const dates = ['2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25'];
    const [gate, spirit, rows, corners] = dates.map(day => dailyPuzzle(day, catalog)!);
    expect([gate.formation.enemy, spirit.formation.tiles?.[6], rows.formation.affix?.id, corners.formation.relic])
      .toEqual(['regent_seal', 'spirit_gathering', 'odd_row_frenzy', 'bagua_mirror']);
    const variations = [
      { ...gate.formation, enemy: 'regent' as const }, { ...spirit.formation, tiles: undefined },
      { ...rows.formation, affix: undefined }, { ...corners.formation, relic: undefined },
    ];
    for (const [index, puzzle] of [gate, spirit, rows, corners].entries()) {
      const queues = [puzzle.formation.pieces, ...layer([[...puzzle.formation.pieces]])];
      expect(queues.some(pieces => runDaily(puzzle.formation, puzzle.hp, pieces, catalog).damage !==
        runDaily(variations[index], puzzle.hp, pieces, catalog).damage), puzzle.formation.title).toBe(true);
      const score = { moves: puzzle.par, damage: puzzle.targetDamage, peakDamage: puzzle.peakDamage };
      const url = new URL(dailyLink('https://example.com/play/', puzzle.day, score));
      expect(url.searchParams.get('daily')).toMatch(/^v4\./);
      expect(readDailyLink(url.searchParams.get('daily'), '2026-11-21')).toBeUndefined();
      expect(readDailyLink(`v3.${puzzle.day}`, puzzle.day)).toBeUndefined();
      expect(readDailyLink(url.searchParams.get('daily'), puzzle.day)).toEqual({ day: puzzle.day, score });
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

  it('shares the fastest recorded route, verifies the original puzzle and handles score-only links', () => {
    const day = '2026-11-21';
    const puzzle = dailyPuzzle(day, catalog)!;
    const score = { moves: 2, damage: 360 };
    const route = encodeDailyRoute([[0, 1], [1, 5]])!;
    const best = betterDailyRecord({ ...score, route }, { ...score, peakDamage: 621 });
    const url = new URL(dailyLink('https://example.com/play/', day, best));
    const invite = readDailyLink(url.searchParams.get('daily'), day)!;
    expect(invite.score).toEqual({ ...score, peakDamage: 621 });
    expect(url.searchParams.get(dailyRouteParam)).toBe('0115');
    expect(readDailyRecord(best)).toEqual({ ...score, peakDamage: 621, route });
    const replay = replayDailyRoute(puzzle, invite.score!, url.searchParams.get(dailyRouteParam), catalog);
    expect(replay?.moves).toEqual([[0, 1], [1, 5]]);
    expect(replay?.boards[0]).toEqual(puzzle.pieces);
    expect(replay?.damage).toBe(360);
    expect(betterDailyRecord({ moves: 3, damage: 621, route: '030512' }, best)).toEqual(best);
    for (const invalid of [null, '0015', '0f15', '0305', '0115x0', '01150115']) {
      expect(replayDailyRoute(puzzle, invite.score!, invalid, catalog)).toBeUndefined();
    }
    expect(replayDailyRoute(puzzle, { ...score, damage: 361 }, route, catalog)).toBeUndefined();
    expect(encodeDailyRoute(Array.from({ length: 13 }, () => [0, 1]))).toBeUndefined();
  });

  it('shares both scores with the exact puzzle date and hides claims outside the puzzle limits', () => {
    const day = '2026-11-21';
    const puzzle = dailyPuzzle(day, catalog)!;
    expect([puzzle.formation.title, puzzle.par, puzzle.targetDamage, puzzle.peakDamage]).toEqual(['印落攻城', 2, 360, 621]);
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

  it('tracks both forms of mastery on their own and ignores impossible records', () => {
    const puzzle = dailyPuzzle('2026-11-21', catalog)!;
    const fast = { moves: puzzle.par, damage: puzzle.targetDamage };
    const peak = { moves: puzzle.par + 1, damage: puzzle.peakDamage };
    expect(dailyMastery(puzzle)).toEqual({ cleared: false, fast: false, peak: false, complete: false });
    expect(dailyMastery(puzzle, fast)).toEqual({ cleared: true, fast: true, peak: false, complete: false });
    expect(dailyMastery(puzzle, peak)).toEqual({ cleared: true, fast: false, peak: true, complete: false });
    expect(dailyMastery(puzzle, betterDailyRecord(peak, fast))).toEqual({ cleared: true, fast: true, peak: true, complete: true });
    expect(dailyMastery(puzzle, { ...fast, moves: puzzle.par - 1 }).cleared).toBe(false);
    expect(dailyMastery(puzzle, { ...fast, peakDamage: puzzle.peakDamage + 1 }).complete).toBe(false);
  });

  it('keeps a streak before today is solved', () => {
    const best = { moves: 2, damage: 110 };
    const scores = new Map([['2026-11-19', best], ['2026-11-18', best], ['2026-11-16', best]]);
    expect(dailyStreak(scores, '2026-11-20')).toBe(2);
    scores.set('2026-11-20', best);
    expect(dailyStreak(scores, '2026-11-20')).toBe(3);
  });
});
