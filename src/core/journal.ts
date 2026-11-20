import { MAX_EVENTS } from './eventBus';
import { CELL_COUNT } from './grid';
import { relics } from './expedition';
import { battleTarget, trialAt } from './trials';
import { readJournalReplay } from './boardShare';
import type { BattleEvent, BattleJournal, Catalog } from './types';

export type JournalFilter = 'all' | 'chain' | 'damage' | 'economy' | 'support';

export function damageBySource(events: readonly BattleEvent[]) {
  const breakdown = new Map<number | 'poison' | 'tutorial', number>();
  let total = 0;
  for (const event of events) {
    if (event.type !== 'DAMAGE' || !event.amount) continue;
    const source = event.kind === 'rune' ? event.source : event.kind;
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
  const { wave, board, gold, events } = data;
  if (!natural(wave) || wave < 1 || !natural(gold) || !Array.isArray(board) || board.length !== CELL_COUNT ||
    !board.every(rune => rune === null || (rune && typeof rune.configId === 'string' &&
      Object.hasOwn(catalog, rune.configId) && [1, 2, 3].includes(rune.star))) ||
    !Array.isArray(events) || !events.length || events.length > MAX_EVENTS || events.at(-1)?.type !== 'TURN_RESULT') return;
  const slot = (index: number) => natural(index) && index < CELL_COUNT && !!board[index];
  const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value);
  function valid(event: BattleEvent, index: number) {
    if (!event || typeof event !== 'object') return false;
    switch (event.type) {
      case 'CELL_ACTIVATE': return slot(event.index) && typeof event.isChain === 'boolean' && natural(event.depth) && natural(event.combo);
      case 'CHAIN_LINK': return slot(event.from) && slot(event.to);
      case 'DAMAGE': return ['rune', 'poison', 'tutorial'].includes(event.kind) && (event.source === null || slot(event.source)) &&
        natural(event.amount) && natural(event.hp) && typeof event.crit === 'boolean' && (event.enemyDelta === undefined || integer(event.enemyDelta)) &&
        (event.breach === undefined || event.breach === true && wave === 20) &&
        (event.relics === undefined || Array.isArray(event.relics) && event.relics.length <= 2 &&
          event.relics.every(id => typeof id === 'string' && Object.hasOwn(relics, id)));
      case 'POISON': return (event.source === null || slot(event.source)) && natural(event.poison);
      case 'GOLD': return slot(event.source) && natural(event.gold) && integer(event.delta);
      case 'RUNE_STATE': return slot(event.index) && !!event.state && natural(event.state.chargeStacks) &&
        finite(event.state.tempMult) && finite(event.state.tempCritChance);
      case 'TURN_RESULT': return index === events.length - 1 && typeof event.win === 'boolean' &&
        [event.damage, event.combo, event.hp, event.poison, event.gold].every(natural);
      default: return false;
    }
  }
  const trialWave = data.trialWave === wave && trialAt(wave) ? wave : undefined;
  const trialRoute = trialWave && data.trialRoute === 'alternate' && trialAt(wave, 'alternate') ? 'alternate' : undefined;
  if (events.every(valid)) {
    const replay = readJournalReplay(data.replay);
    return { wave, board, gold, events, trialWave, trialRoute, ...(replay ? { replay } : {}) };
  }
}

export function foughtHealth(journal: BattleJournal | undefined, wave: number, trialWave?: number, trialRoute?: 'alternate') {
  if (!journal || journal.wave !== wave) return battleTarget(wave, trialWave, trialRoute).hp;
  const result = journal.events.at(-1);
  return result?.type === 'TURN_RESULT' && result.hp > 0 ? result.damage + result.hp : battleTarget(wave, journal.trialWave, journal.trialRoute).hp;
}

export function journalPlayback(journal: BattleJournal) {
  const maxHp = foughtHealth(journal, journal.wave, journal.trialWave, journal.trialRoute);
  let hp = maxHp;
  let poison = 0;
  let gold = journal.gold;
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
