import { readSharedBoard } from '../core/boardShare';
import { damageLeaders } from '../core/journal';
import { openings, runScore } from '../core/openings';
import type { Catalog, Run, Slots, TileModifierMap } from '../core/types';
import { formatNumber } from './canvasRenderer';
import { drawRuneGlyph } from './glyphs';

const paper = '#f4e8d1';
const gold = '#e8b878';
const muted = '#b8ab95';
const sans = '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", system-ui, sans-serif';
const serif = '"STZhongsong", "Songti SC", "SimSun", serif';
const tileInk = {
  li_fire: ['火', '#f58f82'],
  xuan_ice: ['冰', '#72caf4'],
  spirit_gathering: ['灵', '#e8b878'],
} as const;

export function cardBackdrop(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const field = ctx.createLinearGradient(0, 0, width, height);
  field.addColorStop(0, '#16171b');
  field.addColorStop(.56, '#101116');
  field.addColorStop(1, '#261d17');
  ctx.fillStyle = field;
  ctx.fillRect(0, 0, width, height);

  const light = ctx.createRadialGradient(width * .77, height * .46, 0, width * .77, height * .46, width * .63);
  light.addColorStop(0, '#a9753726');
  light.addColorStop(1, '#a9753700');
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, width, height);

  const inset = 30;
  ctx.strokeStyle = '#ac815350';
  ctx.lineWidth = 1;
  ctx.strokeRect(inset, inset, width - inset * 2, height - inset * 2);
  ctx.strokeStyle = gold;
  ctx.lineWidth = 2;
  for (const x of [inset, width - inset]) {
    for (const y of [inset, height - inset]) {
      ctx.beginPath();
      ctx.moveTo(x, y + (y === inset ? 18 : -18));
      ctx.lineTo(x, y);
      ctx.lineTo(x + (x === inset ? 18 : -18), y);
      ctx.stroke();
    }
  }
}

export function drawShareBoard(ctx: CanvasRenderingContext2D, board: Slots, tiles: TileModifierMap,
  catalog: Catalog, left: number, top: number, size: number, leader?: number) {
  const gap = 8;
  const cell = (size - gap * 3) / 4;
  const step = cell + gap;
  board.forEach((rune, index) => {
    const x = left + (index % 4) * step;
    const y = top + Math.floor(index / 4) * step;
    const config = rune ? catalog[rune.configId] : undefined;
    const tile = tiles[index];
    const highlighted = index === leader;
    const gradient = ctx.createLinearGradient(x, y, x, y + cell);
    gradient.addColorStop(0, config ? `${config.color}31` : '#18181c');
    gradient.addColorStop(1, '#101218');
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, cell, cell);
    ctx.strokeStyle = highlighted ? gold : config ? `${config.color}9c` : '#bea07348';
    ctx.lineWidth = highlighted ? 2 : 1;
    ctx.strokeRect(x + .5, y + .5, cell - 1, cell - 1);
    ctx.textAlign = 'left';
    ctx.font = '500 13px system-ui, sans-serif';
    ctx.fillStyle = muted;
    ctx.fillText(String(index + 1), x + 8, y + 17);
    if (tile) {
      const [seal, color] = tileInk[tile];
      ctx.textAlign = 'right';
      ctx.font = `700 15px ${sans}`;
      ctx.fillStyle = color;
      ctx.fillText(seal, x + cell - 7, y + 17);
    }
    if (rune && config) {
      drawRuneGlyph(ctx, rune.configId, config.archetype, x + cell / 2, y + cell * .47, cell * .46, config.color);
      ctx.textAlign = 'center';
      ctx.font = '700 13px system-ui, sans-serif';
      ctx.fillStyle = rune.star === 3 ? gold : paper;
      ctx.fillText('✦'.repeat(rune.star), x + cell / 2, y + cell - 9);
    }
  });
}

export function renderScoreCard(canvas: HTMLCanvasElement, run: Run, catalog: Catalog) {
  canvas.width = 720;
  canvas.height = 960;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;

  const print = (value: string, x: number, y: number, size: number, color = paper, weight = 600, face = sans, maxWidth?: number) => {
    ctx.textAlign = 'left';
    ctx.font = `${weight} ${size}px ${face}`;
    ctx.fillStyle = color;
    ctx.fillText(value, x, y, maxWidth);
  };
  const rule = (x: number, y: number, width: number) => {
    ctx.fillStyle = '#bc946650';
    ctx.fillRect(x, y, width, 1);
  };
  const journal = run.lastJournal;
  const snapshot = journal && readSharedBoard(journal.formation, catalog, true);
  const board = snapshot?.board ?? run.board;
  const leaders = journal && snapshot ? damageLeaders(journal) : [];
  const leadingSource = leaders[0]?.source;
  const score = runScore(run);
  const opening = openings[run.opening];

  cardBackdrop(ctx, canvas.width, canvas.height);
  print('4×4 词条法阵', 57, 81, 24, gold);
  const outcome = run.status === 'victory' ? '二十波通关'
    : run.status === 'defeat' ? `止步第 ${formatNumber(run.wave)} 波` : '本局战绩';
  print(outcome, 54, 153, 62, paper, 700, serif, 605);
  print(`${opening.name} · ${opening.label}开局${run.endless ? ' / 无尽' : ''}`, 57, 200, 23, muted, 500);
  rule(56, 228, 608);

  const stats = [
    ['守住波次', formatNumber(score.cleared)],
    ['本局最高连击', formatNumber(score.combo)],
    ['末战伤害', formatNumber(run.lastDamage)],
  ];
  stats.forEach(([label, value], index) => {
    const x = 57 + index * 205;
    print(label, x, 266, 19, muted, 500);
    print(value, x, 316, 41, index === 2 ? gold : paper, 700, sans, 182);
  });
  rule(56, 343, 608);

  print(snapshot ? `第 ${formatNumber(snapshot.wave)} 波阵容` : '存档阵容', 57, 388, 27, paper, 700);
  drawShareBoard(ctx, board, snapshot?.tileModifiers ?? run.tileModifiers, catalog, 56, 410, 386,
    typeof leadingSource === 'number' ? leadingSource : undefined);
  print('末战输出', 468, 388, 24, paper, 700);
  if (!leaders.length) print('暂无伤害来源明细', 468, 451, 18, muted, 500, sans, 195);
  leaders.forEach(({ source, amount, share }, index) => {
    const y = 449 + index * 117;
    const slot = typeof source === 'number' ? board[source] : null;
    const config = slot ? catalog[slot.configId] : undefined;
    const name = config?.name ?? (source === 'poison' ? '回合末剧毒' : source === 'tutorial' ? '首波共鸣' : '符文');
    const color = config?.color ?? (source === 'poison' ? '#80c887' : gold);
    const percent = share < .01 ? '<1%' : `${Math.round(share * 100)}%`;
    print(typeof source === 'number' ? `${source + 1} 格 · ${name}` : name, 468, y, 19, paper, 600, sans, 195);
    print(`${formatNumber(amount)}  /  ${percent}`, 468, y + 34, 23, color, 700, sans, 195);
    rule(468, y + 51, 194);
    ctx.fillStyle = color;
    ctx.fillRect(468, y + 51, Math.max(1, Math.min(1, share) * 194), 3);
  });

  rule(56, 828, 608);
  print('种子码', 57, 865, 19, muted, 500);
  print(run.seed, 134, 866, 24, paper, 700, 'monospace');
  print('bartcurry.github.io/affix-grid-4x4', 57, 903, 22, gold, 500, sans, 605);
  return true;
}
