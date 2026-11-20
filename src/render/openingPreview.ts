import { damageBySource } from '../core/journal';
import { openings, type OpeningRecord } from '../core/openings';
import { prepareBattle } from '../core/tactics';
import type { Catalog, Run } from '../core/types';

export function renderOpeningPreview(
  preview: HTMLElement,
  run: Run,
  catalog: Catalog,
  record: OpeningRecord | undefined,
  glyph: (owner: HTMLElement, id: string) => void,
  format: (value: number) => string,
  click: () => void,
) {
  const get = (id: string) => preview.querySelector<HTMLElement>(`#opening-${id}`)!;
  const { events, hp } = prepareBattle(run, catalog);
  const turn = events.at(-1);
  if (turn?.type !== 'TURN_RESULT') return;

  const route = openings[run.opening];
  const runeInfo = get('rune');
  const history = get('record');
  const damage = get('damage');
  const sources = damageBySource(events).breakdown;
  preview.dataset.opening = run.opening;
  damage.textContent = `${format(turn.damage)} / ${format(hp)}`;
  damage.dataset.win = String(turn.win);
  get('combo').textContent = String(turn.combo);
  get('gold').textContent = String(run.gold);
  get('supply').textContent = catalog[route.supply].name;
  history.hidden = !record;
  history.textContent = record ? `纪录 ${format(record.cleared)} 波 · ${format(record.combo)} 连击` : '';

  let selected: number | null = null;
  const cells = run.board.map((rune, index) => {
    if (!rune) {
      const blank = document.createElement('span');
      blank.setAttribute('aria-hidden', 'true');
      return blank;
    }
    const config = catalog[rune.configId];
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.style.setProperty('--opening-glyph', config.color);
    tile.setAttribute('aria-label', `第 ${index + 1} 格，${config.name}`);
    tile.setAttribute('aria-pressed', 'false');
    glyph(tile, config.id);
    tile.onclick = () => {
      click();
      update(selected === index ? null : index);
    };
    return tile;
  });

  function update(index: number | null) {
    selected = index;
    const links = new Map<number, number>();
    for (const event of events) {
      if (event.type === 'CHAIN_LINK' && !event.tutorial && event.from === index) {
        links.set(event.to, (links.get(event.to) ?? 0) + 1);
      }
    }
    for (const [position, cell] of cells.entries()) {
      if (!(cell instanceof HTMLButtonElement)) continue;
      cell.setAttribute('aria-pressed', String(position === index));
      cell.toggleAttribute('data-opening-link', links.has(position));
    }

    const rune = index === null ? null : run.board[index];
    if (!rune || index === null) {
      runeInfo.textContent = route.note;
      return;
    }
    const config = catalog[rune.configId];
    const name = document.createElement('strong');
    name.textContent = config.name;
    const dealt = sources.get(index) ?? 0;
    const targets = [...links].map(([cell, count]) => `${catalog[run.board[cell]!.configId].name} ×${count}`);
    const summary = [dealt ? `首波打了 ${format(dealt)} 点` : '', targets.length ? `连锁 ${targets.join('、')}` : ''].filter(Boolean);
    runeInfo.replaceChildren(name, ` ${summary.length ? `${summary.join(' · ')}。` : config.desc}`);
  }

  get('board').replaceChildren(...cells);
  update(null);
}
