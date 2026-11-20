import { expect, it } from 'vitest';
import { compareBoardAttempts } from '../core/boardComparison';
import type { BattleEvent, Rune } from '../core/types';

const hit = (source: number | null, amount: number, kind: 'rune' | 'poison' = 'rune'): BattleEvent =>
  ({ type: 'DAMAGE', source, amount, kind, hp: 0, crit: false });
const link = (from: number, to: number, tutorial?: boolean): BattleEvent =>
  ({ type: 'CHAIN_LINK', from, to, tutorial });

it('attributes damage and chains to individual runes when they move', () => {
  const prism: Rune = { configId: 'prism_right', star: 1 };
  const firstSpark: Rune = { configId: 'spark_orb', star: 1 };
  const secondSpark: Rune = { configId: 'spark_orb', star: 1, bonusPower: 2 };
  const previous = { board: [prism, firstSpark, secondSpark, null],
    events: [hit(1, 12), hit(2, 14), hit(null, 6, 'poison'), link(0, 1), link(0, 1), link(1, 2, true)] };
  const next = { board: [null, prism, secondSpark, firstSpark],
    events: [hit(3, 12), hit(2, 38), hit(null, 1, 'poison'), link(1, 3), link(1, 2)] };

  expect(compareBoardAttempts(previous, next)).toEqual({
    damage: [
      { rune: secondSpark, from: 2, to: 2, before: 14, after: 38 },
      { kind: 'poison', before: 6, after: 1 },
    ],
    chains: [
      { from: prism, to: firstSpark, difference: -1 },
      { from: prism, to: secondSpark, difference: 1 },
    ],
  });
});

it('counts a reserve rune joining combat and a boarded rune going to reserve', () => {
  const prism: Rune = { configId: 'prism_right', star: 1 };
  const mine: Rune = { configId: 'copper_mine', star: 1 };
  const spark: Rune = { configId: 'spark_orb', star: 1 };
  const previous = { board: [prism, mine], bench: [spark], events: [hit(1, 3), link(0, 1)] };
  const next = { board: [prism, spark], events: [hit(1, 12), hit(1, 24), link(0, 1)] };

  expect(compareBoardAttempts(previous, next)).toEqual({
    damage: [
      { rune: spark, from: null, to: 1, before: 0, after: 36 },
      { rune: mine, from: 1, to: null, before: 3, after: 0 },
    ],
    chains: [
      { from: prism, to: mine, difference: -1 },
      { from: prism, to: spark, difference: 1 },
    ],
  });
});
