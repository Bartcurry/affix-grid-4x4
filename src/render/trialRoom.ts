import { encounters } from '../core/expedition';
import { prepareBattle } from '../core/tactics';
import { battleTarget, trialAt } from '../core/trials';
import type { Catalog, Run } from '../core/types';

export function bindTrialRoom(catalog: Catalog, format: (value: number) => string, choose: (enabled: boolean) => boolean) {
  const dialog = document.querySelector<HTMLDialogElement>('#trial-dialog')!;
  const routes = dialog.querySelector('#trial-routes')!;
  const wave = dialog.querySelector('#trial-wave')!;
  dialog.querySelector<HTMLButtonElement>('#trial-close')!.onclick = () => dialog.close();

  return (run: Run) => {
    const trial = trialAt(run.wave);
    if (!trial || dialog.open) return;
    wave.textContent = `第 ${run.wave} 波`;
    routes.replaceChildren(...[false, true].map(enabled => {
      const trialWave = enabled ? run.wave : undefined;
      const { encounter } = battleTarget(run.wave, trialWave);
      const enemy = encounters[encounter];
      const { events, hp } = prepareBattle({ ...run, trialWave }, catalog);
      const result = events.at(-1);
      if (result?.type !== 'TURN_RESULT') throw new Error('Missing trial preview result');
      const current = enabled === (run.trialWave === run.wave);
      const card = document.createElement('article');
      card.dataset.trial = String(enabled);
      const title = document.createElement('h3');
      title.textContent = enabled ? trial.name : '原路';
      const hint = document.createElement('p');
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
      action.textContent = current ? '当前路线' : enabled ? '接下悬赏' : '改走原路';
      action.disabled = current;
      action.onclick = () => { if (choose(enabled)) dialog.close(); };
      if (enabled) {
        const reward = document.createElement('strong');
        reward.className = 'trial-reward';
        reward.textContent = `打过额外 +${trial.reward} 金`;
        card.append(title, reward);
      } else card.append(title);
      card.append(hint, metrics, estimate, action);
      return card;
    }));
    dialog.showModal();
  };
}
