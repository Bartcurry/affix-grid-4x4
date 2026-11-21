import type { FirstSupplyPlan } from '../core/firstSupply';
import { runeAt } from '../core/shopEngine';
import type { Catalog, Run, Slot, TurnResult } from '../core/types';
import { formatNumber as format, tileStamp } from './canvasRenderer';

const place = ({ zone, index }: Slot) => `${zone === 'board' ? '棋盘' : '备战区'}第 ${index + 1} 格`;

export function bindFirstSupplyRoom(catalog: Catalog, glyph: (node: HTMLElement, id: string) => void, click: () => void) {
  const dialog = document.querySelector<HTMLDialogElement>('#first-supply-dialog')!;
  const get = <T extends HTMLElement = HTMLElement>(id: string) => dialog.querySelector<T>(`#first-supply-${id}`)!;
  const confirm = get<HTMLButtonElement>('confirm');
  const status = get('status');
  get('close').onclick = () => { click(); dialog.close(); };

  return (run: Run, current: TurnResult, plan: FirstSupplyPlan, apply: () => boolean) => {
    if (dialog.open) return;
    const { result, move, purchase } = plan;
    const cost = run.gold - plan.run.gold;
    const steps: string[] = [];
    const offer = purchase && run.shop[purchase.index];
    if (purchase && offer) steps.push(`花 ${format(cost)} 金买${catalog[offer.configId].name}，放在${place(purchase.landing)}。`);
    if (move) {
      const moved = runeAt(plan.run, move.to);
      const name = moved ? catalog[moved.configId].name : '符文';
      steps.push(runeAt(plan.run, move.from)
        ? `把${place(move.from)}的${name}和${place(move.to)}互换。`
        : `把${place(move.from)}的${name}移到${place(move.to)}。`);
    }
    get('steps').replaceChildren(...steps.map(step => {
      const row = document.createElement('li');
      row.textContent = step;
      return row;
    }));
    get('damage').textContent = `${format(current.damage)} → ${format(result.damage)}`;
    get('gold').textContent = `${format(run.gold)} → ${format(plan.run.gold)}`;
    const verdict = get('verdict');
    verdict.dataset.win = String(result.win);
    verdict.textContent = result.win ? `可打过第 2 波 · 敌方 ${format(current.hp + current.damage)} 血` : `离过关还差 ${format(result.hp)} 点伤害`;
    get('board').replaceChildren(...plan.run.board.map((rune, index) => {
      const cell = document.createElement('span');
      const number = document.createElement('small');
      number.textContent = String(index + 1);
      cell.append(number);
      const mark = plan.run.tileModifiers[index];
      const changed = rune?.configId !== run.board[index]?.configId || rune?.star !== run.board[index]?.star;
      cell.toggleAttribute('data-change', changed);
      const name = rune ? catalog[rune.configId].name : '空格';
      cell.setAttribute('aria-label', `第 ${index + 1} 格，${name}${changed ? '，位置有变化' : ''}`);
      if (rune) {
        cell.dataset.occupied = 'true';
        cell.style.setProperty('--rune-ink', catalog[rune.configId].color);
        glyph(cell, rune.configId);
      }
      if (mark && tileStamp[mark]) {
        const marker = document.createElement('i');
        marker.textContent = tileStamp[mark].name[0];
        marker.style.color = tileStamp[mark].color;
        cell.append(marker);
      }
      return cell;
    }));
    confirm.disabled = false;
    confirm.textContent = purchase ? `确认买入并布阵 · ${format(cost)} 金` : '按方案换位';
    status.hidden = true;
    confirm.onclick = () => {
      if (apply()) dialog.close();
      else {
        status.textContent = '阵容或商店已变动，请关闭后重新试算。';
        status.hidden = false;
        confirm.disabled = true;
      }
    };
    dialog.showModal();
    dialog.scrollTop = 0;
  };
}
