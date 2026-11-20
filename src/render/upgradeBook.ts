import { purchaseInfo } from '../core/shopEngine';
import { previewUpgrade, upgradeProgress } from '../core/upgradeProgress';
import type { Catalog, Run, Slot } from '../core/types';

export function bindUpgradeBook(
  catalog: Catalog,
  glyph: (node: HTMLElement, id: string) => void,
  format: (value: number) => string,
  pin: (id?: string) => void,
  locate: (slot: Slot) => void,
  findOffer: (index: number) => void,
  buy: (index: number, id: string) => boolean,
) {
  const dialog = document.querySelector<HTMLDialogElement>('#upgrades-dialog')!;
  const open = document.querySelector<HTMLButtonElement>('#upgrades-open')!;
  const get = <T extends HTMLElement = HTMLElement>(id: string) => dialog.querySelector<T>(`#upgrades-${id}`)!;
  const list = get('list');
  const quickBuy = get<HTMLButtonElement>('offer');
  const pinButton = get<HTMLButtonElement>('pin');
  const planPanel = get('plan');
  const close = get<HTMLButtonElement>('close');
  close.onclick = () => dialog.close();
  const title = document.createElement('strong');
  const summary = document.createElement('span');
  title.textContent = '升星簿';
  open.append(title, summary);

  return (run: Run, tracked: string | undefined, enabled: boolean, currentDamage: number) => {
    const candidates = upgradeProgress(run);
    const pinned = candidates.find(entry => entry.id === tracked);
    const first = pinned ?? candidates[0];
    open.hidden = !first;
    open.disabled = !enabled;
    if (!first) return;
    const firstName = catalog[first.id].name;
    open.dataset.ready = String(first.missing === 1 && first.offers.length > 0);
    summary.textContent = `${firstName} · 差 ${first.missing} 枚升 ${first.target} 星${first.offers.length ? ' · 有货' : ''}`;

    open.onclick = () => {
      if (!enabled) return;
      let selected = first;
      let activePin = pinned?.id;
      const tabs = candidates.map(entry => {
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.textContent = catalog[entry.id].name;
        tab.dataset.ready = String(entry.missing === 1 && entry.offers.length > 0);
        tab.onclick = () => { selected = entry; draw(); };
        return tab;
      });
      list.replaceChildren(...tabs);

      function draw() {
        const { id, singles, doubles, filled, required, target, missing, offers } = selected;
        const config = catalog[id];
        for (const [index, tab] of tabs.entries()) tab.setAttribute('aria-pressed', String(candidates[index] === selected));
        get('detail').style.setProperty('--upgrade-ink', config.color);
        glyph(get('icon'), id);
        get('rune').textContent = config.name;
        get('missing').textContent = `差 ${missing} 枚一星符文${target === 2 && doubles.length ? '再合一枚二星' : `升 ${target} 星`}`;
        pinButton.setAttribute('aria-pressed', String(activePin === id));
        pinButton.textContent = activePin === id ? '取消盯牌' : '盯这枚';
        pinButton.onclick = () => {
          activePin = activePin === id ? undefined : id;
          pin(activePin);
          draw();
        };
        get('progress').replaceChildren(...Array.from({ length: required }, (_, index) => {
          const mark = document.createElement('i');
          mark.dataset.fill = target === 3 && index < doubles.length * 3 ? 'double' : index < filled ? 'single' : '';
          return mark;
        }));
        get('slots').replaceChildren(...[...doubles.map(slot => ({ slot, stars: '★★' })), ...singles.map(slot => ({ slot, stars: '★' }))].map(({ slot, stars }) => {
          const piece = document.createElement('button');
          piece.type = 'button';
          piece.textContent = `${slot.zone === 'board' ? '棋盘' : '备战'} ${slot.index + 1} · ${stars}`;
          piece.onclick = () => { dialog.close(); locate(slot); };
          return piece;
        }));
        const index = offers[0];
        const status = get('stock');
        status.textContent = offers.length ? `店里有 ${offers.length} 枚 · ${config.cost} 金/枚` : '这一批没有同名符文';
        quickBuy.hidden = index === undefined;
        planPanel.hidden = true;
        if (index === undefined) return;
        const { blocked } = purchaseInfo(run, index, catalog);
        if (blocked === 'gold') status.append(` · 差 ${config.cost - run.gold} 金`);
        if (blocked === 'bench') status.append(' · 备战区满了');
        const plan = previewUpgrade(run, index, catalog);
        if (!plan) {
          quickBuy.textContent = '看现货';
          quickBuy.onclick = () => { dialog.close(); findOffer(index); };
          return;
        }
        const { slot, rune } = plan.final;
        const zoneName = (zone: Slot['zone']) => zone === 'board' ? '棋盘' : '备战区';
        const freed = (['board', 'bench'] as const).flatMap(zone => {
          const positions = plan.freed.filter(slot => slot.zone === zone).map(slot => slot.index + 1);
          return positions.length ? [`${zoneName(zone)}第 ${positions.join('、')} 格`] : [];
        });
        planPanel.hidden = false;
        get('destination').textContent = `${zoneName(slot.zone)}第 ${slot.index + 1} 格升到 ${rune.star} 星${rune.bonusPower ? ` · 威力 +${rune.bonusPower}` : ''}`;
        const empty = get('freed');
        empty.hidden = !freed.length;
        empty.textContent = `腾出${freed.join('、')}`;
        const damage = get('damage');
        damage.toggleAttribute('data-lower', plan.result.damage < currentDamage);
        damage.textContent = `${format(currentDamage)} → ${format(plan.result.damage)} / 敌血 ${format(plan.hp)}`;
        quickBuy.textContent = `买入升 ${rune.star} 星`;
        quickBuy.onclick = () => { if (buy(index, id)) dialog.close(); };
      }

      draw();
      dialog.showModal();
      close.focus({ preventScroll: true });
      dialog.scrollTop = 0;
    };
    return pinned?.id;
  };
}
