import { campChoices, campGold, type CampChoice } from '../core/endlessCamp';
import { affixAt, encounters } from '../core/expedition';
import { battleTarget } from '../core/trials';
import type { Catalog, Run, TurnResult } from '../core/types';

const marks = { li_fire: '离火', xuan_ice: '玄冰', spirit_gathering: '聚灵' } as const;

export function bindEndlessCampRoom(
  catalog: Catalog,
  glyph: (owner: HTMLElement, id: string) => void,
  format: (value: number) => string,
  choose: (kind: CampChoice, cell?: number) => boolean,
) {
  const dialog = document.querySelector<HTMLDialogElement>('#camp-dialog')!;
  const get = <ElementType extends HTMLElement = HTMLElement>(id: string) => dialog.querySelector<ElementType>(`#camp-${id}`)!;
  const repair = get<HTMLButtonElement>('repair');
  const move = get<HTMLButtonElement>('move');
  const panel = get<HTMLDetailsElement>('move-panel');
  const grid = get('grid');
  dialog.addEventListener('cancel', event => event.preventDefault());

  function accept(kind: CampChoice, cell?: number) {
    if (choose(kind, cell)) dialog.close();
  }
  get('supplies').onclick = () => accept('supplies');
  repair.onclick = () => accept('repair');

  return (run: Run) => {
    if (dialog.open) return;
    const { baseline, options } = campChoices(run, catalog);
    const { encounter } = battleTarget(run.wave);
    const affix = affixAt(run.wave);
    get('wave').textContent = `第 ${format(run.wave)} 波前 · ${encounters[encounter].name}${affix ? ` · ${affix.name}` : ''}`;
    get('baseline').textContent = `当前阵容预计 ${format(baseline.result.damage)} / ${format(baseline.hp)} 伤害。选一项再出发。`;
    const impact = (label: HTMLElement, result: TurnResult) => {
      const delta = result.damage - baseline.result.damage;
      const change = delta ? `（${delta > 0 ? '+' : '−'}${format(Math.abs(delta))}）` : '';
      label.dataset.win = String(result.win);
      label.textContent = `预计 ${format(result.damage)} 伤害${change} · ${result.win ? '能打过' : `差 ${format(result.hp)}`}`;
    };
    const funds = options.find(option => option.kind === 'supplies');
    if (funds) impact(get('supplies-impact'), funds.result);
    get('supplies-value').textContent = `拿 ${campGold} 金`;

    const recovery = options.find(option => option.kind === 'repair');
    repair.disabled = !recovery;
    get('repair-value').textContent = recovery ? `恢复 1 点护盾 · ${run.shield} → ${run.shield + 1}` : '护盾已满';
    const repairImpact = get('repair-impact');
    repairImpact.hidden = !recovery;
    if (recovery) impact(repairImpact, recovery.result);

    const placements = new Map(options.flatMap(option => option.kind === 'move' && option.cell !== undefined ? [[option.cell, option.result]] : []));
    const best = [...placements].reduce<[number, TurnResult] | undefined>((prior, candidate) => !prior || candidate[1].damage > prior[1].damage ? candidate : prior, undefined);
    panel.hidden = !best;
    panel.open = false;
    if (best) {
      const current = Object.keys(run.tileModifiers).map(Number).find(index => run.tileModifiers[index] === 'li_fire')!;
      get('tile-current').textContent = `现在第 ${current + 1} 格`;
      let selected = best[0];
      const cells = run.board.map((rune, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.cell = String(index);
        button.dataset.best = String(index === best[0]);
        const tile = run.tileModifiers[index];
        const name = rune ? catalog[rune.configId].name : '空格';
        const estimate = placements.get(index);
        button.disabled = !estimate;
        if (tile) button.dataset.modifier = tile;
        button.setAttribute('aria-label', `第 ${index + 1} 格，${name}${tile ? `，${marks[tile]}位` : `，预计 ${format(estimate!.damage)} 伤害`}`);
        const number = document.createElement('small');
        number.textContent = String(index + 1);
        const icon = document.createElement('span');
        if (rune) { icon.style.color = catalog[rune.configId].color; glyph(icon, rune.configId); }
        button.append(number, icon);
        button.onclick = () => { selected = index; selectCell(); };
        return button;
      });
      function selectCell() {
        for (const [index, button] of cells.entries()) button.setAttribute('aria-pressed', String(index === selected));
        impact(get('move-impact'), placements.get(selected)!);
        move.textContent = `移到第 ${selected + 1} 格`;
      }
      move.onclick = () => accept('move', selected);
      grid.replaceChildren(...cells);
      selectCell();
    }
    dialog.showModal();
  };
}
