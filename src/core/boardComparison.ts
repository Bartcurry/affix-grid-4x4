import { damageBySource } from './journal';
import type { BattleJournal, Rune, Slots } from './types';

type BoardAttempt = Pick<BattleJournal, 'board' | 'events'> & { bench?: Slots };
type DamageChange = { rune: Rune; from: number | null; to: number | null; before: number; after: number } |
  { kind: 'poison' | 'tutorial'; before: number; after: number };

// Trial positions keep the original rune objects when moving them between slots.
export function compareBoardAttempts(previous: BoardAttempt, next: BoardAttempt) {
  const before = damageBySource(previous.events).breakdown;
  const after = damageBySource(next.events).breakdown;
  const origins = new Map<Rune, number>();
  [...previous.board, ...(previous.bench ?? [])].forEach((rune, index) => { if (rune) origins.set(rune, index); });
  const destinations = new Map<Rune, number>();
  next.board.forEach((rune, index) => { if (rune) destinations.set(rune, index); });
  const damage: DamageChange[] = [];
  for (const [rune, index] of origins) {
    const from = index < previous.board.length ? index : null;
    const to = destinations.get(rune) ?? null;
    const was = from === null ? 0 : before.get(from) ?? 0;
    const now = to === null ? 0 : after.get(to) ?? 0;
    if (was !== now) damage.push({ rune, from, to, before: was, after: now });
  }
  for (const kind of ['poison', 'tutorial'] as const) {
    const was = before.get(kind) ?? 0;
    const now = after.get(kind) ?? 0;
    if (was !== now) damage.push({ kind, before: was, after: now });
  }
  damage.sort((a, b) => Math.abs(b.after - b.before) - Math.abs(a.after - a.before));

  function links(attempt: BoardAttempt) {
    const count = new Map<string, { from: Rune; to: Rune; total: number }>();
    for (const event of attempt.events) {
      if (event.type !== 'CHAIN_LINK' || event.tutorial) continue;
      const from = attempt.board[event.from], to = attempt.board[event.to];
      if (!from || !to) continue;
      const source = origins.get(from), target = origins.get(to);
      if (source === undefined || target === undefined) continue;
      const key = `${source}:${target}`;
      const entry = count.get(key);
      if (entry) entry.total++;
      else count.set(key, { from, to, total: 1 });
    }
    return count;
  }

  const previousLinks = links(previous);
  const nextLinks = links(next);
  const chains = [...new Set([...previousLinks.keys(), ...nextLinks.keys()])].flatMap(key => {
    const was = previousLinks.get(key), now = nextLinks.get(key);
    const edge = now ?? was;
    const difference = (now?.total ?? 0) - (was?.total ?? 0);
    return edge && difference ? [{ from: edge.from, to: edge.to, difference }] : [];
  }).sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));

  return { damage, chains };
}
