import { betterDailyRecord, dailyHint, dailyLink, dailyPuzzle, dailyStreak, recentDailyDates, runDaily, shanghaiDay, validDailyDate,
  type DailyPuzzle, type DailyRecord } from '../core/daily';
import { encounters } from '../core/expedition';
import type { Catalog } from '../core/types';

const storageKey = 'affix-grid-4x4.daily.v2';
const tileNames = { li_fire: '离火', xuan_ice: '玄冰', spirit_gathering: '聚灵' } as const;
type Move = [number, number];

export function bindDailyRoom(catalog: Catalog, glyph: (cell: HTMLElement, id: string) => void, click: () => void) {
  const dialog = document.querySelector<HTMLDialogElement>('#daily-dialog')!;
  const get = <T extends HTMLElement = HTMLElement>(id: string) => dialog.querySelector<T>(`#daily-${id}`)!;
  const board = get('board');
  const outcome = get('result');
  const archive = get<HTMLDetailsElement>('archive');
  const dates = get('dates');
  const undo = get<HTMLButtonElement>('undo');
  const link = get<HTMLInputElement>('link');
  const shareStatus = get('share-status');
  const records = new Map<string, DailyRecord>();
  const drafts = new Map<string, { pieces: string[]; moves: Move[] }>();
  let puzzle: DailyPuzzle;
  let pieces: string[];
  let moves: Move[];
  let selected: number | undefined;
  let hinted: number | undefined;

  function loadRecords() {
    try {
      const data = JSON.parse(localStorage.getItem(storageKey) ?? '{}');
      for (const [day, value] of Object.entries(data ?? {})) {
        const stored = value as DailyRecord | null;
        if (validDailyDate(day) && stored && Number.isSafeInteger(stored.moves) && stored.moves > 0 &&
          Number.isSafeInteger(stored.damage) && stored.damage > 0) records.set(day, betterDailyRecord(stored, records.get(day)));
      }
    } catch {}
  }

  function message(text: string, win?: boolean) {
    outcome.textContent = text;
    outcome.dataset.win = win === undefined ? '' : String(win);
  }

  function stats() {
    undo.disabled = !moves.length;
    get('moves').textContent = `已换 ${moves.length} 步 · 最少 ${puzzle.par} 步`;
    const best = records.get(puzzle.day);
    const label = get('best');
    label.hidden = !best;
    if (best) label.textContent = best.moves === puzzle.par && best.damage >= puzzle.targetDamage ?
      `满分 · ${best.moves} 步 / ${best.damage} 伤害` : `最佳 ${best.moves} 步 / ${best.damage} 伤害`;
  }

  function renderArchive() {
    const today = shanghaiDay();
    const streak = dailyStreak(records, today);
    get('streak').textContent = streak ? `连续解开 ${streak} 期` : '';
    dates.replaceChildren(...recentDailyDates(today).map(day => {
      const btn = document.createElement('button');
      const best = records.get(day);
      btn.type = 'button';
      btn.dataset.day = day;
      btn.setAttribute('aria-pressed', String(day === puzzle.day));
      btn.setAttribute('aria-label', `${day}，${day === today ? '今天，' : ''}${best ? `已解 ${best.moves} 步` : '待解'}`);
      const date = document.createElement('strong');
      date.textContent = day === today ? '今天' : day.slice(5).replace('-', '/');
      const score = document.createElement('small');
      score.textContent = best ? `${best.moves} 步` : '待解';
      btn.append(date, score);
      btn.onclick = () => { click(); open(day); dates.querySelector<HTMLButtonElement>('[aria-pressed=true]')?.focus({ preventScroll: true }); };
      return btn;
    }));
  }

  function exchange([left, right]: Move) {
    [pieces[left], pieces[right]] = [pieces[right], pieces[left]];
  }

  function draw(focus?: number) {
    const { formation } = puzzle;
    board.replaceChildren(...Array.from({ length: 16 }, (_, cell) => {
      const index = formation.cells.indexOf(cell);
      const number = document.createElement('small');
      number.textContent = String(cell + 1);
      if (index === -1) {
        const empty = document.createElement('span');
        empty.setAttribute('aria-hidden', 'true');
        empty.append(number);
        return empty;
      }
      const rune = catalog[pieces[index]];
      const tile = formation.tiles?.[cell];
      const slot = document.createElement('button');
      slot.type = 'button';
      slot.dataset.cell = String(cell);
      slot.dataset.index = String(index);
      slot.style.setProperty('--rune-ink', rune.color);
      slot.setAttribute('aria-pressed', String(index === selected));
      slot.toggleAttribute('data-hint', index === hinted);
      if (tile) {
        const marker = document.createElement('i');
        marker.textContent = tileNames[tile];
        marker.setAttribute('aria-hidden', 'true');
        slot.append(marker);
      }
      slot.setAttribute('aria-label', `第 ${cell + 1} 格，${rune.name}${tile ? `，${tileNames[tile]}位` : ''}${index === hinted ? '，提示格' : ''}`);
      slot.append(number);
      glyph(slot, rune.id);
      slot.onclick = () => {
        click();
        const start = selected;
        if (start === index) {
          selected = undefined;
          message('点两枚符文换位，再试打。');
        } else if (start === undefined || pieces[start] === pieces[index]) {
          selected = index;
          message(`${rune.name} · ${rune.desc}`);
        } else {
          const move: Move = [start, index];
          exchange(move);
          moves.push(move);
          selected = hinted = undefined;
          message('阵型已变，可以试打。');
          stats();
        }
        draw(index);
      };
      return slot;
    }));
    if (focus !== undefined) board.querySelector<HTMLButtonElement>(`[data-index="${focus}"]`)?.focus({ preventScroll: true });
  }

  function reset() {
    pieces = [...puzzle.pieces];
    moves = [];
    selected = hinted = undefined;
    message('点两枚符文换位，再试打。');
    stats();
    draw();
  }

  function open(day = shanghaiDay()) {
    if (dialog.open && puzzle.day === day) return true;
    const next = dailyPuzzle(day, catalog);
    if (!next) return false;
    loadRecords();
    if (dialog.open) drafts.set(puzzle.day, { pieces, moves });
    else archive.open = false;
    puzzle = next;
    const { formation, hp } = puzzle;
    get('date').textContent = `${day} · 每日残局`;
    get('title').textContent = formation.title;
    get('enemy').textContent = `${encounters[formation.enemy].name} · ${hp} 血`;
    get('rules').textContent = `${formation.gold ? `起始 ${formation.gold} 金 · ` : ''}保留羁绊，关闭暴击`;
    shareStatus.textContent = '每天北京时间零点换题';
    link.value = dailyLink(location.href, day);
    link.hidden = true;
    const draft = drafts.get(day);
    if (draft) {
      ({ pieces, moves } = draft);
      selected = hinted = undefined;
      message('继续上次的摆法。');
      stats();
      draw();
    } else reset();
    renderArchive();
    if (!dialog.open) dialog.showModal();
    return true;
  }

  get('close').onclick = () => dialog.close();
  get('reset').onclick = () => { click(); reset(); };
  undo.onclick = () => {
    const move = moves.pop();
    if (!move) return;
    click();
    exchange(move);
    selected = hinted = undefined;
    message('已撤销一步。');
    stats();
    draw();
  };
  get('hint').onclick = () => {
    click();
    const hint = dailyHint(puzzle, pieces, catalog);
    selected = undefined;
    hinted = hint?.index;
    message(hint ? `${puzzle.formation.clue} 先看亮起的格子，还能 ${hint.remaining} 步过。` : '这套阵已经能打过，点试打验证。');
    draw();
  };
  get('check').onclick = () => {
    click();
    const result = runDaily(puzzle.formation, puzzle.hp, pieces, catalog);
    if (!result.win) { message(`打了 ${result.damage} 点，还差 ${result.hp} 点。`, false); return; }
    loadRecords();
    const attempt = { moves: moves.length, damage: result.damage };
    records.set(puzzle.day, betterDailyRecord(attempt, records.get(puzzle.day)));
    try { localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(records))); } catch {}
    stats();
    renderArchive();
    const perfect = attempt.moves === puzzle.par && attempt.damage === puzzle.targetDamage;
    message(perfect ? '满分解开。' :
      `${attempt.moves} 步解开，打出 ${attempt.damage} 点。满分是 ${puzzle.par} 步、${puzzle.targetDamage} 伤害。`, true);
  };
  get('copy').onclick = async () => {
    click();
    const day = puzzle.day;
    const best = records.get(day);
    const score = best ? `我用 ${best.moves} 步打出 ${best.damage} 点。` : '比比谁用的换位更少。';
    try {
      await navigator.clipboard.writeText(`4×4 词条法阵 · ${puzzle.formation.title}\n${score}\n${link.value}`);
      if (dialog.open && puzzle.day === day) shareStatus.textContent = '挑战链接已复制。';
    } catch {
      if (!dialog.open || puzzle.day !== day) return;
      shareStatus.textContent = '长按链接可手动复制。';
      link.hidden = false;
      link.focus();
      link.select();
    }
  };
  dialog.addEventListener('close', () => drafts.set(puzzle.day, { pieces, moves }));
  return { open, dialog };
}
