import { preparePurchase, purchaseLayouts, purchaseWallet } from '../core/purchasePreview';
import { purchaseInfo } from '../core/shopEngine';
import { synergyTierChanges } from '../core/synergy';
import type { Catalog, Run, Slot, TurnResult } from '../core/types';
import { formatNumber as format } from './canvasRenderer';
import { renderSynergyChanges } from './synergyChanges';

const place = ({ zone, index }: Slot) => `${zone === 'board' ? '棋盘' : '备战区'}第 ${index + 1} 格`;
const tileNames = { li_fire: '火', xuan_ice: '冰', spirit_gathering: '灵' } as const;

export function bindPurchaseRoom(catalog: Catalog, glyph: (cell: HTMLElement, id: string) => void, click: () => void) {
  const dialog = document.querySelector<HTMLDialogElement>('#purchase-dialog')!;
  const get = <T extends HTMLElement = HTMLElement>(id: string) => dialog.querySelector<T>(`#purchase-${id}`)!;
  const stay = get<HTMLButtonElement>('stay');
  const suggest = get<HTMLButtonElement>('recommend');
  const economy = get<HTMLButtonElement>('economy');
  const stock = get('stock');
  const board = get('board');
  const confirm = get<HTMLButtonElement>('confirm');
  get('close').onclick = () => { click(); dialog.close(); };

  return (run: Run, initial: number, current: TurnResult, buy: (index: number, target?: Slot) => boolean) => {
    const currentWallet = purchaseWallet(run, current, catalog);
    let index = initial;
    const tabs = run.shop.map((offer, offerIndex) => {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.dataset.index = String(offerIndex);
      const config = offer && catalog[offer.configId];
      tab.disabled = !config;
      const name = document.createElement('strong');
      name.textContent = config?.name ?? '已售罄';
      const price = document.createElement('small');
      price.textContent = config ? `${config.cost} 金${purchaseInfo(run, offerIndex, catalog).willMerge ? ' · 可升星' : ''}` : '';
      tab.append(name, price);
      tab.onclick = () => { click(); index = offerIndex; showOffer(); };
      return tab;
    });
    stock.replaceChildren(...tabs);

    function showOffer() {
      const offer = run.shop[index];
      if (!offer) return;
      const config = catalog[offer.configId];
      tabs.forEach((tab, position) => tab.setAttribute('aria-pressed', String(position === index)));
      get('rule').textContent = config.desc;
      const prepared = preparePurchase(run, index, catalog);
      const blocked = get('blocked');
      const plan = get('plan');
      blocked.hidden = !!prepared;
      plan.hidden = !prepared;
      if (!prepared) {
        const reason = purchaseInfo(run, index, catalog).blocked;
        blocked.textContent = reason === 'gold' ? `还差 ${format(config.cost - run.gold)} 金。`
          : reason === 'bench' ? '备战区已满。腾一个位置，或等买入就能升星的符文。' : '这枚符文暂时买不了。';
        return;
      }
      const layouts = purchaseLayouts(prepared, catalog);
      const { candidate, slot, rune } = prepared;
      const acquired = `${config.name} ${rune.star} 星`;
      let destination = layouts.recommended;

      function draw(focus?: number) {
        const layout = destination === undefined ? layouts.fixed : layouts.placements[destination]!;
        const { hp, result, wallet } = layout;
        const diff = result.damage - current.damage;
        const damage = get('damage');
        damage.textContent = `${format(current.damage)} → ${format(result.damage)}`;
        damage.dataset.change = diff < 0 ? 'down' : diff > 0 ? 'up' : 'same';
        get('wallet').textContent = `${format(currentWallet.gold)} → ${format(wallet.gold)} 金`;
        get('interest').textContent = result.win ? `含利息 ${format(wallet.interest)} 金` : '无过关奖励';
        get('gold').textContent = `${format(run.gold)} → ${format(candidate.gold)} 金`;
        const spot: Slot = destination === undefined ? slot : { zone: 'board', index: destination };
        const previous = destination === undefined ? null : candidate.board[destination];
        get('placement').textContent = `${acquired}放在${place(spot)}。${previous ?
          `原来的${catalog[previous.configId].name}换到${place(slot)}。` : ''}`;
        const verdict = get('verdict');
        verdict.textContent = result.win ? `可击破 · 敌血 ${format(hp)}` :
          current.win ? `原本能过 · 改后差 ${format(result.hp)}` : `还差 ${format(result.hp)}`;
        verdict.dataset.win = String(result.win);
        stay.setAttribute('aria-pressed', String(destination === undefined));
        suggest.hidden = layouts.recommended === undefined;
        suggest.setAttribute('aria-pressed', String(destination !== undefined && destination === layouts.recommended));
        suggest.textContent = layouts.recommended === undefined ? '' : `高伤 · 第 ${layouts.recommended + 1} 格`;
        economy.hidden = layouts.economy === undefined;
        economy.setAttribute('aria-pressed', String(destination !== undefined && destination === layouts.economy));
        economy.textContent = layouts.economy === undefined ? '' : `多留金 · 第 ${layouts.economy + 1} 格`;
        get('status').hidden = true;
        renderSynergyChanges(get('synergies'), synergyTierChanges(run, layout.run.board, catalog));

        board.replaceChildren(...layout.run.board.map((piece, position) => {
          const cell = document.createElement('button');
          cell.type = 'button';
          cell.dataset.index = String(position);
          cell.setAttribute('aria-pressed', String(spot.zone === 'board' && spot.index === position));
          cell.toggleAttribute('data-recommended', position === layouts.recommended);
          cell.toggleAttribute('data-economy', position === layouts.economy);
          const pieceConfig = piece ? catalog[piece.configId] : undefined;
          const tile = run.tileModifiers[position];
          const number = document.createElement('small');
          number.textContent = String(position + 1);
          cell.append(number);
          if (pieceConfig) {
            glyph(cell, pieceConfig.id);
            cell.style.color = pieceConfig.color;
          }
          if (tile) {
            const marker = document.createElement('i');
            marker.textContent = tileNames[tile];
            cell.append(marker);
          }
          cell.setAttribute('aria-label', `第 ${position + 1} 格${pieceConfig ? `，${pieceConfig.name} ${piece!.star} 星` : '，空格'}`);
          cell.onclick = () => { click(); destination = layouts.placements[position] ? position : undefined; draw(position); };
          return cell;
        }));
        confirm.textContent = `${destination === undefined ? '购买' : '购买并落位'} · ${config.cost} 金`;
        if (focus !== undefined) board.querySelector<HTMLButtonElement>(`[data-index="${focus}"]`)?.focus({ preventScroll: true });
      }

      stay.onclick = () => { click(); destination = undefined; draw(); };
      suggest.onclick = () => { click(); destination = layouts.recommended; draw(); };
      economy.onclick = () => { click(); destination = layouts.economy; draw(); };
      confirm.onclick = () => {
        const target: Slot | undefined = destination === undefined ? undefined : { zone: 'board', index: destination };
        if (buy(index, target)) dialog.close();
        else {
          const status = get('status');
          status.hidden = false;
          status.textContent = '商店或存档已变化，请关掉试买后再查看。';
        }
      };
      draw();
    }

    showOffer();
    dialog.showModal();
    dialog.scrollTop = 0;
  };
}
