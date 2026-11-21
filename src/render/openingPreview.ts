import { openings, type OpeningRecord } from '../core/openings';
import { planTurn } from '../core/tactics';
import type { Catalog, Run } from '../core/types';
import { placeBattleLink } from './battleFrame';

export function renderOpeningPreview(
  preview: HTMLElement,
  run: Run,
  catalog: Catalog,
  record: OpeningRecord | undefined,
  glyph: (node: HTMLElement, id: string) => void,
  format: (value: number) => string,
  click: () => void,
) {
  const get = (name: string) => preview.querySelector<HTMLElement>(`#opening-${name}`)!;
  const { events, hp, result, byCell } = planTurn(run, catalog);
  const route = openings[run.opening];
  const tip = get('tip');
  const arrow = get('link');
  let selected: number | undefined;
  get('damage').textContent = `${format(result.damage)} / ${format(hp)}`;
  get('damage').dataset.win = String(result.win);
  get('combo').textContent = format(result.combo);
  get('gold').textContent = format(run.gold);
  get('shield').textContent = format(run.shield);
  get('supply').textContent = `第 2 波补货 · ${catalog[route.supply].name}`;
  get('record').hidden = !record;
  if (record) get('record').textContent = `纪录 ${format(record.cleared)} 波 · ${format(record.combo)} 连击`;
  const cells = run.board.map((rune, index) => {
    if (!rune) {
      const cell = document.createElement('span');
      cell.setAttribute('aria-hidden', 'true');
      return cell;
    }
    const config = catalog[rune.configId];
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.style.setProperty('--opening-glyph', config.color);
    cell.setAttribute('aria-label', `第 ${index + 1} 格，${config.name}`);
    glyph(cell, config.id);
    cell.onclick = () => { click(); show(selected === index ? undefined : index); };
    return cell;
  });

  function show(index?: number) {
    selected = index;
    const from = index ?? (run.firstWaveRule === 1 ? 0 : undefined);
    const links = events.flatMap(event => event.type === 'CHAIN_LINK' && event.from === from ? [event] : []);
    arrow.hidden = true;
    if (links[0]) placeBattleLink(arrow, links[0].from, links[0].to);
    for (const [position, cell] of cells.entries()) {
      if (!(cell instanceof HTMLButtonElement)) continue;
      cell.setAttribute('aria-pressed', String(position === index));
      cell.toggleAttribute('data-link', links.some(event => event.to === position));
    }
    const rune = index === undefined ? null : run.board[index];
    if (!rune || index === undefined) {
      tip.textContent = run.opening === 'chain' && run.firstWaveRule !== 1
        ? '这局首波保留原来的站位，电火花会额外打出一次起手共鸣。' : route.note;
      return;
    }
    const config = catalog[rune.configId];
    const linksText = [...new Set(links.flatMap(event => {
      const target = run.board[event.to];
      return target ? [`${event.tutorial ? '首波共鸣' : '连到'}第 ${event.to + 1} 格${catalog[target.configId].name}`] : [];
    }))];
    const damage = byCell[index].damage;
    const detail = [...(damage ? [`首波打出 ${format(damage)} 点`] : []), ...linksText];
    const name = document.createElement('strong');
    name.textContent = config.name;
    tip.replaceChildren(name, ` · ${detail.length ? detail.join(' · ') : config.desc}`);
  }

  get('board').replaceChildren(...cells);
  show();
}
