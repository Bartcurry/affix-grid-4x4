import { expect, it } from 'vitest';
import { findLesson, formationLessons, formationLink, makeFormationTrial } from '../core/formationGuide';
import { prepareBattle } from '../core/tactics';
import { catalog } from '../data/catalog';

it('sets each target using a reachable, stronger formation and keeps the original board playable', () => {
  expect(formationLessons).toHaveLength(6);
  for (const lesson of formationLessons) {
    expect(findLesson(lesson.id)).toBe(lesson);
    const { snapshot, originalDamage, targetDamage } = makeFormationTrial(lesson, catalog);
    const original = prepareBattle(snapshot, catalog).events.at(-1);
    expect(original).toMatchObject({ type: 'TURN_RESULT', damage: originalDamage });
    expect(targetDamage, lesson.title).toBeGreaterThan(originalDamage);
    const improved = [...snapshot.board];
    for (const [from, to] of lesson.swaps) [improved[from], improved[to]] = [improved[to], improved[from]];
    const attempt = prepareBattle({ ...snapshot, board: improved }, catalog).events.at(-1);
    expect(attempt).toMatchObject({ type: 'TURN_RESULT', damage: targetDamage, win: true });
  }
  expect(makeFormationTrial(findLesson('spark')!, catalog)).toMatchObject({ originalDamage: 42, targetDamage: 90 });
  expect(formationLink('https://test.example/game/?challenge=foo#board=bar', 'spark')).toBe('https://test.example/game/?lesson=spark');
  expect(formationLink('file:///game.html', 'spark')).toBe('');
});
