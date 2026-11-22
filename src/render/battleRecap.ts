import { readSharedBoard } from '../core/boardShare';
import { damageLeaders } from '../core/journal';
import type { BattleJournal, Catalog } from '../core/types';
import { damageSourceLabel } from './battleFrame';

export function bindBattleRecap(root: HTMLElement, catalog: Catalog, format: (value: number) => string,
  review: (step: number) => void) {
  let previous: BattleJournal | undefined;

  function render(journal: BattleJournal) {
    const snapshot = readSharedBoard(journal.formation, catalog, true);
    const leaders = damageLeaders(journal);
    if (!snapshot || !leaders.length) return;

    const heading = document.createElement('div');
    const wave = document.createElement('strong');
    const label = document.createElement('span');
    wave.textContent = `第 ${snapshot.wave} 波`;
    label.textContent = '伤害排行';
    heading.className = 'battle-recap-title';
    heading.append(wave, label);

    const list = document.createElement('ol');
    for (const { source, amount, share, step } of leaders) {
      const { name, color } = damageSourceLabel(source, snapshot.board, catalog);
      const item = document.createElement('li');
      const hit = document.createElement('button');
      const caption = document.createElement('span');
      const value = document.createElement('strong');
      const bar = document.createElement('span');
      const origin = typeof source === 'number' ? `当时第 ${source + 1} 格的${name}` : name;
      hit.type = 'button';
      hit.title = `${origin} · ${format(amount)} 伤害 · 查看最高一击`;
      hit.setAttribute('aria-label', `${origin}，${format(amount)} 伤害，查看最高一击`);
      hit.setAttribute('aria-haspopup', 'dialog');
      hit.style.setProperty('--damage-ink', color);
      hit.style.setProperty('--damage-share', `${share * 100}%`);
      hit.onclick = () => review(step);
      caption.className = 'battle-recap-source';
      caption.textContent = name;
      value.textContent = format(amount);
      bar.className = 'journal-share';
      bar.setAttribute('aria-hidden', 'true');
      hit.append(caption, value, bar);
      item.append(hit);
      list.append(item);
    }
    root.append(heading, list);
  }

  return (journal: BattleJournal | undefined, visible = true) => {
    if (journal !== previous) {
      previous = journal;
      root.replaceChildren();
      if (journal) render(journal);
    }
    root.hidden = !visible || !root.childElementCount;
  };
}
