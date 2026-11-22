import { dailyHint, fixedPuzzle, readDailyRecord, simulateDaily, type DailyMove, type DailyRecord, type RunePuzzle } from '../core/daily';
import { encounters } from '../core/expedition';
import type { Catalog } from '../core/types';
import { drills } from '../data/drills';
import { createPuzzleDraftStore } from '../platform/puzzleDrafts';
import { formatNumber as format } from './canvasRenderer';
import { drawPuzzleBoard } from './puzzleBoard';
import { bindPuzzleReplay } from './puzzleReplay';

const storageKey = 'affix-grid-4x4.drills.v1';

export function bindDrillRoom(catalog: Catalog, glyph: (cell: HTMLElement, id: string) => void, click: () => void, unlockAppearance: () => boolean) {
  const dialog = document.querySelector<HTMLDialogElement>('#drill-dialog')!;
  const get = <T extends HTMLElement = HTMLElement>(name: string) => dialog.querySelector<T>(`#drill-${name}`)!;
  const board = get('board');
  const feedback = get('result');
  const next = get<HTMLButtonElement>('next');
  const undo = get<HTMLButtonElement>('undo');
  const reset = get<HTMLButtonElement>('reset');
  const replay = bindPuzzleReplay(dialog, board, catalog, click, 'drill');
  const records = new Map<number, DailyRecord>();
  const drafts = createPuzzleDraftStore('drill');
  let active = 0;
  let puzzle: RunePuzzle;
  let pieces: string[];
  let moves: DailyMove[];
  let selected: number | undefined;
  let hinted: number | undefined;
  let savedDraft = false;

  function saveDraft() {
    savedDraft = drafts.save(drills[active].id, puzzle, moves);
  }

  function keep(index: number, score: DailyRecord) {
    const current = records.get(index);
    if (!current || score.moves < current.moves || (score.moves === current.moves && score.damage > current.damage)) records.set(index, score);
  }

  function load() {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) ?? '{}');
      drills.forEach((drill, index) => {
        const score = readDailyRecord(stored?.[drill.id]);
        if (score && score.moves >= drill.par && score.damage >= drill.formation.hp) keep(index, score);
      });
    } catch {}
  }

  function message(text: string, win?: boolean) {
    feedback.textContent = text;
    feedback.dataset.win = win === undefined ? '' : String(win);
  }

  const tabs = drills.map((drill, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    const title = document.createElement('strong');
    title.textContent = drill.formation.title;
    const badge = document.createElement('small');
    button.append(title, badge);
    button.onclick = () => { if (index !== active) { click(); show(index); } };
    return { button, badge };
  });
  get('levels').replaceChildren(...tabs.map(({ button }) => button));

  function progress() {
    const best = records.get(active);
    const mastered = drills.filter((drill, index) => records.get(index)?.moves === drill.par).length;
    get('progress').textContent = `已过 ${records.size}/${drills.length} · 最少步 ${mastered}/${drills.length}`;
    get('appearance').hidden = records.size !== drills.length;
    get('best').textContent = best ? `个人最佳 ${best.moves} 步 · ${format(best.damage)} 伤害` : '';
    tabs.forEach(({ button, badge }, index) => {
      const record = records.get(index);
      badge.textContent = record ? record.moves === drills[index].par ? '最少步' : `${record.moves} 步过关` : drills[index].skill;
      button.dataset.mastered = String(record?.moves === drills[index].par);
      button.setAttribute('aria-pressed', String(index === active));
    });
    const following = drills.findIndex((_, index) => index > active && !records.has(index));
    const unfinished = following >= 0 ? following : drills.findIndex((_, index) => !records.has(index));
    next.hidden = !best || unfinished < 0;
    if (next.hidden) return;
    next.textContent = unfinished === active + 1 ? '下一关' : `去第 ${unfinished + 1} 关`;
    next.onclick = () => {
      click();
      show(unfinished);
      get('name').focus({ preventScroll: true });
      dialog.scrollTop = 0;
    };
  }

  function exchange([a, b]: DailyMove) {
    [pieces[a], pieces[b]] = [pieces[b], pieces[a]];
  }

  function draw(focus?: number) {
    get('moves').textContent = `已换 ${moves.length} 步 · 最少 ${puzzle.par} 步`;
    get('draft').hidden = !moves.length;
    get('draft').textContent = savedDraft ? '草稿已保存' : '草稿留在当前页面';
    undo.disabled = reset.disabled = !moves.length;
    drawPuzzleBoard(board, puzzle.formation, pieces, catalog, glyph, {
      selected, hinted, focus,
      pick(index) {
        click();
        replay.clear();
        if (selected === index) {
          selected = undefined;
          message('点两枚符文换位，再试打。');
        } else if (selected === undefined || pieces[selected] === pieces[index]) {
          selected = index;
          const rune = catalog[pieces[index]];
          message(`${rune.name} · ${rune.desc}`);
        } else {
          const move: DailyMove = [selected, index];
          moves.push(move);
          exchange(move);
          saveDraft();
          selected = hinted = undefined;
          message('换好了，可以试打。');
        }
        draw(index);
      },
    });
  }

  function show(index: number) {
    const drill = drills[index];
    const setup = fixedPuzzle(drill.formation, catalog);
    if (!setup) throw new Error(`Invalid drill: ${drill.id}`);
    replay.clear();
    active = index;
    puzzle = setup;
    const draft = drafts.load(drill.id, puzzle);
    moves = draft?.moves ?? [];
    pieces = draft?.pieces ?? [...puzzle.pieces];
    savedDraft = draft?.persistent ?? false;
    selected = hinted = undefined;
    const { formation, hp } = puzzle;
    const enemy = encounters[formation.enemy];
    get('name').textContent = `${index + 1}. ${formation.title}`;
    get('enemy').textContent = `${enemy.name} · ${format(hp)} 血`;
    get('rule').textContent = enemy.trait;
    get('rule').hidden = formation.enemy === 'sentry';
    get('gold').hidden = !formation.gold;
    get('gold').textContent = `起始 ${formation.gold ?? 0} 金`;
    message(moves.length ? '继续上次的摆法。' : '点两枚符文换位，再试打。');
    progress();
    draw();
  }

  get('close').onclick = () => { click(); dialog.close(); };
  dialog.addEventListener('close', () => { if (!dialog.open) replay.clear(); });
  get('hint').onclick = () => {
    click();
    replay.clear();
    const hint = dailyHint(puzzle, pieces, catalog);
    selected = undefined;
    hinted = hint?.index;
    message(hint ? `${puzzle.formation.clue} 亮起的格子是一个换位起点。` : '这套阵已经能打过，点试打记下成绩。');
    draw();
  };
  undo.onclick = () => {
    const previous = moves.pop();
    if (!previous) return;
    click();
    replay.clear();
    exchange(previous);
    saveDraft();
    selected = hinted = undefined;
    message('已撤销一步。');
    draw();
  };
  reset.onclick = () => {
    click();
    replay.clear();
    moves = [];
    pieces = [...puzzle.pieces];
    saveDraft();
    selected = hinted = undefined;
    message('点两枚符文换位，再试打。');
    draw();
  };
  get('check').onclick = () => {
    click();
    replay.clear();
    const { events, result } = simulateDaily(puzzle.formation, puzzle.hp, pieces, catalog);
    selected = hinted = undefined;
    draw();
    replay.remember(puzzle, pieces, events);
    if (!result.win) {
      message(`打出 ${format(result.damage)} 点，还差 ${format(result.hp)} 点。`, false);
      return;
    }
    load();
    keep(active, { moves: moves.length, damage: result.damage });
    try { localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries([...records].map(([index, score]) => [drills[index].id, score])))); } catch {}
    progress();
    const earned = records.size === drills.length && unlockAppearance();
    message(`${moves.length === puzzle.par ? '最少步过关' : `${moves.length} 步过关`} · ${format(result.damage)} 伤害。${earned ? ' 解锁青玉棋盘。' : ''}`, true);
  };

  function open() {
    if (dialog.open) return;
    click();
    load();
    const remaining = drills.flatMap((drill, index) => records.has(index) ? [] : [{ drill, index, edited: drafts.changedAt(drill.id) }]);
    const resumable = remaining.filter(item => item.edited !== undefined)
      .sort((a, b) => b.edited! - a.edited!).find(({ drill }) => {
        const setup = fixedPuzzle(drill.formation, catalog);
        return setup && drafts.load(drill.id, setup)?.moves.length;
      });
    show(resumable?.index ?? remaining[0]?.index ?? active);
    dialog.showModal();
    get('title').focus({ preventScroll: true });
    dialog.scrollTop = 0;
  }
  return { open, hasCleared() { load(); return records.size === drills.length; } };
}
