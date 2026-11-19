import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BattleEvent, TurnResult } from '../core/types';
import { PlaybackController } from '../render/playbackController';
import { migrateSave } from '../platform/webMockAdapter';

const activation = (combo: number): BattleEvent => ({ type: 'CELL_ACTIVATE', index: 0, isChain: combo > 1, depth: 0, combo });
const hit = (amount: number, hp: number, crit: boolean, breach?: true): BattleEvent => ({ type: 'DAMAGE', kind: 'rune', source: 0, amount, hp, crit, breach });
const summary = (combo: number): TurnResult => ({ type: 'TURN_RESULT', combo, damage: 220, hp: 0, poison: 0, gold: 15, win: true });

afterEach(() => vi.useRealTimers());

describe('battle playback', () => {
  it('compresses a long chain while presenting each event in original order', async () => {
    vi.useFakeTimers();
    const player = new PlaybackController();
    const timeline = [...Array.from({ length: 120 }, (_, i) => activation(i + 1)), summary(120)];
    const shown: BattleEvent[] = [];
    const start = Date.now();
    const playing = player.play(timeline, event => shown.push(event));
    await vi.runAllTimersAsync();
    expect(await playing).toBe(timeline.at(-1));
    expect(shown).toEqual(timeline);
    expect(Date.now() - start).toBeLessThan(5000);
  });

  it('preserves the brief breach pause and only pauses for major hits while the enemy is alive', async () => {
    vi.useFakeTimers();
    const player = new PlaybackController();
    const hits = [hit(50, 50, false, true), hit(50, 0, true), hit(120, 0, true)];
    const expected = [activation(1), ...hits, summary(1)];
    const hitStop = vi.fn();
    const start = Date.now();
    const times: number[] = [];
    const playing = player.play(expected, (_event, hp) => { expect(hp).toBe(100); times.push(Date.now() - start); }, { maxHp: 100, onHitStop: hitStop });
    await vi.runAllTimersAsync();
    expect(await playing).toBe(expected.at(-1));
    expect(hitStop).toHaveBeenCalledTimes(2);
    expect(times).toEqual([0, 40, 320, 320, 760]);
  });

  it('skips an active pause without presenting the remaining events or starting another replay', async () => {
    vi.useFakeTimers();
    const player = new PlaybackController();
    const present = vi.fn();
    const result = summary(2);
    const playing = player.play([activation(1), activation(2), hit(220, 0, true), result], present);
    player.skip(); player.skip();
    expect(await playing).toBe(result);
    expect(present).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    player.speed = 0;
    expect(await player.play([result], present)).toBe(result);
    expect(present).toHaveBeenCalledTimes(1);
  });

  it('round-trips instant mode and preserves older playback preferences', () => {
    const save = migrateSave(null);
    expect(migrateSave({ ...save, speed: 0 }).speed).toBe(0);
    expect(migrateSave({ ...save, speed: 1 }).speed).toBe(1);
    expect(migrateSave({ ...save, speed: 2 }).speed).toBe(2);
  });
});
