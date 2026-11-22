import type { BattleEvent, PlaybackSpeed, TurnResult } from '../core/types';

type Damage = Extract<BattleEvent, { type: 'DAMAGE' }>;
type ChainLink = Extract<BattleEvent, { type: 'CHAIN_LINK' }>;
type CueEvent = Extract<BattleEvent, { type: 'CELL_ACTIVATE' | 'DAMAGE' | 'GOLD' | 'POISON' }>;

export interface BattleCue {
  event: CueEvent;
  link?: ChainLink;
}

export interface PlaybackBeat {
  events: readonly BattleEvent[];
  featured?: Damage;
  cue?: BattleCue;
  finishing: boolean;
  hold: number;
}

function followBattleCues() {
  let pendingLink: ChainLink | undefined;
  let activeLink: ChainLink | undefined;
  let tutorialLink: ChainLink | undefined;

  return (events: readonly BattleEvent[]) => {
    let cue: BattleCue | undefined;
    let priority = 0;
    let strongest = 0;
    for (const event of events) {
      if (event.type === 'CHAIN_LINK') {
        if (event.tutorial) tutorialLink = event;
        else pendingLink = event;
        continue;
      }
      if (event.type === 'CELL_ACTIVATE') {
        activeLink = pendingLink?.to === event.index ? pendingLink : undefined;
        pendingLink = undefined;
        tutorialLink = undefined;
      }
      if (event.type !== 'CELL_ACTIVATE' && event.type !== 'DAMAGE' && event.type !== 'GOLD' && event.type !== 'POISON') continue;
      const rank = event.type === 'DAMAGE' ? (event.gateBlocked ? 5 : event.crit ? 4 : 3) : event.type === 'CELL_ACTIVATE' ? 1 : 2;
      const amount = event.type === 'DAMAGE' ? event.amount : 0;
      if (rank < priority || (rank === priority && amount < strongest)) continue;
      const source = event.type === 'CELL_ACTIVATE' ? event.index : event.source;
      const link = event.type === 'DAMAGE' && event.kind === 'tutorial' ? tutorialLink : activeLink?.to === source ? activeLink : undefined;
      cue = { event, link };
      priority = rank;
      strongest = amount;
    }
    return cue;
  };
}

export function planPlayback(events: readonly BattleEvent[]) {
  const result = events.at(-1);
  if (result?.type !== 'TURN_RESULT') throw new Error('Missing battle result');
  const end = events.length - 1;
  const beats: PlaybackBeat[] = [];
  if (!end) return { beats, result };

  const openingSteps = 5;
  // Let the opening read one activation at a time, then group long chains into at most 24 beats.
  const stride = Math.max(1, Math.ceil((result.combo - openingSteps) / 24));
  const cuts = new Set([0, end]);
  let biggest = -1;
  let biggestAmount = 0;
  let killingHit = -1;
  for (let i = 0; i < end; i++) {
    const event = events[i];
    if (event.type === 'CELL_ACTIVATE' && (event.combo <= openingSteps || (event.combo - openingSteps - 1) % stride === 0)) {
      const link = events[i - 1];
      cuts.add(link?.type === 'CHAIN_LINK' && !link.tutorial && link.to === event.index ? i - 1 : i);
    }
    if (event.type === 'DAMAGE' && event.amount > 0) {
      if (event.amount > biggestAmount) { biggest = i; biggestAmount = event.amount; }
      if (event.hp === 0 && killingHit < 0) killingHit = i;
      // Keep the final poison tick readable after a high-priority rune hit.
      if (event.kind === 'poison' && event.source === null) cuts.add(i);
    }
  }
  const featured = new Set([biggest, killingHit].filter(index => index >= 0));
  featured.forEach(index => { cuts.add(index); cuts.add(index + 1); });
  const sorted = [...cuts].sort((a, b) => a - b);
  const focus = followBattleCues();
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i];
    const eventsInBeat = events.slice(start, sorted[i + 1]);
    beats.push({
      events: eventsInBeat,
      cue: focus(eventsInBeat),
      featured: featured.has(start) ? events[start] as Damage : undefined,
      finishing: start === killingHit,
      hold: start === killingHit ? 340 : featured.has(start) ? 240 : Math.max(68, 175 - i * 7),
    });
  }
  return { beats, result };
}

export function planJournalReplay(events: readonly BattleEvent[]) {
  const { beats } = planPlayback(events);
  const cues = new Map<number, number>();
  let offset = 0;
  for (const beat of beats) {
    // A review frame is the exact state after the event at step - 1.
    const link = beat.events.findIndex(event => event.type === 'CHAIN_LINK');
    cues.set(offset + (link < 0 ? beat.events.length : link + 1), beat.hold);
    offset += beat.events.length;
  }
  const gateStep = events.findIndex(event => event.type === 'DAMAGE' && event.gateBlocked) + 1;
  if (gateStep) cues.set(gateStep, 440);
  cues.set(events.length, 0);
  return {
    cues: [...cues].sort(([a], [b]) => a - b).map(([step, hold]) => ({ step, hold })),
    gateStep,
  };
}

export class PlaybackController {
  private rate: PlaybackSpeed = 1;
  private skipped = false;
  private release: (() => void) | null = null;

  get speed() { return this.rate; }
  set speed(speed: PlaybackSpeed) {
    this.rate = speed;
    if (speed === 0) this.skip();
  }

  skip() {
    if (this.skipped) return false;
    this.skipped = true;
    this.release?.();
    return true;
  }

  async play(events: readonly BattleEvent[], show: (beat: PlaybackBeat) => void, instant = false): Promise<TurnResult> {
    this.skipped = false;
    const { beats, result } = planPlayback(events);
    if (instant || this.rate === 0) return result;
    for (const beat of beats) {
      if (this.skipped) break;
      show(beat);
      if (!this.skipped) await this.pause(beat.hold / Math.max(1, this.rate));
    }
    return result;
  }

  private pause(ms: number) {
    return new Promise<void>(resolve => {
      const finish = () => { clearTimeout(timer); this.release = null; resolve(); };
      const timer = setTimeout(finish, ms);
      this.release = finish;
    });
  }
}
