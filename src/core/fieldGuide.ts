import { previewOffer } from './marketPreview';
import { canArrange, createSnapshot, restoreSnapshot, swapRunes } from './shopEngine';
import { openings } from './openings';
import { prepareBattle } from './tactics';
import type { planTurn } from './tactics';
import type { Catalog, Run, Slot, TurnResult } from './types';

type Turn = ReturnType<typeof planTurn>;

export type FieldTip = {
  text: string;
  offer?: number;
  destination?: Slot;
  origin?: Slot;
};

export function fieldTip(run: Run, catalog: Catalog, current: Turn): FieldTip | null {
  if (!canArrange(run) || run.endless || run.wave > 3) return null;
  if (run.wave === 1 && current.result.win) return { text: '现在的阵容就能打过首波。先开战，留着金币买下一波的搭档。' };
  if (current.result.win) return { text: '当前阵容已经够打，不必为了过这波花钱。手里至少留 10 金，过关就有利息。' };
  let best: { tip: FieldTip; win: boolean; damage: number; cost: number } | undefined;
  const consider = (result: TurnResult, tip: FieldTip, cost: number) => {
    if (result.damage <= current.result.damage) return;
    if (best && (Number(result.win) < Number(best.win) || (result.win === best.win &&
      ((result.win && cost > best.cost) || ((!result.win || cost === best.cost) && result.damage <= best.damage))))) return;
    best = { tip, win: result.win, damage: result.damage, cost };
  };
  const considerFreeMove = (candidate: Run, tip: FieldTip) => {
    const result = prepareBattle(candidate, catalog).events.at(-1);
    if (result?.type === 'TURN_RESULT') consider(result, tip, 0);
  };
  const clone = (source: Run) => {
    const copy = { ...source };
    restoreSnapshot(copy, createSnapshot(source));
    return copy;
  };
  for (const [index, rune] of run.board.entries()) {
    if (!rune) continue;
    const origin: Slot = { zone: 'board', index };
    for (const [cell, occupant] of run.board.entries()) {
      if (cell === index || (occupant && cell < index)) continue;
      const destination: Slot = { zone: 'board', index: cell };
      const copy = clone(run);
      const name = catalog[rune.configId].name;
      const action = occupant ? `和第 ${cell + 1} 格换位` : `移到第 ${cell + 1} 格`;
      if (swapRunes(copy, origin, destination)) considerFreeMove(copy,
        { origin, destination, text: `把第 ${index + 1} 格的「${name}」${action}，不花钱。` });
    }
  }
  for (const [index, rune] of run.bench.entries()) {
    if (!rune) continue;
    const origin: Slot = { zone: 'bench', index };
    for (const [cell, occupant] of run.board.entries()) {
      if (occupant) continue;
      const destination: Slot = { zone: 'board', index: cell };
      const copy = clone(run);
      if (swapRunes(copy, origin, destination)) considerFreeMove(copy,
        { origin, destination, text: `把备战区的「${catalog[rune.configId].name}」放到第 ${cell + 1} 格。` });
    }
  }
  if (!best?.win) {
    for (const [index, offer] of run.shop.entries()) {
      if (!offer) continue;
      const { name, cost } = catalog[offer.configId];
      for (const { cell, result } of previewOffer(run, index, catalog)) {
        if (cell === undefined) consider(result, { offer: index, text: `买下「${name}」会直接升星。` }, cost);
        else if (!run.board[cell]) {
          const destination: Slot = { zone: 'board', index: cell };
          consider(result, { offer: index, destination, text: `买「${name}」并放到第 ${cell + 1} 格。` }, cost);
        }
      }
    }
  }
  if (best) return { ...best.tip, text: `${best.tip.text} ${best.win ? '这套能打过。' : `预计能打 ${best.damage} 点，还差 ${current.hp - best.damage} 点。`}` };
  const supply = catalog[openings[run.opening].supply];
  return { text: run.freeRefreshes ? '这批没试到更好的阵。还有免费刷新，可以换一批再看。' :
    `这批没试到更好的阵。可以留意「${supply.name}」，或拖动已有符文试试位置。` };
}
