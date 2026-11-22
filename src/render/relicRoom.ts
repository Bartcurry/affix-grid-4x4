import { battleTargetFor } from '../core/bounties';
import { encounters, relics } from '../core/expedition';
import { previewRelics, suggestRelicPlacement, type RelicPlacement } from '../core/relicPreview';
import { runeAt } from '../core/shopEngine';
import type { Catalog, RelicId, Run, Slot } from '../core/types';
import { placeBattleLink } from './battleFrame';
import { tileStamp } from './canvasRenderer';

const place = ({ zone, index }: Slot) => `${zone === 'board' ? '棋盘' : '备战区'}第 ${index + 1} 格`;

export function bindRelicRoom(
  catalog: Catalog,
  icon: (node: HTMLElement, id: RelicId) => void,
  runeGlyph: (node: HTMLElement, id: string) => void,
  format: (value: number) => string,
  click: () => void,
) {
  const dialog = document.querySelector<HTMLDialogElement>('#relic-dialog')!;
  const get = <T extends HTMLElement = HTMLElement>(name: string) => dialog.querySelector<T>(`#relic-${name}`)!;
  const pick = get<HTMLButtonElement>('pick');
  const swap = get<HTMLButtonElement>('swap');
  const plan = get('plan');
  const status = get('status');
  const reload = get<HTMLButtonElement>('reload');
  reload.onclick = () => window.location.reload();
  dialog.addEventListener('cancel', event => event.preventDefault());
  const signed = (value: number) => `${value > 0 ? '+' : '−'}${format(Math.abs(value))}`;
  const delta = (value: number) => value ? `（${signed(value)}）` : '';

  return (run: Run, choose: (id: RelicId, movement: RelicPlacement | undefined, close: () => void) => boolean) => {
    if (dialog.open) return false;
    const { original, choices } = previewRelics(run, catalog);
    if (!choices.length) return false;
    const enemy = encounters[battleTargetFor(run).encounter];
    get('wave').textContent = `打过第 ${run.wave - 1} 波`;
    get('target').textContent = `第 ${run.wave} 波 · ${enemy.name} · ${format(original.hp)} 生命`;
    get('before').textContent = `当前预计 ${format(original.result.damage)} 伤害 · 结算 ${format(original.gold)} 金`;
    pick.disabled = true;
    swap.disabled = false;
    swap.hidden = plan.hidden = status.hidden = reload.hidden = true;
    pick.textContent = '领取所选遗物';
    const placements = new Map<RelicId, RelicPlacement | undefined>();
    let selected: RelicId | undefined;
    let failed = false;

    function renderPlan(placement: RelicPlacement) {
      const { from, to, result, hp, gold, relicDamage, relicGold } = placement;
      const source = runeAt(run, from)!;
      const target = runeAt(run, to);
      const name = catalog[source.configId].name;
      get('move').textContent = target ? `把${place(from)}的${name}和${place(to)}的${catalog[target.configId].name}互换。`
        : `把${place(from)}的${name}移到${place(to)}。`;
      get('after').textContent = `换位后 ${format(result.damage)} / ${format(hp)} 伤害 · 结算 ${format(gold)} 金`;
      get('after').dataset.win = String(result.win);
      const gains = [relicDamage ? `伤害 ${signed(relicDamage)}` : '', relicGold ? `结算金 ${signed(relicGold)}` : ''].filter(Boolean);
      get('gain').textContent = `同样摆法，带上遗物后${gains.join(' · ')}。`;
      const benchVisible = from.zone === 'bench' || to.zone === 'bench';
      get('bench').hidden = !benchVisible;
      for (const zone of benchVisible ? ['board', 'bench'] as const : ['board'] as const) {
        get(zone).replaceChildren(...run[zone].map((rune, index) => {
          const cell = document.createElement('span');
          const number = document.createElement('small');
          number.textContent = String(index + 1);
          cell.append(number);
          if (from.zone === zone && from.index === index) cell.dataset.move = 'from';
          else if (to.zone === zone && to.index === index) cell.dataset.move = 'to';
          cell.setAttribute('aria-label', `第 ${index + 1} 格，${rune ? catalog[rune.configId].name : '空格'}${cell.dataset.move ? cell.dataset.move === 'from' ? '，起点' : '，目标' : ''}`);
          if (rune) {
            cell.dataset.occupied = 'true';
            cell.style.setProperty('--rune-ink', catalog[rune.configId].color);
            runeGlyph(cell, rune.configId);
          }
          const tile = zone === 'board' && tileStamp[run.tileModifiers[index]];
          if (tile) {
            const stamp = document.createElement('i');
            stamp.textContent = tile.name[0];
            stamp.style.color = tile.color;
            cell.append(stamp);
          }
          return cell;
        }));
      }
      const arrow = get('link');
      arrow.hidden = true;
      if (from.zone === 'board' && to.zone === 'board') placeBattleLink(arrow, from.index, to.index);
    }

    const cards = choices.map(offer => {
      const { id, result, gold, refreshes } = offer;
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'altar-option';
      card.dataset.relic = id;
      card.setAttribute('aria-pressed', 'false');
      const glyph = document.createElement('span');
      glyph.className = 'altar-icon';
      glyph.setAttribute('aria-hidden', 'true');
      icon(glyph, id);
      const name = document.createElement('strong');
      name.textContent = relics[id].name;
      const text = document.createElement('span');
      text.className = 'altar-effect';
      text.textContent = relics[id].text;
      const impact = document.createElement('small');
      impact.className = 'altar-impact';
      impact.dataset.win = String(result.win);
      impact.textContent = `${format(result.damage)} 伤害${delta(result.damage - original.result.damage)} · ${format(gold)} 金${delta(gold - original.gold)}`;
      if (refreshes > original.refreshes) impact.append(` · 本波多 ${refreshes - original.refreshes} 次刷新`);
      card.append(glyph, name, text, impact);
      card.onclick = () => {
        if (failed) return;
        click();
        selected = id;
        for (const option of cards) option.setAttribute('aria-pressed', String(option === card));
        if (!placements.has(id)) placements.set(id, suggestRelicPlacement(run, catalog, original, offer));
        const placement = placements.get(id);
        if (placement) renderPlan(placement);
        plan.hidden = swap.hidden = !placement;
        pick.disabled = false;
        pick.classList.toggle('primary', !placement);
        pick.textContent = placement ? '只领取' : `领取${relics[id].name}`;
      };
      return card;
    });
    get('choices').replaceChildren(...cards);
    function commit(placement?: RelicPlacement) {
      if (!selected || choose(selected, placement, () => dialog.close())) return;
      failed = true;
      status.textContent = '进度已变化，请载入最新进度后再选。';
      status.hidden = reload.hidden = false;
      pick.disabled = swap.disabled = true;
      reload.focus();
    }
    pick.classList.add('primary');
    pick.onclick = () => commit();
    swap.onclick = () => { if (selected) commit(placements.get(selected)); };
    dialog.showModal();
    dialog.scrollTop = 0;
    return true;
  };
}
