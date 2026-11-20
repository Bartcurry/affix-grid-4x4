import { encounters } from '../core/expedition';
import { prepareBattle } from '../core/tactics';
import { battleTarget, bountyExtraBlock, bountyExtraText, bountyRewardAt, bountyRuneCell, trialAt, type TrialChoice } from '../core/trials';
import type { Catalog, Run } from '../core/types';

export function bindTrialRoom(catalog: Catalog, format: (value: number) => string, choose: (choice: TrialChoice) => boolean) {
  const dialog = document.querySelector<HTMLDialogElement>('#trial-dialog')!;
  const routes = dialog.querySelector('#trial-routes')!;
  const wave = dialog.querySelector('#trial-wave')!;
  dialog.querySelector<HTMLButtonElement>('#trial-close')!.onclick = () => dialog.close();

  return (run: Run) => {
    const trial = trialAt(run.wave);
    if (!trial || dialog.open) return;
    wave.textContent = `第 ${run.wave} 波`;
    const choices: TrialChoice[] = ['normal', 'standard'];
    if (run.trialRule && trialAt(run.wave, 'alternate')) choices.push('alternate');
    const active: TrialChoice = run.trialWave === run.wave ? run.trialRoute ?? 'standard' : 'normal';
    routes.replaceChildren(...choices.map(choice => {
      const trialWave = choice === 'normal' ? undefined : run.wave;
      const trialRoute = choice === 'alternate' ? choice : undefined;
      const { encounter, trial: bounty } = battleTarget(run.wave, trialWave, trialRoute);
      const reward = bountyRewardAt(run.wave, trialRoute, run.bountyRewardRule);
      const enemy = encounters[encounter];
      const { events, hp } = prepareBattle({ ...run, trialWave, trialRoute }, catalog);
      const result = events.at(-1);
      if (result?.type !== 'TURN_RESULT') throw new Error('Missing trial preview result');
      const current = choice === active;
      const card = document.createElement('article');
      card.dataset.trial = choice === 'alternate' ? choice : String(choice === 'standard');
      card.dataset.current = String(current);
      const header = document.createElement('header');
      const title = document.createElement('h3');
      title.textContent = bounty?.name ?? '原路';
      header.append(title);
      const hint = document.createElement('p');
      hint.className = 'trial-hint';
      hint.textContent = `${enemy.name} · ${encounter === 'sentry' ? '伤害按原值结算。' : enemy.hint}`;
      const metrics = document.createElement('dl');
      metrics.className = 'trial-metrics';
      for (const [label, value] of [['预估伤害', result.damage], ['敌方生命', hp]] as const) {
        const metric = document.createElement('div');
        const name = document.createElement('dt');
        const number = document.createElement('dd');
        name.textContent = label;
        number.textContent = format(value);
        metric.append(name, number);
        metrics.append(metric);
      }
      const estimate = document.createElement('p');
      estimate.className = 'trial-estimate';
      estimate.dataset.win = String(result.win);
      estimate.textContent = result.win ? '能打过' : `差 ${format(result.hp)} 点`;
      const action = document.createElement('button');
      action.type = 'button';
      action.textContent = current ? '当前路线' : bounty ? '接下悬赏' : '改走原路';
      if (!current && bounty) action.setAttribute('aria-label', `接下悬赏：${bounty.name}`);
      action.disabled = current;
      action.onclick = () => { if (choose(choice)) dialog.close(); };
      if (bounty) {
        const gold = document.createElement('strong');
        gold.className = 'trial-reward';
        gold.textContent = `胜利 +${reward.gold} 金`;
        header.append(gold);
      }
      card.append(header, hint, metrics, estimate, action);
      if (bounty && reward.extra) {
        const prize = document.createElement('p');
        const label = document.createElement('strong');
        const block = bountyExtraBlock(reward.extra, run);
        const recipient = reward.extra === 'engrave' ? run.board[bountyRuneCell] : null;
        prize.className = 'trial-extra';
        prize.dataset.available = String(!block);
        label.textContent = bountyExtraText[reward.extra];
        prize.append(label);
        const line = block ? `当前${block}，过关只领金币` : recipient ? `当前是${catalog[recipient.configId].name}` : '';
        if (line) {
          const detail = document.createElement('span');
          detail.textContent = line;
          prize.append(detail);
        }
        card.append(prize);
      }
      return card;
    }));
    dialog.showModal();
  };
}
