import { describe, expect, it } from 'vitest';
import { runDaily, shanghaiDay, type DailyPuzzle } from '../core/daily';
import { compareRelayScores, readRelayLink, relayLink, relayOutlook, relayWeek, restoreRelayDraft, stageAllowance, validRelayScore, weeklyRelay, type RelayMove } from '../core/weeklyRelay';
import { catalog } from '../data/catalog';

function solvesWithin(stage: DailyPuzzle, limit: number) {
  const queue: { pieces: string[]; moves: RelayMove[] }[] = [{ pieces: stage.pieces, moves: [] }];
  const seen = new Set([stage.pieces.join('|')]);
  for (const { pieces, moves } of queue) {
    if (moves.length >= limit) continue;
    for (let left = 0; left < pieces.length; left++) for (let right = left + 1; right < pieces.length; right++) {
      const next = [...pieces];
      [next[left], next[right]] = [next[right], next[left]];
      const key = next.join('|');
      if (!seen.has(key)) { seen.add(key); queue.push({ pieces: next, moves: [...moves, [left, right]] }); }
    }
  }
  return queue.flatMap(({ pieces, moves }) => {
    const result = runDaily(stage.formation, stage.hp, pieces, catalog);
    return result.win ? [{ damage: result.damage, moves }] : [];
  });
}

describe('three-board weekly relay', () => {
  it('turns over on Mondays in Beijing and opens past share links on their own week', () => {
    expect(relayWeek(shanghaiDay(new Date('2026-11-22T15:59:59Z')))).toBe('2026-11-16');
    expect(relayWeek(shanghaiDay(new Date('2026-11-22T16:00:00Z')))).toBe('2026-11-23');
    expect(weeklyRelay('2026-11-20', catalog)).toBeUndefined();
    const relay = weeklyRelay('2026-11-16', catalog)!;
    const score = { moves: relay.budget, damage: relay.ceilings.at(-1)! };
    const link = new URL(relayLink('https://example.com/play/?daily=old#top', relay.day, score));
    expect(link.searchParams.has('daily')).toBe(false);
    expect(link.hash).toBe('');
    expect(readRelayLink(link.searchParams.get('relay'), '2026-11-15')).toBeUndefined();
    expect(readRelayLink(link.searchParams.get('relay'), '2026-11-23')).toEqual({ day: relay.day, score });
    expect(validRelayScore(relay, score)).toEqual(score);
    expect(validRelayScore(relay, { ...score, damage: score.damage + 1 })).toBeUndefined();
  });

  it('has a different tactical lineup each week and an attainable ceiling within the combined budget', () => {
    const weeks = Array.from({ length: 14 }, (_, index) => weeklyRelay(new Date(Date.UTC(2026, 10, 16 + 7 * index)).toISOString().slice(0, 10), catalog)!);
    expect(new Set(weeks.map(relay => relay.stages.map(stage => stage.formation.title).join('/'))).size).toBe(14);
    for (const relay of weeks) {
      expect(new Set(relay.stages.map(stage => stage.formation.title)).size).toBe(3);
      expect(relay.budget).toBe(relay.minimum + 2);
      expect(relay.ceilings[2], relay.day).toBeGreaterThan(relay.ceilings[0]);
      const [first, second, third] = relay.stages.map(stage => {
        const results = solvesWithin(stage, stage.par + 2);
        return [0, 1, 2].map(extra => Math.max(...results.filter(result => result.moves.length <= stage.par + extra).map(result => result.damage)));
      });
      for (const [extra, score] of relay.ceilings.entries()) {
        const totals = first.flatMap((damage, a) => second.flatMap((other, b) => a + b > extra ? [] : [damage + other + third[extra - a - b]]));
        expect(score, relay.day).toBe(Math.max(...totals));
        const lastTwo = second.slice(0, extra + 1).map((damage, used) => damage + third[extra - used]);
        expect(relay.remainingCeilings[1][extra], relay.day).toBe(Math.max(...lastTwo));
        expect(relay.remainingCeilings[2][extra], relay.day).toBe(third[extra]);
      }
    }
  });

  it('replays valid drafts and reserves the minimum for later rounds', () => {
    const relay = weeklyRelay('2026-11-16', catalog)!;
    const first = relay.stages[0];
    const path = solvesWithin(first, first.par).find(({ damage }) => damage === first.targetDamage)!.moves;
    const state = restoreRelayDraft(relay, { spent: [path], current: [] }, catalog);
    expect(state?.results).toEqual([{ damage: first.targetDamage, moves: first.par }]);
    expect(stageAllowance(relay, [path])).toBe(relay.stages[1].par + 2);
    expect(restoreRelayDraft(relay, { spent: [[]], current: [] }, catalog)).toBeUndefined();
    expect(restoreRelayDraft(relay, { spent: [path], current: [[0, 100]] }, catalog)).toBeUndefined();
    expect(restoreRelayDraft(relay, { spent: [path], current: Array(relay.budget).fill([0, 1]) }, catalog)).toBeUndefined();
  });

  it('carries locked damage and actual steps into the attainable finish', () => {
    const relay = weeklyRelay('2026-11-16', catalog)!;
    const first = relay.stages[0];
    const later = relay.remainingCeilings[1];
    const lock = { moves: first.par + 2, damage: first.targetDamage };
    const outlook = relayOutlook(relay, 1, lock);
    expect(outlook).toEqual({ damage: lock.damage + later[0], moves: relay.budget });
    expect(relayOutlook(relay, 0, { damage: 0, moves: 0 }).damage).toBe(relay.ceilings.at(-1));
    expect(relayOutlook(relay, 3, outlook)).toEqual(outlook);
    const sameDamageFaster = { ...outlook, moves: outlook.moves - 1 };
    expect(compareRelayScores(sameDamageFaster, outlook)).toBeGreaterThan(0);
    expect(compareRelayScores({ ...outlook, damage: outlook.damage - 1, moves: 0 }, outlook)).toBeLessThan(0);
  });
});
