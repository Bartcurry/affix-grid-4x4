import { encounters, relics } from '../core/expedition';
import { battleTarget } from '../core/trials';
import { damageLeaders, journalRows, type JournalFilter } from '../core/journal';
import type { BattleJournal, Catalog } from '../core/types';

export function bindBattleJournal(catalog: Catalog, format: (value: number) => string) {
  const dialog = document.querySelector<HTMLDialogElement>('#journal-dialog')!;
  const get = (id: string) => dialog.querySelector<HTMLElement>(`#${id}`)!;
  const rows = get('journal-rows');
  const filters = [...dialog.querySelectorAll<HTMLButtonElement>('[data-filter]')];
  let log: BattleJournal | undefined;
  const signed = (value: number) => `${value < 0 ? '−' : '+'}${format(Math.abs(value))}`;

  function showDamageLeaders(entry: BattleJournal) {
    const leaders = damageLeaders(entry);
    get('journal-damage').hidden = !leaders.length;
    get('journal-leaders').replaceChildren(...leaders.map(({ source, amount, share }) => {
      const item = document.createElement('li');
      const name = document.createElement('span');
      const value = document.createElement('strong');
      const bar = document.createElement('span');
      if (typeof source === 'number') {
        const config = catalog[entry.board[source]?.configId ?? ''];
        name.textContent = `${source + 1} 格 · ${config?.name ?? '符文'}`;
        item.style.setProperty('--damage-ink', config?.color ?? '#dbaf72');
      } else {
        name.textContent = source === 'poison' ? '回合末剧毒' : '首波共鸣';
        item.style.setProperty('--damage-ink', source === 'poison' ? '#80c887' : '#dbaf72');
      }
      value.textContent = `${format(amount)} · ${share < .01 ? '<1' : (share * 100).toFixed(0)}%`;
      bar.className = 'journal-share';
      bar.setAttribute('aria-hidden', 'true');
      item.style.setProperty('--damage-share', `${share * 100}%`);
      item.append(name, value, bar);
      return item;
    }));
  }

  function draw(filter: JournalFilter) {
    if (!log) return;
    const board = log.board;
    const name = (index: number) => `${index + 1} 格 ${catalog[board[index]?.configId ?? '']?.name ?? ''}`;
    const lines = journalRows(log, filter);
    get('journal-empty').hidden = !!lines.length;
    rows.hidden = !lines.length;
    rows.replaceChildren(...lines.map(({ event, step, previousPoison }) => {
      const entry = document.createElement('li');
      const index = document.createElement('small'); index.textContent = String(step);
      const label = document.createElement('span');
      entry.dataset.kind = event.type.toLowerCase();
      switch (event.type) {
        case 'CELL_ACTIVATE': label.textContent = `${event.isChain ? '连锁触发' : '轮到'} ${name(event.index)}`; break;
        case 'CHAIN_LINK': label.textContent = `${name(event.from)} 接到 ${name(event.to)}`; break;
        case 'DAMAGE':
          label.textContent = `${event.kind === 'tutorial' ? '起手共鸣' : event.source === null ? '回合末剧毒' : name(event.source)}：${event.crit ? '暴击，' : ''}${format(event.amount)} 伤害${event.enemyDelta ? `（敌人招式 ${signed(event.enemyDelta)}）` : ''}，敌人剩 ${format(event.hp)} 生命`;
          if (event.relics?.length) label.append(` · ${event.relics.map(id => relics[id].name).join('、')}`);
          if (event.breach) { entry.dataset.breach = 'true'; label.append('。城门已破。'); }
          break;
        case 'POISON': label.textContent = `${event.source === null ? '毒层衰减' : name(event.source)}：${format(previousPoison)} → ${format(event.poison)} 层毒`; break;
        case 'GOLD': label.textContent = `${name(event.source)}：${signed(event.delta)} 金，手里剩 ${format(event.gold)} 金`; break;
        case 'RUNE_STATE': label.textContent = `${name(event.index)}：伤害 ×${+event.state.tempMult.toFixed(2)}，暴击 ${Math.round(event.state.tempCritChance * 100)}%，充能 ${event.state.chargeStacks}`; break;
      }
      entry.append(index, label);
      return entry;
    }));
    rows.scrollTop = 0;
    for (const item of filters) item.setAttribute('aria-pressed', String(item.dataset.filter === filter));
  }

  for (const item of filters) item.onclick = () => draw(item.dataset.filter as JournalFilter);
  get('journal-close').onclick = () => dialog.close();
  return (entry: BattleJournal | undefined) => {
    const result = entry?.events.at(-1);
    if (!entry || result?.type !== 'TURN_RESULT' || dialog.open) return;
    log = entry;
    const { trial, encounter } = battleTarget(entry.wave, entry.trialWave);
    const bounty = trial ? `\n${result.win ? `悬赏已领 · +${trial.reward} 金` : '没拿到这次悬赏。'}` : '';
    get('journal-title').textContent = `第 ${entry.wave} 波 · ${trial?.name ?? encounters[encounter].name}`;
    get('journal-summary').textContent = `${format(result.damage)} 伤害，${result.combo} 次触发。${result.win ? '打过了。' : `还差 ${format(result.hp)} 点。`}\n战斗金币：${format(entry.gold)} → ${format(result.gold)}（不含过关奖励）。${bounty}`;
    showDamageLeaders(entry);
    draw('all'); dialog.showModal();
  };
}
