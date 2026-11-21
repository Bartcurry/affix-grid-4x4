import { battleTarget, bountyWaves } from '../core/bounties';
import { affixAt, encounters, endlessCampAt, endlessRoute, endlessSegment } from '../core/expedition';
import { runScore } from '../core/openings';
import { planTurn, simulateFormation } from '../core/tactics';
import { reforgeWave } from '../core/reforge';
import type { Catalog, Run } from '../core/types';
import { formatNumber as format } from './canvasRenderer';
import { getBossSvgPath } from './glyphs';

export function bindEncounterRoom(catalog: Catalog, click: () => void, trial: (wave: number) => void) {
  const dialog = document.querySelector<HTMLDialogElement>('#encounter-dialog')!;
  const get = <T extends HTMLElement = HTMLElement>(id: string) => dialog.querySelector<T>(`#encounter-${id}`)!;
  const trialButton = get<HTMLButtonElement>('trial');
  const room = dialog.querySelector('.encounter-room')!;
  const list = get('wave-list');
  const route = get<HTMLDetailsElement>('route');
  const segments = get('segments');
  const routeStatus = get('route-status');
  const back = get<HTMLButtonElement>('route-back');
  const scout = get('scout');
  let run: Run;
  let selected: number;
  let canTry: boolean;

  function draw() {
    const selectedRoute = selected === run.wave ? run.bountyRoute : undefined;
    const { encounter, hp, bounty } = battleTarget(selected, selectedRoute, run.finaleRule);
    const { name, trait, tip } = encounters[encounter];
    const affix = affixAt(selected);
    const milestone = selected % 4 === 0 && selected !== 20;
    const bountyWave = run.bountyRule && bountyWaves.includes(selected);
    const campWave = run.endlessRule && endlessCampAt(selected);
    const reforge = run.reforgeRule && selected === reforgeWave;
    get('detail').dataset.enemy = encounter;
    dialog.querySelector('#encounter-icon')?.setAttribute('d', getBossSvgPath(encounter));
    get('step').textContent = `第 ${format(selected)} 波${selected === run.wave ? ' · 当前' : ''}${milestone ? ' · 遗物节点' : ''}${bountyWave ? ' · 悬赏节点' : ''}${campWave ? ' · 营地' : ''}${reforge ? ' · 转铸台' : ''}`;
    get('name').textContent = name;
    get('hp').textContent = `${format(hp)} 生命`;
    get('trait').textContent = bounty ? `${bounty.name} · ${trait}` : trait;
    get('tip').textContent = affix ? `${tip} ${affix.tip}` : tip;
    get('affix').hidden = !affix;
    get('affix').textContent = affix ? `${affix.name} · ${affix.desc}` : '';
    const upcoming = get('next');
    const next = selected > 20 ? endlessSegment(selected).next : undefined;
    const nextAffix = next !== undefined && affixAt(next);
    upcoming.hidden = !nextAffix;
    upcoming.textContent = nextAffix && next !== undefined
      ? `第 ${format(next)} 波换为${nextAffix.name}${run.endlessRule ? '，开战前可在营地选补给。' : '，开战前会收到补给。'}` : '';

    const preview = get('preview');
    preview.hidden = !canTry;
    if (!canTry) return;
    const { result, enemyDelta } = planTurn({ ...run, wave: selected, bountyRoute: selectedRoute }, catalog);
    get('score').textContent = `${format(result.damage)} 伤害 · ${result.win ? '可击破' : `还差 ${format(result.hp)}`}`;
    get('score').dataset.win = String(result.win);
    const impact = get('impact');
    impact.hidden = !enemyDelta;
    impact.textContent = `敌方规则合计 ${enemyDelta > 0 ? '+' : '−'}${format(Math.abs(enemyDelta))} 伤害`;
    trialButton.textContent = `试打第 ${format(selected)} 波`;
    trialButton.disabled = !run.board.some(Boolean) && !run.bench.some(Boolean);
  }

  function waveOption(wave: number, predicted?: boolean) {
    const label = document.createElement('label');
    const { encounter } = battleTarget(wave, wave === run.wave ? run.bountyRoute : undefined, run.finaleRule);
    label.dataset.enemy = encounter;
    label.dataset.state = wave === run.wave ? 'current' : wave < run.wave ? 'cleared' : 'ahead';
    if (predicted !== undefined) label.dataset.forecast = String(predicted);
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'encounter-wave';
    radio.value = String(wave);
    radio.checked = wave === selected;
    radio.setAttribute('aria-label', `第 ${format(wave)} 波 ${encounters[encounter].name}${wave === run.wave ? ' 当前波次' : ''}${predicted === undefined ? '' : predicted ? ' 试算可过' : ' 试算伤害不足'}`);
    radio.onchange = () => {
      click();
      selected = wave;
      draw();
    };
    const number = document.createElement('span');
    number.textContent = format(wave);
    label.append(radio, number);
    return label;
  }

  get('close').onclick = () => { click(); dialog.close(); };
  trialButton.onclick = () => {
    click();
    if (selected === run.wave || routeStatus.hidden) dialog.close();
    trial(selected);
  };

  return (snapshot: Run, mayRehearse: boolean, clearedRecord?: number) => {
    if (dialog.open) return;
    run = snapshot;
    selected = run.wave;
    canTry = mayRehearse;
    const endless = run.wave > 20;
    const start = endless ? Math.max(21, run.wave - 2) : 1;
    const end = endless ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(25, run.wave + 3)) : 20;
    room.toggleAttribute('data-endless', endless);
    route.hidden = !endless;
    route.open = false;
    const best = Math.max(runScore(run).cleared, clearedRecord ?? 0);
    get('record').textContent = `最远已过 ${format(best)} 波`;
    const cards: HTMLButtonElement[] = [];
    function showWaves(first: number, last: number, name: string, predictions?: boolean[]) {
      get('wave-range').textContent = name;
      list.replaceChildren(...Array.from({ length: last - first + 1 }, (_, index) => waveOption(first + index, predictions?.[index])));
      draw();
    }
    back.onclick = () => {
      click();
      selected = run.wave;
      cards.forEach(card => card.setAttribute('aria-pressed', 'false'));
      routeStatus.hidden = true;
      showWaves(start, end, '附近波次');
      list.querySelector<HTMLInputElement>('input:checked')?.focus();
    };
    if (endless) {
      for (const { from, through, affix } of endlessRoute(run.wave)) {
        const card = document.createElement('button');
        card.type = 'button';
        card.dataset.segment = String(from);
        card.setAttribute('aria-pressed', 'false');
        const title = document.createElement('strong');
        title.textContent = affix.name.split('·')[1];
        const waves = document.createElement('small');
        waves.textContent = `${format(from)}–${format(through)} 波`;
        card.append(title, waves);
        card.onclick = () => {
          click();
          cards.forEach(item => item.setAttribute('aria-pressed', String(item === card)));
          selected = selected >= from && selected <= through ? selected : from;
          const length = through - from + 1;
          const predictions = canTry ? Array.from({ length }, (_, index) => {
            const wave = from + index;
            const result = simulateFormation({ ...run, wave, bountyRoute: undefined }, catalog).events.at(-1);
            return result?.type === 'TURN_RESULT' && result.win;
          }) : undefined;
          scout.textContent = predictions
            ? `当前阵容可过 ${predictions.filter(Boolean).length}/${length} 波 · 各波独立试算`
            : `第 ${format(from)}–${format(through)} 波`;
          routeStatus.hidden = false;
          showWaves(from, through, `${affix.name} · 选择波次`, predictions);
          list.querySelector<HTMLInputElement>('input:checked')?.focus();
        };
        cards.push(card);
      }
    }
    segments.replaceChildren(...cards);
    routeStatus.hidden = true;
    showWaves(start, end, endless ? '附近波次' : '二十波战役');
    dialog.showModal();
    dialog.scrollTop = 0;
  };
}
