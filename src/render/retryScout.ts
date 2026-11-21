import type { SharedBoard } from '../core/boardShare';
import { simulateFormation } from '../core/tactics';
import type { Catalog, Run, TurnResult } from '../core/types';
import { formatNumber as format } from './canvasRenderer';

export function bindRetryScout(catalog: Catalog, click: () => void,
  rehearse: (snapshot: SharedBoard, preserving: boolean, quickFind: boolean) => void) {
  const section = document.querySelector<HTMLElement>('#retry-scout')!;
  const get = <T extends HTMLElement = HTMLElement>(id: string) => section.querySelector<T>(`#retry-${id}`)!;
  const keep = get<HTMLButtonElement>('keep');
  const spend = get<HTMLButtonElement>('spend');
  const tryButton = get<HTMLButtonElement>('try');
  const nextButton = get<HTMLButtonElement>('next');
  let run: Run;
  let preserving = false;
  let retry: (preserve: boolean) => void;
  let guarded: TurnResult | undefined;
  let exposed: TurnResult | undefined;

  function choose(preserve: boolean) {
    preserving = preserve;
    keep.setAttribute('aria-pressed', String(preserve));
    spend.setAttribute('aria-pressed', String(!preserve));
    const result = preserve ? guarded : exposed;
    nextButton.dataset.ready = String(!!result?.win);
    nextButton.textContent = result?.win ? preserve ? '看广告保盾并重打' : '扣 1 盾并重打' : '自动找换位';
    nextButton.setAttribute('aria-haspopup', !result?.win || preserve ? 'dialog' : 'false');
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
    return result;
  }

  function draw() {
    get('gold').textContent = `手里有 ${format(run.gold)} 金`;
    guarded = describe(keep, run.shield, true);
    exposed = describe(spend, Math.max(0, run.shield - 1), false);
    const effect = get('effect');
    effect.hidden = !guarded || !exposed || guarded.damage === exposed.damage;
    effect.textContent = effect.hidden ? '' : '当前阵容的伤害会随护盾变化。';
    tryButton.disabled = (!run.board.some(Boolean) && !run.bench.some(Boolean)) || (keep.disabled && spend.disabled);
    nextButton.disabled = tryButton.disabled;
  }

  keep.onclick = () => { click(); choose(true); };
  spend.onclick = () => { click(); choose(false); };
  function openTrial(quickFind: boolean) {
    click();
    rehearse({ ...run, shield: run.shield - Number(!preserving) }, preserving, quickFind);
  }
  tryButton.onclick = () => openTrial(false);
  nextButton.onclick = () => {
    if ((preserving ? guarded : exposed)?.win) retry(preserving);
    else openTrial(true);
  };

  return {
    open(failed: Run, startRetry: (preserve: boolean) => void) {
      run = failed;
      retry = startRetry;
      get('status').hidden = true;
      draw();
      choose(run.shield <= 1 || (!!guarded?.win && !exposed?.win));
      section.hidden = false;
      const selectedOption = preserving ? keep : spend;
      if (!selectedOption.disabled) selectedOption.focus({ preventScroll: true });
    },
    saved() {
      const status = get('status');
      status.textContent = '改阵已保存，下方可以继续布阵，也可按选中的方案重打。';
      status.hidden = false;
      draw();
      choose(preserving);
    },
    changed() {
      const status = get('status');
      status.hidden = false;
      status.textContent = '战况已在另一页更新，刷新后再继续。';
    },
  };
}
