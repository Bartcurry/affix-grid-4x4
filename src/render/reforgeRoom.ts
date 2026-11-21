import { battleTargetFor } from '../core/bounties';
import { findReforgeSuggestion, prepareReforge, previewReforges, type ReforgeSuggestion, type ReforgeSwap } from '../core/reforge';
import { runeAt } from '../core/shopEngine';
import { archetypeLabel, synergyTierChanges } from '../core/synergy';
import type { Catalog, Run, Slot } from '../core/types';
import { formatNumber as format } from './canvasRenderer';
import { renderSynergyChanges } from './synergyChanges';

const rarity = { common: '普通', rare: '稀有', epic: '史诗' };
const tileNames = { li_fire: '火', xuan_ice: '冰', spirit_gathering: '灵' } as const;
const place = ({ zone, index }: Slot) => `${zone === 'board' ? '棋盘' : '备战区'}第 ${index + 1} 格`;
const sameSlot = (a: Slot, b: Slot) => a.zone === b.zone && a.index === b.index;

export function bindReforgeRoom(catalog: Catalog, glyph: (node: HTMLElement, id: string) => void, click: () => void) {
  const dialog = document.querySelector<HTMLDialogElement>('#reforge-dialog')!;
  const get = <T extends HTMLElement = HTMLElement>(id: string) => dialog.querySelector<T>(`#reforge-${id}`)!;
  const target = get<HTMLSelectElement>('target');
  const confirm = get<HTMLButtonElement>('confirm');
  const search = get<HTMLButtonElement>('search');
  const advice = get('advice');
  let worker: Worker | undefined;
  function stopSearch() {
    worker?.terminate();
    worker = undefined;
    search.disabled = false;
  }
  get('close').onclick = () => { stopSearch(); dialog.close(); };
  dialog.addEventListener('close', () => { if (!dialog.open) stopSearch(); });

  return (run: Run, currentDamage: number, apply: (from: Slot, target: string, swap?: ReforgeSwap) => boolean) => {
    if (dialog.open) return;
    const slots: { slot: Slot; button: HTMLButtonElement }[] = [];
    let source: Slot;
    let previews: ReturnType<typeof previewReforges> = [];
    let suggestion: ReforgeSuggestion | undefined;
    const { hp } = battleTargetFor(run);
    get('hp').textContent = format(hp);
    get('status').hidden = true;
    advice.hidden = true;

    function renderPreview() {
      const choice = previews.find(option => option.target.id === target.value);
      confirm.disabled = !choice;
      if (!choice) return;
      const { target: config } = choice;
      const swap = suggestion?.swap;
      const prepared = swap ? prepareReforge(run, source, config.id, catalog, swap) : choice.prepared;
      if (!prepared) { confirm.disabled = true; return; }
      const result = suggestion?.result ?? choice.result;
      const { slot, rune } = prepared.final;
      for (const { slot: position, button } of slots) {
        if (swap && sameSlot(position, swap.from)) button.dataset.suggestion = 'from';
        else if (swap ? sameSlot(position, swap.to) : sameSlot(position, slot) && position !== source) button.dataset.suggestion = 'to';
        else delete button.dataset.suggestion;
      }
      get('desc').textContent = config.desc;
      const damage = get('damage');
      damage.textContent = `${format(currentDamage)} → ${format(result.damage)}`;
      damage.dataset.change = result.damage > currentDamage ? 'up' : result.damage < currentDamage ? 'down' : 'same';
      const power = rune.bonusPower ? ` · 永久威力 +${format(rune.bonusPower)}` : '';
      const merge = prepared.merges.some(item => item.rune.configId === config.id) ? '合成后' : '转铸后';
      get('destination').textContent = `${merge}${config.name}留在${place(slot)}，${rune.star} 星${power}。`;
      const swapLine = get('swap');
      swapLine.hidden = !swap;
      if (swap) {
        const moved = runeAt(choice.prepared.candidate, swap.from)!;
        const exchange = runeAt(choice.prepared.candidate, swap.to);
        swapLine.textContent = `再把${place(swap.from)}的${catalog[moved.configId].name}${exchange ? '和' : '移到'}${place(swap.to)}${exchange ? '交换' : ''}。`;
      }
      renderSynergyChanges(get('synergies'), synergyTierChanges(run, prepared.candidate.board, catalog));
      confirm.textContent = swap ? '转铸并换位' : `转铸为${config.name}`;
      get('status').hidden = true;
    }

    function select(slot: Slot, plan?: ReforgeSuggestion) {
      stopSearch();
      suggestion = plan;
      advice.hidden = !plan;
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
      if (plan) target.value = plan.target;
      renderPreview();
    }

    function showSuggestion(plan?: ReforgeSuggestion) {
      const pick = plan && slots.find(item => sameSlot(item.slot, plan.from));
      if (pick && plan) select(pick.slot, plan);
      advice.textContent = !plan ? '这次没找到能提高伤害的转铸方案。也可以手动试。'
        : `预计多打 ${format(plan.result.damage - currentDamage)} 点 · ${plan.result.win ? '本波可击破' : `还差 ${format(plan.result.hp)} 点`}`;
      advice.dataset.win = String(!!plan?.result.win);
      advice.hidden = false;
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
        slots.push({ slot, button: cell });
        if (rune) {
          const config = catalog[rune.configId];
          cell.style.setProperty('--rune-ink', config.color);
          cell.dataset.star = String(rune.star);
          glyph(cell, config.id);
          cell.setAttribute('aria-label', `${place(slot)}，${config.name}，${rune.star} 星`);
          cell.onclick = () => { click(); select(slot); };
        } else cell.setAttribute('aria-label', `${place(slot)}，空格`);
        return cell;
      }));
    }
    const initial = slots.filter(({ button }) => !button.disabled).reduce<Slot | undefined>((best, { slot }) =>
      !best || runeAt(run, slot)!.star > runeAt(run, best)!.star ? slot : best, undefined);
    if (!initial) return;
    select(initial);
    target.onchange = () => {
      click();
      stopSearch();
      suggestion = undefined;
      advice.hidden = true;
      renderPreview();
    };
    search.onclick = () => {
      click();
      advice.textContent = '正在试算转铸和换位…';
      delete advice.dataset.win;
      advice.hidden = false;
      const fallback = () => showSuggestion(findReforgeSuggestion(run, catalog, currentDamage));
      try {
        const lookup = new Worker(new URL('./reforgeSearch.worker.ts', import.meta.url), { type: 'module' });
        worker = lookup;
        search.disabled = true;
        lookup.onmessage = (event: MessageEvent<ReforgeSuggestion | undefined>) => {
          if (worker !== lookup || !dialog.open) return;
          stopSearch();
          showSuggestion(event.data);
        };
        lookup.onerror = event => {
          event.preventDefault();
          if (worker !== lookup || !dialog.open) return;
          stopSearch();
          fallback();
        };
        lookup.postMessage({ run, currentDamage });
      } catch {
        stopSearch();
        fallback();
      }
    };
    confirm.onclick = () => {
      stopSearch();
      if (apply(source, target.value, suggestion?.swap)) dialog.close();
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
