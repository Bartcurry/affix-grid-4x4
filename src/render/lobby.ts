import type { Catalog } from '../core/types';
import { bindChainDemo } from './chainDemo';

export function bindLobby(catalog: Catalog, glyph: (node: HTMLElement, id: string) => void, click: () => void) {
  const dialog = document.querySelector<HTMLDialogElement>('#lobby-dialog')!;
  const get = <T extends HTMLElement = HTMLElement>(id: string) => dialog.querySelector<T>(`#lobby-${id}`)!;
  const campaign = get<HTMLButtonElement>('campaign');
  const resetDemo = bindChainDemo(get('chain-demo'), catalog, glyph, click);

  get('close').onclick = () => { click(); dialog.close(); };
  dialog.addEventListener('cancel', event => { if (get('close').hidden) event.preventDefault(); });

  return {
    dialog,
    open(progress?: string, message?: string) {
      if (dialog.open) return;
      get('close').hidden = get('new').hidden = !progress;
      get('campaign-title').textContent = progress ? '继续战役' : '开始战役';
      get('campaign-detail').textContent = progress ?? '四套起手阵 · 三档难度';
      if (progress) campaign.removeAttribute('aria-haspopup');
      else campaign.setAttribute('aria-haspopup', 'dialog');
      get('message').hidden = !message;
      get('message').textContent = message ?? '';
      resetDemo();
      dialog.showModal();
      campaign.focus({ preventScroll: true });
      dialog.scrollTop = 0;
    },
  };
}
