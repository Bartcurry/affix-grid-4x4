import { boardThemes, type BoardThemeId } from '../core/boardThemes';

export const appearanceKey = 'affix-grid-4x4.appearance.v1';
const isTheme = (value: unknown): value is BoardThemeId => typeof value === 'string' && Object.hasOwn(boardThemes, value);

export function createAppearance(legacyViolet: boolean) {
  const unlocked = new Set<BoardThemeId>(legacyViolet ? ['obsidian', 'violet'] : ['obsidian']);
  let selected: BoardThemeId = legacyViolet ? 'violet' : 'obsidian';

  function read() {
    try {
      const value = JSON.parse(localStorage.getItem(appearanceKey) ?? 'null');
      if (Array.isArray(value?.unlocked)) value.unlocked.filter(isTheme).forEach((id: BoardThemeId) => unlocked.add(id));
      if (isTheme(value?.selected) && unlocked.has(value.selected)) selected = value.selected;
    } catch {}
    return { selected, unlocked };
  }

  function save() {
    try { localStorage.setItem(appearanceKey, JSON.stringify({ selected, unlocked: [...unlocked] })); } catch {}
  }

  return {
    read,
    unlock(id: BoardThemeId) {
      read();
      if (unlocked.has(id)) return false;
      unlocked.add(id);
      save();
      return true;
    },
    equip(id: BoardThemeId) {
      read();
      if (!unlocked.has(id)) return false;
      selected = id;
      save();
      return true;
    },
  };
}
