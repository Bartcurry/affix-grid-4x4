import { boardShareUrl, type SharedBoard } from '../core/boardShare';
import { encounterAt, encounters, relics } from '../core/expedition';
import { bestFormationMove } from '../core/formationMove';
import { toCoords } from '../core/grid';
import { planTurn, runeFootprint } from '../core/tactics';
import type { Catalog, Rune, Slot } from '../core/types';

const tileNames = { li_fire: '离火', xuan_ice: '玄冰', spirit_gathering: '聚灵' } as const;
type Move = [Slot, Slot];
interface ApplyFormation {
  matches(board: SharedBoard): boolean;
  apply(board: SharedBoard): boolean;
}

export function bindBoardTrial(catalog: Catalog, glyph: (cell: HTMLElement, id: string) => void, format: (value: number) => string, click: () => void) {
  const dialog = document.querySelector<HTMLDialogElement>('#trial-board-dialog')!;
  const get = <T extends HTMLElement = HTMLElement>(id: string) => dialog.querySelector<T>(`#trial-board-${id}`)!;
  const undo = get<HTMLButtonElement>('undo');
  const reset = get<HTMLButtonElement>('reset');
  const copy = get<HTMLButtonElement>('copy');
  const apply = get<HTMLButtonElement>('apply');
  const find = get<HTMLButtonElement>('find');
  const guide = get('guide');
  const link = get<HTMLInputElement>('link');
  const outcome = get('result');
  const shareStatus = get('share-status');
  let active: SharedBoard;
  let original: ReturnType<typeof planTurn>;
  let originalPieces: Map<Rune, number>;
  let selected: Slot | undefined;
  let moves: Move[];
  let tried = false;
  let suggested: Move | undefined;
  let availableApply: ApplyFormation | undefined;
  const delta = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${format(Math.abs(value))}`;

  function updateControls() {
    undo.disabled = reset.disabled = !moves.length;
    copy.disabled = !moves.length || !tried;
    apply.hidden = !availableApply?.matches(active);
  }

  function clearAttempt() {
    tried = false;
    get('current').textContent = '待试打';
    get('delta').textContent = '';
    delete get('delta').dataset.direction;
    outcome.textContent = '换位后点试打。';
    delete outcome.dataset.win;
    shareStatus.textContent = '换位和试打都只在这里生效。';
    link.hidden = true;
    guide.hidden = true;
    suggested = undefined;
    updateControls();
  }

  function exchange([from, to]: Move) {
    [active[from.zone][from.index], active[to.zone][to.index]] = [active[to.zone][to.index], active[from.zone][from.index]];
  }

  function draw(focus?: Slot) {
    const picked = selected && active[selected.zone][selected.index];
    const config = picked ? catalog[picked.configId] : undefined;
    const reach = config && selected?.zone === 'board' ? runeFootprint(config, selected.index) : undefined;
    const inspect = get('inspect');
    inspect.hidden = !config && !!suggested;
    inspect.textContent = config && picked
      ? `${config.name} · ${picked.star} 星${picked.bonusPower ? ` · 威力 +${format(picked.bonusPower)}` : ''}。 ${config.desc}`
      : '先点一枚符文，再点棋盘或备战区的目标格。';
    for (const zone of ['board', 'bench'] as const) {
      const container = get(zone === 'board' ? 'grid' : 'bench');
      container.replaceChildren(...active[zone].map((rune, index) => {
        const slot: Slot = { zone, index };
        const cell = document.createElement('button');
        const type = rune ? catalog[rune.configId] : undefined;
        const tile = zone === 'board' ? active.tileModifiers[index] : undefined;
        const isPicked = selected?.zone === zone && selected.index === index;
        cell.type = 'button';
        cell.dataset.index = String(index);
        cell.dataset.occupied = String(!!rune);
        cell.setAttribute('aria-pressed', String(isPicked));
        cell.setAttribute('aria-label', `${zone === 'board' ? '棋盘' : '备战区'}第 ${index + 1} 格，${type?.name ?? '空格'}${rune ? `，${rune.star} 星` : ''}${tile ? `，${tileNames[tile]}位` : ''}`);
        if (zone === 'board') cell.dataset.reach = reach?.links.has(index) ? 'chain' : reach?.effects.has(index) ? 'effect' : '';
        if (suggested) {
          if (suggested[0].zone === zone && suggested[0].index === index) cell.dataset.suggestion = 'from';
          if (suggested[1].zone === zone && suggested[1].index === index) cell.dataset.suggestion = 'to';
        }
        const number = document.createElement('small');
        number.textContent = String(index + 1);
        cell.append(number);
        if (tile) {
          const marker = document.createElement('i');
          marker.textContent = tileNames[tile];
          cell.append(marker);
        }
        if (type && rune) {
          cell.style.setProperty('--rune-ink', type.color);
          glyph(cell, type.id);
          if (rune.star > 1) cell.dataset.star = String(rune.star);
        }
        cell.onclick = () => {
          click();
          if (isPicked) selected = undefined;
          else if (!selected) { if (rune) selected = slot; }
          else {
            const move: Move = [selected, slot];
            exchange(move);
            moves.push(move);
            selected = undefined;
            clearAttempt();
          }
          draw(slot);
        };
        return cell;
      }));
      if (focus?.zone === zone) container.querySelector<HTMLButtonElement>(`[data-index="${focus.index}"]`)?.focus({ preventScroll: true });
    }
  }

  function showResult(current: ReturnType<typeof planTurn>) {
    const difference = current.result.damage - original.result.damage;
    const combo = current.result.combo - original.result.combo;
    get('current').textContent = format(current.result.damage);
    const change = get('delta');
    change.textContent = `${difference ? `${delta(difference)} 伤害` : '伤害持平'} · ${format(current.result.combo)} 连击${combo ? `（${delta(combo)}）` : ''}`;
    change.dataset.direction = difference > 0 ? 'up' : difference < 0 ? 'down' : '';
    const sources = [...active.board, ...active.bench].flatMap((rune, index) => {
      if (!rune) return [];
      const amount = (current.byCell[index]?.damage ?? 0) - (originalPieces.get(rune) ?? 0);
      return amount ? [{ name: catalog[rune.configId].name, amount }] : [];
    });
    const poison = current.poisonDamage - original.poisonDamage;
    if (poison) sources.push({ name: '回合末剧毒', amount: poison });
    const largest = sources.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))[0];
    const verdict = current.result.win ? '过了。' : `还差 ${format(current.result.hp)} 伤害。`;
    outcome.textContent = `${verdict}${largest ? ` ${largest.name} ${delta(largest.amount)} 伤害。` : ''}`;
    outcome.dataset.win = String(current.result.win);
    tried = true;
    updateControls();
  }

  get('close').onclick = () => dialog.close();
  get('check').onclick = () => { click(); showResult(planTurn(active, catalog)); };
  find.onclick = () => {
    click();
    const current = moves.length ? planTurn(active, catalog) : original;
    const move = bestFormationMove(active, catalog, current.result.damage);
    if (!move) {
      showResult(current);
      guide.textContent = '单步换位已试完。可以继续手动试两步。';
      guide.hidden = false;
      return;
    }
    const place = ({ zone, index }: Slot) => `${zone === 'bench' ? '备战区' : '棋盘'}第 ${index + 1} 格`;
    const fromRune = active[move.from.zone][move.from.index]!;
    const occupied = !!active[move.to.zone][move.to.index];
    const middle = move.to.zone === 'board' && [1, 2].includes(toCoords(move.to.index).col);
    const fromEdge = move.from.zone === 'board' && [0, 3].includes(toCoords(move.from.index).col);
    const positional = encounterAt(active.wave) === 'flanks' && middle && fromEdge ? '打石狮时，把主力放在中间两列。' : '';
    suggested = [move.from, move.to];
    moves.push(suggested);
    exchange(suggested);
    selected = undefined;
    const action = occupied ? `和${place(move.to)}换位` : `移到${place(move.to)}`;
    guide.textContent = `${place(move.from)}的${catalog[fromRune.configId].name}${action}。 ${positional}`;
    guide.hidden = false;
    link.hidden = true;
    shareStatus.textContent = '换位和试打都只在这里生效。';
    draw();
    showResult(planTurn(active, catalog));
  };
  apply.onclick = () => {
    click();
    if (availableApply?.apply(active)) dialog.close();
    else {
      apply.hidden = true;
      shareStatus.textContent = '当前局已变化。改阵链接还可以复制。';
    }
  };
  undo.onclick = () => {
    const move = moves.pop();
    if (!move) return;
    click(); exchange(move); selected = undefined; clearAttempt(); draw();
  };
  reset.onclick = () => {
    click();
    for (const move of moves.reverse()) exchange(move);
    moves = [];
    selected = undefined;
    clearAttempt();
    draw();
  };
  copy.onclick = async () => {
    click();
    const url = boardShareUrl(location.href, active);
    if (!url) return;
    link.value = url;
    try {
      await navigator.clipboard.writeText(url);
      if (dialog.open && tried) shareStatus.textContent = '改阵链接已复制。';
    } catch {
      if (!dialog.open || !tried) return;
      link.hidden = false;
      link.focus();
      link.select();
      shareStatus.textContent = '长按链接可手动复制。';
    }
  };

  return {
    dialog,
    open(snapshot: SharedBoard, applyToRun?: ApplyFormation, fromCampaign = false) {
      if (dialog.open) return;
      active = { ...snapshot, board: [...snapshot.board], bench: [...snapshot.bench] };
      availableApply = applyToRun;
      original = planTurn(active, catalog);
      originalPieces = new Map(active.board.flatMap((rune, index) => rune ? [[rune, original.byCell[index].damage] as const] : []));
      moves = [];
      selected = undefined;
      const enemy = encounters[encounterAt(active.wave)];
      get('wave').textContent = `第 ${active.wave} 波 · ${enemy.name} · ${format(original.hp)} 生命`;
      get('original').textContent = format(original.result.damage);
      get('original-combo').textContent = `${format(original.result.combo)} 连击`;
      get('resources').textContent = `${format(active.gold)} 金 · ${active.shield} 护盾 · ${active.relics.length} 件遗物`;
      get('relics').textContent = [enemy.hint, ...active.relics.map(id => relics[id].name)].join(' · ');
      get<HTMLDetailsElement>('conditions').open = false;
      find.hidden = !fromCampaign;
      dialog.toggleAttribute('data-campaign', fromCampaign);
      clearAttempt();
      draw();
      dialog.showModal();
      dialog.scrollTop = 0;
    },
  };
}
