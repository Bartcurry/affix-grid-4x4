import type { BattleEvent, PlaybackSpeed, TurnResult } from '../core/types';

const activationBudget = 4500;
const activationDelay = (combo: number) => combo <= 1 ? 0 : Math.max(45, 220 - (combo - 1) * 8);

export class PlaybackController {
  speed: PlaybackSpeed = 1;
  private skipped = false;
  private release: (() => void) | null = null;

  skip() {
    this.skipped = true;
    this.release?.();
  }

  async play(
    events: readonly BattleEvent[],
    show: (event: BattleEvent, maxHp: number) => void,
    options?: { maxHp?: number; onHitStop?: () => void }
  ): Promise<TurnResult> {
    this.skipped = false;
    const result = events.at(-1);
    if (result?.type !== 'TURN_RESULT') throw new Error('Missing battle result');
    if (this.speed === 0) return result;
    const activationDuration = events.reduce((sum, event) => sum + (event.type === 'CELL_ACTIVATE' ? activationDelay(event.combo) : 0), 0);
    const scale = Math.min(1, activationBudget / Math.max(1, activationDuration));
    const maxHp = options?.maxHp ?? Number.MAX_SAFE_INTEGER;
    let hp = maxHp;
    const interrupted = () => this.skipped || this.speed === 0;
    for (const event of events) {
      if (interrupted()) return result;
      const speed = this.speed || 1;
      if (event.type === 'TURN_RESULT') {
        if (result.combo) await this.pause(440 / speed);
      } else if (event.type === 'CELL_ACTIVATE') {
        const delay = activationDelay(event.combo) * scale / speed;
        if (delay > 0) await this.pause(delay);
      } else if (event.type === 'DAMAGE') {
        const majorHit = hp > 0 && (event.amount >= maxHp * .25 || event.crit && event.hp <= 0);
        hp = event.hp;
        if (majorHit) {
          options?.onHitStop?.();
          if (interrupted()) return result;
          await this.pause(40 / speed);
        }
      }
      if (interrupted()) return result;
      show(event, maxHp);
      if (event.type === 'DAMAGE' && event.breach && !interrupted()) await this.pause(240 / speed);
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
