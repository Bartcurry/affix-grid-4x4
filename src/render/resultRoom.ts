import { runReport } from '../core/runReport';
import { trialCount } from '../core/trials';
import type { Catalog, Run } from '../core/types';

export interface ResultAction { label: string; act: () => void | Promise<void>; primary?: boolean }

export function bindResultRoom(
  dialog: HTMLDialogElement,
  catalog: Catalog,
  glyph: (node: HTMLElement, id: string) => void,
  format: (value: number) => string,
  click: () => void,
  review: () => void,
) {
  const get = (id: string) => dialog.querySelector<HTMLElement>(`#result-${id}`)!;
  const replay = get('replay');
  replay.onclick = () => { click(); review(); };
  dialog.addEventListener('cancel', event => event.preventDefault());

  return (run: Run, actions: ResultAction[]) => {
    const report = runReport(run, catalog);
    const occupied = report.board.some(Boolean);
    dialog.dataset.result = run.status;
    get('title').textContent = report.title;
    get('battle').textContent = report.battle;
    get('opening').textContent = `${report.opening} · ${run.seed}`;
    get('cleared').textContent = format(report.score.cleared);
    get('combo').textContent = format(report.score.combo);
    get('damage').textContent = format(report.damage);
    get('formation').hidden = !occupied && !report.hasJournal;
    get('board').hidden = !occupied;
    get('board').replaceChildren(...report.board.map((rune, index) => {
      const cell = document.createElement('span');
      if (!rune) { cell.setAttribute('aria-hidden', 'true'); return cell; }
      const config = catalog[rune.configId];
      cell.setAttribute('role', 'img');
      cell.setAttribute('aria-label', `第 ${index + 1} 格，${config.name} ${rune.star} 星`);
      cell.style.setProperty('--result-ink', config.color);
      cell.dataset.rune = 'true';
      if (report.leader?.cell === index) cell.dataset.leader = 'true';
      glyph(cell, config.id);
      const stars = document.createElement('small');
      stars.textContent = '·'.repeat(rune.star);
      cell.append(stars);
      return cell;
    }));
    get('leader').hidden = !report.leader;
    get('leader').textContent = report.leader ? `${report.leader.name} · ${format(report.leader.damage)} 伤害` : '';
    get('bounties').hidden = !report.bounties;
    get('bounties').textContent = `悬赏 ${report.bounties} / ${trialCount}`;
    replay.hidden = !report.hasJournal;
    get('feedback').hidden = true;
    get('actions').replaceChildren(...actions.map(action => {
      const button = document.createElement('button');
      button.type = 'button';
      if (action.primary) button.className = 'primary';
      button.textContent = action.label;
      button.onclick = () => { click(); void action.act(); };
      return button;
    }));
    if (!dialog.open) dialog.showModal();
  };
}
