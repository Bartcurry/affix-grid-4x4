import { BENCH_SIZE, generateTileModifiers, newRun, SHOP_SIZE } from '../core/shopEngine';
import { CELL_COUNT } from '../core/grid';
import { readJournal } from '../core/journal';
import { endlessCampAt, relics } from '../core/expedition';
import { trialAt } from '../core/trials';
import { isOpening, openingIds, type RunRecords } from '../core/openings';
import { createMulberry32, decodeSeed, generateSeedCode } from '../core/rng';
import type { Catalog, OpeningId, Run, Slots, TileModifierMap } from '../core/types';
import { catalog as defaultCatalog } from '../data/catalog';
import { renderScoreCard } from '../render/scoreCard';
import type { PlatformAdapter, Reward, SaveData } from './adapter';

const SAVE_KEY_V2 = 'affix-grid-4x4.v2';
const SAVE_KEY_V1 = 'affix-grid-4x4.v1';
const rewardLabels: Record<Reward, string> = { refresh: '获得 2 次免费刷新', retry: '保留护盾并重新布阵', support: '解锁霓虹边框彩蛋' };
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
  if (parsed?.run && isOpening(parsed.run.opening) && natural(parsed.run.wave) && parsed.run.wave > 1) {
    const op: OpeningId = parsed.run.opening;
    if (!defaultRecords[op]) {
      defaultRecords[op] = { cleared: parsed.run.wave - 1, combo: natural(parsed.run.bestCombo) ? parsed.run.bestCombo : 0 };
    }
  }
  const fallback = (): SaveData => ({
    schemaVersion: 2,
    run: newRun(catalog, createMulberry32(1), 'chain'),
    muted: false,
    skin: false,
    speed: 1,
    exactForecast: false,
    records: defaultRecords,
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
    if (rawRun.openingRule !== 1 && opening === 'chain' && wave === 1 && !rawRun.attempts && !rawRun.lastDamage &&
      board[0]?.configId === 'spark_orb' && board[0].star === 1 && board[1]?.configId === 'prism_right' &&
      board[1].star === 1 && !board.slice(2).some(Boolean)) {
      [board[0], board[1]] = [board[1], board[0]];
    }

    const shop = Array.isArray(rawRun.shop) && rawRun.shop.length === SHOP_SIZE
      ? rawRun.shop.map((offer: any) => offer && known(offer.configId) ? { configId: offer.configId, locked: !!offer.locked } : null)
      : Array(SHOP_SIZE).fill(null);

    const relicsList = Array.isArray(rawRun.relics)
      ? rawRun.relics.filter((id: any) => typeof id === 'string' && Object.hasOwn(relics, id))
      : [];
    const pendingRelicsList = Array.isArray(rawRun.pendingRelics)
      ? rawRun.pendingRelics.filter((id: any) => typeof id === 'string' && Object.hasOwn(relics, id))
      : [];
    const clearedTrials = Array.isArray(rawRun.clearedTrials)
      ? rawRun.clearedTrials.filter((entry: unknown): entry is number => natural(entry) && entry < wave && !!trialAt(entry))
      : [];
    const trialWave = !rawRun.endless && rawRun.trialWave === wave && trialAt(wave) ? wave : undefined;
    const trialRule = rawRun.trialRule === 1 && rawRun.relicRule === 1 ? 1 : undefined;
    const endlessRule = trialRule && rawRun.endlessRule === 1 ? 1 : undefined;
    const pendingCamp = endlessRule && rawRun.endless && rawRun.pendingCamp === true && endlessCampAt(wave) &&
      rawRun.status === 'active' && !rawRun.pendingLoss && !pendingRelicsList.length ? true : undefined;

    const migratedRun: Run = {
      seed,
      rngState,
      tileModifiers,
      opening,
      openingRule: 1,
      relicRule: rawRun.relicRule === 1 ? 1 : undefined,
      trialRule,
      endlessRule,
      bountyRewardRule: endlessRule && rawRun.bountyRewardRule === 1 ? 1 : undefined,
      shopFocus,
      wave,
      gold,
      shield,
      board,
      bench,
      shop,
      freeRefreshes: natural(rawRun.freeRefreshes) ? rawRun.freeRefreshes : 1,
      attempts: natural(rawRun.attempts) ? rawRun.attempts : 0,
      endless: !!rawRun.endless,
      pendingCamp,
      status: ['active', 'victory', 'defeat'].includes(rawRun.status) ? rawRun.status : 'active',
      lastDamage: damageCount(rawRun.lastDamage) ? rawRun.lastDamage : 0,
      lastJournal: readJournal(rawRun.lastJournal, catalog),
      trialWave,
      trialRoute: trialRule && trialWave && rawRun.trialRoute === 'alternate' && trialAt(wave, 'alternate') ? 'alternate' : undefined,
      clearedTrials: clearedTrials.length ? [...new Set<number>(clearedTrials)].sort((a, b) => a - b) : undefined,
      lastPoison: damageCount(rawRun.lastPoison) ? rawRun.lastPoison : 0,
      bestCombo: natural(rawRun.bestCombo) ? rawRun.bestCombo : 0,
      pendingLoss: !!rawRun.pendingLoss,
      relics: relicsList,
      pendingRelics: pendingRelicsList,
    };

    return {
      schemaVersion: 2,
      run: migratedRun,
      muted: !!parsed.muted,
      skin: !!parsed.skin,
      speed: parsed.speed === 0 || parsed.speed === 2 ? parsed.speed : 1,
      exactForecast: !!parsed.exactForecast,
      records: defaultRecords,
    };
  } catch {
    return fallback();
  }
}

export class WebMockAdapter implements PlatformAdapter {
  constructor(private readonly catalog: Catalog, private readonly ad: HTMLDialogElement, private readonly adText: HTMLElement,
    private readonly cancelButton: HTMLButtonElement, private readonly saveKey = SAVE_KEY_V2) {}

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

  showRewardedVideo(reward: Reward): Promise<boolean> {
    if (this.ad.open) return Promise.resolve(false);
    return new Promise(resolve => {
      const finish = (completed: boolean) => {
        clearTimeout(timer);
        this.cancelButton.removeEventListener('click', cancel);
        this.ad.removeEventListener('cancel', escape);
        this.ad.close();
        resolve(completed);
      };
      const cancel = () => finish(false);
      const escape = (event: Event) => { event.preventDefault(); cancel(); };
      this.adText.textContent = `1 秒后${rewardLabels[reward]}。模拟广告，无外部请求。`;
      this.cancelButton.addEventListener('click', cancel);
      this.ad.addEventListener('cancel', escape);
      this.ad.showModal();
      const timer = setTimeout(() => finish(true), 1000);
    });
  }

  async exportScore(run: Run) {
    const image = renderScoreCard(run, this.catalog);
    if (!image) return false;
    const filename = `affix-grid-wave-${run.wave}-${run.seed}.png`;
    const blob = await new Promise<Blob | null>(resolve => image.toBlob(resolve, 'image/png'));
    if (!blob) return false;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
    return true;
  }
}
