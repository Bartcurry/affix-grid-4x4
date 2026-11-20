import type { Catalog } from '../core/types';
import { formatNumber as format } from './canvasRenderer';
import type { PuzzleShareCard } from './puzzleShareCard';

export function bindPuzzleShareRoom(catalog: Catalog, click: () => void) {
  const dialog = document.querySelector<HTMLDialogElement>('#puzzle-share-dialog')!;
  const get = <T extends HTMLElement = HTMLElement>(id: string) => dialog.querySelector<T>(`#puzzle-share-${id}`)!;
  const canvas = get<HTMLCanvasElement>('canvas');
  const status = get('status');
  const link = get<HTMLInputElement>('link');
  const native = get<HTMLButtonElement>('native');
  const download = get<HTMLButtonElement>('download');
  let active: { title: string; caption: string; url: string; image?: File } | undefined;

  get('close').onclick = () => dialog.close();
  dialog.addEventListener('close', () => { if (!dialog.open) active = undefined; });

  get('copy').onclick = async () => {
    if (!active) return;
    click();
    const entry = active;
    try {
      await navigator.clipboard.writeText(`${entry.title}\n${entry.caption}\n${entry.url}`);
      if (dialog.open && active === entry) status.textContent = '挑战链接已复制。';
    } catch {
      if (!dialog.open || active !== entry) return;
      link.hidden = false;
      link.focus();
      link.select();
      status.textContent = '长按链接可复制。';
    }
  };

  download.onclick = () => {
    if (!active?.image) return;
    click();
    const url = URL.createObjectURL(active.image);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = active.image.name;
    dialog.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };

  native.onclick = async () => {
    if (!active) return;
    click();
    const entry = active;
    const { title, caption: text, url, image } = entry;
    try {
      const files = image && navigator.canShare?.({ files: [image] }) ? [image] : undefined;
      await navigator.share({ title, text, url, ...(files ? { files } : {}) });
    } catch (error) {
      if (dialog.open && active === entry && !(error instanceof DOMException && error.name === 'AbortError')) {
        status.textContent = '可以保存图片或复制链接转发。';
      }
    }
  };

  return async (card: PuzzleShareCard) => {
    if (dialog.open) return;
    click();
    const daily = card.kind === 'daily';
    const title = daily ? card.puzzle.formation.title : '三阵接力';
    const caption = daily ? `${card.score.moves} 步过关 · 最高 ${format(card.score.peakDamage ?? card.score.damage)} 伤害`
      : `${card.score.moves} 步 · ${format(card.score.damage)} 总伤害`;
    const entry: NonNullable<typeof active> = { title: `4×4 词条法阵 · ${title}`, caption, url: card.url };
    active = entry;
    get('title').textContent = daily ? '每日战绩卡' : '接力战绩卡';
    canvas.setAttribute('aria-label', `${title}，${caption}。二维码打开原题。`);
    link.value = entry.url;
    link.hidden = canvas.hidden = download.disabled = true;
    native.hidden = typeof navigator.share !== 'function';
    native.disabled = true;
    status.textContent = '正在生成图片…';
    dialog.showModal();
    try {
      const { renderPuzzleShareCard } = await import('./puzzleShareCard');
      if (!dialog.open || active !== entry) return;
      if (!renderPuzzleShareCard(canvas, card, catalog)) throw new Error('Canvas unavailable');
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!dialog.open || active !== entry) return;
      if (!blob) throw new Error('Image unavailable');
      const date = daily ? card.puzzle.day : card.relay.day;
      entry.image = new File([blob], `affix-grid-${card.kind}-${date}.png`, { type: 'image/png' });
      canvas.hidden = download.disabled = false;
      if (status.textContent === '正在生成图片…') status.textContent = '图片里的二维码可打开原题。';
    } catch {
      if (dialog.open && active === entry && status.textContent === '正在生成图片…') {
        status.textContent = '图片生成失败。可以复制原题链接。';
      }
    } finally {
      if (dialog.open && active === entry) native.disabled = false;
    }
  };
}
