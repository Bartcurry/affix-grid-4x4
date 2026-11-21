import type { DailyPuzzle } from '../core/daily';
import { journalPlayback } from '../core/journal';
import type { BattleEvent, Catalog } from '../core/types';
import { describeBattleEvent, placeBattleLink } from './battleFrame';
import { formatNumber as format } from './canvasRenderer';

export function bindDailyReplay(dialog: HTMLDialogElement, board: HTMLElement, catalog: Catalog, click: () => void) {
  const get = <T extends HTMLElement = HTMLElement>(id: string) => dialog.querySelector<T>(`#daily-replay-${id}`)!;
  const panel = dialog.querySelector<HTMLElement>('#daily-replay')!;
  const brief = dialog.querySelector<HTMLElement>('#daily-brief')!;
  const toggle = get<HTMLButtonElement>('toggle');
  const nav = get('nav');
  const link = get('link');
  const health = get<HTMLProgressElement>('health');
  const prev = get<HTMLButtonElement>('prev');
  const next = get<HTMLButtonElement>('next');
  const hit = get<HTMLButtonElement>('hit');
  let playback: ReturnType<typeof journalPlayback> | undefined;
  let names = new Map<number, string>();
  let step = 0;
  let lastStep = -1;

  function highlight(source?: number | null, target?: number) {
    for (const cell of board.querySelectorAll<HTMLElement>('[data-cell]')) {
      const index = Number(cell.dataset.cell);
      cell.toggleAttribute('data-acting', source === index);
      cell.toggleAttribute('data-receiving', target === index);
    }
    link.hidden = true;
    if (typeof source === 'number' && target !== undefined) placeBattleLink(link, source, target);
  }

  function showStep(index: number) {
    if (!playback || index < 0 || index > lastStep || step === index) return;
    step = index;
    const { event, hp, gold, poison, previousPoison } = playback.frames[step];
    const source = event && ('source' in event ? event.source : 'index' in event ? event.index :
      event.type === 'CHAIN_LINK' ? event.from : undefined);
    highlight(source, event?.type === 'CHAIN_LINK' ? event.to : undefined);
    health.max = playback.maxHp;
    health.value = hp;
    get('hp').textContent = `${format(hp)} / ${format(playback.maxHp)}`;
    get('resources').textContent = `${format(gold)} 金 · ${format(poison)} 层毒`;
    get('event').textContent = event
      ? describeBattleEvent(event, cell => names.get(cell) ?? `${cell + 1} 格`, format, previousPoison)
      : '开战前的阵型。';
    get('count').textContent = `${step} / ${lastStep}`;
    prev.setAttribute('aria-disabled', String(step === 0));
    next.setAttribute('aria-disabled', String(step === lastStep));
  }

  function show(open: boolean) {
    if (panel.hidden === !open) return;
    panel.hidden = nav.hidden = !open;
    brief.hidden = board.inert = open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? '收起战况' : '看出手';
    if (!open) highlight();
  }

  toggle.onclick = () => {
    if (!playback) return;
    click();
    if (!panel.hidden) { show(false); return; }
    show(true);
    step = -1;
    showStep(1);
    next.focus({ preventScroll: true });
    board.closest('.daily-stage')?.scrollIntoView({ block: 'start' });
  };
  prev.onclick = () => { if (step > 0) { click(); showStep(step - 1); } };
  next.onclick = () => { if (step < lastStep) { click(); showStep(step + 1); } };
  hit.onclick = () => {
    if (!playback?.hardestStep) return;
    click();
    showStep(playback.hardestStep);
  };

  return {
    clear() {
      show(false);
      toggle.hidden = true;
      playback = undefined;
    },
    remember(puzzle: DailyPuzzle, pieces: readonly string[], events: BattleEvent[]) {
      const { hp, formation } = puzzle;
      names = new Map(formation.cells.map((cell, index) => [cell, `${cell + 1} 格 ${catalog[pieces[index]].name}`]));
      playback = journalPlayback({ events, maxHp: hp }, formation.gold ?? 0);
      lastStep = playback.frames.length - 1;
      toggle.hidden = false;
      hit.disabled = !playback.hardestStep;
    },
  };
}
