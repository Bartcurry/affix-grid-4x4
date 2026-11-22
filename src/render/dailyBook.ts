import { dailyFormation, shanghaiDay, type dailyMastery, type DailyRecord } from '../core/daily';
import { dailyCalendar } from '../core/dailyCalendar';
import { encounters } from '../core/expedition';

export interface DailyBookProgress {
  score?: DailyRecord;
  mark?: ReturnType<typeof dailyMastery>;
  draftMoves?: number;
}

type Filter = 'all' | 'open' | 'mastery' | 'draft';
const statusFor = (progress: DailyBookProgress) => progress.mark?.complete ? '双满' : progress.draftMoves ? '草稿'
  : progress.mark?.cleared ? '已解' : '待解';

export function bindDailyBook(hasProgress: (day: string) => boolean, progressFor: (day: string) => DailyBookProgress,
  play: (day: string) => void, click: () => void) {
  const dialog = document.querySelector<HTMLDialogElement>('#daily-book-dialog')!;
  const get = <T extends HTMLElement = HTMLElement>(id: string) => dialog.querySelector<T>(`#daily-book-${id}`)!;
  const previous = get<HTMLButtonElement>('previous');
  const next = get<HTMLButtonElement>('next');
  const board = get('days');
  const monthLabel = get('month');
  const launch = get<HTMLButtonElement>('play');
  const filters = [...get('filters').querySelectorAll<HTMLButtonElement>('button[data-filter]')];
  let month: string;
  let selected: string | undefined;
  let filter: Filter;
  let options = new Map<string, { button: HTMLButtonElement; progress: DailyBookProgress }>();
  let view: { today: string; calendar: NonNullable<ReturnType<typeof dailyCalendar>>; progress: Map<string, DailyBookProgress>; ready: boolean };

  function matches(entry: DailyBookProgress) {
    switch (filter) {
      case 'open': return !entry.mark?.cleared;
      case 'mastery': return !!entry.mark?.cleared && !entry.mark.complete;
      case 'draft': return !!entry.draftMoves;
      default: return true;
    }
  }

  function select(day?: string, focus = false) {
    const active = day ? options.get(day) : undefined;
    const formation = day && active ? dailyFormation(day) : undefined;
    selected = formation ? day : undefined;
    for (const [date, { button }] of options) {
      button.setAttribute('aria-pressed', String(date === selected));
      button.tabIndex = date === selected ? 0 : -1;
    }
    launch.disabled = !formation;
    get('detail').hidden = !formation;
    get('empty').hidden = !!formation;
    if (!day || !formation || !active) return;
    const { score, mark, draftMoves } = active.progress;
    get('date').textContent = `${day.slice(5).replace('-', '/')} · ${encounters[formation.enemy].name}`;
    get('name').textContent = formation.title;
    const record = mark?.cleared && score
      ? `${mark.complete ? '双满' : '已解'} · 最少 ${score.moves} 步 · 最高 ${score.peakDamage ?? score.damage} 伤害`
      : '尚未解开';
    get('record').textContent = draftMoves ? `${record} · 草稿 ${draftMoves} 步` : record;
    launch.textContent = draftMoves ? '继续摆阵' : '打开这题';
    if (focus) active.button.focus({ preventScroll: true });
  }

  function loadMonth() {
    const today = shanghaiDay();
    const calendar = dailyCalendar(month, today);
    if (!calendar) return;
    const progress = new Map<string, DailyBookProgress>();
    const pending = calendar.days.filter(({ day, playable }) => {
      if (!playable) return false;
      if (hasProgress(day)) return true;
      progress.set(day, {});
      return false;
    });
    const current = view = { today, calendar, progress, ready: pending.length === 0 };
    draw();
    if (!pending.length) return;

    let index = 0;
    function checkBatch() {
      if (view !== current || !dialog.open) return;
      const start = performance.now();
      do {
        const { day } = pending[index++];
        progress.set(day, progressFor(day));
      } while (index < pending.length && performance.now() - start < 9);
      if (index < pending.length) setTimeout(checkBatch, 0);
      else { current.ready = true; draw(); }
    }
    requestAnimationFrame(() => setTimeout(checkBatch, 0));
  }

  function draw() {
    const { calendar, progress, ready, today } = view;
    const { year, month: number, leading, days } = calendar;
    monthLabel.textContent = `${year} 年 ${number} 月`;
    previous.disabled = !calendar.previous;
    next.disabled = !calendar.next;
    previous.onclick = () => flip(calendar.previous);
    next.onclick = () => flip(calendar.next);
    for (const button of filters) {
      button.setAttribute('aria-pressed', String(button.dataset.filter === filter));
      button.disabled = !ready;
    }
    options = new Map();
    const available = days.filter(day => day.playable);
    const values = [...progress.values()];
    const clears = values.filter(entry => entry.mark?.cleared).length;
    const mastered = values.filter(entry => entry.mark?.complete).length;
    get('summary').textContent = ready ? `本月已解 ${clears} / ${available.length} · 双满 ${mastered}` : '读取本机成绩和草稿…';
    board.setAttribute('aria-busy', String(!ready));

    const firstWeek = Math.floor((days.indexOf(available[0]) + leading) / 7);
    const lastWeek = Math.floor((days.indexOf(available[available.length - 1]) + leading) / 7);
    const start = Array.from({ length: firstWeek ? 0 : leading }, () => document.createElement('span'));
    const startIndex = Math.max(0, firstWeek * 7 - leading);
    const endIndex = (lastWeek + 1) * 7 - leading;
    const cells = days.slice(startIndex, endIndex).map(({ day, playable }, offset) => {
      const index = startIndex + offset;
      const dayProgress = progress.get(day);
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.dataset.day = day;
      cell.dataset.index = String(index);
      cell.toggleAttribute('data-today', day === today);
      cell.toggleAttribute('data-unavailable', !playable);
      cell.disabled = !ready || !dayProgress || !matches(dayProgress);
      const number = document.createElement('strong');
      number.textContent = String(index + 1);
      cell.append(number);
      if (!dayProgress) {
        cell.setAttribute('aria-label', `${day}${playable ? '' : '，无已发布题目'}`);
        return cell;
      }
      const label = statusFor(dayProgress);
      const mark = document.createElement('small');
      mark.textContent = label;
      cell.dataset.progress = dayProgress.mark?.complete ? 'complete' : dayProgress.draftMoves ? 'draft'
        : dayProgress.mark?.cleared ? 'cleared' : 'open';
      cell.setAttribute('aria-label', `${day}${day === today ? '，今天' : ''}，${label}`);
      cell.append(mark);
      if (!cell.disabled) options.set(day, { button: cell, progress: dayProgress });
      cell.onclick = () => { click(); select(day, true); };
      return cell;
    });
    const dateFocused = board.contains(document.activeElement);
    board.replaceChildren(...start, ...cells);
    if (ready) select(selected && options.has(selected) ? selected : [...options.keys()].at(-1), dateFocused);
    else {
      get('detail').hidden = get('empty').hidden = launch.disabled = true;
    }
  }

  function flip(target?: string) {
    if (!target) return;
    const focused = document.activeElement;
    click();
    month = target;
    loadMonth();
    if (focused === previous && previous.disabled || focused === next && next.disabled) {
      (previous.disabled ? next : previous).focus({ preventScroll: true });
    }
  }

  const keySteps: Readonly<Record<string, number>> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
  board.onkeydown = event => {
    const active = event.target;
    const step = keySteps[event.key];
    if (!step || !(active instanceof HTMLButtonElement)) return;
    event.preventDefault();
    for (let i = Number(active.dataset.index) + step; i >= 0 && i < 31; i += step) {
      const candidate = board.querySelector<HTMLButtonElement>(`[data-index="${i}"]:not(:disabled)`);
      if (candidate) { select(candidate.dataset.day, true); break; }
    }
  };
  for (const button of filters) button.onclick = () => { click(); filter = button.dataset.filter as Filter; draw(); };
  get('today').onclick = () => { click(); selected = shanghaiDay(); month = selected.slice(0, 7); filter = 'all'; loadMonth(); };
  get('close').onclick = () => { click(); dialog.close(); };
  launch.onclick = () => {
    if (!selected) return;
    click();
    dialog.close();
    play(selected);
  };
  return {
    open(day: string) {
      if (dialog.open) return;
      const today = shanghaiDay();
      selected = day <= today ? day : today;
      month = selected.slice(0, 7);
      filter = 'all';
      loadMonth();
      dialog.showModal();
      dialog.scrollTop = 0;
    },
    refresh() { if (dialog.open) loadMonth(); },
  };
}
