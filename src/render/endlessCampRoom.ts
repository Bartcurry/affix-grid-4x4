import { battleTarget } from '../core/bounties';
import { campSupplies, fireCell, previewCamp, type CampChoice } from '../core/endlessCamp';
import { affixAt, encounters, endlessSegment } from '../core/expedition';
import type { Catalog, Run } from '../core/types';
import { formatNumber as format } from './canvasRenderer';

const tileNames = { li_fire: '离火', xuan_ice: '玄冰', spirit_gathering: '聚灵' } as const;

export function bindEndlessCampRoom(
  catalog: Catalog,
  glyph: (node: HTMLElement, id: string) => void,
  click: () => void,
  claim: (choice: CampChoice) => boolean,
) {
  const dialog = document.querySelector<HTMLDialogElement>('#camp-dialog')!;
  const get = <T extends HTMLElement = HTMLElement>(id: string) => dialog.querySelector<T>(`#camp-${id}`)!;
  const ids = ['supplies', 'repair', 'move'] as const;
  const choices = ids.map(id => get<HTMLButtonElement>(id));
  const confirm = get<HTMLButtonElement>('confirm');
  dialog.addEventListener('cancel', event => event.preventDefault());

  return (run: Run) => {
    if (dialog.open) return;
    const { baseline, supplies, repair, placements } = previewCamp(run, catalog);
    if (!supplies) return;
    const { from, through, next } = endlessSegment(run.wave);
    const { encounter } = battleTarget(run.wave);
    const affix = affixAt(run.wave);
    const nextAffix = next !== undefined && affixAt(next);
    const current = fireCell(run);
    let bestCell: number | undefined;
    placements.forEach((option, cell) => {
      if (option && (bestCell === undefined || option.result.damage > placements[bestCell]!.result.damage ||
        (option.result.damage === placements[bestCell]!.result.damage && run.board[cell] && !run.board[bestCell]))) bestCell = cell;
    });
    let selected: CampChoice = { id: 'supplies' };
    let cell = bestCell;

    get('stage').textContent = `无尽第 ${format(from)}–${format(through)} 波`;
    get('enemy').textContent = `下一战 · ${encounters[encounter].name} · ${format(baseline.hp)} 生命`;
    const affixLine = get('affix');
    affixLine.hidden = !affix && !nextAffix;
    affixLine.textContent = affix ? `${affix.name} · ${affix.desc}`
      : nextAffix && next !== undefined ? `第 ${format(next)} 波进入${nextAffix.name}，${nextAffix.desc}` : '';
    choices[0].querySelector('small')!.textContent = `+${campSupplies.gold} 金 · +${campSupplies.refreshes} 刷新`;
    choices[1].querySelector('small')!.textContent = repair ? `${run.shield} → ${run.shield + 1} 点护盾` : '护盾已满';
    choices[2].querySelector('small')!.textContent = current === undefined ? '棋盘上没有离火位' : `从第 ${current + 1} 格移动`;
    choices[1].disabled = !repair;
    choices[2].disabled = bestCell === undefined;

    const grid = run.board.map((rune, index) => {
      const tile = run.tileModifiers[index];
      const square = document.createElement('button');
      square.type = 'button';
      square.dataset.cell = String(index);
      square.disabled = !placements[index];
      if (index === current) square.dataset.fire = 'true';
      if (index === bestCell) square.dataset.best = 'true';
      const config = rune && catalog[rune.configId];
      const number = document.createElement('small');
      number.textContent = String(index + 1);
      square.append(number);
      if (config) {
        square.style.color = config.color;
        glyph(square, config.id);
      }
      if (tile) {
        const mark = document.createElement('i');
        mark.textContent = tileNames[tile].slice(0, 1);
        square.append(mark);
      }
      square.setAttribute('aria-label', `第 ${index + 1} 格，${config?.name ?? '空格'}${tile ? `，${tileNames[tile]}位` : ''}`);
      square.onclick = () => { click(); cell = index; selected = { id: 'move', cell }; render(); };
      return square;
    });
    get('grid').replaceChildren(...grid);

    function render() {
      choices.forEach((choice, index) => choice.setAttribute('aria-pressed', String(ids[index] === selected.id)));
      get('layout').hidden = selected.id !== 'move';
      const preview = selected.id === 'move' ? placements[selected.cell] : selected.id === 'repair' ? repair : supplies;
      if (selected.id === 'move') {
        const rune = run.board[selected.cell];
        get('cell').textContent = `离火从第 ${current! + 1} 格移到第 ${selected.cell + 1} 格${rune ?
          `，给${catalog[rune.configId].name}用。` : '。'}`;
        for (const [index, square] of grid.entries()) square.setAttribute('aria-pressed', String(index === selected.cell));
      }
      if (!preview) return;
      const { result } = preview;
      const change = result.damage - baseline.result.damage;
      const impact = get('impact');
      impact.textContent = `${format(baseline.result.damage)} → ${format(result.damage)}`;
      impact.dataset.change = change > 0 ? 'up' : change < 0 ? 'down' : 'same';
      get('verdict').textContent = result.win ? '可击破' : `还差 ${format(result.hp)}`;
      confirm.textContent = selected.id === 'supplies' ? '领取补给' : selected.id === 'repair' ? '修复 1 点护盾'
        : `把离火移到第 ${selected.cell + 1} 格`;
    }

    choices.forEach((choice, index) => {
      choice.onclick = () => {
        click();
        const id = ids[index];
        if (id === 'move') {
          if (cell === undefined) return;
          selected = { id, cell };
        } else selected = { id };
        render();
      };
    });
    confirm.onclick = () => { if (claim(selected)) dialog.close(); };
    render();
    dialog.showModal();
    dialog.scrollTop = 0;
  };
}
