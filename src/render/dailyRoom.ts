import { dailyHint, dailyLink, dailyPuzzle, dailyStreak, newDailyRecord, recentDailyDates, runDaily, shanghaiDay, validDailyDate, type DailyPuzzle, type DailyRecord } from '../core/daily';
import { encounters } from '../core/expedition';
import type { Catalog } from '../core/types';

const storageKey = 'affix-grid-4x4.daily.v1';
const tileLabel = { li_fire: '离火', xuan_ice: '玄冰', spirit_gathering: '聚灵' } as const;
type Swap = [number, number];

export function bindDailyRoom(catalog: Catalog, glyph: (node: HTMLElement, id: string) => void, click: () => void,
  canOpen: () => boolean, onSharedClose: () => void) {
  const get = <NodeType extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as NodeType;
  const dialog = get<HTMLDialogElement>('daily-dialog');
  const board = get('daily-board');
  const result = get('daily-result');
  const link = get<HTMLInputElement>('daily-link');
  const archive = get<HTMLDetailsElement>('daily-archive');
  const dates = get('daily-dates');
  const copyButton = get('daily-copy');
  const undo = get<HTMLButtonElement>('daily-undo');
  const goal = get('daily-goal');
  const hintText = get('daily-hint-text');
  let puzzle: DailyPuzzle;
  let pieces: string[];
  let selected: number | null;
  let hinted: number | null = null;
  let exchanges: Swap[];
  let shared = false;
  let copyTimer: ReturnType<typeof setTimeout>;
  const records = new Map<string, DailyRecord>();
  const drafts = new Map<string, { pieces: string[]; exchanges: Swap[] }>();

  const exchange = ([left, right]: Swap) => { [pieces[left], pieces[right]] = [pieces[right], pieces[left]]; };
  const isPerfect = (score: DailyRecord) => score.moves === puzzle.par && score.damage >= puzzle.targetDamage;

  function clearHint() {
    hinted = null;
    hintText.hidden = true;
  }

  function readSavedRecords() {
    try {
      const data: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '{}');
      if (!data || typeof data !== 'object') return;
      for (const [day, value] of Object.entries(data)) if (validDailyDate(day) && value &&
        Number.isSafeInteger(value.moves) && value.moves > 0 && Number.isSafeInteger(value.damage) && value.damage > 0) {
        records.set(day, newDailyRecord(records.get(day), { moves: value.moves, damage: value.damage }));
      }
    } catch {}
  }

  function renderArchive() {
    const today = shanghaiDay();
    const streak = dailyStreak(records, today);
    const badge = get('daily-streak');
    badge.hidden = streak === 0;
    badge.textContent = `连续解开 ${streak} 期`;
    dates.replaceChildren(...recentDailyDates(today).map(day => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.day = day;
      const best = records.get(day);
      button.dataset.solved = String(!!best);
      button.setAttribute('aria-pressed', String(day === puzzle.day));
      button.setAttribute('aria-label', `${day}${day === today ? '，今天' : ''}${best ? `，已解，最佳 ${best.moves} 步` : '，待解'}`);
      const date = document.createElement('strong'); date.textContent = day === today ? '今天' : day.slice(5).replace('-', '/');
      const status = document.createElement('small'); status.textContent = best ? `${best.moves} 步` : '待解';
      button.append(date, status);
      button.onclick = () => {
        click();
        open(day);
        dates.querySelector<HTMLButtonElement>('[aria-pressed=true]')?.focus({ preventScroll: true });
      };
      return button;
    }));
  }

  function stats() {
    get('daily-moves').textContent = String(exchanges.length);
    undo.disabled = !exchanges.length;
    const best = records.get(puzzle.day);
    const bestLabel = get('daily-best');
    const perfect = !!best && isPerfect(best);
    bestLabel.hidden = perfect;
    bestLabel.textContent = best ? `最佳 ${best.moves} 步 · ${best.damage} 伤害` : '还没有纪录';
    goal.hidden = !best;
    if (best) {
      goal.dataset.perfect = String(perfect);
      get('daily-goal-title').textContent = perfect ? '已拿满分' : '满分目标';
      get('daily-goal-target').textContent = `${puzzle.par} 步 · ${puzzle.targetDamage} 伤害`;
    }
  }

  function draw(focus?: number) {
    const offsets = new Map<number, number>(puzzle.template.cells.map((cell, index) => [cell, index]));
    board.replaceChildren(...Array.from({ length: 16 }, (_, cell) => {
      const index = offsets.get(cell);
      if (index === undefined) {
        const empty = document.createElement('span');
        empty.className = 'daily-empty';
        empty.setAttribute('aria-hidden', 'true');
        return empty;
      }
      const id = pieces[index];
      const piece = document.createElement('button');
      piece.type = 'button';
      piece.setAttribute('aria-pressed', String(index === selected));
      piece.toggleAttribute('data-hint', index === hinted);
      const modifier = puzzle.template.tileModifiers?.[cell];
      if (modifier) piece.dataset.modifier = modifier;
      piece.setAttribute('aria-label', `第 ${cell + 1} 格：${catalog[id].name}${modifier ? `，${tileLabel[modifier]}位` : ''}${index === hinted ? '，提示格' : ''}`);
      piece.style.setProperty('--daily-ink', catalog[id].color);
      const stamp = document.createElement('small'); stamp.textContent = `${cell + 1}${modifier ? ` ${tileLabel[modifier]}` : ''}`;
      const icon = document.createElement('span'); glyph(icon, id);
      const name = document.createElement('strong'); name.textContent = catalog[id].name;
      piece.append(stamp, icon, name);
      piece.onclick = () => {
        click();
        if (selected === null) {
          selected = index;
          if (!result.dataset.win) result.textContent = '再点另一枚，交换位置。';
        } else if (selected === index || pieces[selected] === id) {
          selected = null;
          if (!result.dataset.win) result.textContent = '位置没变，不计步数。';
        } else {
          const move: Swap = [selected, index];
          exchange(move); exchanges.push(move); selected = null;
          clearHint();
          delete result.dataset.win;
          result.textContent = '换好了。可以继续换，也可以试打一轮。';
        }
        stats(); draw(cell);
      };
      return piece;
    }));
    if (focus !== undefined) (board.children[focus] as HTMLButtonElement)?.focus({ preventScroll: true });
  }

  function reset() {
    pieces = [...puzzle.pieces]; exchanges = []; selected = null;
    clearHint();
    delete result.dataset.win;
    result.textContent = '点两枚符文换位。不限次数，不算暴击。';
    stats(); draw();
  }

  function open(day: string) {
    const alreadyOpen = dialog.open;
    if (alreadyOpen && puzzle.day === day) return true;
    const next = dailyPuzzle(day, catalog);
    if (!next) return false;
    readSavedRecords();
    if (alreadyOpen) drafts.set(puzzle.day, { pieces, exchanges });
    else archive.open = false;
    puzzle = next;
    get('daily-date').textContent = `${day} · 北京时间每日更新`;
    get('daily-title').textContent = puzzle.template.title;
    const { enemy, hp, gold } = puzzle.template;
    get('daily-intro').textContent = `${encounters[enemy].name} · ${hp} 生命${gold ? ` · 起始 ${gold} 金` : ''}。用尽量少的换位打过它。`;
    const clue = get<HTMLDetailsElement>('daily-clue');
    clue.open = false;
    clearHint();
    get('daily-clue-text').textContent = puzzle.template.clue;
    get('daily-today').hidden = day === shanghaiDay();
    link.value = dailyLink(day);
    clearTimeout(copyTimer);
    copyButton.textContent = '复制挑战';
    const draft = drafts.get(day);
    if (draft) {
      pieces = draft.pieces; exchanges = draft.exchanges; selected = null;
      delete result.dataset.win;
      result.textContent = '继续上次的摆法。';
      stats(); draw();
    } else reset();
    renderArchive();
    if (shared) {
      const address = new URL(location.href);
      address.searchParams.set('daily', day);
      try { history.replaceState(history.state, '', address); } catch {}
    }
    if (!alreadyOpen) dialog.showModal();
    return true;
  }

  const openToday = () => { if (canOpen()) { click(); open(shanghaiDay()); } };
  get('daily-open').onclick = openToday;
  get('opening-daily').onclick = openToday;
  get('daily-close').onclick = () => dialog.close();
  get('daily-reset').onclick = () => { click(); reset(); };
  undo.onclick = () => {
    const move = exchanges.pop();
    if (!move) return;
    click(); exchange(move); selected = null; clearHint();
    delete result.dataset.win;
    result.textContent = '已撤销一步。';
    stats(); draw();
  };
  get('daily-today').onclick = () => { click(); open(shanghaiDay()); };
  get('daily-hint').onclick = () => {
    click();
    const hint = dailyHint(puzzle.template, pieces, catalog);
    hinted = hint?.index ?? null;
    selected = null;
    hintText.hidden = false;
    hintText.textContent = hint ? `先看第 ${puzzle.template.cells[hint.index] + 1} 格的「${catalog[pieces[hint.index]].name}」。从这里最快还有 ${hint.remaining} 步。` :
      '这套已经能打过。想换个解法，可以重摆再试。';
    draw();
  };
  get('daily-check').onclick = () => {
    click();
    const outcome = runDaily(puzzle.template, pieces, catalog).result;
    result.dataset.win = String(outcome.win);
    if (!outcome.win) { result.textContent = `打了 ${outcome.damage} 点，还差 ${outcome.hp} 点。`; return; }
    readSavedRecords();
    const attempt = { moves: exchanges.length, damage: outcome.damage };
    const record = newDailyRecord(records.get(puzzle.day), attempt);
    records.set(puzzle.day, record);
    try {
      localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(records)));
    } catch {}
    stats();
    renderArchive();
    result.textContent = isPerfect(attempt) ? '解开了。已是最少步数。' :
      `${attempt.moves} 步打出 ${outcome.damage} 点，解开了。${attempt.moves === puzzle.par ? ' 已是最少步数。' : ` 最少能用 ${puzzle.par} 步。`}`;
  };
  copyButton.onclick = async () => {
    click();
    const day = puzzle.day;
    const best = records.get(day);
    const score = best ? `我用 ${best.moves} 步打出了 ${best.damage} 点伤害。${isPerfect(best) ? '拿到了满分。' : ''}` : '来试试几步能解。';
    const copy = `《4×4 词条法阵》${day} 每日残局：${puzzle.template.title}。${score}\n${link.value}`;
    try {
      await navigator.clipboard.writeText(copy);
      if (!dialog.open || puzzle.day !== day) return;
      copyButton.textContent = '已复制';
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => { copyButton.textContent = '复制挑战'; }, 1500);
    } catch {
      if (!dialog.open || puzzle.day !== day) return;
      (link.parentElement as HTMLDetailsElement).open = true;
      link.focus(); link.select();
    }
  };
  dialog.addEventListener('close', () => {
    drafts.set(puzzle.day, { pieces, exchanges });
    if (!shared) return;
    shared = false;
    const address = new URL(location.href);
    address.searchParams.delete('daily');
    try { history.replaceState(history.state, '', address); } catch {}
    onSharedClose();
  });
  window.addEventListener('storage', event => {
    if (event.key !== storageKey || !dialog.open) return;
    readSavedRecords();
    stats(); renderArchive();
  });
  return {
    openShared() {
      const day = new URLSearchParams(location.search).get('daily');
      if (!validDailyDate(day) || !open(day)) return false;
      shared = true;
      return true;
    },
  };
}
