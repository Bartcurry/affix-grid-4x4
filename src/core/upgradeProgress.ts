import { preparePurchase } from './purchasePreview';
import { purchaseInfo } from './shopEngine';
import { planTurn } from './tactics';
import type { Catalog, Run, Slot } from './types';

export function upgradeProgress(run: Pick<Run, 'board' | 'bench' | 'shop'>) {
  const groups = new Map<string, { singles: Slot[]; doubles: Slot[] }>();
  for (const zone of ['board', 'bench'] as const) {
    run[zone].forEach((rune, index) => {
      if (!rune || rune.star === 3) return;
      const group = groups.get(rune.configId) ?? { singles: [], doubles: [] };
      (rune.star === 1 ? group.singles : group.doubles).push({ zone, index });
      groups.set(rune.configId, group);
    });
  }
  return [...groups].map(([id, { singles, doubles }]) => {
    const target = doubles.length >= 2 ? 3 : 2;
    const filled = target === 3 ? doubles.length * 3 + singles.length : singles.length;
    const required = target === 3 ? 9 : 3;
    const offers = run.shop.flatMap((offer, index) => offer?.configId === id ? [index] : []);
    return { id, singles, doubles, target, required, filled, missing: Math.max(0, required - filled), offers };
  }).sort((a, b) => a.missing - b.missing || Number(!a.offers.length) - Number(!b.offers.length) || b.target - a.target);
}

export function previewUpgrade(run: Run, index: number, catalog: Catalog) {
  const { blocked, willMerge } = purchaseInfo(run, index, catalog);
  if (blocked || !willMerge) return;
  const setup = preparePurchase(run, index, catalog);
  if (!setup?.merge) return;
  const { candidate, merge: final } = setup;
  const freed = (['board', 'bench'] as const).flatMap(zone =>
    run[zone].flatMap((rune, index) => rune && !candidate[zone][index] ? [{ zone, index }] : []));
  const { hp, result } = planTurn(candidate, catalog);
  return { final, freed, hp, result };
}
