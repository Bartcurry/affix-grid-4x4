import { resolveTargets } from '../core/grid';
import { runeAt } from '../core/shopEngine';
import type { BattleEvent, Catalog, Rune, Run, RuneState, Scope, Slot } from '../core/types';

export interface Point { x: number; y: number }
interface Rect extends Point { width: number; height: number }
type Target = Slot | 'sell' | null;
const WIDTH = 380;
const HEIGHT = 422;
const SELL: Rect = { x: 41, y: 389, width: 298, height: 29 };
const BOARD: Rect = { x: 31, y: 12, width: 318, height: 313 };
const cellRect = ({ zone, index }: Slot): Rect => zone === 'board'
  ? { x: 41 + index % 4 * 76, y: 22 + Math.floor(index / 4) * 75, width: 70, height: 70 }
  : { x: 41 + index * 76, y: 344, width: 70, height: 40 };
const center = ({ x, y, width, height }: Rect): Point => ({ x: x + width / 2, y: y + height / 2 });
const sameSlot = (left: Slot | null, right: Slot) => left?.zone === right.zone && left.index === right.index;
const contains = (rect: Rect, point: Point) => point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
const slotList: Slot[] = [ ...Array.from({ length: 16 }, (_, index): Slot => ({ zone: 'board', index })),
  ...Array.from({ length: 4 }, (_, index): Slot => ({ zone: 'bench', index })) ];

const vector: Record<string, string> = {
  spark_orb: 'M18 1L5 17h10l-2 14 14-18H17Z', prism_right: 'M8 4l19 12L8 28ZM2 8v16',
  relay_cross: 'M12 3h8v9h9v8h-9v9h-8v-9H3v-8h9Z', overclock_core: 'M16 4a12 12 0 1 0 .01 0ZM16 9v7l5 3M16 29v2M29 16h2M1 16h2',
  venom_drop: 'M16 2C12 10 6 14 6 20a10 10 0 0 0 20 0c0-6-6-10-10-18ZM11 20c0 3 2 5 5 5',
  plague_spreader: 'M16 11a5 5 0 1 0 .01 0ZM16 2v5M4 10l5 3M4 23l5-3M16 25v5M28 23l-5-3M28 10l-5 3',
  catalyst_flask: 'M11 3h10M13 3v10L5 25q-2 4 3 4h16q5 0 3-4l-8-12V3M10 21h12M14 25h1',
  toxic_detonator: 'M16 1l3 10 9-5-5 9 8 3-10 3 4 8-9-6-8 7 3-10-10-3 10-3-4-8 8 5Z',
  copper_mine: 'M16 2l13 13-13 15L3 15ZM3 15h26M16 2l-5 13 5 15 5-15Z',
  greed_amplifier: 'M16 3l12 7v13l-12 7-12-7V10ZM16 3v13l12 7M4 23l12-7M4 10l12 6 12-6',
  gold_cannon: 'M16 2l13 14-13 14L3 16ZM16 9l6 7-6 7-6-7Z', tax_collector: 'M16 4l13 23H3ZM16 11v10M12 17h8',
  ember_amp: 'M16 2l14 14-14 14L2 16ZM16 9l7 7-7 7-7-7Z', echo_stone: 'M15 6L4 16l11 10M26 6L15 16l11 10',
  blood_altar: 'M16 1l4 11 11 4-11 4-4 11-4-11-11-4 11-4Z',
  combo_finisher: 'M16 2l4 9 10 1-8 7 3 11-9-6-9 6 3-11-8-7 10-1Z',
};

interface Spark extends Point { vx: number; vy: number }
type Animation = { at: number; life: number; tone: string } & (
  { kind: 'flash'; slot: Slot } | { kind: 'link'; from: Point; to: Point; sparks: Spark[] } |
  { kind: 'float'; anchor: Point; text: string; large: boolean });

export class CanvasRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly paths = Object.fromEntries(Object.entries(vector).map(([id, data]) => [id, new Path2D(data)]));
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  private readonly states = new Map<number, RuneState>();
  private animations: Animation[] = [];
  private frame = 0;
  private shakeAt = -1000;
  private size = { x: 0, y: 0, scale: 1 };
  selection: Slot | null = null;
  cursor: Slot | null = null;
  drag: { from: Slot; point: Point; target: Target } | null = null;
  sellLabel = '拖到此处出售符文';

  constructor(readonly canvas: HTMLCanvasElement, private run: Run, private readonly catalog: Catalog) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D unavailable');
    this.ctx = ctx;
    new ResizeObserver(() => this.invalidate()).observe(canvas);
    this.invalidate();
  }

  setRun(run: Run) { this.run = run; this.invalidate(); }

  point(clientX: number, clientY: number): Point {
    const rect = this.canvas.getBoundingClientRect();
    return { x: (clientX - rect.left - this.size.x) / this.size.scale, y: (clientY - rect.top - this.size.y) / this.size.scale };
  }

  hit(point: Point): Target {
    if (contains(SELL, point)) return 'sell';
    return slotList.find(slot => contains(cellRect(slot), point)) ?? null;
  }

  clearEffects() { this.animations = []; this.states.clear(); this.shakeAt = -1000; this.invalidate(); }

  flash(slot: Slot, tone: string, merge = false) {
    const at = performance.now();
    this.animations.push({ kind: 'flash', at, life: merge ? 790 : 350, slot, tone });
    if (merge) this.animations.push({ kind: 'float', at, life: 860, anchor: center(cellRect(slot)), text: '升星！', tone, large: true });
    this.invalidate();
  }

  play(event: BattleEvent) {
    const at = performance.now();
    const boardSlot = (index: number): Slot => ({ zone: 'board', index });
    const anchor = (index: number | null) => index === null ? { x: WIDTH / 2, y: 57 } : center(cellRect(boardSlot(index)));
    const color = (index: number) => this.catalog[this.run.board[index]?.configId ?? '']?.color ?? '#89f7ff';
    switch (event.type) {
      case 'CELL_ACTIVATE': this.flash(boardSlot(event.index), color(event.index)); break;
      case 'CHAIN_LINK': {
        const to = anchor(event.to);
        const sparks = Array.from({ length: 12 }, (_, index) => {
          const angle = index * 2.39;
          const velocity = 14 + index % 5 * 8;
          return { ...to, vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity };
        });
        this.animations.push({ kind: 'link', at, life: 390, from: anchor(event.from), to, sparks, tone: event.tutorial ? '#ffd787' : '#7eefff' });
        break;
      }
      case 'DAMAGE':
        if (event.crit) this.shakeAt = at;
        this.animations.push({ kind: 'float', at, life: 690, anchor: anchor(event.source),
          text: event.crit ? `暴击 ${event.amount}` : `${event.kind === 'tutorial' ? '共鸣 ' : '−'}${event.amount}`,
          tone: event.crit ? '#ffb45e' : event.kind === 'poison' ? '#92ffac' : '#fbf6ff', large: event.crit });
        break;
      case 'GOLD': this.animations.push({ kind: 'float', at, life: 650, anchor: anchor(event.source), text: `${event.delta >= 0 ? '+' : '−'}${Math.abs(event.delta)} 金`, tone: '#ffda7d', large: false }); break;
      case 'RUNE_STATE': this.states.set(event.index, event.state); break;
    }
    this.invalidate();
  }

  invalidate() { if (!this.frame) this.frame = requestAnimationFrame(this.draw); }

  private readonly draw = (now: number) => {
    this.frame = 0;
    const { canvas, ctx } = this;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const pxWidth = Math.max(1, Math.round(rect.width * dpr));
    const pxHeight = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== pxWidth || canvas.height !== pxHeight) { canvas.width = pxWidth; canvas.height = pxHeight; }
    const scale = Math.min(rect.width / WIDTH, rect.height / HEIGHT);
    if (scale <= 0) return;
    this.size = { x: (rect.width - WIDTH * scale) / 2, y: (rect.height - HEIGHT * scale) / 2, scale };
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, pxWidth, pxHeight);
    const shake = this.reducedMotion.matches ? 0 : 7 * Math.max(0, 1 - (now - this.shakeAt) / 240);
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, (this.size.x + Math.sin(now / 13) * shake) * dpr, (this.size.y + Math.cos(now / 10) * shake * .45) * dpr);
    this.tile(BOARD, '#1e293b', '#3e5270', 12);
    this.text('RUNE RESERVE  /  备战区', 42, 336, 12, '#9eb3cb', 'left');
    const inRange = this.range();
    for (const slot of slotList) {
      const bounds = cellRect(slot);
      const rune = runeAt(this.run, slot);
      const selected = sameSlot(this.selection, slot);
      const hinted = slot.zone === 'board' && inRange.has(slot.index);
      this.tile(bounds, hinted ? '#203b4c' : '#111d2d', selected ? '#b8f5ff' : '#32455e');
      if (rune) this.drawRune(bounds, rune, this.drag && sameSlot(this.drag.from, slot) ? .31 : 1, slot.zone === 'board' ? this.states.get(slot.index) : undefined);
      else this.text('+', bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, slot.zone === 'board' ? 21 : 17, '#526984');
      if (hinted || selected || sameSlot(this.cursor, slot) || (this.drag?.target && this.drag.target !== 'sell' && sameSlot(this.drag.target, slot))) {
        ctx.save();
        if (hinted && !selected) ctx.setLineDash([4, 4]);
        this.tile({ x: bounds.x + 1, y: bounds.y + 1, width: bounds.width - 2, height: bounds.height - 2 }, null,
          selected ? '#d7fcff' : sameSlot(this.cursor, slot) ? '#ffd985' : '#71e6ff', 6, 2);
        ctx.restore();
      }
    }
    this.tile(SELL, this.drag?.target === 'sell' ? '#622e46' : '#271d2c', this.drag?.target === 'sell' ? '#ff9a9d' : '#764757');
    this.text(this.sellLabel, 190, 403, 13, '#f0a9b5');
    this.animations = this.animations.filter(animation => now - animation.at < animation.life);
    for (const animation of this.animations) this.drawAnimation(animation, now);
    if (this.drag) {
      const rune = runeAt(this.run, this.drag.from);
      if (rune) this.drawRune({ x: this.drag.point.x - 33, y: this.drag.point.y - 40, width: 66, height: 66 }, rune, .92);
    }
    if (this.animations.length || shake > 0) this.invalidate();
  };

  private range() {
    const range = new Set<number>();
    const selected = this.selection;
    const rune = selected && runeAt(this.run, selected);
    if (!rune || selected.zone !== 'board') return range;
    for (const rule of this.catalog[rune.configId].triggers) {
      const targets: (Scope | 'BOSS' | undefined)[] = [rule.target, rule.secondaryEffect?.target,
        rule.event === 'ON_ROW_COL_ACTIVATE' ? 'ROW_COL' : undefined,
        rule.event === 'ON_NEIGHBOR_ACTIVATE' || rule.value.scaleBy === 'ADJACENT_TAG_COUNT' ? 'ADJACENT_4' : undefined];
      for (const target of targets) if (target && target !== 'BOSS') for (const index of resolveTargets(selected.index, target)) range.add(index);
    }
    return range;
  }

  private tile(rect: Rect, fill: string | CanvasGradient | null, line: string, radius = 7, width = 1) {
    const ctx = this.ctx;
    ctx.beginPath(); ctx.roundRect(rect.x, rect.y, rect.width, rect.height, radius);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    ctx.lineWidth = width; ctx.strokeStyle = line; ctx.stroke();
  }

  private text(text: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'center') {
    const ctx = this.ctx;
    ctx.fillStyle = color; ctx.font = `700 ${size}px system-ui, sans-serif`; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y);
  }

  private drawRune(rect: Rect, rune: Rune, alpha: number, state?: RuneState) {
    const ctx = this.ctx;
    const { color } = this.catalog[rune.configId];
    const gradient = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.width, rect.y + rect.height);
    gradient.addColorStop(0, '#17283a'); gradient.addColorStop(.56, `${color}35`); gradient.addColorStop(1, '#132033');
    ctx.save(); ctx.globalAlpha = alpha;
    this.tile(rect, gradient, `${color}ba`);
    const compact = rect.height < 50;
    const iconSize = compact ? .6 : 1;
    ctx.save(); ctx.translate(rect.x + rect.width / 2 - 16 * iconSize, rect.y + rect.height / 2 - 16 * iconSize + (compact ? 0 : 4)); ctx.scale(iconSize, iconSize);
    ctx.lineWidth = 2.15; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 10;
    const path = this.paths[rune.configId];
    if (path) ctx.stroke(path);
    ctx.restore();
    this.text('★'.repeat(rune.star), rect.x + 6, rect.y + 10, compact ? 9 : 12, '#ffe499', 'left');
    if (state?.chargeStacks) this.text(`${state.chargeStacks}⚡`, rect.x + 6, rect.y + rect.height - 9, 11, '#a3dbff', 'left');
    if (state && state.tempMult > 1) this.text(`×${+state.tempMult.toFixed(2)}`, rect.x + rect.width - 5, rect.y + rect.height - 9, 10, '#fed3a2', 'right');
    ctx.restore();
  }

  private drawAnimation(animation: Animation, now: number) {
    const ctx = this.ctx;
    const progress = Math.max(0, (now - animation.at) / animation.life);
    ctx.save(); ctx.globalAlpha = 1 - progress;
    if (animation.kind === 'flash') {
      ctx.shadowColor = animation.tone; ctx.shadowBlur = 17;
      this.tile(cellRect(animation.slot), `${animation.tone}55`, animation.tone, 7, 2.6);
    } else if (animation.kind === 'link') {
      const { from, to, tone } = animation;
      const light = ctx.createLinearGradient(from.x, from.y, to.x, to.y);
      light.addColorStop(0, `${tone}68`); light.addColorStop(.6, '#ffffff'); light.addColorStop(1, tone);
      ctx.shadowColor = tone; ctx.shadowBlur = 14; ctx.strokeStyle = light; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.quadraticCurveTo((from.x + to.x) / 2 + 15, (from.y + to.y) / 2 - 22, to.x, to.y); ctx.stroke();
      if (!this.reducedMotion.matches) for (const spark of animation.sparks) {
        ctx.fillStyle = tone; ctx.fillRect(spark.x + spark.vx * progress, spark.y + spark.vy * progress, 2.7, 2.7);
      }
    } else {
      ctx.shadowColor = '#08091a'; ctx.shadowBlur = 6;
      this.text(animation.text, animation.anchor.x, animation.anchor.y - (this.reducedMotion.matches ? 16 : 9 + progress * 44), animation.large ? 20 : 15, animation.tone);
    }
    ctx.restore();
  }
}
