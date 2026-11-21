import { battleTargetFor, bountyPerkLabel, bountyPerkUnavailable, bountyRoutes } from '../core/bounties';
import { encounters } from '../core/expedition';
import { victoryPayout } from '../core/shopEngine';
import { simulateFormation } from '../core/tactics';
import type { BountyRoute, Catalog, Run } from '../core/types';
import { formatNumber as format } from './canvasRenderer';

interface BountyActions {
  choose(route?: BountyRoute): boolean;
  trial(route: BountyRoute | undefined, quickFind: boolean, close: () => void): boolean;
}

export function bindBountyRoom(catalog: Catalog, click: () => void) {
  const dialog = document.querySelector<HTMLDialogElement>('#bounty-dialog')!;
  const get = <T extends HTMLElement = HTMLElement>(id: string) => dialog.querySelector<T>(`#bounty-${id}`)!;
  const confirm = get<HTMLButtonElement>('confirm');
  const trial = get<HTMLButtonElement>('trial');
  const status = get('status');
  get('close').onclick = () => { click(); dialog.close(); };

  return (run: Run, actions: BountyActions) => {
    const current = run.bountyRoute;
    let selected = current;
    const options: Array<BountyRoute | undefined> = [undefined, ...bountyRoutes];
    get('wave').textContent = `第 ${run.wave} 波 · 悬赏路线`;
    status.hidden = true;
    trial.disabled = !run.board.some(Boolean) && !run.bench.some(Boolean);
    const cards = options.map(route => {
      const candidate = { ...run, bountyRoute: route };
      const { bounty, hp, encounter } = battleTargetFor(candidate);
      const enemy = encounters[encounter];
      const result = simulateFormation(candidate, catalog).events.at(-1);
      if (result?.type !== 'TURN_RESULT') throw new Error('Missing bounty preview result');
      const card = document.createElement('button');
      card.type = 'button';
      card.dataset.route = route ?? 'normal';
      const title = document.createElement('strong');
      title.textContent = bounty?.name ?? '原路';
      if (route === current) {
        const marker = document.createElement('small');
        marker.className = 'bounty-current-marker';
        marker.textContent = '当前';
        title.append(' ', marker);
      }
      const rewards = document.createElement('span');
      rewards.className = 'bounty-reward';
      rewards.textContent = bounty ? `胜利多拿 ${bounty.gold} 金` : '常规过关奖励';
      const enemyLine = document.createElement('span');
      enemyLine.className = 'bounty-enemy';
      enemyLine.textContent = `${enemy.name} · ${enemy.trait}`;
      const damage = document.createElement('span');
      damage.className = 'bounty-estimate';
      damage.dataset.win = String(result.win);
      damage.textContent = `${format(result.damage)} 伤害 / ${format(hp)} 血 · ${result.win ? '可击破' : `差 ${format(result.hp)}`}`;
      const wallet = document.createElement('small');
      wallet.className = 'bounty-wallet';
      const gold = result.gold + (result.win ? victoryPayout(candidate, result.gold, catalog).total : 0);
      wallet.textContent = `${result.win ? '过关' : '失利'}后有 ${format(gold)} 金`;
      card.append(title, rewards, enemyLine, damage, wallet);
      if (bounty?.perk) {
        const perk = document.createElement('small');
        const unavailable = bountyPerkUnavailable(bounty.perk, run);
        perk.className = 'bounty-perk';
        perk.textContent = bountyPerkLabel(bounty.perk, run) + (unavailable ? `（${unavailable}）` : '');
        card.append(perk);
      }
      card.onclick = () => { click(); selected = route; mark(); };
      return { card, win: result.win };
    });
    get('options').replaceChildren(...cards.map(({ card }) => card));
    const canWin = () => cards[options.indexOf(selected)].win;
    function mark() {
      cards.forEach(({ card }, index) => card.setAttribute('aria-pressed', String(options[index] === selected)));
      confirm.disabled = selected === current;
      const contract = battleTargetFor({ ...run, bountyRoute: selected }).bounty;
      confirm.textContent = selected === current ? '当前路线' : contract ? `接下「${contract.name}」` : '改走原路';
      trial.textContent = canWin() ? '试打所选路线' : '找过关摆法';
    }
    function changed() {
      status.textContent = '战况已有更新，请刷新后再选路线。';
      status.hidden = false;
    }
    confirm.onclick = () => {
      if (selected === current) return;
      click();
      if (actions.choose(selected)) dialog.close();
      else changed();
    };
    trial.onclick = () => {
      click();
      if (!actions.trial(selected, !canWin(), () => dialog.close())) changed();
    };
    mark();
    dialog.showModal();
    cards[options.indexOf(current)].card.focus({ preventScroll: true });
    dialog.scrollTop = 0;
  };
}
