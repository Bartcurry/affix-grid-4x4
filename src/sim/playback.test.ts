import { describe, expect, it, vi } from 'vitest';
import type { BattleEvent, TurnResult } from '../core/types';
import { planJournalReplay, planPlayback, PlaybackController } from '../render/playbackController';

const activation = (combo: number): BattleEvent => ({
  type: 'CELL_ACTIVATE', index: combo % 16, isChain: combo > 1, depth: combo % 8, combo,
});
const finish = (combo: number): TurnResult => ({ type: 'TURN_RESULT', hp: 0, gold: 20, poison: 8, damage: 450, combo, win: true });
const hit = (amount: number, hp: number): Extract<BattleEvent, { type: 'DAMAGE' }> =>
  ({ type: 'DAMAGE', source: 1, amount, hp, crit: false, kind: 'rune' });

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

  it('keeps exact journal steps for a chain link, first column seal, heaviest hit and result', () => {
    const link: BattleEvent = { type: 'CHAIN_LINK', from: 0, to: 1 };
    const gate: BattleEvent = { ...hit(60, 600), gateBlocked: true };
    const biggest = hit(250, 400);
    const killingHit = hit(100, 0);
    const events = [activation(1), link, activation(2), gate,
      ...Array.from({ length: 119 }, (_, index) => activation(index + 3)),
      biggest, killingHit, finish(121)];
    const { cues, gateStep } = planJournalReplay(events);
    const steps = cues.map(cue => cue.step);
    expect(gateStep).toBe(4);
    expect(steps).toEqual([...new Set(steps)].sort((a, b) => a - b));
    expect(steps).toContain(2);
    expect(steps).toContain(gateStep);
    expect(steps.slice(-3)).toEqual([events.length - 2, events.length - 1, events.length]);
    expect(steps.length).toBeLessThan(36);
    expect(cues.reduce((ms, cue) => ms + cue.hold, 0)).toBeLessThan(4500);
    expect(planJournalReplay([finish(0)])).toEqual({ cues: [{ step: 1, hold: 0 }], gateStep: 0 });
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
