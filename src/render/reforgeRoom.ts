import { battleTarget } from '../core/bounties';
import { previewReforges } from '../core/reforge';
import { runeAt } from '../core/shopEngine';
import { archetypeLabel, synergyTierChanges } from '../core/synergy';
import type { Catalog, Run, Slot } from '../core/types';
import { formatNumber as format } from './canvasRenderer';
import { renderSynergyChanges } from './synergyChanges';

const rarity = { common: '普通', rare: '稀有', epic: '史诗' };
const tileNames = { li_fire: '火', xuan_ice: '冰', spirit_gathering: '灵' } as const;
const place = ({ zone, index }: Slot) => `${zone === 'board' ? '棋盘' : '备战区'}第 ${index + 1} 格`;

export function bindReforgeRoom(catalog: Catalog, glyph: (node: HTMLElement, id: string) => void, click: () => void) {
  const dialog = document.querySelector<HTMLDialogElement>('#reforge-dialog')!;
  const get = <T extends HTMLElement = HTMLElement>(id: string) => dialog.querySelector<T>(`#reforge-${id}`)!;
  const target = get<HTMLSelectElement>('target');
  const confirm = get<HTMLButtonElement>('confirm');
  get('close').onclick = () => dialog.close();

  return (run: Run, currentDamage: number, apply: (from: Slot, target: string) => boolean) => {
    if (dialog.open) return;
    const slots: { slot: Slot; button: HTMLButtonElement }[] = [];
    let source: Slot;
    let previews: ReturnType<typeof previewReforges> = [];
    get('hp').textContent = format(battleTarget(run.wave, run.bountyRoute).hp);
    get('status').hidden = true;

    function renderPreview() {
      const choice = previews.find(option => option.target.id === target.value);
      confirm.disabled = !choice;
      if (!choice) return;
      const { target: config, prepared, result } = choice;
      const { slot, rune } = prepared.final;
      for (const { slot: position, button } of slots) {
        const isDestination = position.zone === slot.zone && position.index === slot.index;
        if (isDestination && position !== source) button.dataset.suggestion = 'to';
        else delete button.dataset.suggestion;
      }
      get('desc').textContent = config.desc;
      const damage = get('damage');
      damage.textContent = `${format(currentDamage)} → ${format(result.damage)}`;
      damage.dataset.change = result.damage > currentDamage ? 'up' : result.damage < currentDamage ? 'down' : 'same';
      const power = rune.bonusPower ? ` · 永久威力 +${format(rune.bonusPower)}` : '';
      const merge = prepared.merges.some(item => item.rune.configId === config.id) ? '合成后' : '转铸后';
      get('destination').textContent = `${merge}${config.name}留在${place(slot)}，${rune.star} 星${power}。`;
      renderSynergyChanges(get('synergies'), synergyTierChanges(run, prepared.candidate.board, catalog));
      confirm.textContent = `转铸为${config.name}`;
      get('status').hidden = true;
    }

    function select(slot: Slot) {
      source = slot;
      const rune = runeAt(run, slot)!;
      const config = catalog[rune.configId];
      get('source').textContent = `${config.name} · ${rarity[config.rarity]} · ${rune.star} 星`;
      for (const item of slots) item.button.setAttribute('aria-pressed', String(item.slot === slot));
      previews = previewReforges(run, slot, catalog);
      target.replaceChildren(...previews.map(({ target: config }) => {
        const option = document.createElement('option');
        option.value = config.id;
        option.textContent = `${config.name} · ${archetypeLabel[config.archetype]}`;
        return option;
      }));
      renderPreview();
    }

    for (const zone of ['board', 'bench'] as const) {
      get(zone).replaceChildren(...run[zone].map((rune, index) => {
        const slot: Slot = { zone, index };
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.dataset.index = String(index);
        cell.disabled = !rune;
        cell.dataset.occupied = String(!!rune);
        const number = document.createElement('small');
        number.textContent = String(index + 1);
        cell.append(number);
        const tile = zone === 'board' && run.tileModifiers[index];
        if (tile) {
          const marker = document.createElement('i');
          marker.textContent = tileNames[tile];
          cell.append(marker);
        }
        if (rune) {
          const config = catalog[rune.configId];
          cell.style.setProperty('--rune-ink', config.color);
          cell.dataset.star = String(rune.star);
          glyph(cell, config.id);
          cell.setAttribute('aria-label', `${place(slot)}，${config.name}，${rune.star} 星`);
          cell.onclick = () => { click(); select(slot); };
          slots.push({ slot, button: cell });
        } else cell.setAttribute('aria-label', `${place(slot)}，空格`);
        return cell;
      }));
    }
    const initial = slots.reduce<Slot | undefined>((best, { slot }) =>
      !best || runeAt(run, slot)!.star > runeAt(run, best)!.star ? slot : best, undefined);
    if (!initial) return;
    select(initial);
    target.onchange = () => { click(); renderPreview(); };
    confirm.onclick = () => {
      if (apply(source, target.value)) dialog.close();
      else {
        const status = get('status');
        status.hidden = false;
        status.textContent = '阵容或存档已变动。请重新打开转铸台。';
        confirm.disabled = true;
      }
    };
    dialog.showModal();
    dialog.scrollTop = 0;
  };
}
