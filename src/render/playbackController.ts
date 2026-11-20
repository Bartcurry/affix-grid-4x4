import type { BattleEvent, PlaybackSpeed, TurnResult } from '../core/types';

type Damage = Extract<BattleEvent, { type: 'DAMAGE' }>;
export interface PlaybackBeat {
  events: readonly BattleEvent[];
  featured?: Damage;
  finishing: boolean;
  hold: number;
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
    }
  }
  const featured = new Set([biggest, killingHit].filter(index => index >= 0));
  featured.forEach(index => { cuts.add(index); cuts.add(index + 1); });
  const sorted = [...cuts].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i];
    beats.push({
      events: events.slice(start, sorted[i + 1]),
      featured: featured.has(start) ? events[start] as Damage : undefined,
      finishing: start === killingHit,
      hold: featured.has(start) ? 240 : Math.max(68, 175 - i * 7),
    });
  }
  return { beats, result };
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
