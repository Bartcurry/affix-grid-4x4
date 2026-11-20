import { encounters } from './expedition';
import { damageLeaders } from './journal';
import { openings, runScore } from './openings';
import { battleTarget } from './trials';
import type { Catalog, Run } from './types';

export function runReport(run: Run, catalog: Catalog) {
  const journal = run.lastJournal;
  const played = journal ?? run;
  const { encounter, trial } = battleTarget(played.wave, played.trialWave, played.trialRoute);
  const score = runScore(run);
  const top = journal && damageLeaders(journal)[0];
  const source = top?.source;
  const rune = typeof source === 'number' ? played.board[source] : null;
  const leader = top && {
    cell: typeof source === 'number' ? source : undefined,
    name: rune ? catalog[rune.configId].name : source === 'poison' ? '回合末剧毒' : '起手共鸣',
    damage: top.amount,
  };
  return {
    title: run.status === 'victory' ? '打完二十波了' : '护盾用完了',
    opening: `${openings[run.opening].name} · ${openings[run.opening].label}开局`,
    battle: `第 ${played.wave} 波 · ${trial?.name ?? encounters[encounter].name}`,
    wave: played.wave,
    score,
    board: played.board,
    damage: run.lastDamage,
    bounties: run.clearedTrials?.length ?? 0,
    leader,
    hasJournal: !!journal,
  };
}
