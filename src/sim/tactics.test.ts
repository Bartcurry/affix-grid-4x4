import { describe, expect, it } from 'vitest';
import { catalog } from '../data/catalog';
import { newRun, settleTurn, swapRunes } from '../core/shopEngine';
import { planTurn, previewPlacement, runeFootprint } from '../core/tactics';

const shopRandom = () => .4;

describe('tactical forecast', () => {
  it('accounts for all damage and uses the same result for settlement', () => {
    const run = newRun(catalog, shopRandom);
    const before = structuredClone(run);
    const forecast = planTurn(run, catalog);
    expect(forecast.tutorialDamage).toBe(42);
    expect(forecast.result.win).toBe(true);
    expect(forecast.byCell.reduce((sum, source) => sum + source.damage, 0) + forecast.tutorialDamage + forecast.poisonDamage)
      .toBe(forecast.result.damage);
    expect(forecast.byCell.reduce((sum, source) => sum + source.activations, 0)).toBe(forecast.result.combo);
    expect(planTurn(run, catalog)).toEqual(forecast);
    expect(run).toEqual(before);
    settleTurn(run, forecast.result, catalog, shopRandom);
    expect(run).toMatchObject({ wave: 2, lastDamage: forecast.result.damage });
  });

  it('previews a board and bench swap without touching the actual slots or shop', () => {
    const run = newRun(catalog, shopRandom);
    run.bench[0] = { configId: 'venom_drop', star: 1 };
    const from = { zone: 'bench', index: 0 } as const;
    const to = { zone: 'board', index: 0 } as const;
    const before = structuredClone(run);
    const preview = previewPlacement(run, from, to);
    expect(preview).not.toBeNull();
    const forecast = planTurn(preview!, catalog);
    expect(forecast.poisonDamage).toBe(7);
    expect(forecast.tutorialDamage).toBe(0);
    expect(run).toEqual(before);
    expect(swapRunes(run, from, to)).toBe(true);
    expect(planTurn(run, catalog)).toEqual(forecast);
  });

  it('distinguishes trigger targets from other effects and respects board edges', () => {
    expect([...runeFootprint(catalog.prism_right, 0).links]).toEqual([1]);
    expect(runeFootprint(catalog.prism_right, 3).links.size).toBe(0);
    expect(runeFootprint(catalog.prism_right, 0).effects.size).toBe(0);
    expect([...runeFootprint(catalog.tax_collector, 0).effects].sort()).toEqual([1, 4]);
    expect(runeFootprint(catalog.spark_orb, 0).effects.size).toBe(0);
  });
});
