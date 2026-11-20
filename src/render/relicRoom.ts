import { battleTarget } from '../core/bounties';
import { encounters, relics } from '../core/expedition';
import { previewRelics } from '../core/relicPreview';
import type { Catalog, RelicId, Run } from '../core/types';

export function bindRelicRoom(
  catalog: Catalog,
  icon: (node: HTMLElement, id: RelicId) => void,
  format: (value: number) => string,
  click: () => void,
  choose: (id: RelicId, close: () => void) => void,
) {
  const dialog = document.querySelector<HTMLDialogElement>('#relic-dialog')!;
  const get = <T extends HTMLElement = HTMLElement>(name: string) => dialog.querySelector<T>(`#relic-${name}`)!;
  const pick = get<HTMLButtonElement>('pick');
  dialog.addEventListener('cancel', event => event.preventDefault());
  const signed = (value: number) => value ? `（${value > 0 ? '+' : '−'}${format(Math.abs(value))}）` : '';

  return (run: Run) => {
    if (dialog.open) return false;
    const { original, choices } = previewRelics(run, catalog);
    if (!choices.length) return false;
    const enemy = encounters[battleTarget(run.wave, run.bountyRoute).encounter];
    get('wave').textContent = `打过第 ${run.wave - 1} 波`;
    get('target').textContent = `第 ${run.wave} 波 · ${enemy.name} · ${format(original.hp)} 生命`;
    get('before').textContent = `当前预计 ${format(original.result.damage)} 伤害 · 结算 ${format(original.gold)} 金`;
    pick.disabled = true;
    pick.textContent = '领取所选遗物';
    let selected: RelicId | undefined;
    const cards = choices.map(({ id, result, gold, refreshes }) => {
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
      impact.textContent = `${format(result.damage)} 伤害${signed(result.damage - original.result.damage)} · ${format(gold)} 金${signed(gold - original.gold)}`;
      if (refreshes > original.refreshes) impact.append(` · 本波多 ${refreshes - original.refreshes} 次刷新`);
      card.append(glyph, name, text, impact);
      card.onclick = () => {
        click();
        selected = id;
        for (const option of cards) option.setAttribute('aria-pressed', String(option === card));
        pick.disabled = false;
        pick.textContent = `领取 ${relics[id].name}`;
      };
      return card;
    });
    get('choices').replaceChildren(...cards);
    pick.onclick = () => { if (selected) choose(selected, () => dialog.close()); };
    dialog.showModal();
    dialog.scrollTop = 0;
    return true;
  };
}
