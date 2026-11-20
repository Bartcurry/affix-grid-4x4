import { challengeFromRun, challengeProgress, challengeUrl, type Challenge } from '../core/challenge';
import { openings, runScore } from '../core/openings';
import { boardFromJournal, boardShareUrl } from '../core/boardShare';
import { canArrange } from '../core/shopEngine';
import { prepareBattle } from '../core/tactics';
import type { Catalog, Run } from '../core/types';

export function bindChallengeRoom(click: () => void, enter: (quick: boolean) => void, leave: () => void, reply: (run: Run) => void) {
  const dialog = document.querySelector<HTMLDialogElement>('#challenge-dialog')!;
  const get = <T extends HTMLElement = HTMLElement>(id: string) => dialog.querySelector<T>(`#${id}`)!;
  let firstVisit = false;
  const manual = get<HTMLButtonElement>('challenge-enter');
  const quick = get<HTMLButtonElement>('challenge-quick');
  const send = get<HTMLButtonElement>('challenge-share-score');
  const back = get<HTMLButtonElement>('challenge-leave');
  manual.onclick = () => { click(); dialog.close(); if (firstVisit) enter(false); };
  quick.onclick = () => {
    if (!dialog.open || !firstVisit) return;
    dialog.close();
    enter(true);
  };
  back.onclick = () => { click(); leave(); };
  dialog.addEventListener('cancel', event => {
    if (!firstVisit) return;
    event.preventDefault();
    leave();
  });

  return (challenge: Challenge, run: Run, first = false, comparableMain?: Run) => {
    firstVisit = first;
    const local = first && comparableMain ? comparableMain : run;
    const player = runScore(local);
    const hasScore = !!(player.cleared || player.combo);
    const replyFirst = first && !!comparableMain && hasScore;
    const opening = openings[challenge.opening];
    get('challenge-opening').textContent = `${opening.name} · ${opening.label}开局  /  ${challenge.seed}`;
    get('challenge-target-wave').textContent = `${challenge.cleared} 波`;
    get('challenge-target-combo').textContent = `最高 ${challenge.combo} 连击`;
    get('challenge-player-label').textContent = first && comparableMain ? '本机同种子战绩' : '你的战绩';
    get('challenge-player-wave').textContent = `${player.cleared} 波`;
    get('challenge-player-combo').textContent = `最高 ${player.combo} 连击`;
    const progress = challengeProgress(player, challenge);
    const status = get('challenge-status');
    status.hidden = first && !comparableMain;
    status.dataset.rank = String(progress.rank);
    status.textContent = progress.text;
    quick.hidden = !first;
    quick.textContent = replyFirst ? '再打首波' : '开打首波';
    manual.textContent = first ? '先布阵' : run.status === 'active' ? '继续挑战' : '查看结算';
    send.hidden = !hasScore;
    send.onclick = () => reply(local);
    const primary = first ? replyFirst ? send : quick : manual;
    for (const action of [quick, manual, send]) {
      action.classList.toggle('primary', action === primary);
      action.autofocus = action === primary;
    }
    dialog.toggleAttribute('data-reply-first', replyFirst);
    primary.parentElement!.replaceChildren(...(replyFirst ? [send, quick, manual, back] : [quick, manual, send, back]));
    if (!dialog.open) dialog.showModal();
  };
}

interface InviteOptions { preferBoard?: boolean; replyTo?: Challenge }

export function bindInviteRoom(click: () => void, catalog: Catalog, format: (number: number) => string) {
  const dialog = document.querySelector<HTMLDialogElement>('#invite-dialog')!;
  const get = <T extends HTMLElement = HTMLElement>(id: string) => dialog.querySelector<T>(`#${id}`)!;
  const details = get<HTMLDetailsElement>('invite-details');
  const textarea = get<HTMLTextAreaElement>('invite-text');
  const copy = get('invite-copy');
  const native = get('invite-native');
  const feedback = get('invite-feedback');
  const modes = get('invite-modes');
  const campaign = get('invite-campaign');
  const board = get('invite-board');
  let share: ShareData = {};

  function manual() {
    details.open = true;
    feedback.hidden = false;
    feedback.textContent = '长按选中下方文字，可以手动复制。';
    textarea.focus();
    textarea.select();
  }

  get('invite-close').onclick = () => { click(); dialog.close(); };
  copy.onclick = async () => {
    click();
    const contents = textarea.value;
    try {
      await navigator.clipboard.writeText(contents);
      if (!dialog.open || textarea.value !== contents) return;
      feedback.hidden = false;
      feedback.textContent = '邀请已复制。';
    } catch { if (dialog.open && textarea.value === contents) manual(); }
  };
  native.onclick = async () => {
    click();
    try { await navigator.share(share); }
    catch (error) { if (dialog.open && !(error instanceof DOMException && error.name === 'AbortError')) manual(); }
  };

  return (run: Run, { preferBoard = false, replyTo }: InviteOptions = {}) => {
    const challenge = challengeFromRun(run);
    const url = challengeUrl(location.href, challenge);
    const name = openings[challenge.opening].name;
    const score = `${challenge.cleared} 波 / ${challenge.combo} 连击`;
    const isLastBattle = !canArrange(run);
    const snapshot = isLastBattle ? boardFromJournal(run.lastJournal) : run;
    const boardUrl = snapshot && !replyTo ? boardShareUrl(location.href, snapshot) : null;
    modes.hidden = !boardUrl;
    board.textContent = isLastBattle ? '最后一波' : '这一波';
    function selectBoard(enabled: boolean) {
      const useBoard = enabled && !!boardUrl;
      campaign.setAttribute('aria-pressed', String(!useBoard));
      board.setAttribute('aria-pressed', String(useBoard));
      const address = useBoard ? boardUrl : url;
      let text = `来打同一个开局。「${name}」${challenge.cleared || challenge.combo ? `，我的战绩是 ${score}。` : '，看看谁能走得更远。'}`;
      let summary = url ? `${name}开局 · ${score}。朋友从同一个种子开始。` : `${name}开局 · ${score}。离线试玩可以分享种子码 ${challenge.seed}。`;
      get('invite-title').textContent = replyTo && !useBoard ? '回传战绩' : '约朋友打同一局';
      if (replyTo) {
        const reply = challengeProgress(challenge, replyTo);
        const finish = reply.rank > 0 ? '我领先了，轮到你了。' : reply.rank === 0 ? '我追平了，再比一轮？' : '看看你还能不能再走远一点。';
        text = `「${name}」同种子战绩，${score}。${finish}`;
        summary = `${name}开局 · ${score}。${reply.text}`;
      }
      if (useBoard && snapshot) {
        const result = isLastBattle ? run.lastJournal?.events.at(-1) : prepareBattle(snapshot, catalog).events.at(-1);
        const damage = result?.type === 'TURN_RESULT' ? format(result.damage) : '0';
        text = `接手我的${isLastBattle ? '最后一波，' : ''}第 ${snapshot.wave} 波。原阵打 ${damage} 伤害，你换几格能打得更高？`;
        summary = `第 ${snapshot.wave} 波 · 原阵 ${damage} 伤害。朋友打开就能换位试打。`;
      }
      share = { title: '4×4 词条法阵', text, ...(address ? { url: address } : {}) };
      textarea.value = `《4×4 词条法阵》${text}\n${address ?? `种子码 ${challenge.seed}`}`;
      get('invite-summary').textContent = summary;
      details.open = false;
      feedback.hidden = true;
      native.hidden = !address || typeof navigator.share !== 'function';
      copy.classList.toggle('primary', native.hidden);
    }
    campaign.onclick = () => { click(); selectBoard(false); };
    board.onclick = () => { click(); selectBoard(true); };
    selectBoard(preferBoard);
    if (!dialog.open) dialog.showModal();
  };
}
