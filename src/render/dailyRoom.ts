import { betterDailyRecord, dailyHint, dailyInviteScore, dailyLink, dailyMastery, dailyPuzzle, dailyStreak, readDailyRecord, recentDailyDates, simulateDaily,
  shanghaiDay, validDailyDate, type DailyGoal, type DailyInvite, type DailyPuzzle, type DailyRecord } from '../core/daily';
import { encounters, relics } from '../core/expedition';
import type { Catalog } from '../core/types';
import { bindPuzzleReplay } from './puzzleReplay';
import { drawPuzzleBoard } from './puzzleBoard';
import type { PuzzleShareCard } from './puzzleShareCard';

const storageKey = 'affix-grid-4x4.daily.v2';
type Move = [number, number];

export function bindDailyRoom(catalog: Catalog, glyph: (cell: HTMLElement, id: string) => void, click: () => void,
  shareCard: (card: PuzzleShareCard) => void) {
  const dialog = document.querySelector<HTMLDialogElement>('#daily-dialog')!;
  const get = <T extends HTMLElement = HTMLElement>(id: string) => dialog.querySelector<T>(`#daily-${id}`)!;
  const board = get('board');
  const replay = bindPuzzleReplay(dialog, board, catalog, click, 'daily');
  const outcome = get('result');
  const archive = get<HTMLDetailsElement>('archive');
  const dates = get('dates');
  const undo = get<HTMLButtonElement>('undo');
  const link = get<HTMLInputElement>('link');
  const shareStatus = get('share-status');
  const followup = get('next');
  const followupCopy = get('next-copy');
  const nextAction = get<HTMLButtonElement>('next-action');
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
    const best = dailyInviteScore(puzzle, records.get(puzzle.day));
    get('goals').hidden = !best;
    get('card').hidden = !best;
    goalButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.goal === goal)));
    get('hint').textContent = goal === 'peak' ? '伤害提示' : '提示';
    const friend = invite?.day === puzzle.day ? invite.score : undefined;
    get('copy').textContent = best ? friend ? '回传链接' : '复制成绩' : '复制挑战';
    get('card').textContent = friend ? '回传战绩' : '战绩卡';
    const duel = get('duel');
    duel.hidden = !friend || !best;
    if (!best) return;
    const mastery = dailyMastery(puzzle, best);
    const peak = best.peakDamage ?? best.damage;
    get('fast-seal').hidden = !mastery.fast;
    get('peak-seal').hidden = !mastery.peak;
    get('best').textContent = `${best.moves} 步 / ${best.damage} 伤害`;
    get('peak').textContent = mastery.peak ? `${peak} · 已达上限` : `${peak} / ${puzzle.peakDamage}`;
    if (friend) {
      const moves = friend.moves - best.moves;
      const fastDamage = best.damage - friend.damage;
      const hit = peak - (friend.peakDamage ?? friend.damage);
      const steps = moves ? `${moves > 0 ? '少' : '多'} ${Math.abs(moves)} 步` : '步数相同';
      const tiebreak = !moves && fastDamage ? `，伤害${fastDamage > 0 ? '多' : '少'} ${Math.abs(fastDamage)}` : '';
      duel.textContent = `与朋友比 · ${steps}${tiebreak} · ${hit ? `最高伤害${hit > 0 ? '多' : '少'} ${Math.abs(hit)}` : '最高伤害持平'}`;
    }
  }

  function renderArchive() {
    const today = shanghaiDay();
    const streak = dailyStreak(records, today);
    get('streak').textContent = streak ? `连续解开 ${streak} 期` : '';
    const recent = recentDailyDates(today).map(day => {
      const best = records.get(day);
      const past = day === puzzle.day ? puzzle : best && dailyPuzzle(day, catalog);
      const mark = past ? dailyMastery(past, best) : undefined;
      return { day, best, mark };
    });
    const cleared = recent.filter(({ mark }) => mark?.cleared).length;
    const complete = recent.filter(({ mark }) => mark?.complete).length;
    get('recent').textContent = `近七期 · 已解 ${cleared}/${recent.length}${complete ? ` · 双满 ${complete}` : ''}`;
    dates.replaceChildren(...recent.map(({ day, best, mark }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.day = day;
      const badge = mark?.complete ? '双满' : mark?.fast ? '步数满' : mark?.peak ? '伤害满' : mark?.cleared ? '已解' : '待解';
      btn.dataset.progress = mark?.complete ? 'complete' : mark?.cleared ? 'cleared' : 'open';
      btn.setAttribute('aria-pressed', String(day === puzzle.day));
      btn.setAttribute('aria-label', `${day}，${day === today ? '今天，' : ''}${badge}${mark?.cleared && best ? `，最少 ${best.moves} 步` : ''}`);
      const date = document.createElement('strong');
      date.textContent = day === today ? '今天' : day.slice(5).replace('-', '/');
      const score = document.createElement('small');
      score.textContent = badge;
      btn.append(date, score);
      btn.onclick = () => { click(); open(day); dates.querySelector<HTMLButtonElement>('[aria-pressed=true]')?.focus({ preventScroll: true }); };
      return btn;
    }));

    const best = dailyInviteScore(puzzle, records.get(puzzle.day));
    followup.hidden = !best;
    if (!best) return;
    const mark = dailyMastery(puzzle, best);
    followup.dataset.complete = String(mark.complete);
    nextAction.hidden = false;
    if (!mark.fast) {
      followupCopy.textContent = `目标 ${puzzle.par} 步 · ${puzzle.targetDamage} 伤害`;
      nextAction.textContent = '重摆冲步数';
      nextAction.onclick = () => { click(); selectGoal('clear', true); };
    } else if (!mark.peak) {
      followupCopy.textContent = `还差 ${puzzle.peakDamage - (best.peakDamage ?? best.damage)} 伤害拿双满`;
      nextAction.textContent = '冲最高伤害';
      nextAction.onclick = () => { click(); selectGoal('peak'); };
    } else {
      const candidate = recent.find(item => !item.mark?.cleared) ?? recent.find(item => !item.mark?.complete);
      followupCopy.textContent = '步数和伤害都已满分';
      nextAction.hidden = !candidate;
      if (candidate) {
        nextAction.textContent = candidate.day === today ? '回到今天' :
          `${candidate.mark?.cleared ? '补满' : '补做'} ${candidate.day.slice(5).replace('-', '/')}`;
        nextAction.onclick = () => {
          click();
          open(candidate.day);
          get('title').focus({ preventScroll: true });
          dialog.scrollTop = 0;
        };
      }
    }
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
          message(`已选中${rune.name}。再点另一枚换位。 ${rune.desc}`);
        } else {
          replay.clear();
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
    replay.clear();
    pieces = [...puzzle.pieces];
    moves = [];
    selected = hinted = undefined;
    message('点两枚符文换位，再试打。');
    stats();
    draw();
  }

  function open(day = shanghaiDay(), score?: DailyRecord, expired = false) {
    if (dialog.open && puzzle.day === day) return true;
    const next = dailyPuzzle(day, catalog);
    if (!next) return false;
    loadRecords();
    if (dialog.open) drafts.set(puzzle.day, { pieces, moves, goal });
    else archive.open = false;
    replay.clear();
    puzzle = next;
    if (score) invite = { day, score: dailyInviteScore(puzzle, score) };
    const { formation, hp } = puzzle;
    get('date').textContent = `${day} · 每日残局`;
    get('title').textContent = formation.title;
    const enemy = encounters[formation.enemy];
    get('enemy').textContent = `${enemy.name} · ${hp} 血`;
    get('trait').textContent = enemy.trait;
    get('trait').hidden = formation.enemy === 'sentry';
    const twist = formation.affix ? { name: formation.affix.name, text: formation.affix.desc } : formation.relic ? relics[formation.relic]
      : Object.values(formation.tiles ?? {}).includes('spirit_gathering') ? { name: '聚灵位', text: '上下左右每有一枚符文触发，聚灵位上的符文威力 +2。' }
      : undefined;
    get('twist').hidden = !twist;
    get('twist-name').textContent = twist?.name ?? '';
    get('twist-rule').textContent = twist?.text ?? '';
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
    if (expired) message('这条挑战链接已失效，已打开今天的题。点两枚符文换位，再试打。');
    renderArchive();
    if (!dialog.open) {
      dialog.showModal();
      get('title').focus({ preventScroll: true });
      dialog.scrollTop = 0;
    }
    return true;
  }

  get('close').onclick = () => dialog.close();
  get('reset').onclick = () => { click(); reset(); };
  undo.onclick = () => {
    const move = moves.pop();
    if (!move) return;
    click();
    replay.clear();
    exchange(move);
    selected = hinted = undefined;
    message('已撤销一步。');
    stats();
    draw();
  };
  function selectGoal(next: DailyGoal, restart = false) {
    replay.clear();
    goal = next;
    selected = hinted = undefined;
    if (restart) reset();
    else {
      draw();
      stats();
    }
    message(goal === 'peak' ? `目标 ${puzzle.peakDamage} 伤害，可以多换几步。`
      : `用 ${puzzle.par} 步过关，同样步数下争取 ${puzzle.targetDamage} 伤害。`);
  }
  goalButtons.forEach(button => {
    button.onclick = () => {
      click();
      selectGoal(button.dataset.goal === 'peak' ? 'peak' : 'clear');
    };
  });
  get('hint').onclick = () => {
    click();
    replay.clear();
    const hint = dailyHint(puzzle, pieces, catalog, goal);
    selected = undefined;
    hinted = hint?.index;
    const total = moves.length + (hint?.remaining ?? 0);
    if (goal === 'clear' && records.has(puzzle.day) && total > puzzle.par) {
      hinted = undefined;
      message(`这条路线至少需要 ${total} 步。点「重摆」可重新冲 ${puzzle.par} 步。`);
      draw();
      return;
    }
    message(hint ? `${puzzle.formation.clue} 先看亮起的格子，${goal === 'peak' ?
      `再换 ${hint.remaining} 步可打到伤害上限。` : `还能 ${hint.remaining} 步过。`}` :
      goal === 'peak' ? '这套阵已达到伤害上限，点试打记下成绩。' : '这套阵已经能打过，点试打验证。');
    draw();
  };
  get('check').onclick = () => {
    click();
    replay.clear();
    const { events, result } = simulateDaily(puzzle.formation, puzzle.hp, pieces, catalog);
    selected = hinted = undefined;
    draw();
    replay.remember(puzzle, pieces, events);
    if (!result.win) { message(`打了 ${result.damage} 点，还差 ${result.hp} 点。`, false); return; }
    loadRecords();
    const attempt = { moves: moves.length, damage: result.damage };
    records.set(puzzle.day, betterDailyRecord(attempt, dailyInviteScore(puzzle, records.get(puzzle.day))));
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
    const best = dailyInviteScore(puzzle, records.get(day));
    link.value = dailyLink(location.href, day, best);
    link.hidden = true;
    const score = best ? `我用 ${best.moves} 步打出 ${best.damage} 点。${best.peakDamage ? `最高 ${best.peakDamage} 点。` : ''}`
      : '比比谁用的换位更少，或谁打得更重。';
    try {
      await navigator.clipboard.writeText(`4×4 词条法阵 · ${puzzle.formation.title}\n${score}\n${link.value}`);
      if (dialog.open && puzzle.day === day) shareStatus.textContent = best ? '成绩和原题链接已复制。' : '挑战链接已复制。';
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
    if (dialog.open) return;
    replay.clear();
    drafts.set(puzzle.day, { pieces, moves, goal });
    invite = undefined;
  });
  window.addEventListener('storage', event => {
    if (!dialog.open || event.key !== storageKey || !event.newValue) return;
    loadRecords();
    stats();
    renderArchive();
  });
  return { open, dialog };
}
