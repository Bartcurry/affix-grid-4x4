import { previewOffer } from '../core/marketPreview';
import { formationLessons } from '../core/formationGuide';
import { purchaseInfo } from '../core/shopEngine';
import { runeFootprint } from '../core/tactics';
import type { Catalog, Run, TurnResult } from '../core/types';

const tileNames = { li_fire: '离火位', xuan_ice: '玄冰位', spirit_gathering: '聚灵位' } as const;

export function bindMarketPreview(
  catalog: Catalog,
  icon: (node: HTMLElement, id: string) => void,
  format: (value: number) => string,
  confirm: (shopIndex: number, configId: string, cell?: number) => boolean,
  guide: (runeId: string) => void,
) {
  const dialog = document.querySelector<HTMLDialogElement>('#market-preview')!;
  const get = <T extends HTMLElement = HTMLElement>(id: string) => dialog.querySelector<T>(`#${id}`)!;
  const buy = get<HTMLButtonElement>('market-preview-buy');
  const grid = get('market-preview-grid');
  const blocked = get('market-preview-blocked');
  const options = get('market-preview-options');
  const links = get('market-preview-link');
  const recipe = get('market-preview-guide');
  get('market-preview-close').onclick = () => dialog.close();

  return (run: Run, shopIndex: number, current: TurnResult, preferred?: number) => {
    const offer = run.shop[shopIndex];
    if (!offer || dialog.open) return;
    const config = catalog[offer.configId];
    const hasChain = config.triggers.some(rule => rule.effect === 'RETRIGGER_TARGET');
    const info = purchaseInfo(run, shopIndex, catalog);
    const placements = previewOffer(run, shopIndex, catalog);
    dialog.style.setProperty('--rune-ink', config.color);
    icon(get('market-preview-icon'), config.id);
    get('market-preview-title').textContent = config.name;
    get('market-preview-meta').textContent = `买前试摆 · ${config.cost} 金`;
    get('market-preview-description').textContent = config.desc;
    recipe.hidden = !formationLessons.some(lesson => lesson.pieces.some(([, id]) => id === config.id));
    recipe.onclick = () => guide(config.id);
    blocked.hidden = placements.length > 0;
    options.hidden = !placements.length;
    if (!placements.length) {
      blocked.textContent = info.blocked === 'gold' ? `还差 ${config.cost - run.gold} 金。` :
        info.blocked === 'bench' ? '先腾出一格备战区，就能购买并试摆。' : '这枚符文暂时买不了。';
      dialog.showModal();
      return;
    }

    const best = placements.reduce((left, right) => right.result.damage > left.result.damage ? right : left);
    let selected = placements.find(plan => preferred !== undefined && plan.cell === preferred) ?? best;
    grid.hidden = best.cell === undefined;
    const cells = new Map<number, HTMLButtonElement>();
    grid.replaceChildren(...placements.flatMap(plan => {
      if (plan.cell === undefined) return [];
      const cell = plan.cell;
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.dataset.cell = String(cell);
      tile.dataset.best = String(cell === best.cell);
      const number = document.createElement('small');
      number.textContent = String(cell + 1);
      const glyph = document.createElement('span');
      glyph.setAttribute('aria-hidden', 'true');
      const occupant = run.board[cell];
      const occupantName = occupant ? catalog[occupant.configId].name : '空格';
      const modifier = run.tileModifiers[cell];
      if (modifier) tile.dataset.modifier = modifier;
      tile.setAttribute('aria-label', `第 ${cell + 1} 格，${occupantName}${modifier ? `，${tileNames[modifier]}` : ''}，预计 ${format(plan.result.damage)} 伤害`);
      tile.append(number, glyph);
      tile.onclick = () => { selected = plan; draw(); };
      cells.set(cell, tile);
      return [tile];
    }));

    const draw = () => {
      const { cell, hp, result, merges } = selected;
      const footprint = cell === undefined ? undefined : runeFootprint(config, cell);
      for (const [index, tile] of cells) {
        const active = index === cell;
        tile.setAttribute('aria-pressed', String(active));
        tile.dataset.reach = footprint?.links.has(index) ? 'chain' : footprint?.effects.has(index) ? 'effect' : '';
        const glyph = tile.querySelector('span')!;
        const rune = active ? config : catalog[run.board[index]?.configId ?? ''];
        glyph.style.color = rune?.color ?? '';
        if (rune) icon(glyph, rune.id);
        else glyph.replaceChildren();
      }
      get('market-before').textContent = `${format(current.damage)} / ${format(hp)}`;
      get('market-after-label').textContent = cell === undefined ? '升星后' : `放到第 ${cell + 1} 格后`;
      get('market-after').textContent = `${format(result.damage)} / ${format(hp)}`;
      const delta = result.damage - current.damage;
      const outcome = get('market-preview-result');
      outcome.dataset.win = String(result.win);
      outcome.textContent = `${delta ? `${delta > 0 ? '+' : '−'}${format(Math.abs(delta))} 伤害` : '伤害持平'} · ${result.win ? '能打过' : `还差 ${format(result.hp)}`}`;
      if (cell === undefined) {
        const final = [...merges].reverse().find(merge => merge.rune.configId === config.id);
        links.hidden = !final;
        const spot = final?.slot;
        if (final && spot) links.textContent = spot.zone === 'board' ? `第 ${spot.index + 1} 格升到 ${final.rune.star} 星。` :
          `备战区第 ${spot.index + 1} 格升到 ${final.rune.star} 星，放上棋盘才会触发。`;
      } else {
        const replaced = run.board[cell];
        const targetNames = (indices?: Set<number>) => [...(indices ?? [])].flatMap(index => {
          const rune = run.board[index];
          return rune ? [`${index + 1} 格${catalog[rune.configId].name}`] : [];
        });
        const targets = targetNames(footprint?.links);
        const effects = targetNames(footprint?.effects);
        const modifier = run.tileModifiers[cell];
        const chain = targets.length ? `连锁目标 ${targets.join('、')}。` : hasChain ? '这一格连不到其他符文。' : '';
        const notes = [modifier ? `${tileNames[modifier]}。` : '', replaced ? `原格的${catalog[replaced.configId].name}回备战区。` : '',
          chain, effects.length ? `作用范围 ${effects.join('、')}。` : ''];
        links.hidden = !notes.some(Boolean);
        links.textContent = notes.filter(Boolean).join(' ');
      }
      buy.textContent = cell === undefined ? `买入并升星 · ${config.cost} 金` : `买入并放到第 ${cell + 1} 格 · ${config.cost} 金`;
    };

    buy.onclick = () => {
      if (confirm(shopIndex, config.id, selected.cell)) dialog.close();
    };
    draw();
    dialog.showModal();
  };
}
