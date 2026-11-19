import { boardShareUrl, type SharedBoard } from '../core/boardShare';
import { encounters, relics } from '../core/expedition';
import { prepareBattle } from '../core/tactics';
import { battleTarget } from '../core/trials';
import type { BattleJournal, Catalog, Rune } from '../core/types';

const tiles = { li_fire: '离火', xuan_ice: '玄冰', spirit_gathering: '聚灵' } as const;
const sameRune = (a: Rune | null, b: Rune | null) => a?.configId === b?.configId && a?.star === b?.star && a?.bonusPower === b?.bonusPower;

export function openSharedBoard(
  snapshot: SharedBoard,
  catalog: Catalog,
  glyph: (owner: HTMLElement, id: string) => void,
  format: (number: number) => string,
  click: () => void,
  review: (journal: BattleJournal) => void,
  leave: () => void,
) {
  const dialog = document.querySelector<HTMLDialogElement>('#shared-board-dialog')!;
  const get = (id: string) => dialog.querySelector<HTMLElement>(`#${id}`)!;
  const grid = get('shared-board-grid');
  const result = get('shared-board-result');
  const journalButton = get('shared-board-journal');
  const share = dialog.querySelector<HTMLDetailsElement>('#shared-board-share')!;
  const link = dialog.querySelector<HTMLInputElement>('#shared-board-link')!;
  const copy = get('shared-board-copy');
  const { hp, encounter, trial } = battleTarget(snapshot.wave, snapshot.trialWave);
  const original = prepareBattle(snapshot, catalog).events.at(-1);
  if (original?.type !== 'TURN_RESULT') return;
  let board = [...snapshot.board];
  let selected: number | null = null;
  let best: number | undefined;
  let journal: BattleJournal | undefined;
  const instructions = '点任意两格换位，空格也能用。';

  function draw(focus?: number) {
    grid.replaceChildren(...board.map((rune, cell) => {
      const button = document.createElement('button');
      button.type = 'button';
      const config = rune && catalog[rune.configId];
      const modifier = snapshot.tileModifiers[cell];
      const stamp = document.createElement('small');
      stamp.textContent = `${cell + 1}${modifier ? ` ${tiles[modifier]}` : ''}`;
      if (modifier) button.dataset.modifier = modifier;
      button.setAttribute('aria-label', `第 ${cell + 1} 格，${config ? `${config.name} ${rune!.star} 星` : '空格'}${modifier ? `，${tiles[modifier]}位` : ''}`);
      button.setAttribute('aria-pressed', String(cell === selected));
      const icon = document.createElement('span');
      icon.setAttribute('aria-hidden', 'true');
      if (config && rune) {
        button.style.setProperty('--daily-ink', config.color);
        glyph(icon, config.id);
        const label = document.createElement('strong');
        label.textContent = `${config.name} ${'·'.repeat(rune.star)}`;
        button.append(stamp, icon, label);
      } else {
        button.dataset.empty = 'true';
        icon.textContent = '＋';
        button.append(stamp, icon);
      }
      button.onclick = () => {
        click();
        if (selected === null) {
          selected = cell;
          result.textContent = '再点一格，交换位置。';
        } else {
          const from = selected;
          selected = null;
          if (from !== cell && !sameRune(board[from], board[cell])) [board[from], board[cell]] = [board[cell], board[from]];
          result.textContent = instructions;
        }
        delete result.dataset.win;
        draw(cell);
      };
      return button;
    }));
    if (focus !== undefined) (grid.children[focus] as HTMLButtonElement).focus({ preventScroll: true });
  }

  get('shared-board-wave').textContent = `第 ${snapshot.wave} 波 · ${trial?.name ?? encounters[encounter].name} · ${format(hp)} 生命`;
  get('shared-board-original').textContent = format(original.damage);
  get('shared-board-rules').textContent = `${format(snapshot.gold)} 金${snapshot.relics.length ? ` · ${snapshot.relics.map(id => relics[id].name).join('、')}` : ''}`;
  result.textContent = instructions;
  get('shared-board-close').onclick = () => { click(); dialog.close(); };
  get('shared-board-reset').onclick = () => {
    click(); board = [...snapshot.board]; selected = null;
    result.textContent = instructions; delete result.dataset.win; draw();
  };
  get('shared-board-check').onclick = () => {
    click();
    const { events } = prepareBattle({ ...snapshot, board }, catalog);
    const turn = events.at(-1);
    if (turn?.type !== 'TURN_RESULT') return;
    journal = { wave: snapshot.wave, trialWave: snapshot.trialWave, board: [...board], gold: snapshot.gold, events };
    journalButton.hidden = false;
    best = best === undefined ? turn.damage : Math.max(best, turn.damage);
    get('shared-board-best').textContent = format(best);
    const change = turn.damage - original.damage;
    const comparison = change > 0 ? `比原阵多 ${format(change)}` : change < 0 ? `比原阵少 ${format(-change)}` : '追平原阵';
    result.textContent = `${format(turn.damage)} 伤害 · ${comparison}。${turn.win ? '打过了。' : `还差 ${format(turn.hp)} 点。`}`;
    result.dataset.win = String(turn.win);
    const changed = board.some((rune, index) => !sameRune(rune, snapshot.board[index]));
    link.value = changed ? boardShareUrl(location.href, { ...snapshot, board }) ?? '' : '';
    share.hidden = !link.value;
    copy.textContent = '复制';
  };
  journalButton.onclick = () => { if (journal) { click(); review(journal); } };
  copy.onclick = async () => {
    click();
    const address = link.value;
    try {
      await navigator.clipboard.writeText(address);
      if (dialog.open && link.value === address) copy.textContent = '已复制';
    } catch { if (dialog.open) { link.focus(); link.select(); } }
  };
  dialog.addEventListener('close', leave, { once: true });
  draw();
  dialog.showModal();
}
