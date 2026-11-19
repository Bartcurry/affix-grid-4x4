import { createEventBus } from './eventBus';
import { CELL_COUNT } from './grid';
import type { EncounterId } from './expedition';
import type { Catalog, Random, RelicId, Slots } from './types';

const chapterOneHealth = 50 * 1.48 ** 9;
const chapterTwoHealth = chapterOneHealth * 1.39 ** 10;

export function bossHealth(wave: number): number {
  if (wave === 1) return 60;
  if (wave <= 10) return Math.round(50 * 1.48 ** (wave - 1));
  const health = wave <= 20 ? chapterOneHealth * 1.39 ** (wave - 10) : chapterTwoHealth * 1.24 ** (wave - 20);
  return Math.min(Number.MAX_SAFE_INTEGER, Math.round(health));
}

export function seededRandom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function simulateBattle(input: { board: Readonly<Slots>; hp: number; gold: number; poison?: number; seed?: number; tutorial?: boolean;
  encounter?: EncounterId; relics?: readonly RelicId[] },
  catalog: Catalog, rng: Random = seededRandom(input.seed ?? 1)) {
  const bus = createEventBus(input.board, catalog, input.hp, input.gold, input.poison ?? 0, rng, input.tutorial ?? false, input.encounter ?? 'sentry', input.relics ?? []);
  for (let index = 0; index < CELL_COUNT; index++) bus.activate(index, 0);
  return bus.finish();
}
