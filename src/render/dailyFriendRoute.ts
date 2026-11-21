import type { DailyPuzzle, replayDailyRoute } from '../core/daily';
import type { Catalog } from '../core/types';
import { formatNumber as format } from './canvasRenderer';
import { drawPuzzleBoard } from './puzzleBoard';

export function bindDailyFriendRoute(catalog: Catalog, glyph: (cell: HTMLElement, id: string) => void, click: () => void) {
  const dialog = document.querySelector<HTMLDialogElement>('#daily-friend-route-dialog')!;
  const get = <T extends HTMLElement = HTMLElement>(id: string) => dialog.querySelector<T>(`#friend-route-${id}`)!;
  const board = get('board');
  const prev = get<HTMLButtonElement>('prev');
  const next = get<HTMLButtonElement>('next');
  get('close').onclick = () => { click(); dialog.close(); };

  return (puzzle: DailyPuzzle, route: NonNullable<ReturnType<typeof replayDailyRoute>>) => {
    if (dialog.open) return;
    const { moves, boards, damage } = route;
    const { formation } = puzzle;
    let step = 0;
    get('score').textContent = `好友的最少步解法 · ${moves.length} 步 / ${format(damage)} 伤害`;

    function draw() {
      drawPuzzleBoard(board, formation, boards[step], catalog, glyph, { pick() {} });
      get('count').textContent = `${step} / ${moves.length} 步`;
      prev.setAttribute('aria-disabled', String(step === 0));
      next.setAttribute('aria-disabled', String(step === moves.length));
      if (!step) {
        get('detail').textContent = '这是原题阵型。点下一步，看好友先换哪两枚。';
        return;
      }
      const [from, to] = moves[step - 1];
      const previous = boards[step - 1];
      board.querySelector(`[data-index="${from}"]`)?.setAttribute('data-acting', '');
      board.querySelector(`[data-index="${to}"]`)?.setAttribute('data-receiving', '');
      get('detail').textContent = `${formation.cells[from] + 1} 格 ${catalog[previous[from]].name} ↔ ${formation.cells[to] + 1} 格 ${catalog[previous[to]].name}`;
      if (step === moves.length) get('detail').append(`。试算打出 ${format(damage)} 点。`);
    }

    prev.onclick = () => { if (step > 0) { click(); step--; draw(); } };
    next.onclick = () => { if (step < moves.length) { click(); step++; draw(); } };
    draw();
    dialog.showModal();
    next.focus({ preventScroll: true });
  };
}
