import { betterDailyRecord, dailyHint, dailyInviteScore, dailyLink, dailyPuzzle, dailyStreak, readDailyRecord, recentDailyDates, runDaily,
  shanghaiDay, validDailyDate, type DailyGoal, type DailyInvite, type DailyPuzzle, type DailyRecord } from '../core/daily';
import { encounters } from '../core/expedition';
import type { Catalog } from '../core/types';
import { drawPuzzleBoard } from './puzzleBoard';
import type { PuzzleShareCard } from './puzzleShareCard';

const storageKey = 'affix-grid-4x4.daily.v2';
type Move = [number, number];

export function bindDailyRoom(catalog: Catalog, glyph: (cell: HTMLElement, id: string) => void, click: () => void,
  shareCard: (card: PuzzleShareCard) => void) {
  const dialog = document.querySelector<HTMLDialogElement>('#daily-dialog')!;
  const get = <T extends HTMLElement = HTMLElement>(id: string) => dialog.querySelector<T>(`#daily-${id}`)!;
  const board = get('board');
  const outcome = get('result');
  const archive = get<HTMLDetailsElement>('archive');
  const dates = get('dates');
  const undo = get<HTMLButtonElement>('undo');
  const link = get<HTMLInputElement>('link');
  const shareStatus = get('share-status');
  const goalButtons = [...get('goals').querySelectorAll<HTMLButtonElement>('button[data-goal]')];
  const records = new Map<string, DailyRecord>();
  const drafts = new Map<string, { pieces: string[]; moves: Move[]; goal: DailyGoal }>();
  let puzzle: DailyPuzzle;
  let invite: DailyInvite | undefined;
  let pieces: string[];
  let moves: Move[];
  let goal: DailyGoal = 'clear';
  let selected: number | undefined;
  let hinted: number | undefined;

  function loadRecords() {
    try {
      const data = JSON.parse(localStorage.getItem(storageKey) ?? '{}');
      for (const [day, value] of Object.entries(data ?? {})) {
        const stored = readDailyRecord(value);
        if (validDailyDate(day) && stored) records.set(day, betterDailyRecord(stored, records.get(day)));
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
    get('goals').hidden = !best;
    get('card').hidden = !dailyInviteScore(puzzle, best);
    goalButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.goal === goal)));
    get('hint').textContent = goal === 'peak' ? '伤害提示' : '提示';
    if (!best) return;
    const speedPerfect = best.moves === puzzle.par && best.damage === puzzle.targetDamage;
    const peak = best.peakDamage ?? best.damage;
    get('best').textContent = `${speedPerfect ? '满分 · ' : ''}${best.moves} 步 / ${best.damage} 伤害`;
    get('peak').textContent = peak === puzzle.peakDamage ? `${peak} · 已达上限` : `${peak} / ${puzzle.peakDamage}`;
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
    drawPuzzleBoard(board, puzzle.formation, pieces, catalog, glyph, {
      selected, hinted, focus, pick(index) {
        click();
        const rune = catalog[pieces[index]];
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
      },
    });
  }

  function reset() {
    pieces = [...puzzle.pieces];
    moves = [];
    selected = hinted = undefined;
    message('点两枚符文换位，再试打。');
    stats();
    draw();
  }

  function open(day = shanghaiDay(), score?: DailyRecord) {
    if (dialog.open && puzzle.day === day) return true;
    const next = dailyPuzzle(day, catalog);
    if (!next) return false;
    loadRecords();
    if (dialog.open) drafts.set(puzzle.day, { pieces, moves, goal });
    else archive.open = false;
    puzzle = next;
    if (score) invite = { day, score: dailyInviteScore(puzzle, score) };
    const { formation, hp } = puzzle;
    get('date').textContent = `${day} · 每日残局`;
    get('title').textContent = formation.title;
    get('enemy').textContent = `${encounters[formation.enemy].name} · ${hp} 血`;
    get('rules').textContent = `${formation.gold ? `起始 ${formation.gold} 金 · ` : ''}保留羁绊，关闭暴击`;
    const friend = invite?.day === day ? invite.score : undefined;
    get('friend').hidden = !friend;
    get('friend').textContent = friend ?
      `朋友的成绩 · ${friend.moves} 步 / ${friend.damage} 伤害${friend.peakDamage ? ` · 最高 ${friend.peakDamage} 伤害` : ''}` : '';
    shareStatus.textContent = '每天北京时间零点换题';
    link.value = dailyLink(location.href, day);
    link.hidden = true;
    const draft = drafts.get(day);
    if (draft) {
      ({ pieces, moves, goal } = draft);
      selected = hinted = undefined;
      message('继续上次的摆法。');
      stats();
      draw();
    } else {
      goal = 'clear';
      reset();
    }
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
  goalButtons.forEach(button => {
    button.onclick = () => {
      click();
      goal = button.dataset.goal === 'peak' ? 'peak' : 'clear';
      selected = hinted = undefined;
      message(goal === 'peak' ? `目标 ${puzzle.peakDamage} 伤害，可以多换几步。`
        : `用 ${puzzle.par} 步过关，同样步数下争取 ${puzzle.targetDamage} 伤害。`);
      draw();
      stats();
    };
  });
  get('hint').onclick = () => {
    click();
    const hint = dailyHint(puzzle, pieces, catalog, goal);
    selected = undefined;
    hinted = hint?.index;
    message(hint ? `${puzzle.formation.clue} 先看亮起的格子，${goal === 'peak' ?
      `再换 ${hint.remaining} 步可打到伤害上限。` : `还能 ${hint.remaining} 步过。`}` :
      goal === 'peak' ? '这套阵已达到伤害上限，点试打记下成绩。' : '这套阵已经能打过，点试打验证。');
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
    let text = perfect ? `满分解开 · ${attempt.moves} 步 / ${attempt.damage} 伤害。` :
      `${attempt.moves} 步解开，打出 ${attempt.damage} 点。`;
    if (attempt.damage === puzzle.peakDamage) text += ' 已达到伤害上限。';
    else if (goal === 'peak') text += ` 距伤害上限还差 ${puzzle.peakDamage - attempt.damage} 点。`;
    else if (!perfect) text += ` 步数满分是 ${puzzle.par} 步、${puzzle.targetDamage} 伤害。`;
    message(text, true);
  };
  get('copy').onclick = async () => {
    click();
    const day = puzzle.day;
    const best = records.get(day);
    link.value = dailyLink(location.href, day, best);
    const score = best ? `我用 ${best.moves} 步打出 ${best.damage} 点。${best.peakDamage ? `最高 ${best.peakDamage} 点。` : ''}`
      : '比比谁用的换位更少，或谁打得更重。';
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
  get('card').onclick = () => {
    const score = dailyInviteScore(puzzle, records.get(puzzle.day));
    if (score) shareCard({ kind: 'daily', puzzle, score, url: dailyLink(location.href, puzzle.day, score) });
  };
  dialog.addEventListener('close', () => {
    drafts.set(puzzle.day, { pieces, moves, goal });
    invite = undefined;
  });
  return { open, dialog };
}
