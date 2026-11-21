import { battleTargetFor, engravingPower } from '../core/bounties';
import { previewEngravings } from '../core/engraving';
import { encounters } from '../core/expedition';
import type { Catalog, Run } from '../core/types';
import { formatNumber as format } from './canvasRenderer';

export function bindEngravingRoom(catalog: Catalog, glyph: (node: HTMLElement, id: string) => void, click: () => void) {
  const dialog = document.querySelector<HTMLDialogElement>('#engraving-dialog')!;
  const get = <T extends HTMLElement = HTMLElement>(id: string) => dialog.querySelector<T>(`#engraving-${id}`)!;
  const confirm = get<HTMLButtonElement>('confirm');
  const status = get('status');
  const exact = new Intl.NumberFormat('zh-CN');
  dialog.addEventListener('cancel', event => event.preventDefault());

  return (run: Run, claim: (index: number) => boolean) => {
    if (dialog.open) return;
    const { baseline, choices } = previewEngravings(run, catalog);
    if (!choices.length) return;
    const recommended = choices.reduce((best, option) => option.result.damage > best.result.damage ? option : best);
    let selected = recommended;
    const enemy = encounters[battleTargetFor(run).encounter];
    get('enemy').textContent = `第 ${run.wave} 波 · ${enemy.name} · ${format(baseline.hp)} 生命`;
    get('rule').textContent = `选一枚上阵符文，永久威力 +${engravingPower}。以后换位也会保留。`;
    status.hidden = true;
    confirm.disabled = false;
    const cells = run.board.map((rune, index) => {
      const cell = document.createElement('button');
      const order = document.createElement('small');
      order.textContent = String(index + 1);
      cell.append(order);
      cell.type = 'button';
      cell.dataset.index = String(index);
      cell.dataset.occupied = String(!!rune);
      cell.disabled = !rune;
      cell.setAttribute('aria-label', `第 ${index + 1} 格，${rune ? `${catalog[rune.configId].name}，${rune.star} 星` : '空格'}`);
      if (rune) {
        cell.style.setProperty('--rune-ink', catalog[rune.configId].color);
        cell.dataset.star = String(rune.star);
        glyph(cell, rune.configId);
      }
      const choice = choices.find(option => option.index === index);
      if (choice) cell.onclick = () => { click(); selected = choice; update(); };
      return cell;
    });
    get('grid').replaceChildren(...cells);

    function update() {
      const { rune, index, result } = selected;
      const name = catalog[rune.configId].name;
      cells.forEach((cell, i) => cell.setAttribute('aria-pressed', String(i === index)));
      get('piece').textContent = `第 ${index + 1} 格 · ${name}`;
      get('power').textContent = `永久威力 +${format((rune.bonusPower ?? engravingPower) - engravingPower)} → +${format(rune.bonusPower ?? engravingPower)}`;
      const delta = result.damage - baseline.result.damage;
      get('change').textContent = `${exact.format(baseline.result.damage)} → ${exact.format(result.damage)}`;
      const verdict = get('verdict');
      verdict.dataset.win = String(result.win);
      verdict.textContent = result.win ? '可击破' : `还差 ${format(result.hp)}`;
      get('delta').textContent = delta ? `${delta > 0 ? '+' : '−'}${format(Math.abs(delta))} 伤害` : '本波伤害持平';
      confirm.textContent = `刻印${name}`;
    }

    confirm.onclick = () => {
      if (claim(selected.index)) dialog.close();
      else {
        confirm.disabled = true;
        status.textContent = '存档已经变动。刷新页面可查看最新进度。';
        status.hidden = false;
      }
    };
    update();
    dialog.showModal();
    cells[recommended.index].focus({ preventScroll: true });
    dialog.scrollTop = 0;
  };
}
