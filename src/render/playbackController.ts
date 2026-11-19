import type { BattleEvent, TurnResult } from '../core/types';

export class PlaybackController {
  speed: 1 | 2 = 1;
  private skipped = false;
  private release: (() => void) | null = null;

  skip() {
    this.skipped = true;
    this.release?.();
  }

  async play(
    events: readonly BattleEvent[],
    show: (event: BattleEvent) => void,
    options?: { maxHp?: number; onHitStop?: () => void }
  ): Promise<TurnResult> {
    this.skipped = false;
    let combo = 0;
    const maxHp = options?.maxHp ?? Number.MAX_SAFE_INTEGER;
    for (const event of events) {
      if (event.type === 'TURN_RESULT') {
        if (!this.skipped && combo) await this.pause(440 / this.speed);
        show(event);
        return event;
      }
      if (event.type === 'CELL_ACTIVATE') {
        if (combo && !this.skipped) await this.pause(Math.max(45, 220 - combo * 8) / this.speed);
        combo = event.combo;
      }
      if (event.type === 'DAMAGE') {
        const isMajorHit = event.amount >= maxHp * 0.25;
        const isCritKill = event.crit && event.hp <= 0;
        if (!this.skipped && (isMajorHit || isCritKill)) {
          options?.onHitStop?.();
          await this.pause(40 / this.speed);
        }
      }
      show(event);
    }
    throw new Error('Missing battle result');
  }

  private pause(ms: number) {
    return new Promise<void>(resolve => {
      const finish = () => { clearTimeout(timer); this.release = null; resolve(); };
      const timer = setTimeout(finish, ms);
      this.release = finish;
    });
  }
}
