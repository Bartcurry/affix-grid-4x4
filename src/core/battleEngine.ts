import { createEventBus } from './eventBus';
import { CELL_COUNT } from './grid';
import type { EncounterId } from './expedition';
import { createMulberry32, decodeSeed } from './rng';
import type { Catalog, Random, RelicId, Slots, TileModifierMap } from './types';

const chapterOneHealth = 50 * 1.48 ** 9;
const chapterTwoHealth = chapterOneHealth * 1.39 ** 10;

export function bossHealth(wave: number): number {
  if (wave === 1) return 60;
  if (wave <= 10) return Math.round(50 * 1.48 ** (wave - 1));
  const health = wave <= 20 ? chapterOneHealth * 1.39 ** (wave - 10) : chapterTwoHealth * 1.24 ** (wave - 20);
  return Math.min(Number.MAX_SAFE_INTEGER, Math.round(health));
}

export function seededRandom(seed: number): Random {
  return createMulberry32(seed);
}

export function simulateBattle(input: {
  board: Readonly<Slots>;
  bench?: Readonly<Slots> | number;
  hp: number;
  gold: number;
  poison?: number;
  seed?: number | string;
  tutorial?: boolean;
  encounter?: EncounterId;
  relics?: readonly RelicId[];
  tileModifiers?: TileModifierMap;
  affix?: string;
  shield?: number;
  enableSynergies?: boolean;
}, catalog: Catalog, rng?: Random) {
  const seedNum = typeof input.seed === 'string' ? decodeSeed(input.seed) : (input.seed ?? 1);
  const effectiveRng = rng ?? seededRandom(seedNum);
  const benchCount = typeof input.bench === 'number'
    ? input.bench
    : (input.bench ? input.bench.filter(Boolean).length : 0);
  const bus = createEventBus(
    input.board, catalog, input.hp, input.gold, input.poison ?? 0, effectiveRng,
    input.tutorial ?? false, input.encounter ?? 'sentry', input.relics ?? [],
    input.tileModifiers, input.affix, input.shield ?? 3, input.enableSynergies,
    benchCount
  );
  for (let index = 0; index < CELL_COUNT; index++) bus.activate(index, 0);
  return bus.finish();
}
