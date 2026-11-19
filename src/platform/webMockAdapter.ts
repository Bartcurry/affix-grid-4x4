import { BENCH_SIZE, SHOP_SIZE } from '../core/shopEngine';
import { CELL_COUNT } from '../core/grid';
import { relics } from '../core/expedition';
import { isOpening, openingIds, openings, type RunRecords } from '../core/openings';
import type { Catalog, Run } from '../core/types';
import type { PlatformAdapter, Reward, SaveData } from './adapter';

const SAVE_KEY = 'affix-grid-4x4.v1';
const rewardLabels: Record<Reward, string> = { refresh: '获得 2 次免费刷新', retry: '保留护盾并重新布阵', support: '解锁霓虹边框彩蛋' };
const natural = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const damageCount = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value >= 0;
const validRelics = (value: unknown, max: number) => Array.isArray(value) && value.length <= max &&
  new Set(value).size === value.length && value.every(id => typeof id === 'string' && Object.hasOwn(relics, id));

function readRecords(value: unknown): RunRecords {
  if (!value || typeof value !== 'object') return {};
  const source = value as RunRecords;
  return Object.fromEntries(openingIds.flatMap(id => {
    const entry = source[id];
    return entry && natural(entry.cleared) && natural(entry.combo) ? [[id, { cleared: entry.cleared, combo: entry.combo }]] : [];
  }));
}

function validRun(run: Run, catalog: Catalog) {
  const known = (id: string) => typeof id === 'string' && Object.hasOwn(catalog, id);
  const validSlots = (slots: Run['board'], size: number) => Array.isArray(slots) && slots.length === size &&
    slots.every(rune => rune === null || (rune && known(rune.configId) && [1, 2, 3].includes(rune.star)));
  return run && isOpening(run.opening) && natural(run.wave) && run.wave > 0 && natural(run.gold) && natural(run.shield) && run.shield <= 3 &&
    (run.shopFocus === 'any' || isOpening(run.shopFocus)) &&
    natural(run.freeRefreshes) && natural(run.attempts) && damageCount(run.lastDamage) && damageCount(run.lastPoison) && natural(run.bestCombo) &&
    typeof run.endless === 'boolean' && typeof run.pendingLoss === 'boolean' && ['active', 'victory', 'defeat'].includes(run.status) &&
    validRelics(run.relics, 4) && validRelics(run.pendingRelics, 3) &&
    (!run.pendingRelics.length || (run.status === 'active' && !run.pendingLoss && run.pendingRelics.every(id => !run.relics.includes(id)))) &&
    validSlots(run.board, CELL_COUNT) && validSlots(run.bench, BENCH_SIZE) && Array.isArray(run.shop) && run.shop.length === SHOP_SIZE &&
    run.shop.every(offer => offer === null || (offer && known(offer.configId) && typeof offer.locked === 'boolean'));
}

export class WebMockAdapter implements PlatformAdapter {
  constructor(private readonly catalog: Catalog, private readonly ad: HTMLDialogElement, private readonly adText: HTMLElement,
    private readonly cancelButton: HTMLButtonElement) {}

  load(): SaveData | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw) as SaveData | null;
      if (data?.run) {
        data.run.opening ??= 'chain';
        data.run.shopFocus ??= data.run.opening;
        data.run.relics ??= [];
        data.run.pendingRelics ??= [];
        data.records = readRecords(data.records);
      }
      return data && validRun(data.run, this.catalog) && typeof data.muted === 'boolean' && typeof data.skin === 'boolean' &&
        (data.speed === 1 || data.speed === 2) ? data : null;
    } catch { return null; }
  }

  save(data: SaveData) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { return; }
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
    const image = document.createElement('canvas');
    image.width = 720; image.height = 860;
    const ctx = image.getContext('2d');
    if (!ctx) return false;
    const gradient = ctx.createLinearGradient(0, 0, 720, 860);
    gradient.addColorStop(0, '#282a20'); gradient.addColorStop(1, '#39291e');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 720, 860);
    ctx.strokeStyle = '#caa66e'; ctx.lineWidth = 3; ctx.strokeRect(28, 28, 664, 804);
    const print = (value: string, y: number, size: number, color: string) => {
      ctx.font = `bold ${size}px system-ui, sans-serif`; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.fillText(value, 360, y);
    };
    print('词条法阵', 161, 70, '#f3e9cf');
    print(`${openings[run.opening].name} · ${openings[run.opening].label}开局`, 244, 33, '#e2bf87');
    print(`打过第 ${run.wave - Number(run.status !== 'victory')} 波`, 390, 44, '#ffdc85');
    print(`本轮伤害 ${run.lastDamage.toLocaleString('zh-CN')}`, 512, 33, '#f0dec1');
    print(`最高连击 ${run.bestCombo}`, 582, 33, '#f0dec1');
    print(run.endless ? '无尽战绩' : '本局战绩', 749, 28, '#e2bf87');
    const blob = await new Promise<Blob | null>(resolve => image.toBlob(resolve, 'image/png'));
    if (!blob) return false;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `affix-grid-wave-${run.wave}.png`;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
    return true;
  }
}
