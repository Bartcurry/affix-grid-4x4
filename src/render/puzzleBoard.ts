import { CELL_COUNT, toCoords } from '../core/grid';
import type { DailyPuzzle } from '../core/daily';
import type { Catalog } from '../core/types';

const tileNames = { li_fire: '离火', xuan_ice: '玄冰', spirit_gathering: '聚灵' } as const;

export function drawPuzzleBoard(board: HTMLElement, formation: DailyPuzzle['formation'], pieces: readonly string[],
  catalog: Catalog, glyph: (cell: HTMLElement, id: string) => void, options: {
    selected?: number;
    hinted?: number;
    focus?: number;
    pick(index: number): void;
  }) {
  board.replaceChildren(...Array.from({ length: CELL_COUNT }, (_, cell) => {
    const index = formation.cells.indexOf(cell);
    const boost = formation.affix?.id === 'odd_row_frenzy' && toCoords(cell).row % 2 === 1 ? '离火行增伤'
      : formation.relic === 'bagua_mirror' && [0, 3, 12, 15].includes(cell) ? '八卦镜增伤' : '';
    const number = document.createElement('small');
    number.textContent = String(cell + 1);
    if (index === -1) {
      const empty = document.createElement('span');
      empty.setAttribute('aria-hidden', 'true');
      empty.toggleAttribute('data-boost', !!boost);
      empty.append(number);
      return empty;
    }
    const rune = catalog[pieces[index]];
    const tile = formation.tiles?.[cell];
    const slot = document.createElement('button');
    slot.type = 'button';
    slot.dataset.cell = String(cell);
    slot.dataset.index = String(index);
    slot.style.setProperty('--rune-ink', rune.color);
    slot.setAttribute('aria-pressed', String(index === options.selected));
    slot.toggleAttribute('data-hint', index === options.hinted);
    slot.toggleAttribute('data-boost', !!boost);
    if (tile) {
      const marker = document.createElement('i');
      marker.textContent = tileNames[tile];
      marker.setAttribute('aria-hidden', 'true');
      slot.append(marker);
    }
    slot.setAttribute('aria-label', `第 ${cell + 1} 格，${rune.name}${tile ? `，${tileNames[tile]}位` : ''}${boost ? `，${boost}` : ''}${index === options.hinted ? '，提示格' : ''}`);
    slot.append(number);
    glyph(slot, rune.id);
    slot.onclick = () => options.pick(index);
    return slot;
  }));
  if (options.focus !== undefined) board.querySelector<HTMLButtonElement>(`[data-index="${options.focus}"]`)?.focus({ preventScroll: true });
}
