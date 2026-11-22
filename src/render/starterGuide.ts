import { previewPlacement, simulateFormation } from '../core/tactics';
import type { Catalog } from '../core/types';
import { formationLessons, lessonBoards } from '../data/formationLessons';
import { formatNumber as format } from './canvasRenderer';

const lessons = [formationLessons[0], formationLessons[2], formationLessons[1]];

export function bindStarterGuide(catalog: Catalog, glyph: (cell: HTMLElement, id: string) => void,
  click: () => void, finish: () => void, startCampaign: () => void) {
  const dialog = document.querySelector<HTMLDialogElement>('#starter-guide')!;
  const get = <T extends HTMLElement = HTMLElement>(id: string) => dialog.querySelector<T>(`#starter-${id}`)!;
  const grid = get('grid');
  const check = get<HTMLButtonElement>('check');
  const reset = get<HTMLButtonElement>('reset');
  const next = get<HTMLButtonElement>('next');
  const campaign = get<HTMLButtonElement>('campaign');
  const feedback = get('feedback');
  const result = get('result');
  let round = 0;
  let selected: number | undefined;
  let exercise: ReturnType<typeof lessonBoards>;
  let board: typeof exercise.original;
  let baseline = 0;
  let goal = 0;
  let passed = false;
  let fromOpening = true;

  function damage(formation: typeof board) {
    const result = simulateFormation(formation, catalog).events.at(-1);
    if (result?.type !== 'TURN_RESULT') throw new Error('Missing practice result');
    return result.damage;
  }

  function draw(focus?: number) {
    const [from, to] = lessons[round].move;
    const target = !passed && selected === from ? to : undefined;
    const source = selected === undefined && board === exercise.original ? from : undefined;
    grid.replaceChildren(...board.board.map((rune, index) => {
      const cell = document.createElement('button');
      const config = rune && catalog[rune.configId];
      const number = document.createElement('small');
      number.textContent = String(index + 1);
      cell.type = 'button';
      cell.dataset.index = String(index);
      cell.dataset.occupied = String(!!config);
      cell.setAttribute('aria-pressed', String(selected === index));
      const hint = target === index ? '，建议落位' : source === index ? '，先点这里' : '';
      cell.setAttribute('aria-label', `第 ${index + 1} 格，${config?.name ?? '空格'}${hint}`);
      if (source === index) cell.dataset.suggestion = 'from';
      if (target === index) cell.dataset.suggestion = 'to';
      cell.append(number);
      if (config) {
        cell.style.setProperty('--rune-ink', config.color);
        glyph(cell, config.id);
      }
      cell.onclick = () => {
        if (passed) return;
        click();
        if (selected === undefined || selected === index) {
          selected = config && selected !== index ? index : undefined;
          if (selected === lessons[round].move[0]) feedback.textContent = `点亮着的第 ${lessons[round].move[1] + 1} 格。`;
          else if (selected !== undefined) feedback.textContent = '再点目标格。';
          delete feedback.dataset.win;
        } else {
          const moved = previewPlacement(board, { zone: 'board', index: selected }, { zone: 'board', index });
          if (moved) {
            board = moved;
            check.disabled = reset.disabled = false;
            result.textContent = '—';
            feedback.textContent = '摆好了，试打看看。';
            delete feedback.dataset.win;
          }
          selected = undefined;
        }
        draw(index);
      };
      return cell;
    }));
    if (focus !== undefined) grid.querySelector<HTMLButtonElement>(`[data-index="${focus}"]`)?.focus({ preventScroll: true });
  }

  function start(index: number) {
    round = index;
    const lesson = lessons[index];
    exercise = lessonBoards(lesson);
    board = exercise.original;
    selected = undefined;
    passed = false;
    baseline = damage(board);
    goal = damage(exercise.revised);
    get('progress').textContent = `第 ${index + 1} / ${lessons.length} 课`;
    get('title').textContent = lesson.name;
    get('tip').textContent = lesson.tip;
    get('before').textContent = format(baseline);
    get('goal').textContent = format(goal);
    result.textContent = '—';
    feedback.textContent = `先点亮着的第 ${lesson.move[0] + 1} 格。`;
    delete feedback.dataset.win;
    next.hidden = true;
    campaign.hidden = true;
    next.textContent = index + 1 === lessons.length ? (fromOpening ? '返回开局' : '返回指引') : '下一课';
    check.hidden = false;
    check.disabled = reset.disabled = true;
    draw();
  }

  check.onclick = () => {
    click();
    const amount = damage(board);
    result.textContent = format(amount);
    passed = amount >= goal;
    feedback.textContent = passed
      ? `打出了 ${format(amount)} 点，比原阵多 ${format(amount - baseline)} 点。`
      : `打出了 ${format(amount)} 点，目标是 ${format(goal)}。再试一个位置。`;
    feedback.dataset.win = String(passed);
    if (passed) {
      check.hidden = true;
      next.hidden = false;
      campaign.hidden = !fromOpening;
      next.focus({ preventScroll: true });
    }
  };
  campaign.onclick = () => {
    if (!fromOpening) return;
    dialog.close();
    startCampaign();
  };
  next.onclick = () => {
    click();
    if (round + 1 < lessons.length) {
      start(round + 1);
      get('title').focus({ preventScroll: true });
    } else {
      dialog.close();
      if (fromOpening) finish();
    }
  };
  reset.onclick = () => { click(); start(round); get('title').focus({ preventScroll: true }); };
  get('close').onclick = () => { click(); dialog.close(); };
  return (opening: boolean) => {
    if (dialog.open) return;
    fromOpening = opening;
    click();
    start(0);
    dialog.showModal();
    get('title').focus({ preventScroll: true });
  };
}
