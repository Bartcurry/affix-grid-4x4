import { CELL_COUNT } from './grid';
import { bountyAt, bountyPerkUnavailable, bountyRefreshes, engravingCell, engravingPower, offersBounties } from './bounties';
import { endlessCampAt, relicChoices } from './expedition';
import { openings } from './openings';
import { countSynergies } from './synergy';
import { createMulberry32, decodeSeed, encodeSeed, type PRNG } from './rng';
import type { Archetype, BountyRoute, Catalog, Offer, OpeningId, Random, Rarity, RelicId, Run, Rune, Slot, Slots, Star, TileModifierMap, TurnResult } from './types';

export const BENCH_SIZE = 4;
export const SHOP_SIZE = 3;
export const REFRESH_COST = 2;
export const canArrange = (run: Run) => run.status === 'active' && !run.pendingLoss && !run.pendingCamp && !run.pendingRelics.length;

export function selectBounty(run: Run, route?: BountyRoute) {
  if (!canArrange(run) || !offersBounties(run) || route === run.bountyRoute ||
    (route !== undefined && !bountyAt(run.wave, route))) return false;
  run.bountyRoute = route;
  return true;
}

export function rarityOdds(wave: number): Record<Rarity, number> {
  return wave <= 4 ? { common: 0.75, rare: 0.22, epic: 0.03 }
    : wave <= 10 ? { common: 0.50, rare: 0.38, epic: 0.12 } : { common: 0.30, rare: 0.45, epic: 0.25 };
}

function rollShop(run: Run, catalog: Catalog, rng: Random, options: { focus?: Archetype; supply?: string } = {}) {
  const odds = rarityOdds(run.wave);
  const configs = Object.values(catalog);
  const guided = Array.from({ length: SHOP_SIZE }, (_, index) => index).find(index => !run.shop[index]?.locked);
  const hasCompass = run.relics.includes('tianji_compass');
  const targetArchetype: Archetype | undefined = options.focus ?? (run.shopFocus !== 'any' ? run.shopFocus : run.opening);

  run.shop = Array.from({ length: SHOP_SIZE }, (_, index): Offer | null => {
    if (run.shop[index]?.locked) return run.shop[index];
    if (index === guided && options.supply && catalog[options.supply]) return { configId: options.supply, locked: false };
    const roll = rng();
    const rarity = roll < odds.common ? 'common' : roll < odds.common + odds.rare ? 'rare' : 'epic';
    const tier = configs.filter(config => config.rarity === rarity);
    const preferFocus = hasCompass ? Boolean(targetArchetype) : (index === guided && Boolean(options.focus));
    const filterType = hasCompass ? targetArchetype : options.focus;
    const focused = preferFocus && filterType ? tier.filter(config => config.archetype === filterType || (hasCompass && config.tags.includes(filterType))) : [];
    const pool = focused.length ? focused : tier.length ? tier : configs;
    return pool.length ? { configId: pool[Math.floor(rng() * pool.length)].id, locked: false } : null;
  });
  if (typeof (rng as any).getState === 'function') {
    run.rngState = (rng as PRNG).getState();
  }
}

export function generateTileModifiers(rng: Random): TileModifierMap {
  const indices: number[] = [];
  let attempts = 0;
  while (indices.length < 3 && attempts < 100) {
    attempts++;
    const roll = rng();
    const candidate = Math.floor(roll * CELL_COUNT);
    if (!indices.includes(candidate)) {
      indices.push(candidate);
    }
  }
  for (let i = 0; indices.length < 3 && i < CELL_COUNT; i++) {
    const fallbackCell = 15 - i;
    if (!indices.includes(fallbackCell)) indices.push(fallbackCell);
  }
  return {
    [indices[0]]: 'li_fire',
    [indices[1]]: 'xuan_ice',
    [indices[2]]: 'spirit_gathering',
  };
}

export function newRun(catalog: Catalog, rng: Random, opening: OpeningId = 'chain', seedInput?: string, difficulty?: Run['difficulty']): Run {
  let seedCode = seedInput;
  let rngState = 1;
  let effectiveRng: Random = rng;

  if (typeof (rng as any)?.getState === 'function') {
    rngState = (rng as PRNG).getState();
    seedCode = seedCode || encodeSeed(rngState);
  } else if (seedCode) {
    rngState = decodeSeed(seedCode);
    effectiveRng = createMulberry32(rngState);
  } else {
    rngState = 1337;
    seedCode = encodeSeed(rngState);
    effectiveRng = createMulberry32(rngState);
  }

  const setup = openings[opening];
  const tileModifiers = generateTileModifiers(effectiveRng);
  const run: Run = {
    ...(difficulty ? { difficulty } : {}),
    seed: seedCode,
    rngState: typeof (effectiveRng as any)?.getState === 'function' ? (effectiveRng as PRNG).getState() : rngState,
    tileModifiers,
    opening,
    shopFocus: opening,
    wave: 1,
    gold: setup.gold,
    shield: 3,
    board: Array<Rune | null>(CELL_COUNT).fill(null),
    bench: Array<Rune | null>(BENCH_SIZE).fill(null),
    shop: [],
    freeRefreshes: difficulty === 'beginner' ? 2 : 1,
    attempts: 0,
    endless: false,
    status: 'active',
    lastDamage: 0,
    lastPoison: 0,
    bestCombo: 0,
    pendingLoss: false,
    relics: [],
    pendingRelics: [],
    enableSynergies: true,
    altarRule: 1,
    bountyRule: 1,
    endlessRule: 1,
    reforgeRule: 1,
    finaleRule: 1,
  };
  for (const [index, configId] of setup.pieces) run.board[index] = { configId, star: 1 };
  rollShop(run, catalog, effectiveRng);
  if (typeof (effectiveRng as any)?.getState === 'function') {
    run.rngState = (effectiveRng as PRNG).getState();
  }
  return run;
}

export function refreshShop(run: Run, catalog: Catalog, rng: Random): boolean {
  if (!canArrange(run) || run.shop.every(offer => offer?.locked) || (!run.freeRefreshes && run.gold < REFRESH_COST)) return false;
  if (run.freeRefreshes) run.freeRefreshes--;
  else run.gold -= REFRESH_COST;
  rollShop(run, catalog, rng, { focus: run.shopFocus === 'any' ? undefined : run.shopFocus });
  return true;
}

export function toggleLock(run: Run, index: number): boolean {
  const offer = run.shop[index];
  if (!canArrange(run) || !offer) return false;
  offer.locked = !offer.locked;
  return true;
}

const validSlot = (run: Pick<Run, 'board' | 'bench'>, slot: Slot) =>
  Number.isInteger(slot.index) && slot.index >= 0 && slot.index < run[slot.zone].length;
export const runeAt = (run: Pick<Run, 'board' | 'bench'>, slot: Slot) => validSlot(run, slot) ? run[slot.zone][slot.index] : null;

export function swapRunes(run: Run, from: Slot, to: Slot): boolean {
  const rune = runeAt(run, from);
  if (!canArrange(run) || !rune || !validSlot(run, to)) return false;
  run[from.zone][from.index] = run[to.zone][to.index];
  run[to.zone][to.index] = rune;
  return true;
}

export interface Merge { slot: Slot; rune: Rune }

export function mergeRunes(run: Run): Merge[] {
  const slots: Slot[] = [
    ...run.board.map((_, index): Slot => ({ zone: 'board', index })),
    ...run.bench.map((_, index): Slot => ({ zone: 'bench', index })),
  ];
  const merges: Merge[] = [];
  while (true) {
    const groups = new Map<string, Slot[]>();
    let trio: Slot[] | undefined;
    for (const slot of slots) {
      const rune = runeAt(run, slot);
      if (!rune || rune.star === 3) continue;
      const key = `${rune.configId}:${rune.star}`;
      const group = groups.get(key) ?? [];
      group.push(slot);
      groups.set(key, group);
      if (group.length === 3) { trio = group; break; }
    }
    if (!trio) return merges;
    const [keep, ...consumed] = trio;
    const rune = runeAt(run, keep)!;
    const totalBonus = trio.reduce((sum, slot) => sum + (runeAt(run, slot)?.bonusPower ?? 0), 0);
    const upgraded: Rune = {
      configId: rune.configId,
      star: (rune.star + 1) as Star,
      ...(totalBonus > 0 ? { bonusPower: totalBonus } : {}),
    };
    run[keep.zone][keep.index] = upgraded;
    for (const slot of consumed) run[slot.zone][slot.index] = null;
    merges.push({ slot: keep, rune: upgraded });
  }
}

export function purchaseInfo(run: Run, index: number, catalog: Catalog) {
  const offer = run.shop[index];
  const config = offer && catalog[offer.configId];
  const copies = config ? [...run.board, ...run.bench].filter(rune => rune?.configId === config.id && rune.star === 1).length : 0;
  const willMerge = copies >= 2;
  const benchFull = !run.bench.includes(null);
  let blocked: 'unavailable' | 'gold' | 'bench' | null = null;
  if (!config || !canArrange(run)) blocked = 'unavailable';
  else if (run.gold < config.cost) blocked = 'gold';
  else if (benchFull && !willMerge) blocked = 'bench';
  return { copies, willMerge, blocked };
}

export function buyRune(run: Run, index: number, catalog: Catalog): Merge[] | null {
  const info = purchaseInfo(run, index, catalog);
  if (info.blocked) return null;
  const offer = run.shop[index];
  if (!offer) return null;
  const config = catalog[offer.configId];
  if (!config) return null;
  const freeSlot = run.bench.indexOf(null);
  run.gold -= config.cost;
  run.shop[index] = null;
  const targetBenchIndex = freeSlot < 0 ? BENCH_SIZE : freeSlot;
  run.bench[targetBenchIndex] = { configId: config.id, star: 1 };
  const merges = mergeRunes(run);
  run.bench.length = BENCH_SIZE;
  return merges;
}

export const sellValue = (rune: Rune, catalog: Catalog) => Math.max(1, Math.floor(catalog[rune.configId].cost * 3 ** (rune.star - 1) * 0.6));

export function sellRune(run: Run, slot: Slot, catalog: Catalog): number {
  const rune = runeAt(run, slot);
  if (!canArrange(run) || !rune) return 0;
  const value = sellValue(rune, catalog);
  run[slot.zone][slot.index] = null;
  run.gold += value;
  return value;
}

export function settleTurn(run: Run, result: TurnResult, catalog: Catalog, rng: Random) {
  if (!canArrange(run)) return;
  run.gold = result.gold;
  run.lastDamage = result.damage;
  run.lastPoison = result.poison;
  run.bestCombo = Math.max(run.bestCombo, result.combo);
  run.attempts++;
  if (!result.win) { run.pendingLoss = true; return; }
  const payout = victoryPayout(run, result.gold, catalog);
  run.gold += payout.total;
  if (payout.bounty) run.bountiesCleared = (run.bountiesCleared ?? 0) + 1;
  if (payout.perk === 'repair') run.shield++;
  if (run.difficulty === 'beginner' && !run.endless) run.shield = Math.min(3, run.shield + 1);
  if (payout.perk === 'engrave') {
    const rune = run.board[engravingCell]!;
    run.board[engravingCell] = { ...rune, bonusPower: (rune.bonusPower ?? 0) + engravingPower };
  }
  if (run.wave === 20 && !run.endless) run.status = 'victory';
  else {
    const choices = relicChoices(run.wave, run.relics, run.altarRule === 1 ? decodeSeed(run.seed) : undefined);
    advanceWave(run, catalog, rng);
    if (payout.perk === 'refresh') run.freeRefreshes += bountyRefreshes;
    run.pendingRelics = choices;
  }
}

export function victoryPayout(run: Pick<Run, 'relics'> &
  Partial<Pick<Run, 'board' | 'enableSynergies' | 'wave' | 'shield' | 'bountyRule' | 'bountyRoute' | 'endless'>>,
  goldAfterBattle: number, catalog?: Catalog) {
  const base = 8;
  let interestDivisor = 10;
  if (run.enableSynergies && run.board && catalog) {
    const synergies = countSynergies(run.board, catalog);
    if (synergies.gold.tier >= 1) interestDivisor = 8;
  }
  const interest = Math.min(5, Math.floor(goldAfterBattle / interestDivisor));
  const relic = run.relics.includes('gate_tithe') ? 4 : 0;
  const reward = run.bountyRule === 1 && !run.endless && run.wave !== undefined ? bountyAt(run.wave, run.bountyRoute) : undefined;
  const bounty = reward?.gold ?? 0;
  const perk = reward?.perk && !bountyPerkUnavailable(reward.perk, run) ? reward.perk : undefined;
  return { base, interest, relic, ...(bounty ? { bounty } : {}), ...(perk ? { perk } : {}), total: base + interest + relic + bounty };
}

export function chooseRelic(run: Run, choice: RelicId): boolean {
  if (run.status !== 'active' || run.pendingLoss || run.relics.includes(choice) || !run.pendingRelics.includes(choice)) return false;
  run.relics.push(choice);
  if (choice === 'tianji_compass') run.gold += 6;
  if (run.altarRule === 1 && choice === 'jade_abacus') run.freeRefreshes++;
  run.pendingRelics = [];
  return true;
}

function advanceWave(run: Run, catalog: Catalog, rng: Random) {
  run.wave++;
  delete run.bountyRoute;
  delete run.pendingCamp;
  delete run.reforgeUsed;
  run.attempts = 0;
  run.freeRefreshes = 1;
  if (run.relics.includes('jade_abacus')) {
    run.freeRefreshes = Math.max(run.freeRefreshes, 2);
  }
  if (run.relics.includes('spirit_gourd') && run.gold >= 20) {
    run.freeRefreshes += 1;
  }
  if (run.difficulty === 'beginner' && !run.endless) run.freeRefreshes += 1;
  if (run.endless && endlessCampAt(run.wave)) {
    if (run.endlessRule === 1) run.pendingCamp = true;
    else if (run.wave !== 21) {
      run.gold += 10;
      if (run.shield < 3) run.shield++;
      run.freeRefreshes += 2;
    }
  }
  rollShop(run, catalog, rng, { supply: run.wave === 2 ? openings[run.opening].supply : undefined });
}

export function resolveLoss(run: Run, protectedRetry: boolean) {
  if (!run.pendingLoss) return;
  run.pendingLoss = false;
  if (!protectedRetry && --run.shield === 0) run.status = 'defeat';
}

export function startEndless(run: Run, catalog: Catalog, rng: Random) {
  if (run.status !== 'victory') return;
  run.status = 'active';
  run.endless = true;
  advanceWave(run, catalog, rng);
}

// Undo Stack functionality
export interface RunSnapshot {
  board: Slots;
  bench: Slots;
  shop: (Offer | null)[];
  gold: number;
  freeRefreshes: number;
  shopFocus: Archetype | 'any';
  rngState: number;
  enableSynergies?: boolean;
  bountyRoute?: BountyRoute;
  reforgeUsed?: true;
  lastCellDamage?: number[];
}

export function createSnapshot(run: Run): RunSnapshot {
  return {
    board: run.board.map(r => r ? { ...r } : null),
    bench: run.bench.map(r => r ? { ...r } : null),
    shop: run.shop.map(o => o ? { ...o } : null),
    gold: run.gold,
    freeRefreshes: run.freeRefreshes,
    shopFocus: run.shopFocus,
    rngState: run.rngState,
    enableSynergies: run.enableSynergies,
    bountyRoute: run.bountyRoute,
    reforgeUsed: run.reforgeUsed,
    lastCellDamage: run.lastCellDamage ? [...run.lastCellDamage] : undefined,
  };
}

export function restoreSnapshot(run: Run, snapshot: RunSnapshot): void {
  run.board = snapshot.board.map((r: Rune | null) => r ? { ...r } : null);
  run.bench = snapshot.bench.map((r: Rune | null) => r ? { ...r } : null);
  run.shop = snapshot.shop.map((o: Offer | null) => o ? { ...o } : null);
  run.gold = snapshot.gold;
  run.freeRefreshes = snapshot.freeRefreshes;
  run.shopFocus = snapshot.shopFocus;
  run.rngState = snapshot.rngState;
  run.enableSynergies = snapshot.enableSynergies;
  run.bountyRoute = snapshot.bountyRoute;
  if (snapshot.reforgeUsed) run.reforgeUsed = true;
  else delete run.reforgeUsed;
  run.lastCellDamage = snapshot.lastCellDamage ? [...snapshot.lastCellDamage] : undefined;
}

export class UndoStack {
  private readonly stack: RunSnapshot[] = [];
  readonly max = 20;

  push(run: Run) {
    if (this.stack.length >= this.max) this.stack.shift();
    this.stack.push(createSnapshot(run));
  }

  pop(run: Run): boolean {
    const snapshot = this.stack.pop();
    if (!snapshot) return false;
    restoreSnapshot(run, snapshot);
    return true;
  }

  clear() {
    this.stack.length = 0;
  }

  get length() {
    return this.stack.length;
  }
}
