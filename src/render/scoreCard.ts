import { runReport } from '../core/runReport';
import { trialCount } from '../core/trials';
import type { Catalog, Run } from '../core/types';
import { formatNumber } from './canvasRenderer';
import { drawRuneGlyph } from './glyphs';

export function renderScoreCard(run: Run, catalog: Catalog) {
  const image = document.createElement('canvas');
  image.width = 720;
  image.height = 860;
  const ctx = image.getContext('2d');
  if (!ctx) return null;
  const report = runReport(run, catalog);
  const light = '#f4e3c5';
  const gold = '#edc37d';
  const slate = '#b9c7d7';
  const fill = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };
  const text = (value: string, x: number, y: number, size: number, color: string, width = 620) => {
    ctx.font = `700 ${size}px system-ui, "Microsoft YaHei", sans-serif`;
    ctx.fillStyle = color;
    ctx.fillText(value, x, y, width);
  };

  const background = ctx.createLinearGradient(0, 0, 720, 860);
  background.addColorStop(0, '#32281e');
  background.addColorStop(.46, '#141c26');
  background.addColorStop(1, '#10161e');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, 720, 860);
  ctx.strokeStyle = '#987545';
  ctx.lineWidth = 2;
  ctx.strokeRect(25, 25, 670, 810);
  fill(54, 57, 40, 4, gold);
  text('4×4 词条法阵', 111, 68, 23, gold);
  text(report.title, 53, 145, 58, light);
  text(report.battle, 55, 185, 23, slate);
  text(report.opening, 55, 221, 21, gold);

  const metrics = [['打过波数', report.score.cleared], ['最高连击', report.score.combo], ['末战伤害', report.damage]] as const;
  for (const [index, [label, value]] of metrics.entries()) {
    const x = 55 + index * 206;
    fill(x, 254, 198, 87, '#212b36');
    fill(x, 254, 198, 1, '#686356');
    text(label, x + 12, 282, 18, slate, 174);
    text(formatNumber(value), x + 12, 322, 32, light, 174);
  }

  const boardX = 55;
  const boardY = 375;
  fill(boardX, boardY, 308, 308, '#101820');
  report.board.forEach((rune, index) => {
    const x = boardX + 8 + (index % 4) * 74;
    const y = boardY + 8 + Math.floor(index / 4) * 74;
    const edge = report.leader?.cell === index ? gold : rune ? '#586778' : '#34414f';
    fill(x, y, 70, 70, edge);
    fill(x + 1, y + 1, 68, 68, rune ? '#26313d' : '#19232e');
    if (!rune) return;
    const config = catalog[rune.configId];
    drawRuneGlyph(ctx, config.id, config.archetype, x + 35, y + 30, 34, config.color, .45);
    for (let star = 0; star < rune.star; star++) fill(x + 33 + (star - (rune.star - 1) / 2) * 9, y + 56, 4, 4, gold);
  });

  text('末战阵容', 396, 415, 28, gold, 260);
  if (report.leader) {
    text(report.leader.name, 396, 462, 24, light, 260);
    text(`${formatNumber(report.leader.damage)} 伤害`, 396, 504, 26, light, 260);
  }
  if (report.bounties) text(`悬赏 ${report.bounties} / ${trialCount}`, 396, 567, 21, slate, 260);

  fill(55, 726, 610, 1, '#6e5840');
  text(`种子码 ${run.seed}`, 55, 763, 21, gold);
  text('bartcurry.github.io/affix-grid-4x4', 55, 801, 19, slate);
  return image;
}
