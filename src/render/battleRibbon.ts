import type { CombatMarker } from './canvasRenderer';
import type { PlaybackBeat } from './playbackController';

export function bindBattleRibbon(format: (value: number) => string, runeName: (index: number) => string) {
  const ribbon = document.querySelector<HTMLElement>('#battle-timeline')!;
  const moment = ribbon.querySelector<HTMLElement>('#battle-moment')!;
  const name = ribbon.querySelector<HTMLElement>('#battle-source')!;
  const hit = ribbon.querySelector<HTMLElement>('#battle-hit')!;
  const steps = ribbon.querySelector<HTMLElement>('#battle-steps')!;
  const progress = ribbon.querySelector<HTMLProgressElement>('#battle-progress')!;

  function show(label: string, source: string, amount: string, tone: string, finishing = false) {
    moment.textContent = label;
    name.textContent = name.title = source;
    hit.hidden = !amount;
    hit.textContent = amount;
    ribbon.dataset.finishing = String(finishing);
    ribbon.style.setProperty('--cue-color', tone);
  }

  function update(combo: number, total: number) {
    progress.value = combo;
    steps.textContent = `${combo}/${total}`;
  }

  return {
    start(total: number) {
      progress.max = Math.max(1, total);
      update(0, total);
      show('扫描', '开始扫描法阵', '', '#e8c78e');
    },
    update,
    show(beat: PlaybackBeat): CombatMarker | undefined {
      if (!beat.cue) return;
      const { event, link } = beat.cue;
      const index = event.type === 'CELL_ACTIVATE' ? event.index : event.source;
      const source = link ? `${runeName(link.from)} → ${runeName(link.to)}`
        : index !== null ? runeName(index) : '回合末剧毒';
      let label = '出手';
      let amount = '';
      let tone = link ? '#9bdbf8' : '#eed9ae';
      if (event.type === 'DAMAGE') {
        amount = `−${format(event.amount)}`;
        if (beat.finishing) { label = '击破'; tone = '#ffe09a'; }
        else if (beat.featured && event.kind === 'poison') { label = '毒爆'; tone = '#a3e6ba'; }
        else if (beat.featured) { label = event.crit ? '暴击' : '重击'; tone = '#ffd09a'; }
        else if (event.gateBlocked) { label = '轮锁减伤'; tone = '#d6bbae'; }
        else if (event.kind === 'poison') { label = '毒伤'; tone = '#a3e6ba'; }
        else if (event.crit) { label = '暴击'; tone = '#ffd09a'; }
        else if (link) label = '连锁触发';
      } else if (event.type === 'CELL_ACTIVATE' && link) {
        label = '连锁触发';
      } else if (event.type === 'GOLD') {
        label = event.delta >= 0 ? '产金' : '耗金';
        amount = `${event.delta >= 0 ? '+' : '−'}${format(Math.abs(event.delta))} 金`;
        tone = '#ffcf87';
      } else if (event.type === 'POISON') {
        label = '剧毒';
        amount = `${format(event.poison)} 层`;
        tone = '#a3e6ba';
      }
      show(label, source, amount, tone, beat.finishing);
      return { index: link?.to ?? index, from: link?.from, tone, finishing: beat.finishing };
    },
  };
}
