import type { Formation } from '../core/daily';

interface Drill {
  id: string;
  skill: string;
  par: number;
  formation: Formation & { hp: number };
}

export const drills: readonly Drill[] = [
  {
    id: 'mirror', skill: '朝向', par: 1,
    formation: {
      title: '镜火双响', enemy: 'sentry', hp: 40, cells: [0, 1, 5],
      pieces: ['spark_orb', 'prism_right', 'falling_bell'],
      clue: '镜子只能触发自己右手边那一格。让火花在自己出手前先亮一次。',
    },
  },
  {
    id: 'gold', skill: '出手顺序', par: 2,
    formation: {
      title: '二十五金', enemy: 'flanks', hp: 95, cells: [1, 2, 5, 6],
      pieces: ['copper_mine', 'coin_mold', 'gold_cannon', 'alchemy_bell'], gold: 22,
      clue: '先凑到 25 金，再让点金铃触发下方的重炮。石狮中间两列更好打。',
    },
  },
  {
    id: 'armor', skill: '磨掉护甲', par: 2,
    formation: {
      title: '验甲落槌', enemy: 'armor', hp: 140, cells: [0, 1, 4, 5, 6],
      pieces: ['overclock_core', 'prism_right', 'falling_bell', 'echo_stone', 'spark_orb'],
      clue: '铁壳会减半前两次直伤。先用小伤害破甲，再让攒了充能的核心压轴。',
    },
  },
  {
    id: 'poison', skill: '叠毒引爆', par: 3,
    formation: {
      title: '毒满开炉', enemy: 'cistern', hp: 86, cells: [0, 1, 2, 5, 6],
      pieces: ['falling_bell', 'plague_crown', 'moss_brick', 'toxic_detonator', 'catalyst_flask'],
      clue: '先让苔砖靠邻居叠毒，再用烧瓶催化。把引爆器留到后面。',
    },
  },
  {
    id: 'gate', skill: '交替列出手', par: 3,
    formation: {
      title: '两列破门', enemy: 'regent_seal', hp: 365, cells: [0, 1, 5, 6, 10],
      pieces: ['falling_bell', 'ember_amp', 'combo_finisher', 'spark_orb', 'prism_right'],
      clue: '前三次打破护甲。破甲后，来自上一击同一列的伤害会被压低。用小伤害换列，再让阵尾重击。',
    },
  },
];
