import type { DailyGoal, DailyMove, RunePuzzle } from '../core/daily';

interface StoredPuzzleDraft {
  signature: string;
  moves: DailyMove[];
  goal: DailyGoal;
  updatedAt: number;
}

function signature(puzzle: RunePuzzle) {
  const { formation, pieces, hp } = puzzle;
  return JSON.stringify([formation.title, formation.enemy, formation.cells, pieces, hp, formation.gold, formation.tiles,
    formation.relic, formation.affix?.id]);
}

export function createPuzzleDraftStore(mode: 'daily' | 'drill') {
  const fallback = new Map<string, string | null>();
  const prefix = `affix-grid-4x4.puzzle-draft.v1.${mode}.`;

  function read(id: string) {
    try {
      const raw = fallback.has(id) ? fallback.get(id) : localStorage.getItem(prefix + id);
      if (!raw) return;
      const stored = JSON.parse(raw) as StoredPuzzleDraft | null;
      if (!stored || typeof stored.signature !== 'string' || !Array.isArray(stored.moves) ||
        !Number.isSafeInteger(stored.updatedAt) || (stored.goal !== 'clear' && stored.goal !== 'peak')) return;
      return stored;
    } catch {
      return;
    }
  }

  return {
    load(id: string, puzzle: RunePuzzle) {
      const stored = read(id);
      if (!stored || stored.signature !== signature(puzzle)) return;
      const pieces = [...puzzle.pieces];
      const moves: DailyMove[] = [];
      for (const move of stored.moves) {
        if (!Array.isArray(move) || move.length !== 2) return;
        const [a, b] = move;
        if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= pieces.length || b >= pieces.length ||
          pieces[a] === pieces[b]) return;
        [pieces[a], pieces[b]] = [pieces[b], pieces[a]];
        moves.push([a, b]);
      }
      return { pieces, moves, goal: stored.goal, persistent: !fallback.has(id) };
    },

    changedAt(id: string) {
      const stored = read(id);
      if (stored?.moves.length) return stored.updatedAt;
    },

    save(id: string, puzzle: RunePuzzle, moves: readonly DailyMove[], goal: DailyGoal = 'clear') {
      const value = moves.length || goal === 'peak'
        ? JSON.stringify({ signature: signature(puzzle), moves, goal, updatedAt: Date.now() }) : null;
      try {
        if (value === null) localStorage.removeItem(prefix + id);
        else localStorage.setItem(prefix + id, value);
        fallback.delete(id);
        return true;
      } catch {
        fallback.set(id, value);
        return false;
      }
    },
  };
}
