import { describe, expect, it, vi } from 'vitest';
import type { BattleEvent, TurnResult } from '../core/types';
import { planPlayback, PlaybackController } from '../render/playbackController';

const activation = (combo: number): BattleEvent => ({
  type: 'CELL_ACTIVATE', index: combo % 16, isChain: combo > 1, depth: combo % 8, combo,
});
const finish = (combo: number): TurnResult => ({ type: 'TURN_RESULT', hp: 0, gold: 20, poison: 8, damage: 450, combo, win: true });
const hit = (amount: number, hp: number): BattleEvent => ({ type: 'DAMAGE', source: 1, amount, hp, crit: false, kind: 'rune' });

describe('battle playback pacing', () => {
  it('groups dense chains while keeping the exact event order and the visible hit and kill separate', () => {
    const finishingHit = hit(100, 0);
    const biggestHit = hit(250, 0);
    const events = [...Array.from({ length: 121 }, (_, index) => activation(index + 1)), finishingHit, biggestHit, finish(121)];
    const reference = structuredClone(events);
    const { beats, result } = planPlayback(events);
    expect(beats.length).toBeLessThan(34);
    expect(beats.reduce((ms, beat) => ms + beat.hold, 0)).toBeLessThan(4200);
    expect(beats.flatMap(beat => [...beat.events])).toEqual(events.slice(0, -1));
    expect(beats.filter(beat => beat.featured).map(beat => [beat.featured, beat.finishing]))
      .toEqual([[finishingHit, true], [biggestHit, false]]);
    expect(result).toBe(events.at(-1));
    expect(events).toEqual(reference);
  });

  it('settles immediately when interrupted and ignores repeated skips', async () => {
    vi.useFakeTimers();
    try {
      const player = new PlaybackController();
      const show = vi.fn();
      const events = [activation(1), hit(6, 15), activation(2), finish(2)];
      const ordinary = player.play(events, show);
      expect(show).toHaveBeenCalledTimes(1);
      expect(player.skip()).toBe(true);
      expect(player.skip()).toBe(false);
      await expect(ordinary).resolves.toBe(events.at(-1));
      expect(show).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);

      const instant = player.play(events, show);
      player.speed = 0;
      await expect(instant).resolves.toBe(events.at(-1));
      expect(show).toHaveBeenCalledTimes(2);
      await player.play(events, show);
      expect(show).toHaveBeenCalledTimes(2);
      player.speed = 1;
      await player.play(events, show, true);
      expect(show).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
