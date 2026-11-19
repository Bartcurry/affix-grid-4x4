import { BENCH_SIZE, SHOP_SIZE } from '../core/shopEngine';
import { CELL_COUNT } from '../core/grid';
import type { Catalog, Run } from '../core/types';
import type { PlatformAdapter, Reward, SaveData } from './adapter';

const SAVE_KEY = 'affix-grid-4x4.v1';
const rewardLabels: Record<Reward, string> = { refresh: '获得 2 次免费刷新', retry: '保留护盾并重新布阵', support: '解锁霓虹边框彩蛋' };
const natural = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const damageCount = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value >= 0;

function validRun(run: Run, catalog: Catalog) {
  const known = (id: string) => typeof id === 'string' && Object.hasOwn(catalog, id);
  const validSlots = (slots: Run['board'], size: number) => Array.isArray(slots) && slots.length === size &&
    slots.every(rune => rune === null || (rune && known(rune.configId) && [1, 2, 3].includes(rune.star)));
  return run && natural(run.wave) && run.wave > 0 && natural(run.gold) && natural(run.shield) && run.shield <= 3 &&
    natural(run.freeRefreshes) && natural(run.attempts) && damageCount(run.lastDamage) && damageCount(run.lastPoison) && natural(run.bestCombo) &&
    typeof run.endless === 'boolean' && typeof run.pendingLoss === 'boolean' && ['active', 'victory', 'defeat'].includes(run.status) &&
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
    gradient.addColorStop(0, '#101b35'); gradient.addColorStop(1, '#132a42');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 720, 860);
    ctx.strokeStyle = '#67e8f9'; ctx.lineWidth = 3; ctx.strokeRect(28, 28, 664, 804);
    const print = (value: string, y: number, size: number, color: string) => {
      ctx.font = `bold ${size}px system-ui, sans-serif`; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.fillText(value, 360, y);
    };
    print('AFFIX GRID / 4×4', 126, 30, '#78eaff');
    print('词条法阵', 228, 70, '#eaf7ff');
    print(`${run.status === 'victory' ? '二十波通关' : '抵达波次'} · ${run.wave}`, 358, 44, '#ffdc85');
    print(`本轮伤害 ${run.lastDamage.toLocaleString('zh-CN')}`, 502, 33, '#d9eeff');
    print(`最高连击 ${run.bestCombo}`, 572, 33, '#d9eeff');
    print(run.endless ? 'ENDLESS MODE' : 'RUN REPORT', 749, 28, '#7de3fa');
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
