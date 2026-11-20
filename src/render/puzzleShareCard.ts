import { dailyMastery, type DailyPuzzle, type DailyRecord } from '../core/daily';
import { encounters } from '../core/expedition';
import type { Catalog, Slots } from '../core/types';
import type { Relay, RelayScore } from '../core/weeklyRelay';
import { formatNumber as format } from './canvasRenderer';
import { cardBackdrop, drawQrCode, drawShareBoard } from './shareCard';

export type PuzzleShareCard =
  | { kind: 'daily'; puzzle: DailyPuzzle; score: DailyRecord; url: string }
  | { kind: 'relay'; relay: Relay; score: RelayScore; url: string };

export function renderPuzzleShareCard(canvas: HTMLCanvasElement, card: PuzzleShareCard, catalog: Catalog) {
  canvas.width = 720;
  canvas.height = 900;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;

  const cream = '#f4e7d0';
  const gold = '#ebbc80';
  const muted = '#c3b8a3';
  const green = '#a8dfbb';
  const serif = '"Songti SC", SimSun, serif';
  const sans = '"Microsoft YaHei", "PingFang SC", system-ui, sans-serif';
  const print = (text: string, x: number, y: number, size: number, color = cream, bold = false, font = sans, max = 600) => {
    ctx.fillStyle = color;
    ctx.font = `${bold ? 700 : 500} ${size}px ${font}`;
    ctx.textAlign = 'left';
    ctx.fillText(text, x, y, max);
  };
  const rule = (y: number) => {
    ctx.fillStyle = '#dcb48560';
    ctx.fillRect(56, y, 608, 1);
  };
  const metric = (label: string, value: string, x: number, highlight = false) => {
    print(label, x, 233, 22, muted);
    print(value, x, 290, 50, highlight ? gold : cream, true, sans, 280);
  };

  cardBackdrop(ctx, canvas.width, canvas.height);
  print('4×4 词条法阵', 56, 78, 24, gold, true);
  const daily = card.kind === 'daily';
  print(daily ? card.puzzle.formation.title : '三阵接力', 53, 147, 57, cream, true, serif);
  const subtitle = daily
    ? `${card.puzzle.day} · 每日残局${dailyMastery(card.puzzle, card.score).complete ? ' · 双满' : ''}`
    : `${card.relay.day} 当周`;
  print(subtitle, 56, 185, 22, muted);

  if (card.kind === 'daily') {
    const { puzzle: { formation, hp, pieces }, score } = card;
    metric('最少步数', `${format(score.moves)} 步`, 56);
    metric('最高伤害', format(score.peakDamage ?? score.damage), 360, true);
    rule(316);
    print('原题阵型', 56, 361, 23, cream, true);
    const board: Slots = Array(16).fill(null);
    formation.cells.forEach((cell, index) => { board[cell] = { configId: pieces[index], star: 1 }; });
    drawShareBoard(ctx, board, formation.tiles ?? {}, catalog, 56, 380, 260);
    print(encounters[formation.enemy].name, 356, 420, 32, cream, true, serif, 295);
    print(`${format(hp)} 生命`, 356, 462, 24, muted);
    if (formation.gold) print(`起始 ${format(formation.gold)} 金`, 356, 506, 24, gold);
    print('保留共鸣 · 无暴击', 356, 576, 22, green);
  } else {
    const { relay, score } = card;
    metric('总伤害', format(score.damage), 56, true);
    metric('共用换位', `${score.moves} / ${relay.budget} 步`, 360);
    rule(316);
    const stages = ['第一阵', '第二阵', '第三阵'];
    relay.stages.forEach((stage, index) => {
      const y = 340 + index * 94;
      ctx.fillStyle = '#c4d2bf12';
      ctx.fillRect(56, y, 608, 78);
      print(stages[index], 73, y + 31, 20, green);
      print(stage.formation.title, 170, y + 49, 27, cream, true, serif, 254);
      print(`${encounters[stage.formation.enemy].name} · ${format(stage.hp)} 血`, 431, y + 48, 19, muted, false, sans, 212);
    });
  }

  rule(660);
  print('扫码挑战同一期', 56, 760, 31, cream, true);
  print(new URL(card.url).hostname, 56, 803, 22, muted, false, sans, 365);
  drawQrCode(ctx, card.url, 452, 662, 204);
  return true;
}
