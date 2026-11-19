import { CELL_COUNT } from './grid';
import { relicChoices } from './expedition';
import { openings } from './openings';
import type { Archetype, Catalog, Offer, OpeningId, Random, Rarity, RelicId, Run, Rune, Slot, Star, TurnResult } from './types';

export const BENCH_SIZE = 4;
export const SHOP_SIZE = 3;
export const REFRESH_COST = 2;
export const canArrange = (run: Run) => run.status === 'active' && !run.pendingLoss && !run.pendingRelics.length;

export function rarityOdds(wave: number): Record<Rarity, number> {
  return wave <= 4 ? { common: 0.75, rare: 0.22, epic: 0.03 }
    : wave <= 10 ? { common: 0.50, rare: 0.38, epic: 0.12 } : { common: 0.30, rare: 0.45, epic: 0.25 };
}

function rollShop(run: Run, catalog: Catalog, rng: Random, options: { focus?: Archetype; supply?: string } = {}) {
  const odds = rarityOdds(run.wave);
  const configs = Object.values(catalog);
  const guided = Array.from({ length: SHOP_SIZE }, (_, index) => index).find(index => !run.shop[index]?.locked);
  run.shop = Array.from({ length: SHOP_SIZE }, (_, index): Offer | null => {
    if (run.shop[index]?.locked) return run.shop[index];
    if (index === guided && options.supply && catalog[options.supply]) return { configId: options.supply, locked: false };
    const roll = rng();
    const rarity = roll < odds.common ? 'common' : roll < odds.common + odds.rare ? 'rare' : 'epic';
    const tier = configs.filter(config => config.rarity === rarity);
    const focused = index === guided && options.focus ? tier.filter(config => config.archetype === options.focus) : [];
    const pool = focused.length ? focused : tier.length ? tier : configs;
    return pool.length ? { configId: pool[Math.floor(rng() * pool.length)].id, locked: false } : null;
  });
}

export function newRun(catalog: Catalog, rng: Random, opening: OpeningId = 'chain'): Run {
  const setup = openings[opening];
  const run: Run = {
    opening, shopFocus: opening, wave: 1, gold: setup.gold, shield: 3, board: Array<Rune | null>(CELL_COUNT).fill(null),
    bench: Array<Rune | null>(BENCH_SIZE).fill(null), shop: [], freeRefreshes: 1, attempts: 0,
    endless: false, status: 'active', lastDamage: 0, lastPoison: 0, bestCombo: 0, pendingLoss: false, relics: [], pendingRelics: [],
  };
  for (const [index, configId] of setup.pieces) run.board[index] = { configId, star: 1 };
  rollShop(run, catalog, rng);
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

const validSlot = (run: Run, slot: Slot) => Number.isInteger(slot.index) && slot.index >= 0 && slot.index < run[slot.zone].length;
export const runeAt = (run: Run, slot: Slot) => validSlot(run, slot) ? run[slot.zone][slot.index] : null;

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
    const upgraded: Rune = { configId: rune.configId, star: (rune.star + 1) as Star };
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
  return { copies, willMerge, blocked: !config || !canArrange(run) ? 'unavailable' :
    run.gold < config.cost ? 'gold' : !willMerge && !run.bench.includes(null) ? 'bench' : null };
}

export function buyRune(run: Run, index: number, catalog: Catalog): Merge[] | null {
  if (purchaseInfo(run, index, catalog).blocked) return null;
  const config = catalog[run.shop[index]!.configId];
  const freeSlot = run.bench.indexOf(null);
  run.gold -= config.cost;
  run.shop[index] = null;
  run.bench[freeSlot < 0 ? BENCH_SIZE : freeSlot] = { configId: config.id, star: 1 };
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
  run.gold += victoryPayout(run, result.gold).total;
  if (run.wave === 20 && !run.endless) run.status = 'victory';
  else {
    const choices = relicChoices(run.wave, run.relics);
    advanceWave(run, catalog, rng);
    run.pendingRelics = choices;
  }
}

export function victoryPayout(run: Pick<Run, 'relics'>, goldAfterBattle: number) {
  const base = 8;
  const interest = Math.min(5, Math.floor(goldAfterBattle / 10));
  const relic = run.relics.includes('gate_tithe') ? 4 : 0;
  return { base, interest, relic, total: base + interest + relic };
}

export function chooseRelic(run: Run, choice: RelicId): boolean {
  if (run.status !== 'active' || run.pendingLoss || run.relics.includes(choice) || !run.pendingRelics.includes(choice)) return false;
  run.relics.push(choice);
  run.pendingRelics = [];
  return true;
}

function advanceWave(run: Run, catalog: Catalog, rng: Random) {
  run.wave++;
  run.attempts = 0;
  run.freeRefreshes = 1;
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
