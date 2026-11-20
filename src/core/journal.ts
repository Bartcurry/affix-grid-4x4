import { MAX_EVENTS } from './eventBus';
import { CELL_COUNT } from './grid';
import { readSharedBoard } from './boardShare';
import type { BattleEvent, BattleJournal, Catalog } from './types';

export type JournalFilter = 'all' | 'chain' | 'damage' | 'economy' | 'support';

export function damageBySource(events: readonly BattleEvent[]) {
  const breakdown = new Map<number | 'poison' | 'tutorial', number>();
  let total = 0;
  for (const event of events) {
    if (event.type !== 'DAMAGE' || !event.amount) continue;
    const source = event.kind === 'tutorial' ? 'tutorial' : event.source ?? (event.kind === 'poison' ? 'poison' : null);
    total += event.amount;
    if (source !== null) breakdown.set(source, (breakdown.get(source) ?? 0) + event.amount);
  }
  return { breakdown, total };
}

export function damageLeaders(journal: BattleJournal) {
  const { breakdown, total } = damageBySource(journal.events);
  return [...breakdown.entries()].sort((left, right) => right[1] - left[1]).slice(0, 3)
    .map(([source, amount]) => ({ source, amount, share: amount / total }));
}

export function journalRows(journal: BattleJournal, filter: JournalFilter) {
  let poison = 0;
  return journal.events.flatMap((event, index) => {
    const previousPoison = poison;
    if (event.type === 'POISON') poison = event.poison;
    const matches = filter === 'all' || (filter === 'chain' && (event.type === 'CELL_ACTIVATE' || event.type === 'CHAIN_LINK')) ||
      (filter === 'damage' && (event.type === 'DAMAGE' || event.type === 'POISON')) ||
      (filter === 'economy' && event.type === 'GOLD') || (filter === 'support' && event.type === 'RUNE_STATE');
    return event.type !== 'TURN_RESULT' && matches ? [{ event, step: index + 1, previousPoison }] : [];
  });
}

const natural = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value >= 0;
const integer = (value: unknown) => typeof value === 'number' && Number.isInteger(value);

export function readJournal(raw: unknown, catalog: Catalog): BattleJournal | undefined {
  if (!raw || typeof raw !== 'object') return;
  const data = raw as BattleJournal;
  const { formation, maxHp, events } = data;
  if (typeof formation !== 'string' || !natural(maxHp) || maxHp < 1 ||
    !Array.isArray(events) || !events.length || events.length > MAX_EVENTS || events.at(-1)?.type !== 'TURN_RESULT') return;
  const snapshot = readSharedBoard(formation, catalog, true);
  if (!snapshot) return;
  const { board, wave, finaleRule } = snapshot;
  const slot = (index: number) => natural(index) && index < CELL_COUNT && !!board[index];
  const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value);
  function valid(event: BattleEvent, index: number) {
    if (!event || typeof event !== 'object') return false;
    switch (event.type) {
      case 'CELL_ACTIVATE': return slot(event.index) && typeof event.isChain === 'boolean' && natural(event.depth) && natural(event.combo);
      case 'CHAIN_LINK': return slot(event.from) && slot(event.to) && (event.tutorial === undefined || event.tutorial === true && wave === 1);
      case 'DAMAGE': return ['rune', 'poison', 'tutorial'].includes(event.kind) && (event.source === null || slot(event.source)) &&
        natural(event.amount) && natural(event.hp) && event.hp <= maxHp && typeof event.crit === 'boolean' &&
        (event.enemyDelta === undefined || integer(event.enemyDelta)) &&
        (event.gateBlocked === undefined || event.gateBlocked === true && finaleRule === 1 && event.kind === 'rune' && event.source !== null);
      case 'POISON': return (event.source === null || slot(event.source)) && natural(event.poison);
      case 'GOLD': return slot(event.source) && natural(event.gold) && integer(event.delta);
      case 'RUNE_STATE': return slot(event.index) && !!event.state && natural(event.state.chargeStacks) &&
        finite(event.state.tempMult) && finite(event.state.tempCritChance);
      case 'TURN_RESULT': return index === events.length - 1 && typeof event.win === 'boolean' &&
        [event.damage, event.combo, event.hp, event.poison, event.gold].every(natural) && event.hp <= maxHp && event.win === (event.hp === 0);
      default: return false;
    }
  }
  if (events.every(valid)) return { formation, maxHp, events };
}

export function journalPlayback(journal: BattleJournal, startingGold: number) {
  const { maxHp } = journal;
  let hp = maxHp;
  let poison = 0;
  let gold = startingGold;
  let hardestHit = 0;
  let hardestStep = 0;
  const frames = [{ event: null as BattleEvent | null, hp, poison, gold, previousPoison: poison }];

  for (const event of journal.events) {
    const previousPoison = poison;
    switch (event.type) {
      case 'DAMAGE':
        hp = event.hp;
        if (event.amount > hardestHit) {
          hardestHit = event.amount;
          hardestStep = frames.length;
        }
        break;
      case 'POISON': poison = event.poison; break;
      case 'GOLD': gold = event.gold; break;
      case 'TURN_RESULT': ({ hp, poison, gold } = event); break;
    }
    frames.push({ event, hp, poison, gold, previousPoison });
  }
  return { frames, maxHp, hardestStep };
}
