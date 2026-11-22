import { firstSupplySteps, type FirstSupplyPlan } from '../core/firstSupply';
import { damageBySource } from '../core/journal';
import { runeAt } from '../core/shopEngine';
import { previewPlacement, simulateFormation } from '../core/tactics';
import type { BattleEvent, Catalog, Run, Slot, TurnResult } from '../core/types';
import { placeBattleLink } from './battleFrame';
import { formatNumber as format, tileStamp } from './canvasRenderer';

const place = ({ zone, index }: Slot) => `${zone === 'board' ? '棋盘' : '备战区'}第 ${index + 1} 格`;
const sameSlot = (a: Slot, b: Slot) => a.zone === b.zone && a.index === b.index;

function countLinks(run: Run, events: BattleEvent[]) {
  const links = new Map<string, { from: number; to: number; count: number }>();
  for (const event of events) {
    if (event.type !== 'CHAIN_LINK') continue;
    const { from, to } = event;
    const key = `${from}:${run.board[from]?.configId}:${to}:${run.board[to]?.configId}`;
    const link = links.get(key);
    if (link) link.count++;
    else links.set(key, { from, to, count: 1 });
  }
  return links;
}

export function bindFirstSupplyRoom(catalog: Catalog, glyph: (node: HTMLElement, id: string) => void, click: () => void) {
  const dialog = document.querySelector<HTMLDialogElement>('#first-supply-dialog')!;
  const get = <T extends HTMLElement = HTMLElement>(id: string) => dialog.querySelector<T>(`#first-supply-${id}`)!;
  const buy = get<HTMLButtonElement>('buy');
  const confirm = get<HTMLButtonElement>('confirm');
  const quick = get<HTMLButtonElement>('quick');
  const retry = get<HTMLButtonElement>('retry');
  const status = get('status');
  get('close').onclick = () => { click(); dialog.close(); };

  return (run: Run, current: TurnResult, plan: FirstSupplyPlan, apply: (draft: Run) => boolean) => {
    if (dialog.open) return;
    const steps = firstSupplySteps(run, plan, catalog);
    const baseLinks = countLinks(run, simulateFormation(run, catalog).events);
    let stepIndex = 0;
    let draft = run;
    let alternative: Run | undefined;
    let picked = false;
    const nameAt = (formation: Run, slot: Slot) => {
      const rune = runeAt(formation, slot);
      return rune ? catalog[rune.configId].name : '空格';
    };
    const cells = (['board', 'bench'] as const).flatMap(zone => {
      const row = run[zone].map((_, index) => {
        const slot: Slot = { zone, index };
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.index = String(index);
        button.onclick = () => choose(slot);
        return { slot, button };
      });
      get(zone).replaceChildren(...row.map(({ button }) => button));
      return row;
    });

    function focusStep() {
      const next = steps[stepIndex];
      if (alternative) (confirm.hidden ? retry : confirm).focus({ preventScroll: true });
      else if (next?.kind === 'place') cells.find(({ slot }) => sameSlot(next.from, slot))?.button.focus({ preventScroll: true });
      else if (next?.kind === 'buy') buy.focus({ preventScroll: true });
      else if (!confirm.hidden) confirm.focus({ preventScroll: true });
      else quick.focus({ preventScroll: true });
    }

    function choose(slot: Slot) {
      const step = steps[stepIndex];
      if (alternative || step?.kind !== 'place') return;
      if (sameSlot(slot, step.from)) picked = !picked;
      else {
        if (!picked) return;
        const moved = previewPlacement(draft, step.from, slot);
        if (!moved) return;
        if (sameSlot(slot, step.to)) { draft = moved; stepIndex++; }
        else alternative = moved;
        picked = false;
      }
      click();
      draw();
      if (picked) cells.find(cell => sameSlot(cell.slot, step.to))?.button.focus({ preventScroll: true });
      else if (!sameSlot(slot, step.from)) focusStep();
    }

    function showTrace(formation: Run, events: BattleEvent[], visible: boolean) {
      const arrow = get('link');
      const trace = get('trace');
      arrow.hidden = true;
      trace.hidden = true;
      if (!visible) return;
      const added = [...countLinks(formation, events)].map(([key, link]) => ({ ...link, count: link.count - (baseLinks.get(key)?.count ?? 0) }))
        .find(link => link.count > 0);
      const slot = (index: number) => ({ zone: 'board' as const, index });
      if (added) {
        placeBattleLink(arrow, added.from, added.to);
        trace.textContent = `第 ${added.from + 1} 格${nameAt(formation, slot(added.from))}让第 ${added.to + 1} 格${nameAt(formation, slot(added.to))}多触发 ${format(added.count)} 次。`;
      } else {
        const [leader] = [...damageBySource(events).breakdown].sort((a, b) => b[1] - a[1]);
        if (!leader) return;
        const [source, amount] = leader;
        const name = typeof source === 'number' ? nameAt(formation, slot(source)) : '回合末的毒';
        trace.textContent = `${name}打出 ${format(amount)} 点，是这次的主要伤害。`;
      }
      trace.hidden = false;
    }

    function draw() {
      const shown = alternative ?? draft;
      const { hp, events } = simulateFormation(shown, catalog);
      const result = events.at(-1);
      if (result?.type !== 'TURN_RESULT') throw new Error('Missing first supply result');
      const step = alternative ? undefined : steps[stepIndex];
      const offer = step?.kind === 'buy' ? draft.shop[step.index] : undefined;
      const damage = get('damage');
      damage.textContent = `${format(result.damage)} / ${format(hp)}`;
      damage.dataset.win = String(result.win);
      get('gold').textContent = format(shown.gold);
      const delta = result.damage - current.damage;
      const verdict = get('verdict');
      verdict.dataset.win = String(result.win);
      verdict.textContent = `${result.win ? '可以击破' : `还差 ${format(result.hp)} 点`}${delta ? ` · 伤害 ${delta > 0 ? '+' : '−'}${format(Math.abs(delta))}` : ''}`;
      get('instruction').textContent = offer ? '先在试阵里买一枚符文。确认应用时才花金币。'
        : step?.kind === 'place' ? (picked ? `试放到高亮的${place(step.to)}，也可以试试别的格子。` : `选中${place(step.from)}的${nameAt(draft, step.from)}。`)
        : alternative ? (result.win ? '这个摆法也能过关。可以用这套，也可以再试。' : '这个摆法伤害不够。重试这一步，换个位置看看。')
        : result.win ? '布阵完成，可以回棋盘开战。' : '这套布阵提高了伤害，还可以继续调整。';
      for (const { slot, button } of cells) {
        const rune = runeAt(shown, slot);
        const source = step?.kind === 'place' && sameSlot(slot, step.from);
        const destination = step?.kind === 'place' && sameSlot(slot, step.to);
        const validTarget = step?.kind === 'place' && picked && (step.from.zone === 'board' || slot.zone === 'board');
        button.disabled = !source && !validTarget;
        button.dataset.occupied = String(!!rune);
        button.toggleAttribute('data-hint', picked ? destination : source);
        button.setAttribute('aria-pressed', String(source && picked));
        const number = document.createElement('small');
        number.textContent = String(slot.index + 1);
        button.replaceChildren(number);
        if (rune) {
          button.style.setProperty('--rune-ink', catalog[rune.configId].color);
          glyph(button, rune.configId);
          const rank = document.createElement('i');
          rank.textContent = rune.star > 1 ? `${rune.star}★` : '';
          button.append(rank);
        }
        const tile = slot.zone === 'board' && tileStamp[shown.tileModifiers[slot.index]];
        if (tile) {
          const mark = document.createElement('i');
          mark.className = 'first-supply-tile';
          mark.textContent = tile.name[0];
          mark.style.color = tile.color;
          button.append(mark);
        }
        button.setAttribute('aria-label', `${place(slot)}，${nameAt(shown, slot)}${rune ? `，${rune.star} 星` : ''}${(picked ? destination : source) ? '，推荐' : ''}`);
      }
      buy.hidden = !offer;
      if (offer) buy.textContent = `试买${catalog[offer.configId].name} · ${format(catalog[offer.configId].cost)} 金${step?.kind === 'buy' && step.merged ? ' · 合成' : ''}`;
      retry.hidden = !alternative;
      confirm.hidden = !!step || !!alternative && !result.win || !steps.length;
      const cost = run.gold - shown.gold;
      confirm.textContent = cost ? `应用这套布阵 · ${format(cost)} 金` : '应用这套布阵';
      quick.hidden = !confirm.hidden && !alternative;
      quick.textContent = plan.purchase ? `直接应用推荐 · ${format(run.gold - plan.run.gold)} 金` : '直接应用推荐';
      showTrace(shown, events, !!alternative || steps.slice(0, stepIndex).some(item => item.kind === 'place') || !step);
    }

    function commit(formation: Run) {
      if (apply(formation)) dialog.close();
      else {
        status.textContent = '阵容或商店已变动，请关闭后重新试算。';
        status.hidden = false;
        confirm.disabled = quick.disabled = true;
      }
    }
    buy.onclick = () => {
      const step = steps[stepIndex];
      if (step?.kind !== 'buy') return;
      click(); draft = step.run; stepIndex++; draw(); focusStep();
    };
    retry.onclick = () => { click(); alternative = undefined; draw(); focusStep(); };
    confirm.onclick = () => commit(alternative ?? draft);
    quick.onclick = () => commit(plan.run);
    confirm.disabled = quick.disabled = false;
    status.hidden = true;
    draw();
    dialog.showModal();
    focusStep();
    dialog.scrollTop = 0;
  };
}
