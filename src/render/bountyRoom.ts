import { battleTarget, bountyPerkLabel, bountyPerkUnavailable, bountyRoutes } from '../core/bounties';
import { encounters } from '../core/expedition';
import { simulateFormation } from '../core/tactics';
import type { BountyRoute, Catalog, Run } from '../core/types';
import { formatNumber as format } from './canvasRenderer';

export function bindBountyRoom(catalog: Catalog, click: () => void, choose: (route?: BountyRoute) => boolean) {
  const dialog = document.querySelector<HTMLDialogElement>('#bounty-dialog')!;
  const get = <T extends HTMLElement = HTMLElement>(id: string) => dialog.querySelector<T>(`#bounty-${id}`)!;
  const confirm = get<HTMLButtonElement>('confirm');
  get('close').onclick = () => { click(); dialog.close(); };

  return (run: Run) => {
    const current = run.bountyRoute;
    let selected = current;
    const options: Array<BountyRoute | undefined> = [undefined, ...bountyRoutes];
    get('wave').textContent = `第 ${run.wave} 波 · 悬赏路线`;
    const cards = options.map(route => {
      const { bounty, hp, encounter } = battleTarget(run.wave, route);
      const enemy = encounters[encounter];
      const result = simulateFormation({ ...run, bountyRoute: route }, catalog).events.at(-1);
      if (result?.type !== 'TURN_RESULT') throw new Error('Missing bounty preview result');
      const card = document.createElement('button');
      card.type = 'button';
      card.dataset.route = route ?? 'normal';
      const title = document.createElement('strong');
      title.textContent = bounty?.name ?? '原路';
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
      card.append(title, rewards, enemyLine, damage);
      if (bounty?.perk) {
        const perk = document.createElement('small');
        const unavailable = bountyPerkUnavailable(bounty.perk, run);
        perk.className = 'bounty-perk';
        perk.textContent = bountyPerkLabel(bounty.perk, run) + (unavailable ? `（${unavailable}）` : '');
        card.append(perk);
      }
      card.onclick = () => { click(); selected = route; mark(); };
      return card;
    });
    get('options').replaceChildren(...cards);
    function mark() {
      cards.forEach((card, index) => card.setAttribute('aria-pressed', String(options[index] === selected)));
      confirm.disabled = selected === current;
      const contract = battleTarget(run.wave, selected).bounty;
      confirm.textContent = selected === current ? '当前路线' : contract ? `接下「${contract.name}」` : '改走原路';
    }
    confirm.onclick = () => { if (selected !== current && choose(selected)) dialog.close(); };
    mark();
    dialog.showModal();
    cards[options.indexOf(current)]?.focus({ preventScroll: true });
    dialog.scrollTop = 0;
  };
}
