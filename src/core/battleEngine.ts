import { createEventBus } from './eventBus';
import { CELL_COUNT } from './grid';
import type { Catalog, Random, Slots } from './types';

export const bossHealth = (wave: number): number => wave === 1 ? 60 : wave <= 10
  ? Math.round(50 * 1.48 ** (wave - 1)) : Math.min(Number.MAX_SAFE_INTEGER, Math.round(1800 * 1.62 ** (wave - 10)));

export function seededRandom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function simulateBattle(input: { board: Readonly<Slots>; hp: number; gold: number; poison?: number; seed?: number; tutorial?: boolean },
  catalog: Catalog, rng: Random = seededRandom(input.seed ?? 1)) {
  const bus = createEventBus(input.board, catalog, input.hp, input.gold, input.poison ?? 0, rng, input.tutorial ?? false);
  for (let index = 0; index < CELL_COUNT; index++) bus.activate(index, 0);
  return bus.finish();
}
