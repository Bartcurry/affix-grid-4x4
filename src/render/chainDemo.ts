import { createMulberry32 } from '../core/rng';
import { newRun } from '../core/shopEngine';
import { planTurn, previewPlacement } from '../core/tactics';
import type { Catalog } from '../core/types';
import { placeBattleLink } from './battleFrame';

export function bindChainDemo(root: HTMLElement, catalog: Catalog, glyph: (node: HTMLElement, id: string) => void,
  click: () => void, onChange?: (linked: boolean) => void) {
  const get = <T extends HTMLElement = HTMLElement>(part: string) => root.querySelector<T>(`[data-demo-${part}]`)!;
  const scene = get('scene');
  const board = get('board');
  const score = get('score');
  const note = get('note');
  const link = get('link');
  const noMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let reversed = false;
  let source: number | undefined;
  let examples: ReturnType<typeof prepareDemo> | undefined;

  function prepareDemo() {
    const start = newRun(catalog, createMulberry32(1), 'chain', undefined, 'beginner');
    start.tileModifiers = {};
    const other = previewPlacement(start, { zone: 'board', index: 0 }, { zone: 'board', index: 1 })!;
    return [start, other].map(run => ({ run, forecast: planTurn(run, catalog) }));
  }

  function swap(focusSlot?: number) {
    source = undefined;
    reversed = !reversed;
    render();
    if (focusSlot !== undefined) board.querySelector<HTMLButtonElement>(`[data-slot="${focusSlot}"]`)?.focus({ preventScroll: true });
  }

  function choose(index: number) {
    click();
    if (source !== undefined && source !== index) {
      swap(index);
      return;
    }
    source = source === index ? undefined : index;
    for (const cell of board.querySelectorAll<HTMLButtonElement>('button')) {
      cell.setAttribute('aria-pressed', String(Number(cell.dataset.slot) === source));
    }
  }

  function render() {
    examples ??= prepareDemo();
    const { run, forecast } = examples[Number(reversed)];
    const linked = forecast.minDamage >= forecast.hp;
    score.textContent = `${forecast.minDamage} / ${forecast.hp}`;
    score.dataset.win = String(linked);
    note.textContent = linked ? '镜子让右边的电火花多打一次。' : '镜子右边是空格，连锁断了。';
    const trigger = forecast.events.find(event => event.type === 'CHAIN_LINK');
    link.hidden = true;
    if (trigger) placeBattleLink(link, trigger.from, trigger.to);
    board.replaceChildren(...run.board.map((rune, index) => {
      if (!rune) {
        const cell = document.createElement('span');
        cell.setAttribute('aria-hidden', 'true');
        return cell;
      }
      const cell = document.createElement('button');
      const { color, name } = catalog[rune.configId];
      cell.type = 'button';
      cell.dataset.slot = String(index);
      cell.setAttribute('aria-label', `第 ${index + 1} 格 ${name}`);
      cell.setAttribute('aria-pressed', 'false');
      cell.style.setProperty('--demo-ink', color);
      glyph(cell, rune.configId);
      cell.onclick = () => choose(index);
      return cell;
    }));
    onChange?.(linked);
  }

  get('swap').onclick = () => { click(); swap(); };
  scene.onpointermove = event => {
    if (event.pointerType !== 'mouse' || noMotion.matches) return;
    const bounds = scene.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - .5;
    const y = (event.clientY - bounds.top) / bounds.height - .5;
    scene.style.setProperty('--demo-yaw', `${x * 16}deg`);
    scene.style.setProperty('--demo-pitch', `${26 - y * 12}deg`);
  };
  function resetTilt() {
    scene.style.removeProperty('--demo-yaw');
    scene.style.removeProperty('--demo-pitch');
  }
  scene.onpointerleave = resetTilt;

  return (startReversed = false) => {
    reversed = startReversed;
    source = undefined;
    resetTilt();
    render();
  };
}
