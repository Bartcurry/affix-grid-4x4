import type { SharedBoard } from '../core/boardShare';
import { simulateFormation } from '../core/tactics';
import type { Catalog, Slots } from '../core/types';
import { formationLessons, lessonBoards, type FormationLesson } from '../data/formationLessons';
import { formatNumber } from './canvasRenderer';

export function bindFormationLessons(catalog: Catalog, glyph: (node: HTMLElement, id: string) => void,
  click: () => void, trial: (board: SharedBoard, name: string, damage: number) => void) {
  const dialog = document.querySelector<HTMLDialogElement>('#formation-lessons')!;
  const get = (id: string) => dialog.querySelector<HTMLElement>(`#lesson-${id}`)!;
  let exercise: { board: SharedBoard; name: string; damage: number };

  function drawBoard(container: HTMLElement, board: Slots, highlight: number) {
    container.replaceChildren(...board.map((rune, index) => {
      const cell = document.createElement('span');
      cell.className = 'lesson-cell';
      cell.toggleAttribute('data-move', index === highlight);
      const number = document.createElement('small');
      number.textContent = String(index + 1);
      cell.append(number);
      if (rune) {
        cell.dataset.rune = rune.configId;
        cell.style.color = catalog[rune.configId].color;
        cell.title = catalog[rune.configId].name;
        glyph(cell, rune.configId);
      }
      return cell;
    }));
  }

  const choices = formationLessons.map(lesson => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.lesson = lesson.id;
    button.textContent = lesson.name;
    button.onclick = () => { click(); select(lesson); };
    return button;
  });
  get('choices').replaceChildren(...choices);

  function select(lesson: FormationLesson) {
    const { original, revised } = lessonBoards(lesson);
    const result = (board: SharedBoard) => simulateFormation(board, catalog).events.at(-1);
    const before = result(original);
    const after = result(revised);
    if (before?.type !== 'TURN_RESULT' || after?.type !== 'TURN_RESULT') return;
    exercise = { board: original, name: lesson.name, damage: after.damage };
    const [source, target] = lesson.move;
    choices.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.lesson === lesson.id)));
    get('name').textContent = lesson.name;
    get('tip').textContent = lesson.tip;
    get('resources').textContent = `${original.gold} 金 · 1 星符文`;
    get('before').textContent = `${formatNumber(before.damage)} 伤害`;
    get('after').textContent = `${formatNumber(after.damage)} 伤害`;
    drawBoard(get('original'), original.board, source);
    drawBoard(get('revised'), revised.board, target);
  }

  get('close').onclick = () => { click(); dialog.close(); };
  get('try').onclick = () => { click(); trial(exercise.board, exercise.name, exercise.damage); };
  return (id?: string) => {
    select(formationLessons.find(lesson => lesson.id === id) ?? formationLessons[0]);
    dialog.showModal();
    dialog.scrollTop = 0;
  };
}
