import { boardShareUrl, type SharedBoard } from '../core/boardShare';
import { compareBoardAttempts } from '../core/boardComparison';
import { encounters, relics } from '../core/expedition';
import { prepareBattle, runeFootprint } from '../core/tactics';
import { battleTarget } from '../core/trials';
import type { BattleJournal, Catalog, Rune, Slot, Slots } from '../core/types';

const tiles = { li_fire: '离火', xuan_ice: '玄冰', spirit_gathering: '聚灵' } as const;
const sameRune = (a: Rune | null, b: Rune | null) => a?.configId === b?.configId && a?.star === b?.star && (a?.bonusPower ?? 0) === (b?.bonusPower ?? 0);
const spot = (index: number | null) => index === null ? '备战区' : `${index + 1} 格`;

interface TrialOptions {
  leave?: () => void;
  live?: { bench: Slots; suggestion?: [Slot, Slot]; apply: (board: Slots, bench: Slots) => boolean };
}

export function openBoardTrial(
  snapshot: SharedBoard,
  catalog: Catalog,
  glyph: (owner: HTMLElement, id: string) => void,
  format: (number: number) => string,
  click: () => void,
  review: (journal: BattleJournal) => void,
  { leave, live }: TrialOptions = {},
) {
  const dialog = document.querySelector<HTMLDialogElement>('#shared-board-dialog')!;
  if (dialog.open) return;
  const get = (id: string) => dialog.querySelector<HTMLElement>(`#${id}`)!;
  const grid = get('shared-board-grid');
  const bench = get('shared-board-bench');
  const apply = dialog.querySelector<HTMLButtonElement>('#shared-board-apply')!;
  const result = get('shared-board-result');
  const journalButton = get('shared-board-journal');
  const share = dialog.querySelector<HTMLDetailsElement>('#shared-board-share')!;
  const link = dialog.querySelector<HTMLInputElement>('#shared-board-link')!;
  const copy = get('shared-board-copy');
  const undo = dialog.querySelector<HTMLButtonElement>('#shared-board-undo')!;
  const compare = dialog.querySelector<HTMLDetailsElement>('#shared-board-compare')!;
  const inspect = get('shared-board-inspect');
  const { hp, encounter, trial } = battleTarget(snapshot.wave, snapshot.trialWave, snapshot.trialRoute);
  const originalEvents = prepareBattle(snapshot, catalog).events;
  const original = originalEvents.at(-1);
  if (original?.type !== 'TURN_RESULT') return;
  const originalDamage = original.damage;
  const boardSize = snapshot.board.length;
  const originalSlots = [...snapshot.board, ...(live?.bench ?? [])];
  let slots = [...originalSlots];
  let selected: number | null = null;
  let best: number | undefined;
  let journal: BattleJournal | undefined;
  const moves: [number, number][] = [];
  const instructions = live ? '点两格换位。试打后，可把这套阵容应用到当前对局。' : '点任意两格换位，空格也能用。';
  const swap = (from: number, to: number) => { [slots[from], slots[to]] = [slots[to], slots[from]]; };
  const slotIndex = ({ zone, index }: Slot) => zone === 'board' ? index : boardSize + index;

  function clearAttempt() {
    journal = undefined;
    journalButton.hidden = true;
    share.hidden = true;
    share.open = false;
    link.value = '';
    compare.hidden = true;
    compare.open = false;
    apply.disabled = true;
    result.textContent = instructions;
    delete result.dataset.win;
    undo.disabled = moves.length === 0;
  }

  function showComparison(current: BattleJournal) {
    const { damage, chains } = compareBoardAttempts({ board: snapshot.board, bench: live?.bench, events: originalEvents }, current);
    const row = (label: string, numbers: string, delta: number, unit: string) => {
      const item = document.createElement('li');
      const heading = document.createElement('span');
      heading.textContent = label;
      const value = document.createElement('strong');
      value.dataset.gain = String(delta > 0);
      value.textContent = `${numbers}${delta > 0 ? '+' : '−'}${format(Math.abs(delta))}${unit}`;
      item.append(heading, value);
      return item;
    };
    const damageList = get('shared-board-damage-diff');
    damageList.hidden = !damage.length;
    damageList.replaceChildren(...damage.slice(0, 3).map(change => {
      const label = 'rune' in change ? `${catalog[change.rune.configId].name} · ${change.from === change.to ? spot(change.to) : `${spot(change.from)} → ${spot(change.to)}`}` :
        change.kind === 'poison' ? '回合末剧毒' : '共鸣伤害';
      return row(label, `${format(change.before)}→${format(change.after)} · `, change.after - change.before, ' 伤害');
    }));
    const chainList = get('shared-board-chain-diff');
    chainList.hidden = !chains.length;
    chainList.replaceChildren(...chains.slice(0, 3).map(edge => row(`${catalog[edge.from.configId].name} → ${catalog[edge.to.configId].name}`, '', edge.difference, ' 次连锁')));
    compare.hidden = !damage.length && !chains.length;
  }

  function draw(focus?: number) {
    const selectedRune = selected === null ? null : slots[selected];
    const selectedConfig = selectedRune ? catalog[selectedRune.configId] : null;
    const footprint = selected !== null && selected < boardSize && selectedConfig ? runeFootprint(selectedConfig, selected) : null;
    inspect.hidden = selected === null;
    inspect.textContent = selectedConfig ? `${selectedConfig.name} · ${selectedConfig.desc}` : '选中了空格，点一枚符文移过来。';
    const cells = slots.map((rune, cell) => {
      const onBoard = cell < boardSize;
      const labelNumber = onBoard ? cell + 1 : cell - boardSize + 1;
      const button = document.createElement('button');
      button.type = 'button';
      const config = rune && catalog[rune.configId];
      const modifier = snapshot.tileModifiers[cell];
      const stamp = document.createElement('small');
      stamp.textContent = `${labelNumber}${modifier ? ` ${tiles[modifier]}` : ''}`;
      if (modifier) button.dataset.modifier = modifier;
      const reach = footprint?.links.has(cell) ? '连锁范围' : footprint?.effects.has(cell) ? '作用范围' : '';
      if (reach) button.dataset.reach = reach === '连锁范围' ? 'chain' : 'effect';
      button.setAttribute('aria-label', `${onBoard ? '' : '备战区'}第 ${labelNumber} 格，${config ? `${config.name} ${rune!.star} 星` : '空格'}${modifier ? `，${tiles[modifier]}位` : ''}${reach ? `，${reach}` : ''}`);
      button.setAttribute('aria-pressed', String(cell === selected));
      const icon = document.createElement('span');
      icon.setAttribute('aria-hidden', 'true');
      if (config && rune) {
        button.style.setProperty('--daily-ink', config.color);
        glyph(icon, config.id);
        const label = document.createElement('strong');
        label.textContent = `${config.name} ${'·'.repeat(rune.star)}`;
        button.append(stamp, icon, label);
      } else {
        button.dataset.empty = 'true';
        icon.textContent = '＋';
        button.append(stamp, icon);
      }
      button.onclick = () => {
        click();
        if (selected === null) {
          selected = cell;
        } else {
          const from = selected;
          selected = null;
          if (from !== cell && !sameRune(slots[from], slots[cell])) {
            swap(from, cell);
            moves.push([from, cell]);
            clearAttempt();
          }
        }
        draw(cell);
      };
      return button;
    });
    grid.replaceChildren(...cells.slice(0, boardSize));
    bench.replaceChildren(...cells.slice(boardSize));
    if (focus !== undefined) cells[focus]?.focus({ preventScroll: true });
  }

  dialog.toggleAttribute('data-live-board', !!live);
  get('shared-board-title').textContent = live ? '试摆当前阵容' : '接手这一波';
  get('shared-board-reserves').hidden = !live;
  apply.hidden = !live;
  get('shared-board-wave').textContent = `第 ${snapshot.wave} 波 · ${trial?.name ?? encounters[encounter].name} · ${format(hp)} 生命`;
  get('shared-board-original').textContent = format(originalDamage);
  get('shared-board-best').textContent = '—';
  get('shared-board-rules').textContent = `${format(snapshot.gold)} 金${snapshot.relics.length ? ` · ${snapshot.relics.map(id => relics[id].name).join('、')}` : ''}`;
  clearAttempt();
  get('shared-board-close').onclick = () => { click(); dialog.close(); };
  get('shared-board-reset').onclick = () => {
    click(); slots = [...originalSlots]; selected = null; moves.length = 0;
    clearAttempt(); draw();
  };
  undo.onclick = () => {
    const move = moves.pop();
    if (!move) return;
    click(); swap(...move); selected = null;
    clearAttempt(); draw();
  };
  function check() {
    const board = slots.slice(0, boardSize);
    const { events } = prepareBattle({ ...snapshot, board }, catalog);
    const turn = events.at(-1);
    if (turn?.type !== 'TURN_RESULT') return;
    journal = { wave: snapshot.wave, trialWave: snapshot.trialWave, trialRoute: snapshot.trialRoute, board, gold: snapshot.gold, events };
    journalButton.hidden = false;
    showComparison(journal);
    best = best === undefined ? turn.damage : Math.max(best, turn.damage);
    get('shared-board-best').textContent = format(best);
    const change = turn.damage - originalDamage;
    const comparison = change > 0 ? `比原阵多 ${format(change)}` : change < 0 ? `比原阵少 ${format(-change)}` : '追平原阵';
    result.textContent = `${format(turn.damage)} 伤害 · ${comparison}。${turn.win ? '打过了。' : `还差 ${format(turn.hp)} 点。`}`;
    result.dataset.win = String(turn.win);
    const changed = board.some((rune, index) => !sameRune(rune, snapshot.board[index]));
    apply.disabled = !live || !slots.some((rune, index) => !sameRune(rune, originalSlots[index]));
    link.value = changed ? boardShareUrl(location.href, { ...snapshot, board }) ?? '' : '';
    share.hidden = !link.value;
    copy.textContent = '复制';
  }
  get('shared-board-check').onclick = () => { click(); check(); };
  apply.onclick = () => {
    if (!live || apply.disabled || !journal) return;
    click();
    if (live.apply(journal.board, slots.slice(boardSize))) dialog.close();
    else {
      clearAttempt();
      apply.hidden = true;
      result.textContent = '当前阵容已变化，请关掉试阵后重新打开。';
    }
  };
  journalButton.onclick = () => { if (journal) { click(); review(journal); } };
  copy.onclick = async () => {
    click();
    const address = link.value;
    try {
      await navigator.clipboard.writeText(address);
      if (dialog.open && link.value === address) copy.textContent = '已复制';
    } catch { if (dialog.open) { link.focus(); link.select(); } }
  };
  if (live?.suggestion) {
    const [origin, destination] = live.suggestion;
    const move: [number, number] = [slotIndex(origin), slotIndex(destination)];
    swap(...move);
    moves.push(move);
    undo.disabled = false;
    check();
  }
  if (leave) dialog.addEventListener('close', leave, { once: true });
  draw();
  dialog.showModal();
}
