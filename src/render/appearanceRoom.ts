import { boardThemeIds, boardThemes, type BoardThemeId } from '../core/boardThemes';
import type { Catalog, Run } from '../core/types';
import type { createAppearance } from '../platform/appearance';
import { CanvasRenderer } from './canvasRenderer';

export function bindAppearanceRoom(catalog: Catalog, appearance: ReturnType<typeof createAppearance>,
  click: () => void, apply: () => void) {
  const dialog = document.querySelector<HTMLDialogElement>('#appearance-dialog')!;
  const get = <T extends HTMLElement = HTMLElement>(id: string) => dialog.querySelector<T>(`#appearance-${id}`)!;
  const equip = get<HTMLButtonElement>('equip');
  const choices = get('choices');
  let renderer: CanvasRenderer | undefined;
  let preview: BoardThemeId = 'obsidian';

  const tabs = boardThemeIds.map(id => {
    const theme = boardThemes[id];
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.theme = id;
    button.style.setProperty('--theme-frame', theme.frame[0]);
    button.style.setProperty('--theme-depth', theme.frame[1]);
    button.style.setProperty('--theme-ink', theme.accent[1]);
    button.style.setProperty('--theme-trim', theme.trim);
    const swatch = document.createElement('span');
    swatch.className = 'appearance-swatch';
    swatch.setAttribute('aria-hidden', 'true');
    const name = document.createElement('strong');
    name.textContent = theme.name;
    const status = document.createElement('small');
    button.append(swatch, name, status);
    button.onclick = () => { click(); preview = id; draw(); };
    return { id, button, status };
  });
  choices.replaceChildren(...tabs.map(({ button }) => button));

  function draw() {
    const { selected, unlocked } = appearance.read();
    const theme = boardThemes[preview];
    const ready = unlocked.has(preview);
    for (const { id, button, status } of tabs) {
      button.setAttribute('aria-pressed', String(id === preview));
      status.textContent = id === selected ? '使用中' : unlocked.has(id) ? '已解锁' : '未解锁';
    }
    get('name').textContent = theme.name;
    get('hint').textContent = ready ? theme.unlock : `解锁条件 · ${theme.unlock}`;
    get('preview').setAttribute('aria-label', `${theme.name}棋盘预览`);
    equip.disabled = !ready || preview === selected;
    equip.textContent = preview === selected ? '使用中' : ready ? `使用${theme.name}` : '未解锁';
    renderer?.setTheme(preview);
  }

  equip.onclick = () => {
    if (!appearance.equip(preview)) return;
    click();
    apply();
    draw();
  };

  return (run: Run, preferred?: BoardThemeId) => {
    if (dialog.open) return;
    preview = preferred ?? appearance.read().selected;
    if (renderer) renderer.setRun(run);
    else renderer = new CanvasRenderer(get<HTMLCanvasElement>('preview'), run, catalog, true);
    draw();
    dialog.showModal();
    tabs.find(tab => tab.id === preview)?.button.focus({ preventScroll: true });
    dialog.scrollTop = 0;
  };
}
