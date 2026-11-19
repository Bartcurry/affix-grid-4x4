import type { Slot } from '../core/types';
import type { CanvasRenderer, Point } from './canvasRenderer';

interface Position extends Point { id: number; from: Slot | null; moved: boolean }

export function bindDragDrop(renderer: CanvasRenderer, actions: {
  enabled(): boolean;
  hasRune(slot: Slot): boolean;
  select(slot: Slot | null): void;
  move(from: Slot, to: Slot): void;
  sell(from: Slot): void;
}) {
  const canvas = renderer.canvas;
  let pointer: Position | null = null;
  let keyboardPick: Slot | null = null;

  const clearDrag = () => {
    pointer = null;
    renderer.drag = null;
    renderer.invalidate();
  };

  canvas.addEventListener('pointerdown', event => {
    if (!actions.enabled() || pointer || event.button !== 0) return;
    const target = renderer.hit(renderer.point(event.clientX, event.clientY));
    const from = target && target !== 'sell' ? target : null;
    canvas.setPointerCapture(event.pointerId);
    pointer = { x: event.clientX, y: event.clientY, id: event.pointerId, from, moved: false };
    keyboardPick = null;
    renderer.cursor = null;
    if (from && actions.hasRune(from)) actions.select(from);
    renderer.invalidate();
  });

  canvas.addEventListener('pointermove', event => {
    if (!pointer || pointer.id !== event.pointerId || !pointer.from || !actions.hasRune(pointer.from)) return;
    if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 5) pointer.moved = true;
    if (!pointer.moved) return;
    const point = renderer.point(event.clientX, event.clientY);
    renderer.drag = { from: pointer.from, point, target: renderer.hit(point) };
    renderer.invalidate();
  });

  canvas.addEventListener('pointerup', event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const { from, moved } = pointer;
    const target = renderer.hit(renderer.point(event.clientX, event.clientY));
    clearDrag();
    if (!actions.enabled()) return;
    if (moved && from) {
      if (target === 'sell') actions.sell(from);
      else if (target) actions.move(from, target);
    } else if (target && target !== 'sell') {
      if (!actions.hasRune(target) && renderer.selection) actions.move(renderer.selection, target);
      else actions.select(target);
    } else if (target === 'sell' && renderer.selection) actions.sell(renderer.selection);
    else actions.select(null);
  });

  for (const type of ['pointercancel', 'lostpointercapture']) canvas.addEventListener(type, event => {
    if (pointer?.id === (event as PointerEvent).pointerId) clearDrag();
  });

  canvas.addEventListener('focus', () => {
    if (canvas.matches(':focus-visible')) { renderer.cursor = { zone: 'board', index: 0 }; renderer.invalidate(); }
  });
  canvas.addEventListener('blur', () => { renderer.cursor = null; keyboardPick = null; renderer.invalidate(); });
  canvas.addEventListener('keydown', event => {
    if (!actions.enabled()) return;
    const cursor = renderer.cursor ?? { zone: 'board', index: 0 };
    const col = cursor.index % 4;
    let row = cursor.zone === 'bench' ? 4 : Math.floor(cursor.index / 4);
    let nextCol = col;
    switch (event.key) {
      case 'ArrowUp': row = Math.max(0, row - 1); break;
      case 'ArrowDown': row = Math.min(4, row + 1); break;
      case 'ArrowLeft': nextCol = Math.max(0, col - 1); break;
      case 'ArrowRight': nextCol = Math.min(3, col + 1); break;
      case 'Enter': case ' ':
        if (keyboardPick) { actions.move(keyboardPick, cursor); keyboardPick = null; }
        else if (actions.hasRune(cursor)) { keyboardPick = cursor; actions.select(cursor); }
        break;
      case 'Delete': actions.sell(keyboardPick ?? cursor); keyboardPick = null; break;
      case 'Escape': keyboardPick = null; actions.select(null); break;
      default: return;
    }
    event.preventDefault();
    renderer.cursor = row === 4 ? { zone: 'bench', index: nextCol } : { zone: 'board', index: row * 4 + nextCol };
    renderer.invalidate();
  });
}
