import type { SharedBoard } from '../core/boardShare';
import { CELL_COUNT } from '../core/grid';
import { BENCH_SIZE } from '../core/shopEngine';
import { previewPlacement } from '../core/tactics';

export interface FormationLesson {
  id: string;
  name: string;
  tip: string;
  pieces: readonly (readonly [number, string])[];
  move: readonly [number, number];
  gold?: number;
}

export const formationLessons: readonly FormationLesson[] = [
  {
    id: 'mirror', name: '镜子对准火花',
    tip: '第 3 格的电火花移到第 2 格，贴在镜子右边。它会先被镜子触发一次，之后再按格子顺序打一次。',
    pieces: [[0, 'prism_right'], [2, 'spark_orb']], move: [2, 1],
  },
  {
    id: 'poison', name: '先叠毒再引爆',
    tip: '把第 1 格的引爆器挪到第 4 格。毒液滴管先叠毒，催化烧瓶放大毒层，引爆器最后才吃得到这些毒。',
    pieces: [[0, 'toxic_detonator'], [1, 'venom_drop'], [2, 'catalyst_flask']], move: [0, 3],
  },
  {
    id: 'gold', name: '钱到账再开炮',
    tip: '交换第 1 格的重炮和第 2 格的矿脉。开炮看的是出手那一刻手头的金币。',
    pieces: [[0, 'gold_cannon'], [1, 'copper_mine']], move: [0, 1], gold: 20,
  },
  {
    id: 'seal', name: '火漆印往下盖',
    tip: '把第 2 格的电火花移到第 5 格，正好在火漆印下方。火漆印只给脚下那一格加暴击和伤害。',
    pieces: [[0, 'red_seal'], [1, 'spark_orb']], move: [1, 4],
  },
  {
    id: 'bell', name: '钟下的第二炮',
    tip: '把第 6 格的重炮移到点金铃正下方的第 5 格。铃先拉起一炮，剩下的那一炮才会吃到 25 金的加成。',
    pieces: [[0, 'alchemy_bell'], [5, 'gold_cannon']], move: [5, 4], gold: 25,
  },
  {
    id: 'finisher', name: '把重击留到最后',
    tip: '把第 1 格的终焉共鸣器移到第 4 格。等镜子和火花先攒连击，共鸣器的最后一击会更重。',
    pieces: [[0, 'combo_finisher'], [1, 'prism_right'], [2, 'spark_orb']], move: [0, 3],
  },
];

export function lessonBoards(lesson: FormationLesson) {
  const original: SharedBoard = {
    wave: 2, opening: 'chain', rngState: 667, gold: lesson.gold ?? 12, shield: 3,
    board: Array(CELL_COUNT).fill(null), bench: Array(BENCH_SIZE).fill(null), relics: [], tileModifiers: {},
  };
  for (const [index, configId] of lesson.pieces) original.board[index] = { configId, star: 1 };
  const [from, to] = lesson.move;
  const revised = previewPlacement(original, { zone: 'board', index: from }, { zone: 'board', index: to });
  if (!revised) throw new Error(`Invalid formation lesson: ${lesson.id}`);
  return { original, revised };
}
