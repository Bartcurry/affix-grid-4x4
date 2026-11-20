import { findReforgeSuggestion } from '../core/reforge';
import type { Run } from '../core/types';
import { catalog } from '../data/catalog';

self.onmessage = (event: MessageEvent<{ run: Run; currentDamage: number }>) => {
  const { run, currentDamage } = event.data;
  self.postMessage(findReforgeSuggestion(run, catalog, currentDamage));
};
