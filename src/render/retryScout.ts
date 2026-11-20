import type { SharedBoard } from '../core/boardShare';
import { simulateFormation } from '../core/tactics';
import type { Catalog, Run } from '../core/types';
import { formatNumber as format } from './canvasRenderer';

export function bindRetryScout(catalog: Catalog, click: () => void, rehearse: (snapshot: SharedBoard, preserving: boolean) => void) {
  const section = document.querySelector<HTMLElement>('#retry-scout')!;
  const get = <T extends HTMLElement = HTMLElement>(id: string) => section.querySelector<T>(`#retry-${id}`)!;
  const keep = get<HTMLButtonElement>('keep');
  const spend = get<HTMLButtonElement>('spend');
  const tryButton = get<HTMLButtonElement>('try');
  let run: Run;
  let preserving = false;

  function choose(preserve: boolean) {
    preserving = preserve;
    keep.setAttribute('aria-pressed', String(preserve));
    spend.setAttribute('aria-pressed', String(!preserve));
  }

  function describe(button: HTMLButtonElement, shield: number, preserve: boolean) {
    const [label, value, note] = button.children;
    button.disabled = shield === 0;
    label.textContent = preserve ? `保留 ${shield} 点护盾` : shield ? `扣盾后剩 ${shield} 点` : '扣除最后 1 点护盾';
    const turn = shield ? simulateFormation({ ...run, shield }, catalog).events.at(-1) : undefined;
    const result = turn?.type === 'TURN_RESULT' ? turn : undefined;
    value.textContent = result ? `${format(result.damage)} 伤害` : '本局结束';
    note.textContent = result ? (result.win ? '可击破' : `还差 ${format(result.hp)}`) : '无法重打';
    button.dataset.win = String(!!result?.win);
    return result?.damage;
  }

  function draw() {
    get('gold').textContent = `手里有 ${format(run.gold)} 金`;
    const guarded = describe(keep, run.shield, true);
    const exposed = describe(spend, Math.max(0, run.shield - 1), false);
    const effect = get('effect');
    effect.hidden = guarded === undefined || exposed === undefined || guarded === exposed;
    effect.textContent = effect.hidden ? '' : '当前阵容的伤害会随护盾变化。';
    tryButton.disabled = (!run.board.some(Boolean) && !run.bench.some(Boolean)) || (keep.disabled && spend.disabled);
  }

  keep.onclick = () => { click(); choose(true); };
  spend.onclick = () => { click(); choose(false); };
  tryButton.onclick = () => {
    click();
    rehearse({ ...run, shield: run.shield - Number(!preserving) }, preserving);
  };

  return {
    open(failed: Run) {
      run = failed;
      choose(run.shield <= 1);
      get('status').hidden = true;
      draw();
      section.hidden = false;
      const selectedOption = preserving ? keep : spend;
      if (!selectedOption.disabled) selectedOption.focus({ preventScroll: true });
    },
    saved() {
      const status = get('status');
      status.textContent = '改阵已保存，可以选一种方式回棋盘。';
      status.hidden = false;
      draw();
    },
  };
}
