import { affixAt, encounters, endlessCampAt, lastGate, relicChoices } from '../core/expedition';
import { runScore } from '../core/openings';
import { battleTarget, bountyExtraText, bountyRewardAt, trialAt, trialOptions } from '../core/trials';
import type { Run } from '../core/types';

export function bindRouteRoom(icon: (node: HTMLElement, encounter: keyof typeof encounters) => void) {
  const dialog = document.querySelector<HTMLDialogElement>('#route-dialog')!;
  const get = (id: string) => dialog.querySelector<HTMLElement>(`#${id}`)!;
  const list = get('route-waves');
  const finale = get('route-finale');
  const reward = get('route-reward');
  for (const [phase, desc] of [['守门', lastGate.closed], ['破门', lastGate.breached]]) {
    const item = document.createElement('li');
    const label = document.createElement('strong'); label.textContent = phase;
    const rule = document.createElement('span'); rule.textContent = desc;
    item.append(label, rule); finale.append(item);
  }
  get('route-close').onclick = () => dialog.close();

  return (run: Run) => {
    if (dialog.open) return;
    const { cleared } = runScore(run);
    get('route-progress').textContent = run.endless ? `无尽 · 已过 ${cleared} 波` : `主线 · 已过 ${cleared} / 20 波`;
    const waves = run.endless ? Array.from({ length: 5 }, (_, index) => run.wave + index) : Array.from({ length: 20 }, (_, index) => index + 1);
    const initial = run.endless ? run.wave + 1 : Math.min(run.wave + 1, 20);
    const buttons = waves.map(wave => {
      const { encounter, trial } = battleTarget(wave, run.trialWave, run.trialRoute);
      const bounty = trialAt(wave);
      const altar = relicChoices(wave, []).length > 0;
      const camp = run.endless && run.endlessRule && endlessCampAt(wave);
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.dataset.wave = String(wave);
      tile.dataset.state = wave <= cleared ? 'cleared' : wave === run.wave ? 'current' : 'ahead';
      tile.dataset.encounter = encounter;
      if (wave === run.wave && wave > cleared) tile.setAttribute('aria-current', 'step');
      tile.setAttribute('aria-label', `第 ${wave} 波，${trial?.name ?? encounters[encounter].name}${wave <= cleared ? '，已过关' : ''}${bounty ? '，悬赏' : ''}${altar ? '，遗物' : ''}${camp ? '，休整' : ''}`);
      const glyph = document.createElement('span'); glyph.setAttribute('aria-hidden', 'true'); icon(glyph, encounter);
      const label = document.createElement('strong'); label.textContent = String(wave);
      tile.append(glyph, label);
      const mark = bounty ? '赏' : altar ? '遗' : camp ? '补' : wave === 20 ? '终' : '';
      if (mark) {
        const badge = document.createElement('small'); badge.textContent = mark;
        tile.append(badge);
      }
      tile.onclick = () => selectWave(wave);
      return tile;
    });

    function selectWave(wave: number) {
      for (const tile of buttons) tile.setAttribute('aria-pressed', String(Number(tile.dataset.wave) === wave));
      const { encounter, trial, hp } = battleTarget(wave, run.trialWave, run.trialRoute);
      const foe = encounters[encounter];
      const affix = affixAt(wave);
      get('route-enemy').textContent = `第 ${wave} 波 · ${trial?.name ?? foe.name}`;
      get('route-health').textContent = `${hp.toLocaleString('zh-CN')} 生命`;
      finale.hidden = encounter !== 'last_gate';
      get('route-rule').textContent = encounter === 'last_gate' ? `剩余生命降到 ${Math.floor(hp / 2).toLocaleString('zh-CN')} 或更低时破门。` :
        affix ? `${foe.hint} ${affix.name} · ${affix.desc}` : foe.hint;
      const bounties = trialOptions({ wave, trialRule: run.trialRule });
      const perk = bounties.length ? (run.clearedTrials?.includes(wave) ? '悬赏已拿下。' :
        bounties.map((bounty, index) => {
          const { gold, extra } = bountyRewardAt(wave, index === 1 ? 'alternate' : undefined, run.bountyRewardRule);
          return `${bounty.name} +${gold} 金${extra ? ` · ${bountyExtraText[extra]}` : ''}`;
        }).join(' / ')) :
        run.endless && run.endlessRule && endlessCampAt(wave) ? wave === run.wave && !run.pendingCamp ? '本波已完成休整。' : '开战前可休整一次。' :
        relicChoices(wave, []).length ? '打过这一波，可以选一件遗物。' : '';
      reward.hidden = !perk;
      reward.textContent = perk;
    }

    list.replaceChildren(...buttons);
    selectWave(initial);
    dialog.showModal();
  };
}
