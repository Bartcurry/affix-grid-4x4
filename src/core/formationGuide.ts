import type { SharedBoard } from './boardShare';
import { CELL_COUNT } from './grid';
import { prepareBattle } from './tactics';
import type { Catalog, Slots, Star } from './types';

type Piece = readonly [cell: number, id: string, star?: Star];
export type FormationLesson = {
  id: string;
  title: string;
  style: '连锁' | '剧毒' | '点金' | '增幅' | '混搭';
  clue: string;
  pieces: readonly Piece[];
  swaps: readonly (readonly [number, number])[];
  gold?: number;
};

export const formationLessons: readonly FormationLesson[] = [
  { id: 'spark', title: '两边都来电', style: '连锁',
    clue: '折射镜找右邻，回响之石找左邻。让同一枚电火花接住两边的连锁。',
    pieces: [[0, 'prism_right'], [1, 'spark_orb'], [5, 'echo_stone']], swaps: [[5, 2]] },
  { id: 'poison', title: '先叠毒，再引爆', style: '剧毒',
    clue: '按格号从小到大扫描。引爆前先让两只滴管叠毒，再交给烧瓶催化。',
    pieces: [[0, 'toxic_detonator'], [1, 'venom_drop', 2], [2, 'catalyst_flask'], [3, 'venom_drop']], swaps: [[0, 3]] },
  { id: 'cannon', title: '钱到账再开炮', style: '点金', gold: 20,
    clue: '重炮每次都按当时手里的金币算伤害。让产钱的先动，再让回响多打两炮。',
    pieces: [[0, 'gold_cannon'], [1, 'copper_mine'], [2, 'coin_mold'], [3, 'echo_stone']], swaps: [[0, 1], [1, 2]] },
  { id: 'seal', title: '印落在谁身上', style: '增幅',
    clue: '火漆印只加成正下方。让吃到加成的电火花也接上同排的折射镜。',
    pieces: [[1, 'red_seal'], [4, 'spark_orb'], [5, 'prism_right'], [6, 'spark_orb']], swaps: [[4, 5]] },
  { id: 'fuse', title: '落铃点引信', style: '混搭',
    clue: '毒火引信只在被连锁时引爆。让落铃敲中它，同时让苔砖挨着多次触发的位置。',
    pieces: [[0, 'venom_drop', 3], [1, 'falling_bell'], [5, 'moss_brick'], [6, 'toxic_fuse', 3]], swaps: [[5, 6]] },
  { id: 'charge', title: '攒够充能再放', style: '混搭',
    clue: '同行或同列触发会给超频核心攒充能。试试让靠后的核心接住落铃。',
    pieces: [[0, 'relay_cross'], [1, 'spark_orb'], [4, 'overclock_core'], [5, 'falling_bell']], swaps: [[1, 5], [4, 5]] },
];

export function findLesson(id: string | null) {
  return formationLessons.find(lesson => lesson.id === id);
}

export function makeFormationTrial(lesson: FormationLesson, catalog: Catalog) {
  const board: Slots = Array(CELL_COUNT).fill(null);
  for (const [cell, configId, star = 1] of lesson.pieces) board[cell] = { configId, star };
  const snapshot: SharedBoard = { board, wave: 2, gold: lesson.gold ?? 10, shield: 3, rngState: 667, relics: [], tileModifiers: {} };
  const after = [...board];
  for (const [from, to] of lesson.swaps) [after[from], after[to]] = [after[to], after[from]];
  const original = prepareBattle(snapshot, catalog).events.at(-1);
  const reference = prepareBattle({ ...snapshot, board: after }, catalog).events.at(-1);
  if (original?.type !== 'TURN_RESULT' || reference?.type !== 'TURN_RESULT') throw new Error('Missing formation trial result');
  return { snapshot, originalDamage: original.damage, targetDamage: reference.damage };
}

export function formationLink(page: string, id: string) {
  const url = new URL(page);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
  url.search = '';
  url.hash = '';
  url.searchParams.set('lesson', id);
  return url.href;
}
