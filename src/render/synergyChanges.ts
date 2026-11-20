import type { synergyTierChanges } from '../core/synergy';

export function renderSynergyChanges(list: HTMLElement, changes: ReturnType<typeof synergyTierChanges>) {
  list.hidden = changes.length === 0;
  list.replaceChildren(...changes.map(({ label, before, after }) => {
    const line = document.createElement('li');
    line.dataset.loss = String(before > after);
    line.textContent = after === 0 ? `${label} · 失去 ${before} 件套` :
      before === 0 ? `${label} · 激活 ${after} 件套` : `${label} · ${before} → ${after} 件套`;
    return line;
  }));
}
