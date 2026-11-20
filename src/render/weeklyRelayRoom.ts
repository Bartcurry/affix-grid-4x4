import { runDaily } from '../core/daily';
import { encounters } from '../core/expedition';
import { relayLink, relayPosition, relayWeek, restoreRelayDraft, stageAllowance, validRelayScore, weeklyRelay,
  type Relay, type RelayDraft, type RelayScore } from '../core/weeklyRelay';
import type { Catalog, TurnResult } from '../core/types';
import { formatNumber as format } from './canvasRenderer';
import { drawPuzzleBoard } from './puzzleBoard';

const prefix = 'affix-grid-4x4.relay.v1.';
const ordinal = ['第一阵', '第二阵', '第三阵'];

export function bindWeeklyRelay(catalog: Catalog, glyph: (cell: HTMLElement, id: string) => void, click: () => void) {
  const dialog = document.querySelector<HTMLDialogElement>('#relay-dialog')!;
  const get = <T extends HTMLElement = HTMLElement>(id: string) => dialog.querySelector<T>(`#relay-${id}`)!;
  const board = get('board');
  const status = get('result');
  const lock = get<HTMLButtonElement>('lock');
  const link = get<HTMLInputElement>('link');
  const share = get('share');
  let relay: Relay;
  let draft: RelayDraft;
  let results: RelayScore[];
  let selected: number | undefined;
  let trial: TurnResult | undefined;
  let best: RelayScore | undefined;
  const stage = () => relay.stages[draft.spent.length];

  function read(key: string): unknown {
    try { return JSON.parse(localStorage.getItem(prefix + key + '.' + relay.day) ?? 'null'); }
    catch { return null; }
  }

  function write(key: string, value: unknown) {
    try { localStorage.setItem(prefix + key + '.' + relay.day, JSON.stringify(value)); } catch {}
  }

  function message(text: string, state = '') {
    status.textContent = text;
    status.dataset.state = state;
  }

  function summary() {
    return results.reduce((total, result) => ({ damage: total.damage + result.damage, moves: total.moves + result.moves }), { damage: 0, moves: 0 });
  }

  function record(score: RelayScore) {
    const saved = validRelayScore(relay, read('best') as RelayScore | undefined) ?? best;
    best = saved && (saved.damage > score.damage || (saved.damage === score.damage && saved.moves <= score.moves)) ? saved : score;
    write('best', best);
  }

  function draw(focus?: number) {
    const current = stage();
    const { damage, moves } = summary();
    const used = moves + draft.current.length;
    const cap = stageAllowance(relay, draft.spent);
    get('budget').textContent = `${relay.budget - used} / ${relay.budget} 步`;
    get('total').textContent = format(damage);
    get('stages').replaceChildren(...relay.stages.map((puzzle, index) => {
      const item = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = ordinal[index];
      const detail = document.createElement('small');
      const result = results[index];
      item.dataset.state = result ? 'cleared' : index === results.length ? 'current' : 'ahead';
      if (index === results.length) item.setAttribute('aria-current', 'step');
      detail.textContent = result ? `${result.moves} 步 · ${format(result.damage)}` : puzzle.formation.title;
      item.append(title, detail);
      return item;
    }));
    const target = relay.ceilings.at(-1)!;
    get('best').textContent = best ? `最佳 ${format(best.damage)} / ${format(target)} · ${best.moves} 步` : `本期满分 ${format(target)}`;
    get('stage').hidden = !current;
    get('tools').hidden = !current;
    get('restart').hidden = !used;
    if (!current) return;
    get('name').textContent = current.formation.title;
    get('enemy').textContent = `${encounters[current.formation.enemy].name} · ${format(current.hp)} 血`;
    get('moves').textContent = `本阵 ${draft.current.length} / ${cap} 步 · 至少 ${current.par} 步`;
    get('rules').textContent = `${current.formation.gold ? `起始 ${current.formation.gold} 金 · ` : ''}保留共鸣 · 无暴击`;
    get<HTMLButtonElement>('undo').disabled = !draft.current.length;
    get<HTMLButtonElement>('reset').disabled = !draft.current.length;
    lock.disabled = !trial?.win;
    lock.textContent = results.length === relay.stages.length - 1 ? '锁定并结算' : '锁定本阵';
    const pieces = relayPosition(current, draft.current)!;
    drawPuzzleBoard(board, current.formation, pieces, catalog, glyph, {
      selected, focus, pick(index) {
        click();
        if (selected === index) {
          selected = undefined;
          initialMessage();
        } else if (selected === undefined || pieces[selected] === pieces[index]) {
          selected = index;
          const rune = catalog[pieces[index]];
          message(`${rune.name} · ${rune.desc}`);
        } else if (draft.current.length >= cap) {
          selected = undefined;
          message('本阵步数用完了。可以撤销一步，或用当前摆法试打。', 'loss');
        } else {
          draft.current.push([selected, index]);
          change('摆好了。可以继续换位，或试打看伤害。', index);
          return;
        }
        draw(index);
      },
    });
  }

  function initialMessage() {
    if (stage()) message('点两枚符文换位。步数三阵共用，锁定后进入下一阵。');
    else {
      const { damage, moves } = summary();
      message(`${damage === relay.ceilings.at(-1) ? '满分接力' : '三阵通关'} · ${moves} 步打出 ${format(damage)} 点总伤害。`, 'win');
    }
  }

  function change(text: string, focus?: number) {
    selected = trial = undefined;
    write('draft', draft);
    message(text);
    draw(focus);
  }

  get('close').onclick = () => dialog.close();
  get('undo').onclick = () => { click(); draft.current.pop(); change('撤销了一步。'); };
  get('reset').onclick = () => { click(); draft.current = []; change('本阵已重摆。'); };
  get('restart').onclick = () => {
    click();
    draft = { spent: [], current: [] };
    results = [];
    change('重新从第一阵开始。');
    get('close').focus({ preventScroll: true });
  };
  get('check').onclick = () => {
    const current = stage();
    if (!current) return;
    click();
    trial = runDaily(current.formation, current.hp, relayPosition(current, draft.current)!, catalog);
    const canMove = draft.current.length < stageAllowance(relay, draft.spent);
    const next = canMove ? '可锁定成绩，或再换位冲更高伤害。' : '本阵步数已用完，可锁定成绩。';
    message(trial.win ? `打出 ${format(trial.damage)} 点。${next}` :
      `打出 ${format(trial.damage)} 点，离过关还差 ${format(trial.hp)} 点。${current.formation.clue}`, trial.win ? 'win' : 'loss');
    lock.disabled = !trial.win;
  };
  lock.onclick = () => {
    if (!stage() || !trial?.win) return;
    click();
    results.push({ damage: trial.damage, moves: draft.current.length });
    draft.spent.push(draft.current);
    draft.current = [];
    selected = trial = undefined;
    write('draft', draft);
    if (!stage()) record(summary());
    initialMessage();
    draw();
    get(stage() ? 'name' : 'copy').focus({ preventScroll: true });
  };
  get('copy').onclick = async () => {
    click();
    const day = relay.day;
    link.value = relayLink(location.href, day, best);
    share.hidden = false;
    try {
      const score = best ? `${best.moves} 步 / ${best.damage} 点总伤害` : `三阵共用 ${relay.budget} 步，来试试。`;
      await navigator.clipboard.writeText(`4×4 词条法阵 · 三阵接力\n${score}\n${link.value}`);
      if (dialog.open && relay.day === day) share.textContent = '接力链接已复制。';
    } catch {
      if (!dialog.open || relay.day !== day) return;
      share.textContent = '长按链接可复制。';
      link.hidden = false;
      link.focus();
      link.select();
    }
  };

  return { dialog, open(day = relayWeek(), score?: RelayScore) {
    if (dialog.open) return false;
    const next = weeklyRelay(day, catalog);
    if (!next) return false;
    relay = next;
    const prior = restoreRelayDraft(relay, read('draft'), catalog);
    draft = prior?.draft ?? { spent: [], current: [] };
    results = prior?.results ?? [];
    best = validRelayScore(relay, read('best') as RelayScore | undefined);
    if (!stage()) record(summary());
    selected = trial = undefined;
    const friend = validRelayScore(relay, score);
    get('date').textContent = `${day} 当周 · 每周一换题`;
    get('friend').hidden = !friend;
    get('friend').textContent = friend ? `朋友的成绩 · ${friend.moves} 步 / ${format(friend.damage)} 点` : '';
    link.hidden = share.hidden = true;
    share.textContent = '';
    initialMessage();
    draw();
    dialog.showModal();
    dialog.scrollTop = 0;
    return true;
  } };
}
