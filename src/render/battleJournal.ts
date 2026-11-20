import { encounters, relics } from '../core/expedition';
import { GRID_SIZE, toCoords } from '../core/grid';
import { battleTarget } from '../core/trials';
import { damageLeaders, journalPlayback, journalRows, type JournalFilter } from '../core/journal';
import type { BattleEvent, BattleJournal, Catalog } from '../core/types';

export function bindBattleJournal(catalog: Catalog, format: (value: number) => string, glyph: (owner: HTMLElement, id: string) => void) {
  const dialog = document.querySelector<HTMLDialogElement>('#journal-dialog')!;
  const get = <T extends HTMLElement = HTMLElement>(id: string) => dialog.querySelector<T>(`#${id}`)!;
  const rows = get('journal-rows');
  const details = get<HTMLDetailsElement>('journal-details');
  const seek = get<HTMLInputElement>('journal-seek');
  const health = get<HTMLProgressElement>('journal-health');
  const prev = get<HTMLButtonElement>('journal-prev');
  const next = get<HTMLButtonElement>('journal-next');
  const hardest = get<HTMLButtonElement>('journal-hardest');
  const link = get('journal-link');
  const filters = [...dialog.querySelectorAll<HTMLButtonElement>('[data-filter]')];
  let log: BattleJournal | undefined;
  let playback: ReturnType<typeof journalPlayback> | undefined;
  let cells: HTMLElement[] = [];
  let step = 0;
  const signed = (value: number) => `${value < 0 ? '−' : '+'}${format(Math.abs(value))}`;

  function runeName(index: number) {
    return `${index + 1} 格 ${catalog[log?.board[index]?.configId ?? '']?.name ?? '符文'}`;
  }

  function describe(event: BattleEvent, previousPoison: number) {
    switch (event.type) {
      case 'CELL_ACTIVATE': return `${event.isChain ? '连锁触发' : '轮到'} ${runeName(event.index)}`;
      case 'CHAIN_LINK': return `${runeName(event.from)} 接到 ${runeName(event.to)}`;
      case 'DAMAGE': {
        const source = event.kind === 'tutorial' ? '起手共鸣' : event.source === null ? '回合末剧毒' : runeName(event.source);
        const modifier = event.enemyDelta ? `（敌人招式 ${signed(event.enemyDelta)}）` : '';
        const buffs = event.relics?.length ? ` · ${event.relics.map(id => relics[id].name).join('、')}` : '';
        return `${source}打出 ${format(event.amount)} 点${event.crit ? '暴击' : '伤害'}${modifier}${buffs}${event.breach ? '。城门已破。' : ''}`;
      }
      case 'POISON': return `${event.source === null ? '毒层衰减' : runeName(event.source)} · ${format(previousPoison)} → ${format(event.poison)} 层毒`;
      case 'GOLD': return `${runeName(event.source)} · ${signed(event.delta)} 金`;
      case 'RUNE_STATE': return `${runeName(event.index)} · 伤害 ×${+event.state.tempMult.toFixed(2)}，暴击 ${Math.round(event.state.tempCritChance * 100)}%，充能 ${event.state.chargeStacks}`;
      case 'TURN_RESULT': return `共 ${format(event.damage)} 伤害 · ${event.combo} 次触发`;
    }
  }

  function setStep(index: number) {
    if (!playback) return;
    const { frames, maxHp } = playback;
    step = Math.max(0, Math.min(index, frames.length - 1));
    const { event, hp, gold, poison, previousPoison } = frames[step];
    const kind = get('journal-frame-kind');
    let source = null;
    let target = null;
    link.hidden = true;
    switch (event?.type) {
      case 'CELL_ACTIVATE': source = event.index; kind.textContent = `第 ${event.combo} 次触发`; break;
      case 'CHAIN_LINK': {
        source = event.from;
        target = event.to;
        kind.textContent = event.tutorial ? '起手共鸣' : '连锁接力';
        const from = toCoords(source);
        const to = toCoords(target);
        const dx = to.col - from.col;
        const dy = to.row - from.row;
        const unit = 100 / GRID_SIZE;
        Object.assign(link.style, {
          left: `${(from.col + .5) * unit}%`,
          top: `${(from.row + .5) * unit}%`,
          width: `${Math.hypot(dx, dy) * unit}%`,
          transform: `rotate(${Math.atan2(dy, dx)}rad)`,
        });
        link.hidden = source === target;
        break;
      }
      case 'DAMAGE': source = event.source; kind.textContent = event.crit ? '暴击' : '命中'; break;
      case 'POISON': source = event.source; kind.textContent = '毒层变化'; break;
      case 'GOLD': source = event.source; kind.textContent = '金币变化'; break;
      case 'RUNE_STATE': source = event.index; kind.textContent = '符文状态'; break;
      case 'TURN_RESULT': kind.textContent = event.win ? '守住了' : '敌人撑过了这波'; break;
      default: kind.textContent = '准备开战';
    }
    for (const [position, cell] of cells.entries()) {
      cell.toggleAttribute('data-source', position === source);
      cell.toggleAttribute('data-target', position === target);
    }
    kind.dataset.kind = event?.type.toLowerCase() ?? 'start';
    get('journal-frame').textContent = event ? describe(event, previousPoison) : '本波开战时的站位';
    health.max = maxHp;
    health.value = hp;
    get('journal-hp').textContent = format(hp);
    get('journal-poison').textContent = format(poison);
    get('journal-gold').textContent = format(gold);
    seek.value = String(step);
    seek.setAttribute('aria-valuetext', `第 ${step} 步，共 ${frames.length - 1} 步`);
    get('journal-count').textContent = `${step} / ${frames.length - 1} 步`;
    prev.disabled = step === 0;
    next.disabled = step === frames.length - 1;
  }

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
    const lines = journalRows(log, filter);
    get('journal-empty').hidden = !!lines.length;
    rows.hidden = !lines.length;
    rows.replaceChildren(...lines.map(({ event, step, previousPoison }) => {
      const entry = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      const index = document.createElement('small');
      index.textContent = String(step);
      const label = document.createElement('span');
      entry.dataset.kind = event.type.toLowerCase();
      label.textContent = describe(event, previousPoison);
      if (event.type === 'DAMAGE') {
        if (event.breach) entry.dataset.breach = 'true';
        label.append(` · 剩余敌血 ${format(event.hp)}`);
      }
      if (event.type === 'GOLD') label.append(` · 手里剩 ${format(event.gold)} 金`);
      button.onclick = () => {
        setStep(step);
        details.open = false;
        seek.focus({ preventScroll: true });
        seek.scrollIntoView({ block: 'nearest' });
      };
      button.append(index, label);
      entry.append(button);
      return entry;
    }));
    rows.scrollTop = 0;
    for (const item of filters) item.setAttribute('aria-pressed', String(item.dataset.filter === filter));
  }

  for (const item of filters) item.onclick = () => draw(item.dataset.filter as JournalFilter);
  seek.oninput = () => setStep(seek.valueAsNumber);
  prev.onclick = () => setStep(step - 1);
  next.onclick = () => setStep(step + 1);
  hardest.onclick = () => setStep(playback!.hardestStep);
  get('journal-end').onclick = () => setStep(Number(seek.max));
  get('journal-close').onclick = () => dialog.close();
  return (entry: BattleJournal | undefined) => {
    const result = entry?.events.at(-1);
    if (!entry || result?.type !== 'TURN_RESULT' || dialog.open) return;
    log = entry;
    playback = journalPlayback(entry);
    seek.max = String(entry.events.length);
    hardest.disabled = playback.hardestStep === 0;
    cells = entry.board.map((rune, position) => {
      const cell = document.createElement('span');
      const number = document.createElement('small');
      number.textContent = String(position + 1);
      cell.append(number);
      if (rune) {
        cell.style.setProperty('--rune-ink', catalog[rune.configId].color);
        glyph(cell, rune.configId);
        cell.dataset.star = String(rune.star);
      }
      return cell;
    });
    get('journal-board').replaceChildren(...cells);
    const { trial, encounter } = battleTarget(entry.wave, entry.trialWave, entry.trialRoute);
    const bounty = trial ? `\n${result.win ? `悬赏已领 · +${trial.reward} 金` : '没拿到这次悬赏。'}` : '';
    get('journal-title').textContent = `第 ${entry.wave} 波 · ${trial?.name ?? encounters[encounter].name}`;
    get('journal-summary').textContent = `${format(result.damage)} 伤害，${result.combo} 次触发。${result.win ? '打过了。' : `还差 ${format(result.hp)} 点。`}\n战斗金币：${format(entry.gold)} → ${format(result.gold)}（不含过关奖励）。${bounty}`;
    showDamageLeaders(entry);
    details.open = false;
    draw('all');
    setStep(0);
    dialog.showModal();
    dialog.scrollTop = 0;
  };
}
