import { challengeFromRun, challengeProgress, challengeUrl, type Challenge } from '../core/challenge';
import { openings, runScore } from '../core/openings';
import type { Run } from '../core/types';

export function bindShareRoom() {
  const dialog = document.querySelector<HTMLDialogElement>('#share-dialog')!;
  const get = <T extends HTMLElement = HTMLElement>(id: string) => dialog.querySelector<T>(`#share-${id}`)!;
  const link = get<HTMLInputElement>('link');
  const status = get('status');
  const native = get<HTMLButtonElement>('native');
  const copy = get<HTMLButtonElement>('copy');
  get('close').onclick = () => dialog.close();

  return (run: Run, reply = false, boardUrl?: string) => {
    if (dialog.open || run.enableSynergies === false) return;
    const score = challengeFromRun(run);
    const opening = openings[score.opening];
    const campaignUrl = challengeUrl(location.href, score);
    const match = get<HTMLButtonElement>('run');
    const board = get<HTMLButtonElement>('board');
    let shareBoard = false;
    let url = campaignUrl;
    let title: string;
    let caption: string;
    get('modes').hidden = !boardUrl;
    function update() {
      match.setAttribute('aria-pressed', String(!shareBoard));
      board.setAttribute('aria-pressed', String(shareBoard));
      url = shareBoard && boardUrl ? boardUrl : campaignUrl;
      title = shareBoard ? '4×4 词条法阵 · 试打这一波' : '4×4 词条法阵 · 同局挑战';
      caption = shareBoard ? `帮我试试第 ${run.wave} 波` : `${opening.name} · 已过 ${score.cleared} 波`;
      get('title').textContent = shareBoard ? '分享这一波' : reply ? '发回同局战绩' : '邀请朋友打同局';
      get('score').textContent = shareBoard ? `第 ${run.wave} 波 · 当前棋盘与备战区`
        : `${caption} · 最高 ${score.combo} 连击`;
      get('description').textContent = shareBoard ? '朋友接手同一波，可以换位、试打，再把改好的阵发回来。'
        : '朋友点开可用同种子、同开局开打。先比通关波数，波数相同再比连击。';
      status.hidden = true;
      link.value = url;
    }
    match.onclick = () => { shareBoard = false; update(); };
    board.onclick = () => { if (boardUrl) { shareBoard = true; update(); } };
    update();
    native.hidden = typeof navigator.share !== 'function';
    copy.onclick = async () => {
      const address = url;
      status.hidden = false;
      try {
        await navigator.clipboard.writeText(address);
        if (url !== address) return;
        status.textContent = '链接已复制。';
      } catch {
        if (url !== address) return;
        link.focus();
        link.select();
        status.textContent = '复制未完成。长按链接可手动复制。';
      }
    };
    native.onclick = async () => {
      try {
        await navigator.share({ title, text: caption, url });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        status.hidden = false;
        status.textContent = '可以复制链接转发。';
      }
    };
    dialog.showModal();
    copy.focus({ preventScroll: true });
  };
}

export function bindChallengeRoom(enter: (quick: boolean) => void, leave: () => void, reply: (run: Run) => void) {
  const dialog = document.querySelector<HTMLDialogElement>('#challenge-dialog')!;
  const get = <T extends HTMLElement = HTMLElement>(id: string) => dialog.querySelector<T>(`#challenge-${id}`)!;
  const quick = get<HTMLButtonElement>('quick');
  const manual = get<HTMLButtonElement>('enter');
  const send = get<HTMLButtonElement>('reply');
  const close = get<HTMLButtonElement>('close');
  let entering = false;
  close.onclick = () => dialog.close();
  dialog.addEventListener('cancel', event => { if (entering) { event.preventDefault(); leave(); } });
  get('leave').onclick = leave;

  return (target: Challenge, run: Run, entry: boolean, fresh: boolean, main?: Run) => {
    entering = entry;
    const player = runScore(main ?? run);
    const progress = challengeProgress(player, target);
    const hasScore = !!(player.cleared || player.combo);
    const opening = openings[target.opening];
    get('opening').textContent = `${opening.name} · ${opening.label} · ${target.seed}`;
    get('target').textContent = `${target.cleared} 波`;
    get('target-combo').textContent = `最高 ${target.combo} 连击`;
    get('player-label').textContent = main ? '本机同种子战绩' : '你的战绩';
    get('player').textContent = `${player.cleared} 波`;
    get('player-combo').textContent = `最高 ${player.combo} 连击`;
    const status = get('status');
    status.textContent = fresh && !main ? '同一套起手阵和商店，挑战进度单独保存。' : progress.text;
    status.dataset.reached = String(progress.reached && hasScore);

    close.hidden = entry;
    quick.hidden = !fresh;
    manual.textContent = fresh ? '先布阵' : entry ? '继续挑战' : '回到棋盘';
    send.hidden = !hasScore;
    const primary = main && hasScore ? send : fresh ? quick : manual;
    for (const button of [quick, manual, send]) button.classList.toggle('primary', button === primary);
    quick.onclick = () => { dialog.close(); enter(true); };
    manual.onclick = () => { dialog.close(); enter(false); };
    send.onclick = () => reply(main ?? run);
    if (!dialog.open) dialog.showModal();
    primary.focus({ preventScroll: true });
  };
}
