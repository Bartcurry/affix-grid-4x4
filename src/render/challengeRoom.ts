import { challengeFromRun, challengeUrl, compareScores, type Challenge } from '../core/challenge';
import { openings, runScore } from '../core/openings';
import { boardShareUrl } from '../core/boardShare';
import { canArrange } from '../core/shopEngine';
import { prepareBattle } from '../core/tactics';
import type { Catalog, Run } from '../core/types';

export function bindChallengeRoom(click: () => void, enter: () => void, leave: () => void) {
  const dialog = document.querySelector<HTMLDialogElement>('#challenge-dialog')!;
  const get = <T extends HTMLElement = HTMLElement>(id: string) => dialog.querySelector<T>(`#${id}`)!;
  let firstVisit = false;
  get('challenge-enter').onclick = () => { click(); dialog.close(); if (firstVisit) enter(); };
  get('challenge-leave').onclick = () => { click(); leave(); };
  dialog.addEventListener('cancel', event => {
    if (!firstVisit) return;
    event.preventDefault();
    leave();
  });

  return (challenge: Challenge, run: Run, first = false) => {
    firstVisit = first;
    const player = runScore(run);
    const opening = openings[challenge.opening];
    get('challenge-opening').textContent = `${opening.name} · ${opening.label}开局  /  ${challenge.seed}`;
    get('challenge-target-wave').textContent = `${challenge.cleared} 波`;
    get('challenge-target-combo').textContent = `最高 ${challenge.combo} 连击`;
    get('challenge-player-wave').textContent = `${player.cleared} 波`;
    get('challenge-player-combo').textContent = `最高 ${player.combo} 连击`;
    const rank = compareScores(player, challenge);
    const status = get('challenge-status');
    status.hidden = first;
    status.dataset.rank = String(rank);
    status.textContent = rank > 0 ? '你超过了这个战绩。' : rank === 0 ? '你追平了这个战绩。' :
      player.cleared < challenge.cleared ? `还差 ${challenge.cleared - player.cleared} 波追平。` : `波数已追平，再多 ${challenge.combo - player.combo} 连击。`;
    get('challenge-enter').textContent = first ? '开始同局挑战' : run.status === 'active' ? '继续挑战' : '查看结算';
    if (!dialog.open) dialog.showModal();
  };
}

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

  return (run: Run) => {
    const challenge = challengeFromRun(run);
    const url = challengeUrl(location.href, challenge);
    const name = openings[challenge.opening].name;
    const score = `${challenge.cleared} 波 / ${challenge.combo} 连击`;
    const boardUrl = canArrange(run) ? boardShareUrl(location.href, run) : null;
    modes.hidden = !boardUrl;
    function selectBoard(enabled: boolean) {
      const useBoard = enabled && !!boardUrl;
      campaign.setAttribute('aria-pressed', String(!useBoard));
      board.setAttribute('aria-pressed', String(useBoard));
      const address = useBoard ? boardUrl : url;
      let text = `来打同一个开局。「${name}」${challenge.cleared || challenge.combo ? `，我的战绩是 ${score}。` : '，看看谁能走得更远。'}`;
      let summary = url ? `${name}开局 · ${score}。朋友从同一个种子开始。` : `${name}开局 · ${score}。离线试玩可以分享种子码 ${challenge.seed}。`;
      if (useBoard) {
        const result = prepareBattle(run, catalog).events.at(-1);
        const damage = result?.type === 'TURN_RESULT' ? format(result.damage) : '0';
        text = `接手我的第 ${run.wave} 波。原阵打 ${damage} 伤害，你换几格能打得更高？`;
        summary = `第 ${run.wave} 波 · 原阵 ${damage} 伤害。朋友打开就能换位试打。`;
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
    selectBoard(false);
    if (!dialog.open) dialog.showModal();
  };
}
