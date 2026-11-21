import { challengeFromRun, challengeUrl } from '../core/challenge';
import { dailyRouteParam } from '../core/daily';
import type { Catalog, Run } from '../core/types';
import { formatNumber as format } from './canvasRenderer';
import type { PuzzleShareCard } from './puzzleShareCard';

export function bindScoreShareRoom(catalog: Catalog, click: () => void) {
  const dialog = document.querySelector<HTMLDialogElement>('#score-share-dialog')!;
  const get = <T extends HTMLElement = HTMLElement>(id: string) => dialog.querySelector<T>(`#score-share-${id}`)!;
  const canvas = get<HTMLCanvasElement>('canvas');
  const status = get('status');
  const link = get<HTMLInputElement>('link');
  const native = get<HTMLButtonElement>('native');
  const download = get<HTMLButtonElement>('download');
  const copy = get<HTMLButtonElement>('copy');
  let active: { title: string; caption: string; url?: string; image?: File } | undefined;

  get('close').onclick = () => dialog.close();
  dialog.addEventListener('close', () => { if (!dialog.open) active = undefined; });

  copy.onclick = async () => {
    if (!active?.url) return;
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

  const shareableFiles = (image?: File) => image && navigator.canShare?.({ files: [image] }) ? [image] : undefined;
  native.onclick = async () => {
    if (!active) return;
    click();
    const entry = active;
    const { title, caption: text, url, image } = entry;
    try {
      const files = shareableFiles(image);
      await navigator.share({ title, text, ...(url ? { url } : {}), ...(files ? { files } : {}) });
    } catch (error) {
      if (dialog.open && active === entry && !(error instanceof DOMException && error.name === 'AbortError')) {
        status.textContent = url ? '可以保存图片或复制链接转发。' : '可以先保存图片再转发。';
      }
    }
  };

  async function show(options: { label: string; title: string; caption: string; filename: string; url?: string; scanText: string;
    loadRenderer: () => Promise<() => boolean> }) {
    if (dialog.open) return;
    const { label, title, caption, filename, url, scanText, loadRenderer } = options;
    const entry: NonNullable<typeof active> = { title: `4×4 词条法阵 · ${title}`, caption, url };
    active = entry;
    get('title').textContent = label;
    canvas.setAttribute('aria-label', [title, caption, scanText].filter(Boolean).join('。'));
    link.value = url ?? '';
    link.hidden = canvas.hidden = download.disabled = true;
    copy.hidden = !url;
    native.hidden = !url || typeof navigator.share !== 'function';
    native.disabled = true;
    status.textContent = '正在生成图片…';
    dialog.showModal();
    try {
      const render = await loadRenderer();
      if (!dialog.open || active !== entry) return;
      if (!render()) throw new Error('Canvas unavailable');
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!dialog.open || active !== entry) return;
      if (!blob) throw new Error('Image unavailable');
      entry.image = new File([blob], filename, { type: 'image/png' });
      canvas.hidden = download.disabled = false;
      if (status.textContent === '正在生成图片…') status.textContent = scanText;
    } catch {
      if (dialog.open && active === entry && status.textContent === '正在生成图片…') {
        status.textContent = url ? '图片生成失败。可以直接复制挑战链接。' : '图片生成失败，请重新打开战绩卡。';
      }
    } finally {
      if (dialog.open && active === entry) {
        native.hidden = typeof navigator.share !== 'function' || (!url && !shareableFiles(entry.image));
        native.disabled = false;
      }
    }
  }

  return {
    puzzle(card: PuzzleShareCard) {
      click();
      const daily = card.kind === 'daily';
      const caption = daily
        ? `${card.score.moves} 步过关 · 最高 ${format(card.score.peakDamage ?? card.score.damage)} 伤害`
        : `${card.score.moves} 步 · ${format(card.score.damage)} 总伤害`;
      return show({ label: daily ? '每日战绩卡' : '接力战绩卡', title: daily ? card.puzzle.formation.title : '三阵接力', caption,
        filename: `affix-grid-${card.kind}-${daily ? card.puzzle.day : card.relay.day}.png`, url: card.url,
        scanText: daily && new URL(card.url).searchParams.has(dailyRouteParam)
          ? '图片里的二维码可打开原题。解开后可以查看好友摆法。' : '图片里的二维码可打开原题。',
        loadRenderer: async () => {
          const { renderPuzzleShareCard } = await import('./puzzleShareCard');
          return () => renderPuzzleShareCard(canvas, card, catalog);
        },
      });
    },
    campaign(run: Run) {
      const score = challengeFromRun(run);
      const url = run.enableSynergies === false ? undefined : challengeUrl(location.href, score);
      return show({ label: '战役战绩卡', title: '同局挑战', caption: `已过 ${format(score.cleared)} 波 · 最高 ${format(score.combo)} 连击`,
        filename: `affix-grid-wave-${run.wave}-${run.seed}.png`, url,
        scanText: url ? '朋友扫码后可以用同样的开局挑战你的成绩。' : '',
        loadRenderer: async () => {
          const { renderScoreCard } = await import('./shareCard');
          return () => renderScoreCard(canvas, run, catalog, url);
        },
      });
    },
  };
}
