import { boardShareUrl, type SharedBoard } from '../core/boardShare';
import { battleTarget } from '../core/bounties';
import { affixAt, encounters, relics } from '../core/expedition';
import { bestFormationMove, type FormationPlan } from '../core/formationMove';
import { toCoords } from '../core/grid';
import { planTurn, runeFootprint } from '../core/tactics';
import type { Catalog, Rune, Slot } from '../core/types';

const tileNames = { li_fire: '离火', xuan_ice: '玄冰', spirit_gathering: '聚灵' } as const;
type Move = [Slot, Slot];
interface ApplyFormation {
  matches(board: SharedBoard): boolean;
  apply(board: SharedBoard): boolean;
  label?: string;
  note?: string;
}
interface PracticeGoal { name: string; damage: number }

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
  let suggested: Move[] = [];
  let search: Worker | undefined;
  let availableApply: ApplyFormation | undefined;
  let practice: PracticeGoal | undefined;
  const delta = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${format(Math.abs(value))}`;

  function updateControls() {
    undo.disabled = reset.disabled = !moves.length;
    copy.disabled = !moves.length || !tried;
    apply.hidden = !availableApply?.matches(active);
  }

  function clearAttempt() {
    stopSearch();
    tried = false;
    get('current').textContent = '待试打';
    get('delta').textContent = '';
    delete get('delta').dataset.direction;
    outcome.textContent = '换位后点试打。';
    delete outcome.dataset.win;
    shareStatus.textContent = '换位和试打都只在这里生效。';
    link.hidden = true;
    guide.hidden = true;
    suggested = [];
    updateControls();
  }

  function stopSearch() {
    search?.terminate();
    search = undefined;
    find.disabled = false;
  }

  function exchange([from, to]: Move) {
    [active[from.zone][from.index], active[to.zone][to.index]] = [active[to.zone][to.index], active[from.zone][from.index]];
  }

  function draw(focus?: Slot) {
    const picked = selected && active[selected.zone][selected.index];
    const config = picked ? catalog[picked.configId] : undefined;
    const reach = config && selected?.zone === 'board' ? runeFootprint(config, selected.index) : undefined;
    const inspect = get('inspect');
    inspect.hidden = !config && suggested.length > 0;
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
        for (const [from, to] of suggested) {
          if (from.zone === zone && from.index === index) cell.dataset.suggestion = 'from';
          if (to.zone === zone && to.index === index) cell.dataset.suggestion = 'to';
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
    const passed = practice ? current.result.damage >= practice.damage : current.result.win;
    const verdict = practice
      ? passed ? '达成练习目标。' : `离练习目标还差 ${format(practice.damage - current.result.damage)} 伤害。`
      : passed ? '过了。' : `还差 ${format(current.result.hp)} 伤害。`;
    outcome.textContent = `${verdict}${largest ? ` ${largest.name} ${delta(largest.amount)} 伤害。` : ''}`;
    outcome.dataset.win = String(passed);
    tried = true;
    updateControls();
  }

  get('close').onclick = () => dialog.close();
  dialog.addEventListener('close', stopSearch);
  get('check').onclick = () => {
    click();
    if (search) { stopSearch(); guide.hidden = true; }
    showResult(planTurn(active, catalog));
  };

  function showPlan(plan: FormationPlan | undefined, current: ReturnType<typeof planTurn>) {
    if (!plan) {
      showResult(current);
      guide.textContent = '暂时没找到更高伤害的摆法。可以继续换位，或到符文铺试买。';
      guide.hidden = false;
      return;
    }
    const place = ({ zone, index }: Slot) => `${zone === 'bench' ? '备战区' : '棋盘'}第 ${index + 1} 格`;
    const spot = ({ zone, index }: Slot) => `${zone === 'bench' ? '备战 ' : ''}${index + 1}`;
    suggested = [];
    const descriptions = plan.moves.map(({ from, to }, index) => {
      const fromRune = active[from.zone][from.index]!;
      const occupied = !!active[to.zone][to.index];
      const action = occupied ? `和${place(to)}换位` : `移到${place(to)}`;
      const move: Move = [from, to];
      suggested.push(move);
      moves.push(move);
      exchange(move);
      const middle = to.zone === 'board' && [1, 2].includes(toCoords(to.index).col);
      const fromEdge = from.zone === 'board' && [0, 3].includes(toCoords(from.index).col);
      const positional = plan.moves.length === 1 && battleTarget(active.wave, active.bountyRoute).encounter === 'flanks' && middle && fromEdge
        ? ' 石狮的中间两列更好打。' : '';
      const name = catalog[fromRune.configId].name;
      if (plan.moves.length === 1) return `${place(from)}的${name}${action}。${positional}`;
      return `第 ${index + 1} 步 · ${name} ${spot(from)} → ${spot(to)}${occupied ? '（换位）' : ''}`;
    });
    selected = undefined;
    guide.textContent = descriptions.join('\n');
    guide.hidden = false;
    link.hidden = true;
    shareStatus.textContent = '换位和试打都只在这里生效。';
    draw();
    showResult(planTurn(active, catalog));
  }

  function findPlan() {
    if (search) return;
    const current = moves.length ? planTurn(active, catalog) : original;
    const fallback = () => {
      const move = bestFormationMove(active, catalog, current.result.damage);
      showPlan(move ? { moves: [move], result: move.result } : undefined, current);
    };
    try {
      const worker = new Worker(new URL('./formationSearch.worker.ts', import.meta.url), { type: 'module' });
      search = worker;
      find.disabled = true;
      guide.textContent = '正在试换一两步…';
      guide.hidden = false;
      worker.onmessage = (event: MessageEvent<FormationPlan | undefined>) => {
        if (search !== worker || !dialog.open) return;
        stopSearch();
        showPlan(event.data, current);
      };
      worker.onerror = event => {
        event.preventDefault();
        if (search !== worker || !dialog.open) return;
        stopSearch();
        fallback();
      };
      worker.postMessage({ board: active, result: current.result });
    } catch {
      stopSearch();
      fallback();
    }
  }

  find.onclick = () => { click(); findPlan(); };
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
    open(snapshot: SharedBoard, applyToRun?: ApplyFormation, fromCampaign = false, goal?: PracticeGoal, quickFind = false) {
      if (dialog.open) return;
      active = { ...snapshot, board: [...snapshot.board], bench: [...snapshot.bench] };
      availableApply = applyToRun;
      practice = goal;
      original = planTurn(active, catalog);
      originalPieces = new Map(active.board.flatMap((rune, index) => rune ? [[rune, original.byCell[index].damage] as const] : []));
      moves = [];
      selected = undefined;
      const { encounter, bounty } = battleTarget(active.wave, active.bountyRoute, active.finaleRule);
      const enemy = encounters[encounter];
      get('wave').textContent = goal ? `${goal.name} · 练习目标 ${format(goal.damage)} 伤害`
        : applyToRun?.note ?? `第 ${active.wave} 波 · ${bounty?.name ?? enemy.name} · ${format(original.hp)} 生命`;
      get('original').textContent = format(original.result.damage);
      get('original-combo').textContent = `${format(original.result.combo)} 连击`;
      get('resources').textContent = `${format(active.gold)} 金 · ${active.shield} 护盾 · ${active.relics.length} 件遗物`;
      const affix = affixAt(active.wave);
      get('relics').textContent = [enemy.trait, ...(affix ? [`${affix.name} · ${affix.desc}`] : []),
        ...active.relics.map(id => relics[id].name)].join(' · ');
      get<HTMLDetailsElement>('conditions').open = false;
      find.hidden = !fromCampaign;
      copy.hidden = !!goal;
      apply.textContent = applyToRun?.label ?? '应用到当前阵';
      dialog.toggleAttribute('data-campaign', fromCampaign);
      clearAttempt();
      draw();
      dialog.showModal();
      dialog.scrollTop = 0;
      if (quickFind) findPlan();
    },
  };
}
