import type { SharedBoard } from '../core/boardShare';
import { findLesson, formationLessons, formationLink, makeFormationTrial, type FormationLesson } from '../core/formationGuide';
import type { Catalog } from '../core/types';
import type { TrialOptions } from './sharedBoardRoom';

const storageKey = 'affix-grid-4x4.formations';

function readCompleted() {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
    if (Array.isArray(raw)) return new Set<string>(raw.filter(id => typeof id === 'string' && findLesson(id)));
  } catch {}
  return new Set<string>();
}

export function bindFormationGuide(
  catalog: Catalog,
  glyph: (node: HTMLElement, id: string) => void,
  format: (value: number) => string,
  click: () => void,
  openTrial: (snapshot: SharedBoard, options: TrialOptions) => void,
) {
  const dialog = document.querySelector<HTMLDialogElement>('#formation-guide')!;
  const get = (id: string) => dialog.querySelector<HTMLElement>(`#formation-${id}`)!;
  const list = get('lessons');
  const rehearsals = new Map<FormationLesson, ReturnType<typeof makeFormationTrial>>();
  const completed = readCompleted();

  function syncProgress() {
    for (const id of readCompleted()) completed.add(id);
  }

  function rehearsal(lesson: FormationLesson) {
    const existing = rehearsals.get(lesson);
    if (existing) return existing;
    const prepared = makeFormationTrial(lesson, catalog);
    rehearsals.set(lesson, prepared);
    return prepared;
  }

  function updateProgress() {
    get('progress').textContent = `已解 ${completed.size} / ${formationLessons.length}`;
    for (const card of list.querySelectorAll<HTMLElement>('[data-lesson]')) {
      const cleared = completed.has(card.dataset.lesson!);
      card.dataset.completed = String(cleared);
      card.querySelector<HTMLElement>('.formation-status')!.hidden = !cleared;
    }
  }

  function train(lesson: FormationLesson, leave?: () => void) {
    const { snapshot, targetDamage } = rehearsal(lesson);
    openTrial(snapshot, { leave, practice: {
      title: lesson.title,
      clue: lesson.clue,
      target: targetDamage,
      link: formationLink(location.href, lesson.id),
      complete() {
        syncProgress();
        completed.add(lesson.id);
        try { localStorage.setItem(storageKey, JSON.stringify([...completed])); } catch {}
        updateProgress();
      },
    } });
  }

  function show(runeId?: string) {
    syncProgress();
    get('filter').hidden = !runeId;
    get('filter-name').textContent = runeId ? `搭配${catalog[runeId].name}` : '';
    list.replaceChildren(...formationLessons.filter(lesson => !runeId || lesson.pieces.some(([, id]) => id === runeId)).map(lesson => {
      const { originalDamage, targetDamage } = rehearsal(lesson);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'formation-card';
      card.dataset.lesson = lesson.id;
      card.dataset.style = lesson.style;
      const header = document.createElement('span'); header.className = 'formation-card-heading';
      const title = document.createElement('strong'); title.textContent = lesson.title;
      const style = document.createElement('small'); style.textContent = lesson.style;
      header.append(title, style);
      const runes = document.createElement('span'); runes.className = 'formation-runes';
      for (const id of new Set(lesson.pieces.map(([, id]) => id))) {
        const rune = document.createElement('span');
        rune.style.color = catalog[id].color;
        glyph(rune, id);
        runes.append(rune);
      }
      const stats = document.createElement('span'); stats.className = 'formation-card-stats';
      const score = document.createElement('span'); score.textContent = `${format(originalDamage)} → ${format(targetDamage)} 伤害`;
      const status = document.createElement('small'); status.className = 'formation-status'; status.textContent = '已解';
      stats.append(score, status);
      card.append(header, runes, stats);
      card.onclick = () => { click(); train(lesson); };
      return card;
    }));
    updateProgress();
    if (!dialog.open) dialog.showModal();
  }

  get('guide-close').onclick = () => { click(); dialog.close(); };
  get('show-all').onclick = () => { click(); show(); list.querySelector('button')?.focus(); };
  return { show, train };
}
