import { afterEach, describe, expect, it, vi } from 'vitest';
import { appearanceKey, createAppearance } from '../platform/appearance';

function stubStorage() {
  const entries = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
  });
  return entries;
}

afterEach(() => vi.unstubAllGlobals());

describe('board appearance', () => {
  it('requires unlocks and preserves the selection across sessions', () => {
    stubStorage();
    const appearance = createAppearance(false);
    const anotherSession = createAppearance(false);

    expect(appearance.equip('jade')).toBe(false);
    expect(appearance.unlock('jade')).toBe(true);
    expect(anotherSession.unlock('frost')).toBe(true);
    expect(appearance.equip('jade')).toBe(true);
    expect(createAppearance(false).read()).toEqual({
      selected: 'jade',
      unlocked: new Set(['obsidian', 'jade', 'frost']),
    });
  });

  it('retains the legacy board without overriding a newer valid choice', () => {
    const entries = stubStorage();
    entries.set(appearanceKey, JSON.stringify({ selected: 'copper', unlocked: ['unknown'] }));
    const appearance = createAppearance(true);

    expect(appearance.read()).toEqual({ selected: 'violet', unlocked: new Set(['obsidian', 'violet']) });
    expect(appearance.equip('obsidian')).toBe(true);
    expect(createAppearance(true).read().selected).toBe('obsidian');
  });
});
