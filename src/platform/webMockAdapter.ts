import { BENCH_SIZE, generateTileModifiers, newRun, SHOP_SIZE } from '../core/shopEngine';
import { bountyAt, bountyCount, engravingWave } from '../core/bounties';
import { reforgeWave } from '../core/reforge';
import { CELL_COUNT } from '../core/grid';
import { readJournal } from '../core/journal';
import { endlessCampAt, relics } from '../core/expedition';
import { isOpening, openingIds, type RunRecords } from '../core/openings';
import { createMulberry32, decodeSeed, generateSeedCode } from '../core/rng';
import type { Catalog, OpeningId, Run, Slots, TileModifierMap } from '../core/types';
import { catalog as defaultCatalog } from '../data/catalog';
import type { PlatformAdapter, RunArchive, SaveData } from './adapter';
import { archiveBoard, archiveLimit } from './runArchive';

const SAVE_KEY_V2 = 'affix-grid-4x4.v2';
const SAVE_KEY_V1 = 'affix-grid-4x4.v1';
const natural = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const damageCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;

export function readRecords(value: unknown): RunRecords {
  if (!value || typeof value !== 'object') return {};
  const source = value as RunRecords;
  return Object.fromEntries(openingIds.flatMap(id => {
    const entry = source[id];
    return entry && natural(entry.cleared) && natural(entry.combo) ? [[id, { cleared: entry.cleared, combo: entry.combo }]] : [];
  }));
}

export function migrateSave(raw: unknown, catalog: Catalog = defaultCatalog): SaveData {
  let parsed: any = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
  }

  const defaultRecords = readRecords(parsed?.records);
  const beginnerRecords = readRecords(parsed?.beginnerRecords);
  const expertRecords = readRecords(parsed?.expertRecords);
  if (parsed?.run && isOpening(parsed.run.opening) && natural(parsed.run.wave) && parsed.run.wave > 1) {
    const op: OpeningId = parsed.run.opening;
    const records = parsed.run.difficulty === 'expert' && parsed.run.engravingRule === 1 ? expertRecords
      : parsed.run.difficulty === 'beginner' && parsed.run.finaleRule === 1 ? beginnerRecords : defaultRecords;
    if (!records[op]) {
      records[op] = { cleared: parsed.run.wave - Number(parsed.run.status !== 'victory'), combo: natural(parsed.run.bestCombo) ? parsed.run.bestCombo : 0 };
    }
  }
  const difficultyRecords = {
    ...(Object.keys(beginnerRecords).length ? { beginnerRecords } : {}),
    ...(Object.keys(expertRecords).length ? { expertRecords } : {}),
  };

  const parseHistory = (rawList: unknown): RunArchive[] => {
    if (!Array.isArray(rawList)) return [];
    return rawList
      .filter((item: any) => item && typeof item.seed === 'string' && isOpening(item.opening))
      .slice(0, archiveLimit)
      .map((item: any) => ({
        id: typeof item.id === 'string' ? item.id : `${item.seed}-${item.wave}`,
        seed: String(item.seed),
        wave: natural(item.wave) ? item.wave : 1,
        opening: item.opening as OpeningId,
        status: ['victory', 'defeat', 'active'].includes(item.status) ? item.status : 'defeat',
        lastDamage: damageCount(item.lastDamage) ? item.lastDamage : 0,
        bestCombo: natural(item.bestCombo) ? item.bestCombo : 0,
        date: typeof item.date === 'string' ? item.date : new Date().toLocaleDateString('zh-CN'),
        relicsCount: natural(item.relicsCount) ? item.relicsCount : 0,
        ...(item.enableSynergies === false ? { enableSynergies: false as const } : {}),
        ...(item.altarRule === 1 ? { altarRule: 1 as const } : {}),
        ...(item.altarRule === 1 && item.bountyRule === 1 ? { bountyRule: 1 as const } : {}),
        ...(natural(item.bountiesCleared) && item.bountiesCleared <= bountyCount ? { bountiesCleared: item.bountiesCleared } : {}),
        ...(item.altarRule === 1 && item.bountyRule === 1 && item.endlessRule === 1 ? { endlessRule: 1 as const } : {}),
        ...(item.altarRule === 1 && item.bountyRule === 1 && item.endlessRule === 1 && item.reforgeRule === 1 ? { reforgeRule: 1 as const } : {}),
        ...(item.altarRule === 1 && item.bountyRule === 1 && item.endlessRule === 1 && item.reforgeRule === 1 && item.finaleRule === 1 ? { finaleRule: 1 as const } : {}),
        ...(item.finaleRule === 1 && item.engravingRule === 1 ? { engravingRule: 1 as const } : {}),
        ...(item.opening === 'chain' && item.firstWaveRule === 1 ? { firstWaveRule: 1 as const } : {}),
        ...(item.finaleRule === 1 && item.difficulty === 'beginner' ? { difficulty: 'beginner' as const } : {}),
        ...(item.engravingRule === 1 && item.difficulty === 'expert' ? { difficulty: 'expert' as const } : {}),
        ...(item.endless === true || (natural(item.wave) && item.wave > 20) ? { endless: true as const } : {}),
        ...(typeof item.formation === 'string' && archiveBoard(item, catalog) ? { formation: item.formation } : {}),
      }));
  };

  const defaultHistory = parseHistory(parsed?.history);

  const fallback = (): SaveData => ({
    schemaVersion: 2,
    run: newRun(catalog, createMulberry32(1), 'chain'),
    muted: !!parsed?.muted,
    skin: !!parsed?.skin,
    speed: parsed?.speed === 0 || parsed?.speed === 2 ? parsed.speed : 1,
    exactForecast: !!parsed?.exactForecast,
    records: defaultRecords,
    ...difficultyRecords,
    history: defaultHistory,
    ambientMuted: !!parsed?.ambientMuted,
  });

  if (!parsed || typeof parsed !== 'object') return fallback();

  try {
    const rawRun = parsed.run;
    if (!rawRun || typeof rawRun !== 'object') return fallback();

    const seed = typeof rawRun.seed === 'string' && rawRun.seed ? rawRun.seed : generateSeedCode().code;
    const rngState = natural(rawRun.rngState) ? rawRun.rngState : decodeSeed(seed);
    const tileModifiers: TileModifierMap = (rawRun.tileModifiers && typeof rawRun.tileModifiers === 'object' && Object.keys(rawRun.tileModifiers).length === 3)
      ? rawRun.tileModifiers
      : generateTileModifiers(createMulberry32(rngState));

    const opening: OpeningId = isOpening(rawRun.opening) ? rawRun.opening : 'chain';
    const shopFocus = (rawRun.shopFocus === 'any' || isOpening(rawRun.shopFocus)) ? rawRun.shopFocus : opening;
    const wave = natural(rawRun.wave) && rawRun.wave > 0 ? rawRun.wave : 1;
    const gold = natural(rawRun.gold) ? rawRun.gold : 10;
    const shield = natural(rawRun.shield) && rawRun.shield <= 3 ? rawRun.shield : 3;

    const known = (id: string) => typeof id === 'string' && Object.hasOwn(catalog, id);
    const fixSlots = (slots: any, size: number): Slots => {
      if (!Array.isArray(slots)) return Array(size).fill(null);
      return Array.from({ length: size }, (_, i) => {
        const item = slots[i];
        if (item && known(item.configId) && [1, 2, 3].includes(item.star)) {
          return { configId: item.configId, star: item.star, ...(item.bonusPower ? { bonusPower: item.bonusPower } : {}) };
        }
        return null;
      });
    };

    const board = fixSlots(rawRun.board, CELL_COUNT);
    const bench = fixSlots(rawRun.bench, BENCH_SIZE);

    const shop = Array.isArray(rawRun.shop) && rawRun.shop.length === SHOP_SIZE
      ? rawRun.shop.map((offer: any) => offer && known(offer.configId) ? { configId: offer.configId, locked: !!offer.locked } : null)
      : Array(SHOP_SIZE).fill(null);

    const relicsList = Array.isArray(rawRun.relics)
      ? rawRun.relics.filter((id: any) => typeof id === 'string' && Object.hasOwn(relics, id))
      : [];
    const pendingRelicsList = Array.isArray(rawRun.pendingRelics)
      ? rawRun.pendingRelics.filter((id: any) => typeof id === 'string' && Object.hasOwn(relics, id))
      : [];
    const journal = readJournal(rawRun.lastJournal, catalog);
    const bountyRule = rawRun.altarRule === 1 && rawRun.bountyRule === 1;
    const bountyRoute = bountyRule && !rawRun.endless && bountyAt(wave, rawRun.bountyRoute) ? rawRun.bountyRoute : undefined;
    const endlessRule = bountyRule && rawRun.endlessRule === 1;
    const reforgeRule = endlessRule && rawRun.reforgeRule === 1;
    const finaleRule = reforgeRule && rawRun.finaleRule === 1;
    const engravingRule = finaleRule && rawRun.engravingRule === 1;
    const pendingEngraving = engravingRule && !rawRun.endless && rawRun.status === 'active' && !rawRun.pendingLoss &&
      wave === engravingWave && rawRun.pendingEngraving === true && board.some(Boolean);
    const pendingCamp = endlessRule && rawRun.endless === true && rawRun.status === 'active' &&
      !rawRun.pendingLoss && endlessCampAt(wave) && rawRun.pendingCamp === true;

    const migratedRun: Run = {
      seed,
      rngState,
      tileModifiers,
      opening,
      shopFocus,
      wave,
      gold,
      shield,
      board,
      bench,
      shop,
      freeRefreshes: natural(rawRun.freeRefreshes) ? rawRun.freeRefreshes : 1,
      attempts: Math.max(Number(!!rawRun.pendingLoss), natural(rawRun.attempts) ? rawRun.attempts : 0),
      endless: !!rawRun.endless,
      status: ['active', 'victory', 'defeat'].includes(rawRun.status) ? rawRun.status : 'active',
      lastDamage: damageCount(rawRun.lastDamage) ? rawRun.lastDamage : 0,
      lastPoison: damageCount(rawRun.lastPoison) ? rawRun.lastPoison : 0,
      bestCombo: natural(rawRun.bestCombo) ? rawRun.bestCombo : 0,
      pendingLoss: !!rawRun.pendingLoss,
      relics: relicsList,
      pendingRelics: pendingRelicsList,
      enableSynergies: rawRun.enableSynergies !== false,
      ...(rawRun.altarRule === 1 ? { altarRule: 1 } : {}),
      ...(bountyRule ? { bountyRule: 1 } : {}),
      ...(bountyRoute ? { bountyRoute } : {}),
      ...(bountyRule && natural(rawRun.bountiesCleared) && rawRun.bountiesCleared <= bountyCount ? { bountiesCleared: rawRun.bountiesCleared } : {}),
      ...(endlessRule ? { endlessRule: 1 } : {}),
      ...(reforgeRule ? { reforgeRule: 1 } : {}),
      ...(finaleRule ? { finaleRule: 1 } : {}),
      ...(engravingRule ? { engravingRule: 1 } : {}),
      ...(opening === 'chain' && rawRun.firstWaveRule === 1 ? { firstWaveRule: 1 } : {}),
      ...(pendingEngraving ? { pendingEngraving: true } : {}),
      ...(finaleRule && rawRun.difficulty === 'beginner' ? { difficulty: 'beginner' } : {}),
      ...(engravingRule && rawRun.difficulty === 'expert' ? { difficulty: 'expert' } : {}),
      ...(reforgeRule && wave === reforgeWave && rawRun.reforgeUsed === true ? { reforgeUsed: true } : {}),
      ...(pendingCamp ? { pendingCamp: true } : {}),
      ...(Array.isArray(rawRun.lastCellDamage) && rawRun.lastCellDamage.length === CELL_COUNT && rawRun.lastCellDamage.every(damageCount)
        ? { lastCellDamage: rawRun.lastCellDamage } : {}),
      ...(journal ? { lastJournal: journal } : {}),
    };

    return {
      schemaVersion: 2,
      run: migratedRun,
      muted: !!parsed.muted,
      skin: !!parsed.skin,
      speed: parsed.speed === 0 || parsed.speed === 2 ? parsed.speed : 1,
      exactForecast: !!parsed.exactForecast,
      ...(typeof parsed.trackedUpgrade === 'string' && Object.hasOwn(catalog, parsed.trackedUpgrade) ? { trackedUpgrade: parsed.trackedUpgrade } : {}),
      ...(wave === 2 && natural(parsed.firstClearPayout) ? { firstClearPayout: parsed.firstClearPayout } : {}),
      records: defaultRecords,
      ...difficultyRecords,
      history: defaultHistory,
      ambientMuted: !!parsed.ambientMuted,
    };
  } catch {
    return fallback();
  }
}

export class WebSaveAdapter implements PlatformAdapter {
  constructor(private readonly catalog: Catalog, private readonly saveKey = SAVE_KEY_V2) {}

  load(saveMigration = true): SaveData | null {
    try {
      const rawV2 = localStorage.getItem(this.saveKey);
      if (rawV2) {
        return migrateSave(rawV2, this.catalog);
      }
      if (this.saveKey !== SAVE_KEY_V2) return null;
      const rawV1 = localStorage.getItem(SAVE_KEY_V1);
      if (rawV1) {
        const migrated = migrateSave(rawV1, this.catalog);
        if (saveMigration) this.save(migrated);
        return migrated;
      }
      return null;
    } catch {
      return null;
    }
  }

  save(data: SaveData) {
    try {
      localStorage.setItem(this.saveKey, JSON.stringify(data));
    } catch {
      return;
    }
  }
}
