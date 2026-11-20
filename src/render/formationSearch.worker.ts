import type { SharedBoard } from '../core/boardShare';
import { findFormationPlan } from '../core/formationMove';
import type { TurnResult } from '../core/types';
import { catalog } from '../data/catalog';

self.onmessage = (event: MessageEvent<{ board: SharedBoard; result: TurnResult }>) => {
  const { board, result } = event.data;
  self.postMessage(findFormationPlan(board, catalog, result));
};
