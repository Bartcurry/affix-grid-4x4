import { dailyLink, dailyPuzzle, newDailyRecord, runDaily, shanghaiDay, validDailyDate, type DailyPuzzle, type DailyRecord } from '../core/daily';
import { encounters } from '../core/expedition';
import type { Catalog } from '../core/types';

const storageKey = 'affix-grid-4x4.daily.v1';

export function bindDailyRoom(catalog: Catalog, glyph: (node: HTMLElement, id: string) => void, click: () => void,
  canOpen: () => boolean, onSharedClose: () => void) {
  const get = <NodeType extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as NodeType;
  const dialog = get<HTMLDialogElement>('daily-dialog');
  const board = get('daily-board');
  const result = get('daily-result');
  const link = get<HTMLInputElement>('daily-link');
  let puzzle: DailyPuzzle;
  let pieces: string[];
  let selected: number | null;
  let moves: number;
  let shared = false;
  const records = new Map<string, DailyRecord>();
  try {
    const data: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '{}');
    if (data && typeof data === 'object') {
      for (const [day, value] of Object.entries(data)) if (validDailyDate(day) && value &&
        Number.isSafeInteger(value.moves) && value.moves > 0 && Number.isSafeInteger(value.damage) && value.damage > 0) records.set(day, value);
    }
  } catch {}

  function stats() {
    get('daily-moves').textContent = String(moves);
    const best = records.get(puzzle.day);
    get('daily-best').textContent = best ? `本机最佳 ${best.moves} 步` : '还没有纪录';
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
      piece.setAttribute('aria-label', `第 ${cell + 1} 格：${catalog[id].name}`);
      piece.style.setProperty('--daily-ink', catalog[id].color);
      const stamp = document.createElement('small'); stamp.textContent = String(cell + 1);
      const icon = document.createElement('span'); glyph(icon, id);
      const name = document.createElement('strong'); name.textContent = catalog[id].name;
      piece.append(stamp, icon, name);
      piece.onclick = () => {
        click();
        if (selected === null) {
          selected = index;
          result.textContent = '再点另一枚，交换位置。';
        } else if (selected === index || pieces[selected] === id) {
          selected = null;
          result.textContent = '位置没变，不计步数。';
        } else {
          [pieces[selected], pieces[index]] = [pieces[index], pieces[selected]];
          selected = null; moves++;
          result.textContent = '换好了。可以继续换，也可以试打一轮。';
        }
        delete result.dataset.win;
        stats(); draw(cell);
      };
      return piece;
    }));
    if (focus !== undefined) (board.children[focus] as HTMLButtonElement)?.focus();
  }

  function reset() {
    pieces = [...puzzle.pieces]; moves = 0; selected = null;
    delete result.dataset.win;
    result.textContent = '点两枚符文换位。不限次数，不算暴击。';
    stats(); draw();
  }

  function open(day: string) {
    const next = dailyPuzzle(day, catalog);
    if (!next) return false;
    puzzle = next;
    get('daily-date').textContent = `${day} · 北京时间每日更新`;
    get('daily-title').textContent = puzzle.template.title;
    get('daily-intro').textContent = `${encounters[puzzle.template.enemy].name} · ${puzzle.template.hp} 生命。用尽量少的换位打过它。`;
    const clue = get<HTMLDetailsElement>('daily-clue');
    clue.open = false;
    get('daily-clue-text').textContent = puzzle.template.clue;
    get('daily-today').hidden = day === shanghaiDay();
    link.value = dailyLink(day);
    reset();
    if (!dialog.open) dialog.showModal();
    return true;
  }

  const openToday = () => { if (canOpen()) { click(); open(shanghaiDay()); } };
  get('daily-open').onclick = openToday;
  get('opening-daily').onclick = openToday;
  get('daily-close').onclick = () => dialog.close();
  get('daily-reset').onclick = () => { click(); reset(); };
  get('daily-today').onclick = () => { click(); open(shanghaiDay()); };
  get('daily-check').onclick = () => {
    click();
    const outcome = runDaily(puzzle.template, pieces, catalog).result;
    result.dataset.win = String(outcome.win);
    if (!outcome.win) { result.textContent = `打了 ${outcome.damage} 点，还差 ${outcome.hp} 点。`; return; }
    const record = newDailyRecord(records.get(puzzle.day), { moves, damage: outcome.damage });
    records.set(puzzle.day, record);
    try {
      const recent = [...records].sort(([left], [right]) => right.localeCompare(left)).slice(0, 90);
      localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(recent)));
    } catch {}
    stats();
    result.textContent = `${moves} 步打出 ${outcome.damage} 点，解开了。${moves === puzzle.par ? ' 已是最少步数。' : ` 最少能用 ${puzzle.par} 步。`}`;
  };
  get('daily-copy').onclick = async () => {
    click();
    const best = records.get(puzzle.day);
    const copy = `《4×4 词条法阵》${puzzle.day} 每日残局：${puzzle.template.title}。${best ? `我用 ${best.moves} 步打出了 ${best.damage} 点伤害。` : '来试试几步能解。'}\n${link.value}`;
    try {
      await navigator.clipboard.writeText(copy);
      if (dialog.open) get('daily-copy').textContent = '已复制';
      setTimeout(() => { get('daily-copy').textContent = '复制挑战'; }, 1500);
    } catch {
      (link.parentElement as HTMLDetailsElement).open = true;
      link.focus(); link.select();
    }
  };
  dialog.addEventListener('close', () => {
    if (!shared) return;
    shared = false;
    const address = new URL(location.href);
    address.searchParams.delete('daily');
    try { history.replaceState(history.state, '', address); } catch {}
    onSharedClose();
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
