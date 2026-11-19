import { runeAt } from '../core/shopEngine';
import { runeFootprint } from '../core/tactics';
import type { BattleEvent, Catalog, Rune, Run, RuneState, Slot } from '../core/types';

export interface Point { x: number; y: number }
interface Rect extends Point { width: number; height: number }
type Target = Slot | 'sell' | null;
const WIDTH = 380;
const HEIGHT = 477;
const SELL: Rect = { x: 19, y: 439, width: 342, height: 31 };
const BOARD: Rect = { x: 4, y: 4, width: 372, height: 351 };
const cellRect = ({ zone, index }: Slot): Rect => zone === 'board'
  ? { x: 19 + index % 4 * 87, y: 18 + Math.floor(index / 4) * 82, width: 81, height: 77 }
  : { x: 19 + index * 87, y: 385, width: 81, height: 46 };
const center = ({ x, y, width, height }: Rect): Point => ({ x: x + width / 2, y: y + height / 2 });
const sameSlot = (left: Slot | null, right: Slot) => left?.zone === right.zone && left.index === right.index;
const contains = (rect: Rect, point: Point) => point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
const slotList: Slot[] = [ ...Array.from({ length: 16 }, (_, index): Slot => ({ zone: 'board', index })),
  ...Array.from({ length: 4 }, (_, index): Slot => ({ zone: 'bench', index })) ];
const pigment = {
  chain: { stone: '#29413d', edge: '#638a79', ink: '#b1d9cc' },
  poison: { stone: '#393f26', edge: '#8c9c56', ink: '#d4dc9a' },
  gold: { stone: '#4c3822', edge: '#ac8050', ink: '#f0cb87' },
  amplify: { stone: '#48323a', edge: '#aa7582', ink: '#f0b8be' },
} as const;

export const runeVectors: Record<string, string> = {
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
  falling_bell: 'M13 5c0-4 6-4 6 0m-9 6c0-8 12-8 12 0v7l4 3H6l4-3Zm2 12 4 5 4-5M16 25v5',
  moss_brick: 'M3 10l13-6 13 6v13l-13 6-13-6Zm0 0 13 6 13-6m-13 6v13M8 8l13 6m-15 3 6 3m10-1 4-2',
  coin_mold: 'M4 4h24v24H4Zm19 12a7 7 0 1 0-14 0 7 7 0 1 0 14 0ZM14 14h4v4h-4Z',
  red_seal: 'M11 13V7a5 5 0 0 1 10 0v6l5 6v4H6v-4Zm-7 13h24v3H4Zm8-6 4-4 4 4',
};

interface Spark extends Point { vx: number; vy: number }
type Animation = { at: number; life: number; tone: string } & (
  { kind: 'flash'; slot: Slot } | { kind: 'link'; from: Point; to: Point; sparks: Spark[] } |
  { kind: 'float'; anchor: Point; text: string; large: boolean });

export class CanvasRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly paths = Object.fromEntries(Object.entries(runeVectors).map(([id, data]) => [id, new Path2D(data)]));
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  private readonly states = new Map<number, RuneState>();
  private animations: Animation[] = [];
  private frame = 0;
  private shakeAt = -1000;
  private size = { x: 0, y: 0, scale: 1 };
  selection: Slot | null = null;
  cursor: Slot | null = null;
  drag: { from: Slot; point: Point; target: Target } | null = null;
  sellLabel = '拖到此处回收符文';
  waveComplete = false;

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
    const { x, y, scale } = this.fit(rect);
    return { x: (clientX - rect.left - x) / scale, y: (clientY - rect.top - y) / scale };
  }

  private fit({ width, height }: { width: number; height: number }) {
    const scale = Math.min(width / WIDTH, height / HEIGHT);
    return { x: (width - WIDTH * scale) / 2, y: (height - HEIGHT * scale) / 2, scale };
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
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const pxWidth = Math.max(1, Math.round(rect.width * dpr));
    const pxHeight = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== pxWidth || canvas.height !== pxHeight) { canvas.width = pxWidth; canvas.height = pxHeight; }
    this.size = this.fit(rect);
    const { scale } = this.size;
    if (scale <= 0) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, pxWidth, pxHeight);
    const shake = this.reducedMotion.matches ? 0 : 7 * Math.max(0, 1 - (now - this.shakeAt) / 240);
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, (this.size.x + Math.sin(now / 13) * shake) * dpr, (this.size.y + Math.cos(now / 10) * shake * .45) * dpr);
    this.drawFrame();
    this.text('备战区', 19, 374, 14, '#d6c29c', 'left');
    this.text(`${this.run.bench.filter(Boolean).length} / 4`, 359, 374, 13, '#c7b28d', 'right');
    const origin = this.drag ? this.drag.target !== 'sell' && this.drag.target?.zone === 'board' ? this.drag.target : null : this.selection;
    const source = this.drag?.from ?? this.selection;
    const originRune = source && runeAt(this.run, source);
    const footprint = originRune && origin?.zone === 'board' ? runeFootprint(this.catalog[originRune.configId], origin.index) : null;
    for (const slot of slotList) {
      const bounds = cellRect(slot);
      const rune = runeAt(this.run, slot);
      const selected = sameSlot(this.selection, slot);
      const linked = slot.zone === 'board' && !!footprint?.links.has(slot.index);
      const hinted = slot.zone === 'board' && !!footprint?.effects.has(slot.index);
      const drop = this.drag?.target && this.drag.target !== 'sell' && sameSlot(this.drag.target, slot);
      const alternate = slot.zone === 'board' && (Math.floor(slot.index / 4) + slot.index % 4) % 2;
      this.tile(bounds, hinted ? '#474331' : alternate ? '#2e3228' : '#282d24', selected ? '#f7d29c' : '#66614a', 3);
      if (rune) this.drawRune(bounds, rune, this.drag && sameSlot(this.drag.from, slot) ? .31 : 1, slot.zone === 'board' ? this.states.get(slot.index) : undefined);
      else this.drawEmpty(bounds, slot);
      if (linked || hinted || selected || sameSlot(this.cursor, slot) || drop) {
        ctx.save();
        if (hinted && !linked && !selected && !drop) ctx.setLineDash([4, 3]);
        this.tile({ x: bounds.x + 1, y: bounds.y + 1, width: bounds.width - 2, height: bounds.height - 2 }, null,
          drop ? '#d0f1d3' : selected ? '#ffe1ad' : sameSlot(this.cursor, slot) ? '#fcbfaa' : linked ? '#a6dfce' : '#f1bb75', 3, 2);
        if (linked) this.text('↯', bounds.x + bounds.width - 9, bounds.y + bounds.height - 9, 13, '#a6dfce');
        ctx.restore();
      }
    }
    this.tile(SELL, this.drag?.target === 'sell' ? '#663b2d' : '#2d251e', this.drag?.target === 'sell' ? '#f6a282' : '#715446', 2);
    this.text(this.sellLabel, 190, 454, 13, '#edbaa2');
    this.animations = this.animations.filter(animation => now - animation.at < animation.life);
    for (const animation of this.animations) this.drawAnimation(animation, now);
    if (this.drag) {
      const rune = runeAt(this.run, this.drag.from);
      if (rune) this.drawRune({ x: this.drag.point.x - 33, y: this.drag.point.y - 40, width: 66, height: 66 }, rune, .92);
    }
    if (this.animations.length || shake > 0) this.invalidate();
  };

  private drawFrame() {
    const ctx = this.ctx;
    this.tile(BOARD, '#403c2c', this.waveComplete ? '#dfb16e' : '#9a8155', 5);
    this.tile({ x: 9, y: 9, width: 362, height: 341 }, '#22271e', '#746545', 3);
    ctx.strokeStyle = this.waveComplete ? '#e8c083' : '#b28d55';
    ctx.lineWidth = 1.2;
    for (const { x, y } of [{ x: 10, y: 10 }, { x: 370, y: 10 }, { x: 10, y: 349 }, { x: 370, y: 349 }]) {
      ctx.beginPath();
      ctx.moveTo(x, y - 4); ctx.lineTo(x + 4, y); ctx.lineTo(x, y + 4); ctx.lineTo(x - 4, y); ctx.closePath();
      ctx.fillStyle = '#332919'; ctx.fill(); ctx.stroke();
    }
  }

  private drawEmpty(bounds: Rect, slot: Slot) {
    const ctx = this.ctx;
    const { x, y } = center(bounds);
    ctx.strokeStyle = '#655e47';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y - 5); ctx.lineTo(x + 5, y); ctx.lineTo(x, y + 5); ctx.lineTo(x - 5, y); ctx.closePath(); ctx.stroke();
    if (slot.zone === 'board') {
      const mark = slot.index + 1;
      this.text(String(mark), bounds.x + 9, bounds.y + 10, 10, '#a5a084', 'left');
      ctx.strokeStyle = '#9f927139';
      ctx.beginPath();
      for (let grain = 0; grain < 6; grain++) {
        const startX = bounds.x + 12 + (mark * 23 + grain * 29) % 56;
        const startY = bounds.y + 18 + (mark * 31 + grain * 19) % 47;
        ctx.moveTo(startX, startY); ctx.lineTo(startX + 3 + grain % 4, startY - 2);
      }
      ctx.stroke();
    }
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
    const { archetype, name, rarity } = this.catalog[rune.configId];
    const { stone, edge, ink } = pigment[archetype];
    ctx.save(); ctx.globalAlpha = alpha;
    this.tile(rect, stone, edge, 4);
    this.tile({ x: rect.x + 3, y: rect.y + 3, width: rect.width - 6, height: rect.height - 6 }, null, `${edge}86`, 2);
    const compact = rect.height < 50;
    const iconSize = compact ? .64 : .95;
    ctx.save(); ctx.translate(rect.x + rect.width / 2 - 16 * iconSize, rect.y + rect.height / 2 - 16 * iconSize - (compact ? 0 : 3)); ctx.scale(iconSize, iconSize);
    ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = ink;
    ctx.shadowColor = '#000a'; ctx.shadowOffsetY = 2;
    const path = this.paths[rune.configId];
    if (path) ctx.stroke(path);
    ctx.restore();
    this.text('★'.repeat(rune.star), rect.x + 6, rect.y + 10, compact ? 9 : 11, '#ffe499', 'left');
    if (rarity !== 'common') this.text('◆', rect.x + rect.width - 9, rect.y + 10, 9, rarity === 'epic' ? '#eec3ff' : '#b8d9ff');
    if (!compact && !state?.chargeStacks && (!state || state.tempMult <= 1)) {
      this.text(name, rect.x + rect.width / 2, rect.y + rect.height - 12, 11, '#f4e9ed');
    }
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
