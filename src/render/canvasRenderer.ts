import { bossHealth } from '../core/battleEngine';
import { runeAt } from '../core/shopEngine';
import { runeFootprint } from '../core/tactics';
import type { BattleEvent, Catalog, Rune, Run, RuneState, Slot } from '../core/types';
import { drawRuneGlyph, RUNE_GLYPHS } from './glyphs';

export { RUNE_GLYPHS as runeVectors };

export interface Point { x: number; y: number }
interface Rect extends Point { width: number; height: number }
type Target = Slot | 'sell' | null;

const WIDTH = 380;
const HEIGHT = 477;
const SELL: Rect = { x: 19, y: 439, width: 342, height: 31 };
const BOARD: Rect = { x: 4, y: 4, width: 372, height: 351 };

const cellRect = ({ zone, index }: Slot): Rect => zone === 'board'
  ? { x: 19 + (index % 4) * 87, y: 18 + Math.floor(index / 4) * 82, width: 81, height: 77 }
  : { x: 19 + index * 87, y: 385, width: 81, height: 46 };

const center = ({ x, y, width, height }: Rect): Point => ({ x: x + width / 2, y: y + height / 2 });
const sameSlot = (left: Slot | null, right: Slot) => left?.zone === right.zone && left.index === right.index;
const contains = (rect: Rect, point: Point) =>
  point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;

const slotList: Slot[] = [
  ...Array.from({ length: 16 }, (_, index): Slot => ({ zone: 'board', index })),
  ...Array.from({ length: 4 }, (_, index): Slot => ({ zone: 'bench', index })),
];

// 「玄墨鎏金」四大流派专属质感色盘
const pigment = {
  chain: {
    stone: '#0c1520',
    edge: '#1e3a8a',
    ink: '#38bdf8',
    glow: '#38bdf8',
    accent: '#f97316',
  },
  poison: {
    stone: '#081710',
    edge: '#064e3b',
    ink: '#34d399',
    glow: '#34d399',
    accent: '#10b981',
  },
  gold: {
    stone: '#1a1309',
    edge: '#78350f',
    ink: '#f59e0b',
    glow: '#fbbf24',
    accent: '#d4af37',
  },
  amplify: {
    stone: '#1c0a13',
    edge: '#831843',
    ink: '#e11d48',
    glow: '#f43f5e',
    accent: '#c084fc',
  },
} as const;

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const sign = value < 0 ? '−' : '';
  const abs = Math.abs(value);
  if (abs < 10_000) return `${sign}${Math.round(abs).toLocaleString('zh-CN')}`;
  if (abs < 100_000_000) {
    const wan = abs / 10_000;
    const formatted = wan >= 100 ? wan.toFixed(1) : wan.toFixed(2);
    return `${sign}${parseFloat(formatted)}万`;
  }
  const yi = abs / 100_000_000;
  const formatted = yi >= 100 ? yi.toFixed(1) : yi.toFixed(2);
  return `${sign}${parseFloat(formatted)}亿`;
}

interface Spark extends Point { vx: number; vy: number }
export type ParticleKind = 'spark' | 'poison_mist' | 'bronze_shard' | 'coin' | 'confetti';

export interface JuiceParticle {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ax: number;
  ay: number;
  size: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
  rot: number;
  rotSpeed: number;
  drag: number;
  shape?: 'square' | 'circle' | 'triangle' | 'coin' | 'ribbon';
}

type Animation = { at: number; life: number; tone: string } & (
  | { kind: 'flash'; slot: Slot; merge?: boolean }
  | { kind: 'link'; from: Point; to: Point; sparks: Spark[] }
  | { kind: 'float'; anchor: Point; text: string; large: boolean; vx: number; vy: number; prefix?: string }
  | { kind: 'scan'; slot: Slot }
  | { kind: 'merge_burst'; anchor: Point }
);

export class CanvasRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly reducedMotion = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  private readonly states = new Map<number, RuneState>();
  private readonly popScales = new Map<number, { at: number; amp: number }>();
  private animations: Animation[] = [];
  private particles: JuiceParticle[] = [];
  private lastFrameTime = performance.now();
  private readonly MAX_PARTICLES = 220;
  private frame = 0;
  private shakeAt = -1000;
  private pulseAt = -1000;
  private size = { x: 0, y: 0, scale: 1 };
  private comboCount = 0;
  private activeScanSlot: Slot | null = null;
  get currentScanSlot(): Slot | null { return this.activeScanSlot; }
  selection: Slot | null = null;
  cursor: Slot | null = null;
  drag: { from: Slot; point: Point; target: Target; isTouch?: boolean } | null = null;
  sellLabel = '拖到此处回收符文';
  waveComplete = false;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private run: Run,
    private readonly catalog: Catalog
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D unavailable');
    this.ctx = ctx;
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => this.invalidate()).observe(canvas);
    }
    this.invalidate();
  }

  get currentRun(): Run { return this.run; }

  setRun(run: Run) {
    this.run = run;
    this.invalidate();
  }

  setCombo(combo: number) {
    this.comboCount = combo;
    this.invalidate();
  }

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

  clearEffects() {
    this.animations = [];
    this.particles = [];
    this.states.clear();
    this.popScales.clear();
    this.shakeAt = -1000;
    this.pulseAt = -1000;
    this.comboCount = 0;
    this.activeScanSlot = null;
    this.invalidate();
  }

  flash(slot: Slot, tone: string, merge = false) {
    const at = performance.now();
    this.animations.push({ kind: 'flash', at, life: merge ? 750 : 360, slot, tone, merge });
    this.popScales.set(slot.index + (slot.zone === 'bench' ? 100 : 0), { at, amp: merge ? 0.35 : 0.18 });

    if (merge) {
      const anchor = center(cellRect(slot));
      this.spawnCritSparks(anchor);
      this.animations.push({ kind: 'merge_burst', at, life: 820, anchor, tone: '#fde047' });
      this.animations.push({
        kind: 'float',
        at,
        life: 900,
        anchor: { x: anchor.x, y: anchor.y - 12 },
        text: '升星！',
        tone: '#fde047',
        large: true,
        vx: 0,
        vy: 24,
      });
    }
    this.invalidate();
  }

  pulseBorder() {
    this.pulseAt = performance.now();
    this.invalidate();
  }

  play(event: BattleEvent) {
    const at = performance.now();
    const boardSlot = (index: number): Slot => ({ zone: 'board', index });
    const anchor = (index: number | null) =>
      index === null ? { x: WIDTH / 2, y: 55 } : center(cellRect(boardSlot(index)));
    const color = (index: number) =>
      this.catalog[this.run.board[index]?.configId ?? '']?.color ?? '#38bdf8';

    switch (event.type) {
      case 'CELL_ACTIVATE':
        this.comboCount = event.combo;
        this.activeScanSlot = boardSlot(event.index);
        this.animations.push({ kind: 'scan', at, life: 280, slot: boardSlot(event.index), tone: '#fde047' });
        this.flash(boardSlot(event.index), color(event.index));
        break;

      case 'CHAIN_LINK': {
        const to = anchor(event.to);
        const from = anchor(event.from);
        const sparks: Spark[] = Array.from({ length: 14 }, (_, i) => {
          const angle = (i / 14) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
          const velocity = 16 + (i % 4) * 9;
          return { ...to, vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity };
        });
        this.animations.push({
          kind: 'link',
          at,
          life: 420,
          from,
          to,
          sparks,
          tone: event.tutorial ? '#fbbf24' : '#38bdf8',
        });
        break;
      }

      case 'DAMAGE': {
        if (event.crit) {
          this.shakeAt = at;
          this.spawnCritSparks(anchor(event.source));
        }
        const maxHp = Math.max(1, bossHealth(this.run.wave));
        const dmgRatio = event.amount / maxHp;
        const isPoison = event.kind === 'poison';
        if (isPoison) {
          this.spawnPoisonMist(anchor(event.source));
        }
        const isCrit = event.crit;
        const isLarge = isCrit || isPoison || dmgRatio >= 0.08;
        const isHuge = isCrit || dmgRatio >= 0.18;
        const tone = isCrit ? '#fde047' : isPoison ? '#34d399' : '#f1ece1';
        const prefix = isCrit ? '暴击！−' : isPoison ? '剧毒爆！−' : event.kind === 'tutorial' ? '共鸣 ' : '−';
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.8;
        const speed = 24 + Math.random() * 12;
        this.animations.push({
          kind: 'float',
          at,
          life: isHuge ? 860 : isLarge ? 760 : 640,
          anchor: anchor(event.source),
          text: `${prefix}${formatNumber(event.amount)}`,
          tone,
          large: isLarge,
          prefix: isCrit ? 'crit' : isPoison ? 'poison' : undefined,
          vx: Math.cos(angle) * speed * 0.5,
          vy: Math.abs(Math.sin(angle) * speed),
        });
        break;
      }

      case 'GOLD': {
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.6;
        this.animations.push({
          kind: 'float',
          at,
          life: 680,
          anchor: anchor(event.source),
          text: `${event.delta >= 0 ? '+' : '−'}${formatNumber(Math.abs(event.delta))} 金`,
          tone: '#f59e0b',
          large: false,
          vx: Math.cos(angle) * 12,
          vy: 20,
        });
        break;
      }

      case 'RUNE_STATE':
        this.states.set(event.index, event.state);
        break;
    }
    this.invalidate();
  }

  invalidate() {
    if (!this.frame) this.frame = requestAnimationFrame(this.draw);
  }

  private readonly draw = (now: number) => {
    this.frame = 0;
    const { canvas, ctx } = this;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const pxWidth = Math.max(1, Math.round(rect.width * dpr));
    const pxHeight = Math.max(1, Math.round(rect.height * dpr));

    if (canvas.width !== pxWidth || canvas.height !== pxHeight) {
      canvas.width = pxWidth;
      canvas.height = pxHeight;
    }
    this.size = this.fit(rect);
    const { scale } = this.size;
    if (scale <= 0) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, pxWidth, pxHeight);

    const shake = this.reducedMotion.matches
      ? 0
      : 8 * Math.max(0, 1 - (now - this.shakeAt) / 250);
    const shakeX = Math.sin(now / 13) * shake;
    const shakeY = Math.cos(now / 10) * shake * 0.45;

    ctx.setTransform(
      scale * dpr,
      0,
      0,
      scale * dpr,
      (this.size.x + shakeX) * dpr,
      (this.size.y + shakeY) * dpr
    );

    // 1. 底座与缓慢旋转星轨八角阵纹
    this.drawFrame(now);

    // 2. 备战区托盘标题与计数
    this.text('备战区', 22, 373, 12, '#94a3b8', 'left', true);
    this.text(
      `${this.run.bench.filter(Boolean).length} / 4`,
      358,
      373,
      12,
      '#d4af37',
      'right',
      true
    );

    const origin = this.drag
      ? this.drag.target !== 'sell' && this.drag.target?.zone === 'board'
        ? this.drag.target
        : null
      : this.selection;
    const source = this.drag?.from ?? this.selection;
    const originRune = source && runeAt(this.run, source);
    const footprint =
      originRune && origin?.zone === 'board'
        ? runeFootprint(this.catalog[originRune.configId], origin.index)
        : null;

    // 3. 渲染各个格子（棋盘 16 格 + 备战 4 格）
    for (const slot of slotList) {
      const bounds = cellRect(slot);
      const rune = runeAt(this.run, slot);
      const selected = sameSlot(this.selection, slot);
      const linked = slot.zone === 'board' && !!footprint?.links.has(slot.index);
      const hinted = slot.zone === 'board' && !!footprint?.effects.has(slot.index);
      const drop =
        this.drag?.target &&
        this.drag.target !== 'sell' &&
        sameSlot(this.drag.target, slot);
      const tileMod =
        slot.zone === 'board' ? this.run.tileModifiers?.[slot.index] : undefined;

      // 弹簧缩放动效计算
      const popKey = slot.index + (slot.zone === 'bench' ? 100 : 0);
      const pop = this.popScales.get(popKey);
      let scalePop = 1.0;
      if (pop) {
        const dt = (now - pop.at) / 1000;
        if (dt < 0.35) {
          scalePop = 1 + pop.amp * Math.sin(dt * 20) * Math.exp(-dt * 8);
        } else {
          this.popScales.delete(popKey);
        }
      }

      // 底槽绘制（内凹石槽质感）
      this.drawSlotBase(bounds, slot, tileMod, hinted, selected, now);

      // 阵牌绘制
      if (rune) {
        const isDraggingSource = this.drag && sameSlot(this.drag.from, slot);
        const alpha = isDraggingSource ? 0.28 : 1.0;
        const state =
          slot.zone === 'board' ? this.states.get(slot.index) : undefined;
        this.drawEntityTile(bounds, rune, alpha, state, scalePop, selected, now);
      } else {
        this.drawEmptySlot(bounds, slot, tileMod, now);
      }

      // 联动瞄准与高亮流动蚂蚁线 (Marching Ants)
      if (linked || hinted || selected || sameSlot(this.cursor, slot) || drop) {
        ctx.save();
        if (drop) {
          ctx.strokeStyle = '#6ee7b7';
          ctx.lineWidth = 2.5;
          ctx.shadowColor = '#34d399';
          ctx.shadowBlur = 10;
          this.roundRect(bounds.x - 1, bounds.y - 1, bounds.width + 2, bounds.height + 2, 6);
          ctx.stroke();
        } else if (selected) {
          ctx.strokeStyle = '#fde047';
          ctx.lineWidth = 2.4;
          ctx.shadowColor = '#d4af37';
          ctx.shadowBlur = 12;
          this.roundRect(bounds.x - 1, bounds.y - 1, bounds.width + 2, bounds.height + 2, 6);
          ctx.stroke();
        } else if (linked) {
          // 连锁目标：流动光弧实线
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2;
          ctx.shadowColor = '#38bdf8';
          ctx.shadowBlur = 8;
          this.roundRect(bounds.x, bounds.y, bounds.width, bounds.height, 5);
          ctx.stroke();
          // 角标能量符号
          this.text('↯', bounds.x + bounds.width - 10, bounds.y + bounds.height - 10, 14, '#38bdf8');
        } else if (hinted) {
          // 作用范围：流动蚂蚁线
          ctx.setLineDash([5, 4]);
          ctx.lineDashOffset = -now * 0.025;
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 1.8;
          this.roundRect(bounds.x, bounds.y, bounds.width, bounds.height, 5);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // 4. 底部回收槽（暗金内凹托槽）
    this.drawSellSlot(now);

    // 5. 动画层（光幕、贝塞尔连锁光弧、伤害飘字、升星星芒）
    this.animations = this.animations.filter(
      animation => now - animation.at < animation.life
    );
    for (const animation of this.animations) {
      this.drawAnimation(animation, now);
    }

    // 5.1 原生高性能粒子池（金芒火星、翡翠毒雾、青铜碎屑、金币雨与彩带）
    this.updateAndDrawParticles(now);

    // 6. 战斗阶段动态 COMBO 计数器展示
    this.drawComboDisplay(now);

    // 7. 拖拽实体玉牌（悬浮 1.08x 放大 + 投射深色阴影）
    if (this.drag) {
      const rune = runeAt(this.run, this.drag.from);
      const touchLift = this.drag.isTouch ? 50 / scale : 0;
      if (rune) {
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
        ctx.shadowBlur = 20;
        ctx.shadowOffsetY = 10;
        const dragRect: Rect = {
          x: this.drag.point.x - 38,
          y: this.drag.point.y - 44 - touchLift,
          width: 76,
          height: 72,
        };
        this.drawEntityTile(dragRect, rune, 0.96, undefined, 1.08, true, now);
        ctx.restore();
      }
    }

    const pulseActive = now - this.pulseAt < 320;
    if (
      !this.reducedMotion.matches ||
      this.animations.length ||
      this.particles.length ||
      shake > 0 ||
      pulseActive ||
      this.comboCount > 0 ||
      this.drag ||
      this.selection ||
      this.popScales.size
    ) {
      this.invalidate();
    }
    this.lastFrameTime = now;
  };

  /**
   * 绘制法阵底座：内凹漆石底板 + 缓慢旋转几何星轨罗盘与八角阵纹
   */
  private drawFrame(now = 0) {
    const ctx = this.ctx;

    // 4x4 外框漆石基座
    const boardGrad = ctx.createLinearGradient(BOARD.x, BOARD.y, BOARD.x, BOARD.y + BOARD.height);
    boardGrad.addColorStop(0, '#131722');
    boardGrad.addColorStop(1, '#0b0e14');

    ctx.save();
    ctx.fillStyle = boardGrad;
    ctx.strokeStyle = this.waveComplete ? '#fde047' : '#785a28';
    ctx.lineWidth = 1.5;
    this.roundRect(BOARD.x, BOARD.y, BOARD.width, BOARD.height, 8);
    ctx.fill();
    ctx.stroke();

    // 内嵌微弱金边框
    ctx.strokeStyle = '#d4af3726';
    ctx.lineWidth = 1;
    this.roundRect(BOARD.x + 4, BOARD.y + 4, BOARD.width - 8, BOARD.height - 8, 6);
    ctx.stroke();

    // 绘制极低透明度缓慢旋转的几何星轨罗盘与八角阵纹
    this.drawCelestialCompass(now);

    // 四角折角鎏金装饰角标
    const corners = [
      { x: BOARD.x + 8, y: BOARD.y + 8 },
      { x: BOARD.x + BOARD.width - 8, y: BOARD.y + 8 },
      { x: BOARD.x + 8, y: BOARD.y + BOARD.height - 8 },
      { x: BOARD.x + BOARD.width - 8, y: BOARD.y + BOARD.height - 8 },
    ];
    ctx.strokeStyle = this.waveComplete ? '#fde047' : '#d4af37';
    ctx.lineWidth = 1.2;
    for (const { x, y } of corners) {
      ctx.beginPath();
      ctx.moveTo(x - 3, y);
      ctx.lineTo(x, y - 3);
      ctx.lineTo(x + 3, y);
      ctx.lineTo(x, y + 3);
      ctx.closePath();
      ctx.fillStyle = '#1e160a';
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();

    // Hit-stop 边缘受击高亮闪白
    const pulseProgress = Math.max(0, 1 - (now - this.pulseAt) / 320);
    if (pulseProgress > 0) {
      ctx.save();
      ctx.strokeStyle = `rgba(253, 224, 71, ${pulseProgress * 0.9})`;
      ctx.lineWidth = 3 + pulseProgress * 4;
      ctx.shadowColor = '#fde047';
      ctx.shadowBlur = 18 * pulseProgress;
      this.roundRect(BOARD.x - 2, BOARD.y - 2, BOARD.width + 4, BOARD.height + 4, 9);
      ctx.stroke();
      ctx.restore();
    }

    // 连击热度屏幕边缘热力光晕 (连击 >= 18 赤金色热力光晕)
    if (this.comboCount >= 18) {
      const heatPulse = Math.sin(now * 0.008) * 0.5 + 0.5;
      const heatAlpha = 0.09 + heatPulse * 0.08;

      ctx.save();
      // 上边缘赤焰光晕
      const topGrad = ctx.createLinearGradient(0, 0, 0, 48);
      topGrad.addColorStop(0, `rgba(225, 29, 72, ${heatAlpha * 1.5})`);
      topGrad.addColorStop(1, 'rgba(225, 29, 72, 0)');
      ctx.fillStyle = topGrad;
      ctx.fillRect(0, 0, WIDTH, 48);

      // 下边缘赤金光晕
      const botGrad = ctx.createLinearGradient(0, HEIGHT, 0, HEIGHT - 48);
      botGrad.addColorStop(0, `rgba(249, 115, 22, ${heatAlpha * 1.5})`);
      botGrad.addColorStop(1, 'rgba(249, 115, 22, 0)');
      ctx.fillStyle = botGrad;
      ctx.fillRect(0, HEIGHT - 48, WIDTH, 48);

      // 左边缘
      const leftGrad = ctx.createLinearGradient(0, 0, 32, 0);
      leftGrad.addColorStop(0, `rgba(225, 29, 72, ${heatAlpha})`);
      leftGrad.addColorStop(1, 'rgba(225, 29, 72, 0)');
      ctx.fillStyle = leftGrad;
      ctx.fillRect(0, 0, 32, HEIGHT);

      // 右边缘
      const rightGrad = ctx.createLinearGradient(WIDTH, 0, WIDTH - 32, 0);
      rightGrad.addColorStop(0, `rgba(249, 115, 22, ${heatAlpha})`);
      rightGrad.addColorStop(1, 'rgba(249, 115, 22, 0)');
      ctx.fillStyle = rightGrad;
      ctx.fillRect(WIDTH - 32, 0, 32, HEIGHT);
      ctx.restore();
    }
  }

  /**
   * 绘制底座星轨罗盘与八角阵纹（透明度 0.06 - 0.12，转速随连击加快）
   */
  private drawCelestialCompass(now: number) {
    const ctx = this.ctx;
    const cx = BOARD.x + BOARD.width / 2;
    const cy = BOARD.y + BOARD.height / 2;
    const baseSpeed = 0.00025;
    const comboBoost = Math.min(this.comboCount, 25) * 0.00015;
    const angle = now * (baseSpeed + comboBoost);
    const alpha = 0.06 + Math.min(this.comboCount, 20) * 0.003;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.strokeStyle = `rgba(212, 175, 55, ${alpha})`;
    ctx.lineWidth = 1;

    // 同心星轨圆环
    for (const r of [150, 126, 92, 54]) {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 八角阵纹星线
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      ctx.moveTo(Math.cos(a) * 45, Math.sin(a) * 45);
      ctx.lineTo(Math.cos(a) * 152, Math.sin(a) * 152);
    }
    ctx.stroke();

    // 刻度刻线
    ctx.beginPath();
    for (let i = 0; i < 24; i++) {
      const a = (i * Math.PI) / 12;
      ctx.moveTo(Math.cos(a) * 145, Math.sin(a) * 145);
      ctx.lineTo(Math.cos(a) * 150, Math.sin(a) * 150);
    }
    ctx.stroke();

    ctx.restore();
  }

  /**
   * 绘制格子底座（内凹石槽质感 + 四角准星）
   */
  private drawSlotBase(
    bounds: Rect,
    slot: Slot,
    tileMod: string | undefined,
    _hinted: boolean,
    _selected: boolean,
    now: number
  ) {
    const ctx = this.ctx;
    const isBoard = slot.zone === 'board';

    ctx.save();
    // 内凹石槽渐变底
    const slotGrad = ctx.createRadialGradient(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
      4,
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
      bounds.width * 0.7
    );
    slotGrad.addColorStop(0, '#10141f');
    slotGrad.addColorStop(1, '#090c12');

    ctx.fillStyle = slotGrad;
    this.roundRect(bounds.x, bounds.y, bounds.width, bounds.height, 5);
    ctx.fill();

    // 细微凹槽内阴影边
    ctx.strokeStyle = '#1e2433';
    ctx.lineWidth = 1;
    this.roundRect(bounds.x, bounds.y, bounds.width, bounds.height, 5);
    ctx.stroke();

    // 特殊阵眼动态辨识
    if (tileMod === 'li_fire') {
      // 离火位：四角火纹切角 + 余烬微粒
      ctx.strokeStyle = '#ef444499';
      ctx.lineWidth = 1.6;
      this.drawCornerBrackets(bounds, 8, '#f97316');

      // 余烬火星
      const emberY = bounds.y + bounds.height - 8 - Math.abs(Math.sin(now * 0.003 + slot.index)) * 14;
      const emberX = bounds.x + bounds.width / 2 + Math.sin(now * 0.004 + slot.index * 2) * 16;
      ctx.fillStyle = '#f97316cc';
      ctx.beginPath();
      ctx.arc(emberX, emberY, 1.6, 0, Math.PI * 2);
      ctx.fill();
    } else if (tileMod === 'xuan_ice') {
      // 玄冰位：淡青冰晶折射高光 + 细霜边线
      const iceGrad = ctx.createLinearGradient(bounds.x, bounds.y, bounds.x + bounds.width, bounds.y + bounds.height);
      iceGrad.addColorStop(0, 'rgba(56, 189, 248, 0.14)');
      iceGrad.addColorStop(0.5, 'rgba(224, 242, 254, 0.04)');
      iceGrad.addColorStop(1, 'rgba(56, 189, 248, 0.12)');
      ctx.fillStyle = iceGrad;
      this.roundRect(bounds.x + 1, bounds.y + 1, bounds.width - 2, bounds.height - 2, 4);
      ctx.fill();

      this.drawCornerBrackets(bounds, 7, '#38bdf8');
    } else if (tileMod === 'spirit_gathering') {
      // 聚灵位：缓慢呼吸金色细圆阵环
      const pulseR = 18 + Math.sin(now * 0.003 + slot.index) * 3;
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, pulseR, 0, Math.PI * 2);
      ctx.stroke();

      this.drawCornerBrackets(bounds, 7, '#f59e0b');
    } else if (isBoard) {
      // 普通空格：极淡准星刻线
      this.drawCornerBrackets(bounds, 5, '#334155');
    }

    ctx.restore();
  }

  /**
   * 绘制空格提示与扫描序号（01 - 16）
   */
  private drawEmptySlot(bounds: Rect, slot: Slot, tileMod: string | undefined, _now: number) {
    if (slot.zone !== 'board') return;
    const ctx = this.ctx;
    const mark = String(slot.index + 1).padStart(2, '0');

    // 左上角淡色扫描序号
    this.text(mark, bounds.x + 12, bounds.y + 11, 9.5, '#475569', 'left', true);

    // 中心微弱准星点
    const { x, y } = center(bounds);
    ctx.save();
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 3, y);
    ctx.lineTo(x + 3, y);
    ctx.moveTo(x, y - 3);
    ctx.lineTo(x, y + 3);
    ctx.stroke();
    ctx.restore();

    // 阵眼中文徽记
    if (tileMod) {
      const badgeText = tileMod === 'li_fire' ? '离火位' : tileMod === 'xuan_ice' ? '玄冰位' : '聚灵位';
      const badgeColor = tileMod === 'li_fire' ? '#f87171' : tileMod === 'xuan_ice' ? '#38bdf8' : '#fbbf24';
      this.text(badgeText, bounds.x + bounds.width - 10, bounds.y + 11, 8.5, badgeColor, 'right');
    }
  }

  /**
   * 绘制实体“玉牌/阵牌”样式的符文
   */
  private drawEntityTile(
    bounds: Rect,
    rune: Rune,
    alpha: number,
    state?: RuneState,
    scalePop = 1.0,
    selected = false,
    now = 0
  ) {
    const ctx = this.ctx;
    const config = this.catalog[rune.configId];
    if (!config) return;
    const { archetype, name, rarity } = config;
    const p = pigment[archetype] ?? pigment.chain;
    const compact = bounds.height < 52;

    ctx.save();
    ctx.globalAlpha = alpha;

    // 弹簧放大变换
    if (scalePop !== 1.0) {
      const cx = bounds.x + bounds.width / 2;
      const cy = bounds.y + bounds.height / 2;
      ctx.translate(cx, cy);
      ctx.scale(scalePop, scalePop);
      ctx.translate(-cx, -cy);
    }

    // 1. 玉牌底板：暗色径向渐变
    const tileGrad = ctx.createRadialGradient(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
      6,
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
      bounds.width * 0.75
    );
    tileGrad.addColorStop(0, p.stone);
    tileGrad.addColorStop(1, '#090c12');

    ctx.fillStyle = tileGrad;
    this.roundRect(bounds.x + 1, bounds.y + 1, bounds.width - 2, bounds.height - 2, 5);
    ctx.fill();

    // 细微内描边
    ctx.strokeStyle = `${p.ink}26`;
    ctx.lineWidth = 1;
    this.roundRect(bounds.x + 2, bounds.y + 2, bounds.width - 4, bounds.height - 4, 4);
    ctx.stroke();

    // 2. 按稀有度区分外框与四角纹饰
    if (rarity === 'epic') {
      // 史诗：鎏金双线刻角框
      ctx.strokeStyle = '#d4af37';
      ctx.lineWidth = 1.5;
      this.roundRect(bounds.x + 1, bounds.y + 1, bounds.width - 2, bounds.height - 2, 5);
      ctx.stroke();

      // 内金线
      ctx.strokeStyle = '#fde04755';
      ctx.lineWidth = 1;
      this.roundRect(bounds.x + 3, bounds.y + 3, bounds.width - 6, bounds.height - 6, 3);
      ctx.stroke();

      this.drawCornerBrackets(bounds, 8, '#fde047');
    } else if (rarity === 'rare') {
      // 罕见：碧玉流光框
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 1.3;
      this.roundRect(bounds.x + 1, bounds.y + 1, bounds.width - 2, bounds.height - 2, 5);
      ctx.stroke();

      this.drawCornerBrackets(bounds, 6, '#34d399');
    } else {
      // 普通：素银青铁框
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1.1;
      this.roundRect(bounds.x + 1, bounds.y + 1, bounds.width - 2, bounds.height - 2, 5);
      ctx.stroke();
    }

    // 3. 绘制中心纯 Canvas 矢量图腾（三层高光）
    const iconSize = compact ? 22 : 28;
    const iconCy = bounds.y + (compact ? bounds.height / 2 - 2 : 27);
    drawRuneGlyph(
      ctx,
      rune.configId,
      archetype,
      bounds.x + bounds.width / 2,
      iconCy,
      iconSize,
      p.ink,
      selected ? 1.4 : 0.9
    );

    // 4. 星级展示升级为底部居中镶嵌的发光星钻与皇冠
    this.drawStarDiamonds(bounds, rune.star, compact, now);

    // 5. 符文名称（非紧凑时，居中于图腾与星钻之间）
    if (!compact && (!state || (!state.chargeStacks && state.tempMult <= 1))) {
      this.text(
        name,
        bounds.x + bounds.width / 2,
        bounds.y + 53,
        9.5,
        '#f1ece1',
        'center'
      );
    }

    // 6. 充能、倍率、聚灵紧凑胶囊徽章贴在角落
    if (state?.chargeStacks) {
      this.drawPillBadge(
        bounds.x + 4,
        bounds.y + bounds.height - 17,
        `${state.chargeStacks}充`,
        '#38bdf8',
        '#0c1e30cc'
      );
    }

    if (state && state.tempMult > 1) {
      const text = `×${+state.tempMult.toFixed(1)}`;
      const w = Math.max(18, text.length * 5.8 + 8);
      this.drawPillBadge(
        bounds.x + bounds.width - w - 4,
        bounds.y + 4,
        text,
        '#f59e0b',
        '#221606cc'
      );
    }

    if (rune.bonusPower) {
      this.drawPillBadge(
        bounds.x + 4,
        bounds.y + 4,
        `+${rune.bonusPower}`,
        '#fbbf24',
        '#1f1807cc'
      );
    }

    // 3 星缓慢绕边流光
    if (rune.star >= 3) {
      const perimeter = (bounds.width + bounds.height) * 2;
      const offset = (now * 0.08) % perimeter;
      ctx.save();
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([12, perimeter - 12]);
      ctx.lineDashOffset = -offset;
      ctx.shadowColor = '#fde047';
      ctx.shadowBlur = 8;
      this.roundRect(bounds.x + 1, bounds.y + 1, bounds.width - 2, bounds.height - 2, 5);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }

  /**
   * 绘制星级星钻（纯 Canvas 几何发光菱石与皇冠）
   */
  private drawStarDiamonds(bounds: Rect, star: number, compact: boolean, _now: number) {
    const ctx = this.ctx;
    const y = bounds.y + bounds.height - (compact ? 6 : 9);

    if (star === 3) {
      // 3星鎏金皇冠微光
      ctx.save();
      const cx = bounds.x + bounds.width / 2;
      ctx.translate(cx, y - 1);
      ctx.shadowColor = '#fde047';
      ctx.shadowBlur = 8;
      ctx.fillStyle = '#fde047';
      ctx.strokeStyle = '#d4af37';
      ctx.lineWidth = 0.9;

      // 3峰皇冠路径
      ctx.beginPath();
      ctx.moveTo(-7, 2.5);
      ctx.lineTo(-8, -2);
      ctx.lineTo(-4, 0);
      ctx.lineTo(0, -4.5);
      ctx.lineTo(4, 0);
      ctx.lineTo(8, -2);
      ctx.lineTo(7, 2.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // 3峰珍珠高光点
      ctx.fillStyle = '#ffffff';
      for (const [px, py] of [[-8, -2], [0, -4.5], [8, -2]]) {
        ctx.beginPath();
        ctx.arc(px, py, 0.9, 0, Math.PI * 2);
        ctx.fill();
      }

      // 底边金箍
      ctx.strokeStyle = '#785a28';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(-6, 2);
      ctx.lineTo(6, 2);
      ctx.stroke();

      ctx.restore();
      return;
    }

    const spacing = 8;
    const startX = bounds.x + bounds.width / 2 - ((star - 1) * spacing) / 2;

    for (let i = 0; i < star; i++) {
      const sx = startX + i * spacing;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(sx, y - 3);
      ctx.lineTo(sx + 2.4, y);
      ctx.lineTo(sx, y + 3);
      ctx.lineTo(sx - 2.4, y);
      ctx.closePath();

      if (star === 1) {
        ctx.fillStyle = '#e2e8f0';
        ctx.strokeStyle = '#94a3b8';
      } else {
        ctx.fillStyle = '#34d399';
        ctx.strokeStyle = '#10b981';
        ctx.shadowColor = '#34d399';
        ctx.shadowBlur = 6;
      }

      ctx.lineWidth = 0.8;
      ctx.fill();
      ctx.stroke();

      // 顶点白色高光
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(sx, y - 0.5, 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /**
   * 角落胶囊徽章
   */
  private drawPillBadge(
    x: number,
    y: number,
    text: string,
    strokeColor: string,
    bgColor: string
  ) {
    const ctx = this.ctx;
    ctx.save();
    const w = Math.max(18, text.length * 5.8 + 8);
    const h = 13;

    ctx.fillStyle = bgColor;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1;
    this.roundRect(x, y, w, h, 3);
    ctx.fill();
    ctx.stroke();

    this.text(text, x + w / 2, y + h / 2, 8.5, strokeColor, 'center', true);
    ctx.restore();
  }

  /**
   * 绘制四角折角准星 (Corner Brackets)
   */
  private drawCornerBrackets(rect: Rect, len: number, color: string) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.beginPath();

    // 左上
    ctx.moveTo(rect.x + len, rect.y + 2);
    ctx.lineTo(rect.y + 2, rect.y + 2);
    ctx.moveTo(rect.x + 2, rect.y + len);
    ctx.lineTo(rect.x + 2, rect.y + 2);

    // 右上
    ctx.moveTo(rect.x + rect.width - len, rect.y + 2);
    ctx.lineTo(rect.x + rect.width - 2, rect.y + 2);
    ctx.lineTo(rect.x + rect.width - 2, rect.y + len);

    // 左下
    ctx.moveTo(rect.x + 2, rect.y + rect.height - len);
    ctx.lineTo(rect.x + 2, rect.y + rect.height - 2);
    ctx.lineTo(rect.x + len, rect.y + rect.height - 2);

    // 右下
    ctx.moveTo(rect.x + rect.width - len, rect.y + rect.height - 2);
    ctx.lineTo(rect.x + rect.width - 2, rect.y + rect.height - 2);
    ctx.lineTo(rect.x + rect.width - 2, rect.y + rect.height - len);

    ctx.stroke();
    ctx.restore();
  }

  /**
   * 绘制底部回收槽
   */
  private drawSellSlot(_now: number) {
    const ctx = this.ctx;
    const hovered = this.drag?.target === 'sell';

    ctx.save();
    const grad = ctx.createLinearGradient(SELL.x, SELL.y, SELL.x, SELL.y + SELL.height);
    grad.addColorStop(0, hovered ? '#451a1a' : '#141822');
    grad.addColorStop(1, hovered ? '#2a0e0e' : '#0c0f16');

    ctx.fillStyle = grad;
    ctx.strokeStyle = hovered ? '#ef4444' : '#785a28';
    ctx.lineWidth = hovered ? 1.8 : 1.2;
    this.roundRect(SELL.x, SELL.y, SELL.width, SELL.height, 5);
    ctx.fill();
    ctx.stroke();

    // 居中文案与回收图标
    this.text(
      this.sellLabel,
      SELL.x + SELL.width / 2,
      SELL.y + SELL.height / 2,
      11.5,
      hovered ? '#fca5a5' : '#d4af37',
      'center',
      true
    );
    ctx.restore();
  }

  /**
   * 绘制动态 COMBO 计数器（连击大于等于 8 次鎏金，大于等于 18 次赤金弹跳）
   */
  private drawComboDisplay(now: number) {
    if (this.comboCount < 2) return;
    const ctx = this.ctx;
    const combo = this.comboCount;

    const isGilded = combo >= 8 && combo < 18;
    const isVermilion = combo >= 18;

    const color = isVermilion ? '#f97316' : isGilded ? '#fde047' : '#38bdf8';
    const borderColor = isVermilion ? '#e11d48' : isGilded ? '#d4af37' : '#0284c7';
    const bgColor = isVermilion
      ? 'rgba(28, 10, 19, 0.94)'
      : isGilded
        ? 'rgba(26, 19, 9, 0.94)'
        : 'rgba(12, 21, 32, 0.94)';

    ctx.save();
    const cx = BOARD.x + BOARD.width - 56;
    const cy = 13;
    const text = `连击 × ${combo}`;

    // 赤金连击伴随轻微倾斜弹跳
    if (isVermilion) {
      const bounce = Math.sin(now * 0.02) * 1.5;
      const tilt = Math.sin(now * 0.025) * 0.06;
      ctx.translate(cx, cy + bounce);
      ctx.rotate(tilt);
      ctx.translate(-cx, -cy - bounce);
    }

    ctx.font = `800 11.5px "Noto Serif SC", "Songti SC", serif`;
    const textMetrics = ctx.measureText(text);
    const w = textMetrics.width + 16;
    const h = 18;

    // 胶囊底框
    ctx.fillStyle = bgColor;
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1.2;
    if (isVermilion) {
      ctx.shadowColor = '#e11d48';
      ctx.shadowBlur = 10;
    } else if (isGilded) {
      ctx.shadowColor = '#d4af37';
      ctx.shadowBlur = 6;
    }
    this.roundRect(cx - w / 2, cy - h / 2, w, h, 4);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(text, cx, cy);
    ctx.restore();
  }

  /**
   * 绘制动画层
   */
  private drawAnimation(animation: Animation, now: number) {
    const ctx = this.ctx;
    const progress = Math.max(0, (now - animation.at) / animation.life);
    ctx.save();

    if (animation.kind === 'flash') {
      ctx.globalAlpha = Math.max(0, 1 - progress);
      ctx.shadowColor = animation.tone;
      ctx.shadowBlur = 22;
      ctx.strokeStyle = animation.tone;
      ctx.lineWidth = 3;
      ctx.fillStyle = `${animation.tone}33`;
      const rect = cellRect(animation.slot);
      this.roundRect(rect.x, rect.y, rect.width, rect.height, 6);
      ctx.fill();
      ctx.stroke();
    } else if (animation.kind === 'scan') {
      // 扫描光幕随激活格同步移动
      const rect = cellRect(animation.slot);
      const alpha = Math.max(0, (1 - progress) * 0.25);
      const scanGrad = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.width, rect.y);
      scanGrad.addColorStop(0, 'rgba(253, 224, 71, 0)');
      scanGrad.addColorStop(0.5, `rgba(253, 224, 71, ${alpha})`);
      scanGrad.addColorStop(1, 'rgba(253, 224, 71, 0)');
      ctx.fillStyle = scanGrad;
      ctx.fillRect(BOARD.x + 4, rect.y, BOARD.width - 8, rect.height);
    } else if (animation.kind === 'link') {
      // 贝塞尔曲线能量弧 + 头部高光脉冲点 + 落点扩散冲击环
      const { from, to, tone, sparks } = animation;
      const alpha = Math.max(0, 1 - progress);
      ctx.globalAlpha = alpha;

      const midX = (from.x + to.x) / 2 + (from.y < to.y ? 15 : -15);
      const midY = (from.y + to.y) / 2 - 20;

      // 能量弧外发光
      ctx.strokeStyle = tone;
      ctx.lineWidth = 3.5;
      ctx.shadowColor = tone;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.quadraticCurveTo(midX, midY, to.x, to.y);
      ctx.stroke();

      // 中心白色高能核
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.quadraticCurveTo(midX, midY, to.x, to.y);
      ctx.stroke();

      // 头部脉冲点
      const t = Math.min(1, progress * 1.8);
      const px = (1 - t) * (1 - t) * from.x + 2 * (1 - t) * t * midX + t * t * to.x;
      const py = (1 - t) * (1 - t) * from.y + 2 * (1 - t) * t * midY + t * t * to.y;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(px, py, 3.2, 0, Math.PI * 2);
      ctx.fill();

      // 落点扩散冲击环
      if (progress > 0.4) {
        const ringT = (progress - 0.4) / 0.6;
        ctx.strokeStyle = `${tone}${Math.floor((1 - ringT) * 255).toString(16).padStart(2, '0')}`;
        ctx.lineWidth = 2 * (1 - ringT);
        ctx.beginPath();
        ctx.arc(to.x, to.y, ringT * 26, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 飞溅火花
      if (!this.reducedMotion.matches) {
        ctx.fillStyle = tone;
        for (const spark of sparks) {
          ctx.fillRect(
            spark.x + spark.vx * progress,
            spark.y + spark.vy * progress,
            2.5,
            2.5
          );
        }
      }
    } else if (animation.kind === 'merge_burst') {
      // 升星星芒与扩散光环
      const { anchor } = animation;
      const r = progress * 38;
      const alpha = Math.max(0, 1 - progress);
      ctx.globalAlpha = alpha;

      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 2.5 * (1 - progress);
      ctx.beginPath();
      ctx.arc(anchor.x, anchor.y, r, 0, Math.PI * 2);
      ctx.stroke();

      // 8 向星芒
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        ctx.beginPath();
        ctx.moveTo(anchor.x + Math.cos(a) * (r * 0.4), anchor.y + Math.sin(a) * (r * 0.4));
        ctx.lineTo(anchor.x + Math.cos(a) * r, anchor.y + Math.sin(a) * r);
        ctx.stroke();
      }
    } else if (animation.kind === 'float') {
      // 轻抛物线飘字 + 黑色描边 + 放大弹跳
      const alpha = Math.max(0, 1 - progress);
      ctx.globalAlpha = alpha;

      const gravity = 45;
      const posX = animation.anchor.x + animation.vx * progress;
      const posY =
        animation.anchor.y -
        animation.vy * progress +
        0.5 * gravity * progress * progress;

      // 暴击与剧毒引爆附带专属放大弹跳
      let bounceScale = 1.0;
      if (animation.prefix || animation.large) {
        bounceScale =
          1.0 + Math.sin(Math.min(Math.PI, progress * Math.PI * 2.2)) * 0.35;
      }

      const baseFontSize = animation.large ? 19 : 13;
      const fontSize = baseFontSize * bounceScale;

      ctx.save();
      ctx.translate(posX, posY);

      ctx.font = `800 ${fontSize}px "Noto Serif SC", "Songti SC", system-ui, serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // 黑色高对比外描边
      ctx.strokeStyle = '#090b10';
      ctx.lineWidth = animation.large ? 4.2 : 3.0;
      ctx.strokeText(animation.text, 0, 0);

      ctx.fillStyle = animation.tone;
      ctx.shadowColor = animation.tone;
      ctx.shadowBlur = animation.large ? 14 : 4;
      ctx.fillText(animation.text, 0, 0);

      ctx.restore();
    }

    ctx.restore();
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  private text(
    text: string,
    x: number,
    y: number,
    size: number,
    color: string,
    align: CanvasTextAlign = 'center',
    tabular = false
  ) {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.font = `700 ${size}px ${tabular ? '"ui-monospace", Consolas, sans-serif' : 'system-ui, -apple-system, sans-serif'}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
  }

  /**
   * 暴击斩杀时的四散金芒火星粒子池喷发
   */
  spawnCritSparks(anchor: Point) {
    if (this.reducedMotion.matches) return;
    const count = 22;
    const colors = ['#ffffff', '#fde047', '#fbbf24', '#f59e0b', '#ffd700'];
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.MAX_PARTICLES) this.particles.shift();
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
      const speed = 75 + Math.random() * 140;
      this.particles.push({
        kind: 'spark',
        x: anchor.x,
        y: anchor.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        ax: 0,
        ay: 130,
        size: 2.4 + Math.random() * 2.6,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1,
        life: 0,
        maxLife: 420 + Math.random() * 320,
        rot: Math.random() * Math.PI,
        rotSpeed: (Math.random() - 0.5) * 8,
        drag: 0.94,
        shape: 'square',
      });
    }
    this.invalidate();
  }

  /**
   * 剧毒引爆时的翡翠毒雾扩散粒子池
   */
  spawnPoisonMist(anchor: Point) {
    if (this.reducedMotion.matches) return;
    const count = 16;
    const colors = ['#34d399', '#10b981', '#059669', '#6ee7b7', '#a7f3d0'];
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.MAX_PARTICLES) this.particles.shift();
      this.particles.push({
        kind: 'poison_mist',
        x: anchor.x + (Math.random() - 0.5) * 16,
        y: anchor.y + (Math.random() - 0.5) * 16,
        vx: (Math.random() - 0.5) * 55,
        vy: -22 - Math.random() * 45,
        ax: (Math.random() - 0.5) * 12,
        ay: -8,
        size: 6 + Math.random() * 6,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1,
        life: 0,
        maxLife: 600 + Math.random() * 400,
        rot: 0,
        rotSpeed: 0,
        drag: 0.96,
        shape: 'circle',
      });
    }
    this.invalidate();
  }

  /**
   * 击破 Boss 护盾时的青铜碎屑飞溅
   */
  spawnBronzeShatter(anchor: Point = { x: WIDTH / 2, y: 55 }) {
    if (this.reducedMotion.matches) return;
    const count = 20;
    const colors = ['#94a3b8', '#64748b', '#b45309', '#d97706', '#78350f', '#475569'];
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.MAX_PARTICLES) this.particles.shift();
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const speed = 90 + Math.random() * 160;
      this.particles.push({
        kind: 'bronze_shard',
        x: anchor.x,
        y: anchor.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        ax: 0,
        ay: 420,
        size: 4 + Math.random() * 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1,
        life: 0,
        maxLife: 650 + Math.random() * 350,
        rot: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 16,
        drag: 0.97,
        shape: 'triangle',
      });
    }
    this.invalidate();
  }

  /**
   * 结算通关时的满屏金币雨与彩带爆破粒子
   */
  spawnVictoryCelebration() {
    if (this.reducedMotion.matches) return;
    // 1. 满屏金币雨
    const coinCount = 32;
    for (let i = 0; i < coinCount; i++) {
      if (this.particles.length >= this.MAX_PARTICLES) this.particles.shift();
      this.particles.push({
        kind: 'coin',
        x: 15 + Math.random() * (WIDTH - 30),
        y: -15 - Math.random() * 100,
        vx: (Math.random() - 0.5) * 35,
        vy: 130 + Math.random() * 180,
        ax: 0,
        ay: 80,
        size: 6.5 + Math.random() * 2.5,
        color: '#fbbf24',
        alpha: 1,
        life: 0,
        maxLife: 1500 + Math.random() * 700,
        rot: Math.random() * Math.PI,
        rotSpeed: 3.5 + Math.random() * 7,
        drag: 0.99,
        shape: 'coin',
      });
    }
    // 2. 欢庆彩带爆破
    const ribbonCount = 36;
    const ribbonColors = ['#ef4444', '#f59e0b', '#10b981', '#38bdf8', '#c084fc', '#ec4899', '#fde047'];
    for (let i = 0; i < ribbonCount; i++) {
      if (this.particles.length >= this.MAX_PARTICLES) this.particles.shift();
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.8;
      const speed = 190 + Math.random() * 220;
      this.particles.push({
        kind: 'confetti',
        x: WIDTH / 2 + (Math.random() - 0.5) * 140,
        y: HEIGHT * 0.72 + Math.random() * 60,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        ax: 0,
        ay: 260,
        size: 3.5 + Math.random() * 3.5,
        color: ribbonColors[Math.floor(Math.random() * ribbonColors.length)],
        alpha: 1,
        life: 0,
        maxLife: 1300 + Math.random() * 600,
        rot: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 10,
        drag: 0.96,
        shape: 'ribbon',
      });
    }
    this.invalidate();
  }

  private updateAndDrawParticles(now: number) {
    if (!this.particles.length) return;
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastFrameTime) / 1000));
    const ctx = this.ctx;
    ctx.save();

    const remaining: JuiceParticle[] = [];
    for (const p of this.particles) {
      p.life += dt * 1000;
      if (p.life >= p.maxLife) continue;

      p.vx += p.ax * dt;
      p.vy += p.ay * dt;
      const dragFactor = Math.pow(p.drag, dt * 60);
      p.vx *= dragFactor;
      p.vy *= dragFactor;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.rotSpeed * dt;
      p.alpha = Math.max(0, 1 - p.life / p.maxLife);

      this.drawSingleParticle(ctx, p);
      remaining.push(p);
    }
    this.particles = remaining;
    ctx.restore();
  }

  private drawSingleParticle(ctx: CanvasRenderingContext2D, p: JuiceParticle) {
    ctx.save();
    ctx.globalAlpha = p.alpha;

    if (p.shape === 'square') {
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 6;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
    } else if (p.shape === 'circle') {
      const progress = p.life / p.maxLife;
      const currentRadius = p.size * (1 + progress * 1.6);
      ctx.globalAlpha = p.alpha * 0.65;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(p.x, p.y, currentRadius, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.shape === 'triangle') {
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.shadowColor = '#000000';
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.moveTo(0, -p.size);
      ctx.lineTo(p.size * 0.75, p.size * 0.75);
      ctx.lineTo(-p.size * 0.75, p.size * 0.75);
      ctx.closePath();
      ctx.fill();
    } else if (p.shape === 'coin') {
      ctx.translate(p.x, p.y);
      const scaleX = Math.cos(p.rot);
      ctx.scale(scaleX, 1);
      ctx.fillStyle = '#d4af37';
      ctx.beginPath();
      ctx.arc(0, 0, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(0, 0, p.size * 0.78, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#78350f';
      ctx.fillRect(-p.size * 0.28, -p.size * 0.28, p.size * 0.56, p.size * 0.56);
    } else if (p.shape === 'ribbon') {
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size * 1.6, -p.size * 0.5, p.size * 3.2, p.size);
    }

    ctx.restore();
  }
}
