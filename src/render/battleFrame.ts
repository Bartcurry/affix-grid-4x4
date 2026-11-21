import { GRID_SIZE, toCoords } from '../core/grid';
import type { BattleEvent } from '../core/types';

export function describeBattleEvent(event: BattleEvent, runeName: (index: number) => string,
  format: (value: number) => string, previousPoison: number) {
  const signed = (value: number) => `${value < 0 ? '−' : '+'}${format(Math.abs(value))}`;
  switch (event.type) {
    case 'CELL_ACTIVATE': return `${event.isChain ? '连锁触发' : '轮到'} ${runeName(event.index)}`;
    case 'CHAIN_LINK': return `${runeName(event.from)} 接到 ${runeName(event.to)}`;
    case 'DAMAGE': {
      const source = event.kind === 'tutorial' ? '起手共鸣' : event.source === null ? '回合末剧毒' :
        `${runeName(event.source)}${event.kind === 'poison' ? '的羁绊毒爆' : ''}`;
      const modifier = event.enemyDelta ? `（敌人招式 ${signed(event.enemyDelta)}）` : '';
      return `${source}打出 ${format(event.amount)} 点${event.crit ? '暴击' : '伤害'}${event.gateBlocked ? ' · 同列轮锁' : ''}${modifier}`;
    }
    case 'POISON': return `${event.source === null ? '毒层衰减' : runeName(event.source)} · ${format(previousPoison)} → ${format(event.poison)} 层毒`;
    case 'GOLD': return `${runeName(event.source)} · ${signed(event.delta)} 金`;
    case 'RUNE_STATE': return `${runeName(event.index)} · 伤害 ×${+event.state.tempMult.toFixed(2)}，暴击 ${Math.round(event.state.tempCritChance * 100)}%，充能 ${event.state.chargeStacks}`;
    case 'TURN_RESULT': return `共 ${format(event.damage)} 伤害 · ${event.combo} 次触发`;
  }
}

export function placeBattleLink(link: HTMLElement, source: number, target: number) {
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
}
