import { createMulberry32 } from '../core/rng';
import { newRun } from '../core/shopEngine';
import { planTurn, previewPlacement } from '../core/tactics';
import type { Catalog } from '../core/types';
import { placeBattleLink } from './battleFrame';

export function bindLobby(catalog: Catalog, glyph: (node: HTMLElement, id: string) => void, click: () => void) {
  const dialog = document.querySelector<HTMLDialogElement>('#lobby-dialog')!;
  const get = <T extends HTMLElement = HTMLElement>(id: string) => dialog.querySelector<T>(`#lobby-${id}`)!;
  const campaign = get<HTMLButtonElement>('campaign');
  let reversed = false;
  let examples: ReturnType<typeof prepareDemo> | undefined;

  function prepareDemo() {
    const start = newRun(catalog, createMulberry32(1), 'chain', undefined, 'beginner');
    start.tileModifiers = {};
    const other = previewPlacement(start, { zone: 'board', index: 0 }, { zone: 'board', index: 1 })!;
    return [start, other].map(run => ({ run, forecast: planTurn(run, catalog) }));
  }

  function showDemo() {
    examples ??= prepareDemo();
    const { run, forecast } = examples[Number(reversed)];
    const score = get('demo-score');
    score.textContent = `${forecast.minDamage} / ${forecast.hp}`;
    score.dataset.win = String(forecast.minDamage >= forecast.hp);
    get('demo-note').textContent = reversed ? '镜子朝右，右边空了。' : '镜子让右边的电火花多打一次。';
    const link = get('demo-link');
    const trigger = forecast.events.find(event => event.type === 'CHAIN_LINK');
    link.hidden = true;
    if (trigger) placeBattleLink(link, trigger.from, trigger.to);
    get('demo-board').replaceChildren(...run.board.map(rune => {
      const cell = document.createElement('span');
      if (rune) {
        cell.dataset.occupied = 'true';
        cell.style.setProperty('--demo-ink', catalog[rune.configId].color);
        glyph(cell, rune.configId);
      }
      return cell;
    }));
  }

  get('demo-swap').onclick = () => { click(); reversed = !reversed; showDemo(); };
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
      reversed = false;
      showDemo();
      dialog.showModal();
      campaign.focus({ preventScroll: true });
      dialog.scrollTop = 0;
    },
  };
}
