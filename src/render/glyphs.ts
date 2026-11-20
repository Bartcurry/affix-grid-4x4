/**
 * 《4×4 词条法阵》纯 Canvas 矢量图腾模块「玄墨鎏金」
 * 包含全部 26 种符文、4 大流派兜底、6 类 Boss 及常用 UI 矢量路径与三层高光渲染
 */

export const RUNE_GLYPHS: Record<string, string> = {
  // ─── 连锁 (Chain) ───
  spark_orb:
    'M16 2L22 13L16 14L21 28L9 16L15 15ZM10 7L6 11M22 25L26 21M8 22L11 25M21 7L24 10',
  prism_right:
    'M7 5L22 16L7 27ZM7 12L15 16L7 20M23 16L29 16M26 13L29 16L26 19M2 16L6 16',
  relay_cross:
    'M12 4H20V10H26V18H20V24H12V18H6V10H12ZM16 11L21 16L16 21L11 16ZM16 2V4M16 24V26M2 14H4M24 14H26',
  overclock_core:
    'M16 6A10 10 0 1 0 16 26A10 10 0 1 0 16 6M16 11A5 5 0 1 0 16 21A5 5 0 1 0 16 11M16 2V6M16 26V30M2 16H6M26 16H30M9 9L12 12M20 20L23 23M23 9L20 12M9 23L12 20',
  falling_bell:
    'M13 4C13 2 19 2 19 4V7H13ZM10 7C10 6 22 6 22 7V18L26 22H6L10 18ZM13 22A3 3 0 0 0 19 22M16 25V29M13 29H19',
  toxic_fuse:
    'M16 2L20 8L27 9L21 14L23 21L16 17L9 21L11 14L5 9L12 8ZM16 18V29M11 24H21M8 27L11 24M24 27L21 24',
  storm_gambler:
    'M5 5H27V27H5ZM10 10H12V12H10ZM20 10H22V12H20ZM15 15H17V17H15ZM10 20H12V22H10ZM20 20H22V22H20ZM5 16L27 16',

  // ─── 剧毒 (Poison) ───
  venom_drop:
    'M16 3C12 9 6 15 6 21A10 10 0 0 0 26 21C26 15 20 9 16 3ZM16 9C14 13 10 17 10 21A6 6 0 0 0 22 21C22 17 18 13 16 9ZM16 15V23',
  plague_spreader:
    'M16 3L27 9V23L16 29L5 23V9ZM16 8L22 12V20L16 24L10 20V12ZM16 13A3 3 0 1 0 16 19A3 3 0 1 0 16 13M16 3V8M27 9L22 12M27 23L22 20M16 29V24M5 23L10 20M5 9L10 12',
  catalyst_flask:
    'M12 3H20M14 3V8L8 22A4 4 0 0 0 12 28H20A4 4 0 0 0 24 22L18 8V3M9 20H23M13 14H19M16 22A2 2 0 1 0 16 26A2 2 0 1 0 16 22',
  toxic_detonator:
    'M16 2L19 11L28 8L22 16L30 19L21 21L24 29L16 23L9 28L11 20L2 18L10 15L4 8L13 11ZM16 12A4 4 0 1 0 16 20A4 4 0 1 0 16 12',
  moss_brick:
    'M4 8L16 3L28 8V24L16 29L4 24ZM4 8L16 14L28 8M16 14V29M10 11L22 17M10 20L16 23M16 23L22 20',
  plague_crown:
    'M4 25H28L26 12L20 18L16 7L12 18L6 12ZM8 22H24M12 18H20M16 13V18',

  // ─── 金币 (Gold) ───
  copper_mine:
    'M16 2L29 16L16 30L3 16ZM3 16H29M16 2V30M11 11L21 11L21 21L11 21Z',
  greed_amplifier:
    'M5 12H27L24 24A4 4 0 0 1 20 27H12A4 4 0 0 1 8 24ZM3 12H29M10 7C10 4 22 4 22 7M12 7H20M16 15L19 18H13ZM11 27L9 30M21 27L23 30',
  gold_cannon:
    'M8 8H24V24H8ZM16 2L20 8H12ZM2 16L8 12V20ZM30 16L24 12V20ZM16 30L12 24H20ZM16 11A5 5 0 1 0 16 21A5 5 0 1 0 16 11',
  tax_collector:
    'M16 4L28 26H4ZM16 10L23 23H9ZM16 13A3 3 0 1 0 16 19A3 3 0 1 0 16 13M16 22V26M10 22L7 26M22 22L25 26',
  coin_mold:
    'M4 4H28V28H4ZM16 7A9 9 0 1 0 16 25A9 9 0 1 0 16 7M12 12H20V20H12ZM4 16H7M25 16H28M16 4V7M16 25V28',
  gilded_fang:
    'M10 4C14 4 24 10 24 23C20 22 14 21 12 15C10 10 9 7 10 4ZM16 23L13 28L18 29ZM12 15L16 18M14 9L18 12',
  alchemy_bell:
    'M16 3C10 3 8 9 8 16V22L4 25H28L24 22V16C24 9 22 3 16 3ZM12 25A4 4 0 0 0 20 25M14 13H18V17H14ZM16 10V13M16 17V20',

  // ─── 增幅 (Amplify) ───
  ember_amp:
    'M16 2L22 10L30 16L22 22L16 30L10 22L2 16L10 10ZM16 9L21 16L16 23L11 16ZM16 2V9M16 23V30M2 16H11M21 16H30',
  echo_stone:
    'M20 5L10 16L20 27M27 5L17 16L27 27M14 11L8 16L14 21M4 11V21',
  blood_altar:
    'M16 2L20 12L30 16L20 20L16 30L12 20L2 16L12 12ZM16 11L18 16L16 21L14 16ZM8 8L12 12M20 20L24 24M24 8L20 12M8 24L12 20',
  combo_finisher:
    'M16 2L19 10L27 5L22 13L30 16L22 19L27 27L19 22L16 30L13 22L5 27L10 19L2 16L10 13L5 5L13 10ZM16 11A5 5 0 1 0 16 21A5 5 0 1 0 16 11',
  red_seal:
    'M5 5H27V27H5ZM8 8H24V24H8ZM12 11V21M20 11V21M12 16H20M16 11V16',
  blood_prism:
    'M16 3L28 25H4ZM16 8L24 23H8ZM16 13L20 20H12ZM16 3V8M4 25L8 23M28 25L24 23',
};

// 流派兜底矢量图标
export const ARCHETYPE_FALLBACKS: Record<string, string> = {
  chain: RUNE_GLYPHS.spark_orb,
  poison: RUNE_GLYPHS.venom_drop,
  gold: RUNE_GLYPHS.copper_mine,
  amplify: RUNE_GLYPHS.ember_amp,
};

// 4 大开局水墨金芒专属徽记
export const ARCHETYPE_EMBLEMS: Record<string, string> = {
  chain:
    'M16 2L20 8L27 9L21 14L23 21L16 17L9 21L11 14L5 9L12 8ZM16 12A4 4 0 1 0 16 20A4 4 0 1 0 16 12M6 16L2 16M26 16L30 16M16 26V30M16 2V6M9 9L6 6M23 23L26 26M9 23L6 26M23 9L26 6',
  poison:
    'M16 3C10 3 6 8 6 15C6 22 11 28 16 29C21 28 26 22 26 15C26 8 22 3 16 3ZM12 12A2 2 0 1 1 12 16A2 2 0 1 1 12 12ZM20 12A2 2 0 1 1 20 16A2 2 0 1 1 20 12ZM16 18C14 18 13 20 13 22H19C19 20 18 18 16 18Z',
  gold:
    'M16 2C8.268 2 2 8.268 2 16C2 23.732 8.268 30 16 30C23.732 30 30 23.732 30 16C30 8.268 23.732 2 16 2ZM11 11H21V21H11ZM16 5V9M16 23V27M5 16H9M23 16H27',
  amplify:
    'M16 2L20 10L28 12L22 18L24 26L16 22L8 26L10 18L4 12L12 10ZM16 8L18 13L23 14L19 18L20 23L16 20L12 23L13 18L9 14L14 13Z',
};

// 15 种神机天工遗物专属图腾徽记
export const RELIC_GLYPHS: Record<string, string> = {
  whetstone: 'M5 27L27 5M7 27L27 7M9 27L27 9M3 25L25 3',
  chain_ring: 'M12 12A6 6 0 1 0 12 24A6 6 0 1 0 12 12M20 8A6 6 0 1 0 20 20A6 6 0 1 0 20 8',
  moss_bowl: 'M4 14C4 22 10 26 16 26C22 26 28 22 28 14H4ZM8 10C10 6 14 6 16 10C18 6 22 6 24 10',
  red_lens: 'M16 4A12 12 0 1 0 16 28A12 12 0 1 0 16 4M16 10A6 6 0 1 0 16 22A6 6 0 1 0 16 10M16 2V6M16 26V30',
  copper_ledger: 'M6 4H26V28H6ZM10 8H22M10 14H22M10 20H18',
  gate_tithe: 'M4 8H28M6 8V26M26 8V26M11 14H21V22H11ZM16 4V8',
  jade_abacus: 'M4 5H28V27H4ZM9 5V27M14 5V27M19 5V27M24 5V27M4 12H28M7 9H11M12 9H16M17 9H21M22 9H26M7 17H11M12 21H16M17 19H21M22 17H26',
  taixu_needle: 'M16 2L18 10L17 28L16 30L15 28L14 10ZM12 6L20 6M16 2V30',
  li_fire_token: 'M9 4H23L27 12V24L23 28H9L5 24V12ZM16 9C13 13 11 16 11 19A5 5 0 0 0 21 19C21 16 19 13 16 9Z',
  huagong_powder: 'M10 4H22L24 12L20 26H12L8 12ZM13 14H19M11 20H21M16 8V12',
  bagua_mirror: 'M10 3H22L29 10V22L22 29H10L3 22V10ZM16 9A7 7 0 1 0 16 23A7 7 0 1 0 16 9M16 12A4 4 0 0 0 16 20A4 4 0 0 0 16 12',
  spirit_gourd: 'M16 4C14 4 12 6 12 9C12 12 14 14 16 14M16 4C18 4 20 6 20 9C20 12 18 14 16 14M16 14C11 14 8 18 8 23A8 8 0 0 0 24 23C24 18 21 14 16 14ZM14 2H18',
  tianji_compass: 'M16 3A13 13 0 1 0 16 29A13 13 0 1 0 16 3M16 7L19 16L16 25L13 16ZM7 16H25',
  xuanbing_silk: 'M16 2L20 10L28 16L20 22L16 30L12 22L4 16L12 10ZM16 8L16 24M8 16L24 16',
  qiankun_pouch: 'M8 12C8 7 12 5 16 5C20 5 24 7 24 12L26 23C26 26 22 28 16 28C10 28 6 26 6 23ZM11 12H21M16 5V12',
};

// 6 类 Boss 专属几何图腾徽记
export const BOSS_GLYPHS: Record<string, string> = {
  // 守门核心：同心旋转菱心、四向准星光芒与灵核之眼
  sentry:
    'M16 3L29 16L16 29L3 16ZM16 8L24 16L16 24L8 16ZM16 12A4 4 0 1 0 16 20A4 4 0 1 0 16 12M16 2V6M16 26V30M2 16H6M26 16H30',
  // 铁壳卫：八角玄铁重盾、四向硬化筋梁与防冲铆钉
  armor:
    'M10 3H22L29 10V22L22 29H10L3 22V10ZM11 6H21L26 11V21L21 26H11L6 21V11ZM16 6V26M6 16H26M10 10L22 22M10 22L22 10',
  // 漏毒翁：裂纹青铜毒鼎、裂缝毒气与三足鼎足
  cistern:
    'M6 10H26L24 22A4 4 0 0 1 20 25H12A4 4 0 0 1 8 22ZM4 10H28M10 5V10M22 5V10M10 25L8 29M22 25L24 29M13 14L16 17L19 14M12 18L16 21L20 18',
  // 石狮：对称青石兽印、怒目石须与镇守灵符
  flanks:
    'M7 5C12 3 20 3 25 5L28 13L24 21L16 28L8 21L4 13ZM10 11A3 3 0 1 0 10 17A3 3 0 1 0 10 11M22 11A3 3 0 1 0 22 17A3 3 0 1 0 22 11M16 15L14 20H18ZM11 23H21M13 23L14 26M19 23L18 26',
  // 回音钟：古铜编钟、多层声波扩音弧与钟悬法纽
  bell:
    'M12 4H20M16 2V4M9 8C9 6 23 6 23 8V19L27 23H5L9 19ZM12 23A4 4 0 0 0 20 23M16 11A2 2 0 1 0 16 15A2 2 0 1 0 16 11M12 17H20M2 13C0 15 0 17 2 19M30 13C32 15 32 17 30 19',
  // 闭门王：双重帝王玄锁、天牢横栅与帝印符印
  regent:
    'M5 4H27V28H5ZM8 7H15V25H8ZM17 7H24V25H17ZM13 14A3 3 0 1 0 19 14A3 3 0 1 0 13 14M16 17V22M4 16H28',
};

// 通用 UI 矢量图标
export const UI_GLYPHS = {
  shield: 'M16 3L27 7V15C27 22 22 27 16 29C10 27 5 22 5 15V7ZM16 7L23 10V15C23 20 19 24 16 25C13 24 9 20 9 15V10Z',
  poison: 'M16 4C12 10 7 15 7 20A9 9 0 0 0 25 20C25 15 20 10 16 4ZM16 11C14 14 11 17 11 20A5 5 0 0 0 21 20C21 17 18 14 16 11Z',
  gold: 'M16 3A13 13 0 1 0 16 29A13 13 0 1 0 16 3M12 12H20V20H12Z',
  lock: 'M10 13V9A6 6 0 0 1 22 9V13M6 13H26V27H6ZM16 18V22',
  unlock: 'M10 13V9A6 6 0 0 1 22 9M6 13H26V27H6ZM16 18V22',
  lightning: 'M17 2L7 16H15L13 28L25 13H16Z',
};

// 预先缓存 Path2D 对象提升 Canvas 渲染效率
const pathCache = new Map<string, Path2D>();
export function getCachedPath(d: string): Path2D {
  let path = pathCache.get(d);
  if (!path) {
    path = new Path2D(d);
    pathCache.set(d, path);
  }
  return path;
}

export function getRuneSvgPath(id: string, archetype?: string): string {
  return RUNE_GLYPHS[id] ?? (archetype ? ARCHETYPE_FALLBACKS[archetype] : null) ?? RUNE_GLYPHS.spark_orb;
}

export function getBossSvgPath(bossId: string): string {
  return BOSS_GLYPHS[bossId] ?? BOSS_GLYPHS.sentry;
}

export function getRelicSvgPath(relicId: string): string {
  return RELIC_GLYPHS[relicId] ?? UI_GLYPHS.shield;
}

export function getArchetypeEmblemPath(archetype: string): string {
  return ARCHETYPE_EMBLEMS[archetype] ?? ARCHETYPE_FALLBACKS[archetype] ?? RUNE_GLYPHS.spark_orb;
}

/**
 * 核心绘制函数：实体三层矢量符文图腾
 * 1. 底层：半透明柔光光晕 (Diffuse Aura)
 * 2. 中层：高对比矢量线框 (Crisp Vector Stroke)
 * 3. 顶层：中心高光点 (Core Highlight Sparkle)
 */
export function drawRuneGlyph(
  ctx: CanvasRenderingContext2D,
  runeId: string,
  archetype: string,
  cx: number,
  cy: number,
  size: number,
  color: string,
  glowStrength = 1.0
): void {
  const d = getRuneSvgPath(runeId, archetype);
  const path = getCachedPath(d);
  const scale = size / 32;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-16, -16);

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 1. 底层半透明柔光光晕
  if (glowStrength > 0) {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 10 * glowStrength;
    ctx.strokeStyle = `${color}66`;
    ctx.lineWidth = 3.2;
    ctx.stroke(path);
    ctx.restore();
  }

  // 2. 主体高对比矢量线框
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.1;
  ctx.stroke(path);

  // 细线白色高光反光层
  ctx.strokeStyle = '#ffffffdd';
  ctx.lineWidth = 1.0;
  ctx.stroke(path);
  ctx.restore();

  // 3. 中心高光点
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(16, 16, 1.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * 绘制 Boss 图腾徽记
 */
export function drawBossGlyph(
  ctx: CanvasRenderingContext2D,
  bossId: string,
  cx: number,
  cy: number,
  size: number,
  color: string
): void {
  const d = getBossSvgPath(bossId);
  const path = getCachedPath(d);
  const scale = size / 32;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-16, -16);

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 外围柔光
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.strokeStyle = `${color}55`;
  ctx.lineWidth = 3;
  ctx.stroke(path);
  ctx.restore();

  // 主体高亮线
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.2;
  ctx.stroke(path);

  ctx.strokeStyle = '#ffffffbb';
  ctx.lineWidth = 0.9;
  ctx.stroke(path);

  ctx.restore();
}
