import './style.css';
import { affixAt, armorLayers, encounters, lastGate, relics, upcomingEncounter } from './core/expedition';
import { challengeParam, challengeSaveKey, readChallenge } from './core/challenge';
import { boardSharePrefix, readSharedBoard } from './core/boardShare';
import { previewRelics } from './core/relicPreview';
import { isOpening, openingIds, openings, runScore, updateRecords } from './core/openings';
import { foughtHealth } from './core/journal';
import { fieldTip } from './core/fieldGuide';
import { createMulberry32, decodeSeed, generateSeedCode } from './core/rng';
import { planTurn, prepareBattle, previewPlacement, runeFootprint } from './core/tactics';
import { battleTarget, trialOptions } from './core/trials';
import { buyRune, canArrange, chooseRelic, newRun, purchaseInfo, refreshShop, resolveLoss, runeAt, selectTrial, sellRune, sellValue, settleTurn, startEndless, swapRunes, toggleLock, UndoStack, victoryPayout } from './core/shopEngine';
import { STAR_MULT, initialRuneState, type BattleEvent, type OpeningId, type Rune, type RuneState, type Slot } from './core/types';
import { catalog } from './data/catalog';
import { CanvasRenderer, formatNumber, runeVectors } from './render/canvasRenderer';
import { getBossSvgPath } from './render/glyphs';
import { bindDragDrop } from './render/dragDrop';
import { bindDailyRoom } from './render/dailyRoom';
import { bindBattleJournal } from './render/battleJournal';
import { bindChallengeRoom, bindInviteRoom } from './render/challengeRoom';
import { bindTrialRoom } from './render/trialRoom';
import { bindMarketPreview } from './render/marketPreviewRoom';
import { renderOpeningPreview } from './render/openingPreview';
import { openBoardTrial } from './render/sharedBoardRoom';
import { bindRouteRoom } from './render/routeRoom';
import { PlaybackController } from './render/playbackController';
import { SynthAudio } from './audio/synthAudio';
import { WebMockAdapter } from './platform/webMockAdapter';

function element<ElementType extends HTMLElement = HTMLElement>(id: string): ElementType {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing UI element: ${id}`);
  return node as ElementType;
}

const button = (id: string) => element<HTMLButtonElement>(id);
const game = element('game');
const dialog = element<HTMLDialogElement>('panel');
const audio = new SynthAudio();
const player = new PlaybackController();
const challengeQuery = new URLSearchParams(location.search).get(challengeParam);
const challenge = readChallenge(challengeQuery);
const invalidChallenge = challengeQuery !== null && !challenge;
const sharedBoard = readSharedBoard(location.hash, catalog);
const invalidBoard = location.hash.startsWith(boardSharePrefix) && !sharedBoard;
const platform = new WebMockAdapter(catalog, element('ad'), element('ad-text'), button('cancel-ad'), challenge ? challengeSaveKey(challenge) : undefined);
const loaded = sharedBoard ? null : platform.load();
const saved = challenge && loaded && (loaded.run.seed !== challenge.seed || loaded.run.opening !== challenge.opening ||
  loaded.run.relicRule !== challenge.relicRule || loaded.run.trialRule !== challenge.trialRule) ? null : loaded;

const initialSeed = challenge?.seed ?? generateSeedCode().code;
function createOpeningRun(opening: OpeningId, seed?: string) {
  const next = newRun(catalog, createMulberry32(seed ? decodeSeed(seed) : 1), opening, seed);
  if (challenge) {
    next.relicRule = challenge.relicRule;
    next.trialRule = challenge.trialRule;
  }
  return next;
}
let run = saved?.run ?? createOpeningRun(challenge?.opening ?? 'chain', initialSeed);
const target = () => battleTarget(run.wave, run.trialWave, run.trialRoute);
let records = saved?.records ?? {};
let forecast: ReturnType<typeof planTurn> | null = null;
let placement: ReturnType<typeof planTurn> | null = null;
let skin = saved?.skin ?? false;
let exactForecast = saved?.exactForecast ?? false;
audio.muted = saved?.muted ?? false;
player.speed = saved?.speed ?? 1;

let phase: 'ARRANGE' | 'PLAYBACK' = 'ARRANGE';
let displayed = { hp: target().hp, poison: 0, gold: run.gold };
let noticeTimer: ReturnType<typeof setTimeout>;
let victoryTimer: ReturnType<typeof setTimeout>;
let ghostTimer: ReturnType<typeof setTimeout>;
let ghostTarget = 100;
let dialogDismissible = false;
let bossArmorHits = 0;
let gateBreached = false;
const states = new Map<number, RuneState>();
const renderer = new CanvasRenderer(element('arena'), run, catalog);
const undoStack = new UndoStack();

const bossColors: Record<string, string> = {
  sentry: '#fde047',
  armor: '#94a3b8',
  cistern: '#34d399',
  flanks: '#f59e0b',
  bell: '#38bdf8',
  regent: '#f43f5e',
  last_gate: '#fb8668',
};

const rarityLabel = { common: '普通', rare: '稀有', epic: '史诗' };
const archetypeLabel = { chain: '连锁', poison: '剧毒', gold: '金币', amplify: '增幅' };

const arranging = () => phase === 'ARRANGE' && canArrange(run);
const persist = () => {
  records = updateRecords(records, run);
  platform.save({ schemaVersion: 2, run, skin, muted: audio.muted, speed: player.speed, exactForecast, records });
};
const click = () => { audio.unlock(); audio.click(); };
const inviteRoom = bindInviteRoom(click, catalog, formatNumber);
const shareRun = () => inviteRoom(run);
const challengeRoom = bindChallengeRoom(click, persist, () => {
  const mainPage = new URL(location.href);
  mainPage.searchParams.delete(challengeParam);
  location.replace(mainPage.href);
});
button('invite-open').onclick = () => { if (phase === 'ARRANGE') { click(); shareRun(); } };
if (challenge) {
  button('openings').textContent = '同局';
  button('openings').title = '同局战绩';
}
const journal = bindBattleJournal(catalog, formatNumber);
const reviewLast = () => journal(run.lastJournal);
button('journal-open').onclick = () => { click(); reviewLast(); };
const openTrial = bindTrialRoom(catalog, formatNumber, choice => {
  if (!arranging() || !selectTrial(run, choice !== 'normal', choice === 'alternate' ? 'alternate' : undefined)) return false;
  click(); resetTimeline(); redraw();
  return true;
});
button('trial-open').onclick = () => { if (arranging()) { click(); openTrial(run); } };

function iconPath(owner: HTMLElement, pathData: string) {
  const namespace = 'http://www.w3.org/2000/svg';
  const existing = owner.querySelector('path');
  if (existing) { existing.setAttribute('d', pathData); return; }
  const svg = document.createElementNS(namespace, 'svg');
  svg.setAttribute('viewBox', '0 0 32 32');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('rune-icon-svg');
  const path = document.createElementNS(namespace, 'path');
  path.setAttribute('d', pathData);
  svg.append(path);
  owner.append(svg);
}

const emptyIcon = 'M16 3l13 13-13 13L3 16 16 3Zm0 6v14m-7-7h14';
const openMarketPreview = bindMarketPreview(catalog, (owner, id) => iconPath(owner, runeVectors[id] ?? emptyIcon), formatNumber,
  (index, configId, cell) => run.shop[index]?.configId === configId && buyOffer(index, cell));
const openRoute = bindRouteRoom((owner, encounter) => iconPath(owner, getBossSvgPath(encounter)));
button('route-open').onclick = () => { if (phase !== 'PLAYBACK') { click(); openRoute(run); } };
const dailyRoom = bindDailyRoom(catalog, (owner, id) => iconPath(owner, runeVectors[id] ?? emptyIcon), click,
  () => phase === 'ARRANGE', showLanding);

function notice(text: string) {
  const target = element('notice');
  clearTimeout(noticeTimer);
  target.textContent = text;
  noticeTimer = setTimeout(() => { target.textContent = ''; }, 2200);
}

function showArenaHint() {
  const hint = element('arena-hint');
  hint.dataset.preview = String(!!placement);
  if (placement && forecast) {
    const change = placement.result.damage - forecast.result.damage;
    hint.textContent = `放置后 ${formatNumber(placement.result.damage)} 伤害 · ${change ? `${change > 0 ? '+' : '−'}${formatNumber(Math.abs(change))}` : '持平'}`;
  } else if (arranging() && renderer.selection) {
    const rune = runeAt(run, renderer.selection);
    hint.textContent = rune ? catalog[rune.configId].name : '点符文看作用，点击目标格交换';
  } else {
    hint.textContent = phase === 'PLAYBACK' ? '按顺序触发符文' : '点符文看作用，点击目标格交换';
  }
}

function showForecast() {
  const panel = element('forecast');
  const playing = phase === 'PLAYBACK';
  panel.hidden = !playing && (!forecast || !arranging());
  element('forecast-main').hidden = playing;
  element('forecast-actions').hidden = playing;
  element('battle-timeline').hidden = !playing;
  showArenaHint();
  if (playing || panel.hidden || !forecast) return;
  const preview = placement ?? forecast;
  const { hp, result } = preview;
  const change = result.damage - forecast.result.damage;
  panel.dataset.verdict = preview.verdict;
  element('forecast-verdict').textContent = preview.verdictText;
  const visibleDamage = exactForecast ? result.damage : preview.minDamage;
  element('forecast-fill').style.width = `${Math.min(100, 100 * visibleDamage / hp)}%`;

  if (exactForecast) {
    const delta = change ? ` · ${change > 0 ? '+' : '−'}${formatNumber(Math.abs(change))} 伤害` : '';
    element('forecast-readout').textContent = `${placement ? '放置后' : '预计伤害'} ${formatNumber(result.damage)} / ${formatNumber(hp)} · ${result.combo} 连击${delta}`;
  } else {
    const baselineChange = preview.minDamage - forecast.minDamage;
    const delta = baselineChange ? ` · ${baselineChange > 0 ? '+' : '−'}${formatNumber(Math.abs(baselineChange))}` : '';
    element('forecast-readout').textContent = `${placement ? '放置后 · ' : ''}无暴击 ${formatNumber(preview.minDamage)} / ${formatNumber(hp)}${delta}`;
  }
  button('forecast-try-board').disabled = !!placement;
  button('forecast-detail').disabled = !!placement;
}

function updateBossArmorUi(hits: number, breaking = false) {
  const layers = armorLayers(target().encounter);
  const shields = element('boss-armor-shields');
  shields.hidden = !layers || gateBreached;
  shields.setAttribute('aria-label', `减伤护甲剩余 ${Math.max(layers - hits, 0)} 层`);
  for (let index = 1; index <= 3; index++) {
    const icon = element(`boss-shield-${index}`);
    icon.hidden = index > layers;
    icon.classList.toggle('broken', index <= hits);
    icon.classList.toggle('breaking', breaking && index === hits);
  }
}

function updateGateUi() {
  const finale = target().encounter === 'last_gate';
  const stage = element('boss-stage');
  stage.hidden = !finale;
  game.dataset.gate = finale ? gateBreached ? 'breached' : 'closed' : '';
  if (!finale) return;
  stage.textContent = gateBreached ? '破门' : '守门';
  element('enemy-hint').textContent = gateBreached ? lastGate.breached : `${lastGate.closed} 半血破门。`;
}

function updateHud() {
  const showOutcomeState = run.pendingLoss || run.status !== 'active';
  const maxHp = showOutcomeState ? foughtHealth(run.lastJournal, run.wave, run.trialWave, run.trialRoute) : target().hp;
  const hp = phase === 'PLAYBACK' ? displayed.hp : showOutcomeState ? Math.max(0, maxHp - run.lastDamage) : maxHp;
  const pct = Math.max(0, Math.min(100, (100 * hp) / maxHp));

  element('wave').textContent = run.endless ? `无尽 · 第 ${run.wave} 波` : `第 ${run.wave} / 20 波`;
  element('hp-fill').style.width = `${pct}%`;

  // 双层延迟残影血条：实际瞬扣，残影条平滑追平
  if (pct !== ghostTarget) {
    ghostTarget = pct;
    clearTimeout(ghostTimer);
    ghostTimer = setTimeout(() => { element('hp-ghost').style.width = `${pct}%`; }, 280);
  }

  element('hp-text').textContent = `${formatNumber(hp)} / ${formatNumber(maxHp)}`;
  element('hp-meter').setAttribute('aria-valuemax', String(maxHp));
  element('hp-meter').setAttribute('aria-valuenow', String(hp));
  element('shield').textContent = `${run.shield}/3`;
  const poison = phase === 'PLAYBACK' ? displayed.poison : showOutcomeState ? run.lastPoison : 0;
  const gold = phase === 'PLAYBACK' ? displayed.gold : run.gold;
  element('poison').textContent = formatNumber(poison);
  element('gold').textContent = formatNumber(gold);

  const poisonBadge = document.getElementById('hp-poison-badge');
  const poisonText = document.getElementById('hp-poison-text');
  if (poisonBadge && poisonText) {
    poisonBadge.hidden = poison <= 0;
    poisonText.textContent = formatNumber(poison);
  }

  element('phase').textContent = phase === 'PLAYBACK' ? '回放中' : run.pendingRelics.length ? '挑选遗物' : run.pendingLoss ? '待结算护盾' :
    run.status !== 'active' ? '战斗结束' : '布阵';
}

function markWaves() {
  const track = element('wave-track');
  track.hidden = run.endless;
  track.replaceChildren(...Array.from({ length: 20 }, (_, index) => {
    const notch = document.createElement('span');
    const wave = index + 1;
    notch.dataset.state = wave < run.wave || run.status === 'victory' ? 'cleared' : wave === run.wave ? 'current' : 'ahead';
    if (run.clearedTrials?.includes(wave)) notch.dataset.bounty = 'true';
    return notch;
  }));
}

function inspect() {
  const slot = renderer.selection;
  const selected = slot && runeAt(run, slot);
  const rune: Rune | null = selected;
  const icon = element('rune-icon');
  const name = element('rune-name');
  const info = element('rune-desc');
  const config = rune && catalog[rune.configId];
  const state = slot?.zone === 'board' ? states.get(slot.index) ?? initialRuneState() : initialRuneState();
  element('inspector').style.setProperty('--accent', config?.color ?? 'var(--gold)');
  iconPath(icon, rune ? runeVectors[rune.configId] : emptyIcon);
  element('rune-context').textContent = config ? `${slot?.zone === 'board' ? '棋盘' : '备战区'} · ${archetypeLabel[config.archetype]}` : '';
  const emptyTileMod = !config && slot?.zone === 'board' ? run.tileModifiers?.[slot.index] : undefined;
  if (emptyTileMod) {
    if (emptyTileMod === 'li_fire') {
      name.textContent = '法阵阵眼 · 离火位';
      info.textContent = '位于此格的符文每次被激活时，额外再触发 1 次（计入单格触发上限）。';
    } else if (emptyTileMod === 'xuan_ice') {
      name.textContent = '法阵阵眼 · 玄冰位';
      info.textContent = '位于此格的符文基础暴击率 +45%。';
    } else if (emptyTileMod === 'spirit_gathering') {
      name.textContent = '法阵阵眼 · 聚灵位';
      info.textContent = '每当上下左右相邻格子激活时，位于此格的符文获得 +2 永久基础威力（跨波保留）。';
    }
  } else {
    name.textContent = config?.name ?? (run.wave === 1 ? openings[run.opening].name : '先挑一枚符文');
    info.textContent = config?.desc ?? (run.wave === 1 ? openings[run.opening].note : '点棋盘或店里的一枚符文，就能看到它的作用。');
  }
  const stats = config && rune ? [rarityLabel[config.rarity], `${'★'.repeat(rune.star)} · 星级 ×${STAR_MULT[rune.star]}`] : emptyTileMod ? ['特殊阵眼', `格 ${slot!.index + 1}`] : [];

  if (slot?.zone === 'board') {
    const mod = run.tileModifiers?.[slot.index];
    if (mod === 'li_fire') stats.push('【离火位】额外触发 1 次');
    if (mod === 'xuan_ice') stats.push('【玄冰位】暴击率 +45%');
    if (mod === 'spirit_gathering') stats.push('【聚灵位】相邻激活永久威力 +2');
    if (rune?.bonusPower) stats.push(`永久威力 +${rune.bonusPower}`);
  }

  const legend = element('target-legend');
  legend.hidden = true;
  if (phase === 'ARRANGE' && config && selected && slot?.zone === 'board') {
    const contribution = forecast?.byCell[slot.index];
    if (contribution?.damage) stats.push(`预计伤害 ${formatNumber(contribution.damage)}`);
    const { links, effects } = runeFootprint(config, slot.index);
    const labels = [];
    if (links.size) labels.push('实线 · 连锁目标');
    if (effects.size) labels.push('虚线 · 作用范围');
    if (!labels.length && config.triggers.some(rule => rule.effect === 'RETRIGGER_TARGET')) labels.push('当前位置没有连锁目标');
    legend.textContent = labels.join(' / ');
    legend.hidden = !labels.length;
  }
  if (phase === 'PLAYBACK' && rune && slot?.zone === 'board') {
    stats.push(`伤害 ×${+state.tempMult.toFixed(2)}`, `暴击 ${Math.round(state.tempCritChance * 100)}%`);
    if (state.chargeStacks) stats.push(`充能 ${state.chargeStacks}`);
  }
  element('rune-stats').replaceChildren(...stats.map(text => {
    const chip = document.createElement('span'); chip.textContent = text; return chip;
  }));
  const price = selected ? sellValue(selected, catalog) : 0;
  const sell = button('sell-selected');
  button('inspect-jump').hidden = !selected || !arranging();
  sell.hidden = !selected;
  sell.disabled = !arranging();
  sell.textContent = `回收 +${price} 金`;
  sell.setAttribute('aria-label', selected ? `回收 ${config?.name}，获得 ${price} 金` : '回收符文');
  showArenaHint();
  const hasSelection = Boolean(selected || emptyTileMod);
  element('inspector').dataset.visible = String(hasSelection);
  renderer.sellLabel = selected ? `拖到此处回收 · +${price} 金` : '拖到此处回收符文';
  renderer.invalidate();
}

function select(slot: Slot | null) { renderer.selection = slot; inspect(); }

function syncControls() {
  button('daily-open').disabled = phase === 'PLAYBACK';
  button('journal-open').hidden = !run.lastJournal || phase === 'PLAYBACK';
  game.classList.toggle('skin', skin);
  game.dataset.phase = phase.toLowerCase();
  button('sound').setAttribute('aria-pressed', String(!audio.muted));
  button('sound').textContent = audio.muted ? '静音' : '音效';
  const speed = player.speed === 0 ? '即结' : `${player.speed}×`;
  button('speed').textContent = speed;
  button('speed').setAttribute('aria-label', `播放方式 ${player.speed === 0 ? '立即结算' : speed}，点击切换`);
  button('skip').disabled = phase !== 'PLAYBACK';
  button('skip').hidden = phase !== 'PLAYBACK';
  button('undo').hidden = phase === 'PLAYBACK';
  button('undo').disabled = !arranging() || undoStack.length === 0;
  element('arena-hint').hidden = phase === 'PLAYBACK';
  button('battle').disabled = !arranging();
  button('battle').textContent = phase === 'PLAYBACK' ? '连锁结算中' : '启动法阵';
  button('refresh').textContent = run.shop.every(offer => offer?.locked) ? '商品已全锁定' :
    run.freeRefreshes ? `免费刷新 ×${run.freeRefreshes}` : '刷新 · 2 金';
  button('refresh').disabled = !arranging() || (!run.freeRefreshes && run.gold < 2) || run.shop.every(offer => offer?.locked);
  const focus = element<HTMLSelectElement>('shop-focus');
  focus.value = run.shopFocus;
  focus.disabled = !arranging();
  button('reward').disabled = !arranging();
  button('support').disabled = phase === 'PLAYBACK';
  button('invite-open').disabled = phase === 'PLAYBACK';
  button('help').disabled = phase === 'PLAYBACK';
  button('route-open').disabled = phase === 'PLAYBACK';
  button('openings').disabled = !arranging();
  const toggle = element<HTMLInputElement>('exact-toggle');
  if (toggle) toggle.checked = exactForecast;
}

function doUndo() {
  if (!arranging() || undoStack.length === 0) return;
  if (undoStack.pop(run)) {
    click();
    select(null);
    redraw();
    notice('已撤销上一步');
  }
}

button('undo').onclick = doUndo;
window.addEventListener('keydown', event => {
  if (document.querySelector('dialog[open]')) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) {
    if (arranging() && undoStack.length > 0) {
      event.preventDefault();
      doUndo();
    }
  }
});

const exactCheckbox = element<HTMLInputElement>('exact-toggle');
exactCheckbox.onchange = () => {
  exactForecast = exactCheckbox.checked;
  showForecast();
  persist();
};

function buyOffer(index: number, cell?: number) {
  if (!arranging()) return false;
  const benchIndex = run.bench.indexOf(null);
  undoStack.push(run);
  const merges = buyRune(run, index, catalog, cell);
  if (!merges) { undoStack.pop(run); return false; }
  click();
  for (const merge of merges) renderer.flash(merge.slot, catalog[merge.rune.configId].color, true);
  if (merges.length) audio.merge();
  const slot = cell !== undefined ? { zone: 'board' as const, index: cell } : merges.at(-1)?.slot ?? { zone: 'bench' as const, index: benchIndex };
  select(slot);
  const placed = runeAt(run, slot);
  if (placed && !merges.length) renderer.flash(slot, catalog[placed.configId].color, false);
  redraw();
  if (cell !== undefined) {
    requestAnimationFrame(() => {
      const arena = element('arena');
      arena.scrollIntoView({ block: 'nearest' });
      arena.focus({ preventScroll: true });
    });
  } else if (!merges.length) notice('买到了。在备战区，拖上棋盘才会触发。');
  return true;
}

function tryOffer(index: number, preferred?: number) {
  if (!arranging() || !forecast) return;
  click();
  openMarketPreview(run, index, forecast.result, preferred);
}

function tryCurrentBoard(suggestion?: [Slot, Slot]) {
  if (!arranging() || placement) return;
  click();
  const current = run;
  const snapshot = { ...run, board: [...run.board], bench: [...run.bench] };
  openBoardTrial(snapshot, catalog, (owner, id) => iconPath(owner, runeVectors[id] ?? emptyIcon), formatNumber, click, journal, {
    live: {
      bench: snapshot.bench,
      suggestion,
      apply(board, bench) {
        if (run !== current || !arranging() || run.wave !== snapshot.wave || run.rngState !== snapshot.rngState ||
          run.trialWave !== snapshot.trialWave || run.trialRoute !== snapshot.trialRoute || run.gold !== snapshot.gold || run.shield !== snapshot.shield ||
          !run.board.every((rune, index) => rune === snapshot.board[index]) || !run.bench.every((rune, index) => rune === snapshot.bench[index])) return false;
        undoStack.push(run);
        run.board = board;
        run.bench = bench;
        select(null);
        redraw();
        notice('已应用试阵。可以撤销整套换位。');
        requestAnimationFrame(() => button('battle').focus({ preventScroll: true }));
        return true;
      },
    },
  });
}

button('forecast-try-board').onclick = () => tryCurrentBoard();

const offers = Array.from({ length: 3 }, (_, index) => {
  const card = document.createElement('div'); card.className = 'offer';
  const preview = document.createElement('button'); preview.className = 'offer-info'; preview.type = 'button';
  const icon = document.createElement('span'); icon.className = 'offer-icon'; icon.setAttribute('aria-hidden', 'true');
  const name = document.createElement('span'); name.className = 'offer-name';
  const meta = document.createElement('span'); meta.className = 'offer-meta';
  preview.append(icon, name, meta);
  const lock = document.createElement('button'); lock.className = 'lock'; lock.type = 'button';
  const actions = document.createElement('div'); actions.className = 'offer-actions';
  const tryButton = document.createElement('button'); tryButton.className = 'offer-try'; tryButton.type = 'button'; tryButton.textContent = '试摆';
  const buy = document.createElement('button'); buy.className = 'offer-buy'; buy.type = 'button';
  actions.append(tryButton, buy);
  card.append(preview, lock, actions); element('offers').append(card);
  preview.onclick = tryButton.onclick = () => tryOffer(index);
  lock.addEventListener('click', () => {
    if (toggleLock(run, index)) { click(); redraw(); }
  });
  buy.onclick = () => { buyOffer(index); };
  return { card, preview, icon, name, meta, lock, buy, tryButton };
});

function redraw(save = true) {
  if (arranging()) forecast = planTurn(run, catalog);
  placement = null;
  updateHud(); markWaves(); syncControls(); showForecast(); inspect();
  const tip = forecast && arranging() ? fieldTip(run, catalog, forecast) : null;
  element('field-tip').hidden = !tip;
  const tipAction = button('field-tip-action');
  tipAction.hidden = !tip || (tip.offer === undefined && !tip.origin);
  tipAction.onclick = null;
  for (const offer of offers) delete offer.card.dataset.suggested;
  if (tip) {
    element('field-tip-text').textContent = tip.text;
    if (tip.offer !== undefined) {
      const offerIndex = tip.offer;
      const item = offers[offerIndex];
      item.card.dataset.suggested = 'true';
      tipAction.textContent = '试摆';
      tipAction.onclick = () => tryOffer(offerIndex, tip.destination?.index);
    } else if (tip.origin && tip.destination) {
      const suggestion: [Slot, Slot] = [tip.origin, tip.destination];
      tipAction.textContent = '试这个换位';
      tipAction.onclick = () => tryCurrentBoard(suggestion);
    }
  }
  const { encounter, trial } = target();
  const enemy = encounters[encounter];
  element('enemy-name').textContent = trial?.name ?? enemy.name;
  const bounties = run.endless ? [] : trialOptions(run);
  const trialButton = button('trial-open');
  trialButton.hidden = !bounties.length || !arranging();
  if (bounties.length) {
    trialButton.textContent = trial ? `悬赏 · +${trial.reward} 金` : bounties.length > 1 ? '选悬赏' : `悬赏 +${bounties[0].reward} 金`;
    trialButton.dataset.active = String(!!trial);
  }

  if (phase !== 'PLAYBACK') {
    const journal = (run.pendingLoss || run.status !== 'active') && run.lastJournal?.wave === run.wave ? run.lastJournal : undefined;
    bossArmorHits = journal?.events.filter(event => event.type === 'DAMAGE' && event.kind === 'rune' && event.amount > 0).length ?? 0;
    gateBreached = journal?.events.some(event => event.type === 'DAMAGE' && event.breach) ?? false;
  }
  updateBossArmorUi(bossArmorHits);

  const bossPath = document.getElementById('boss-emblem-path');
  if (bossPath) bossPath.setAttribute('d', getBossSvgPath(encounter));
  const emblemWrap = document.getElementById('boss-emblem-wrap');
  if (emblemWrap) emblemWrap.style.color = bossColors[encounter] ?? '#d4af37';

  const affix = affixAt(run.wave);
  if (affix) {
    element('enemy-hint').textContent = `【${affix.name}】${affix.desc} · ${enemy.hint}`;
    element('enemy-hint').hidden = false;
  } else {
    element('enemy-hint').textContent = enemy.hint;
    element('enemy-hint').hidden = !enemy.hint;
  }

  updateGateUi();
  const upcoming = upcomingEncounter(run.wave, 1);
  element('boss-intel-text').textContent = run.wave === 20 ? '终局 · 闭门王' : `下波 · ${upcoming.name}`;

  element('game').dataset.enemy = encounter;
  element('board-count').textContent = phase === 'PLAYBACK' ? '准备扫阵' : `已布阵 ${run.board.filter(Boolean).length}/16`;
  element('bench-count').textContent = `备战区 ${run.bench.filter(Boolean).length}/4`;
  element('last-damage').textContent = run.bestCombo || run.lastDamage || run.attempts ? formatNumber(run.lastDamage) : '—';
  element('best-combo').textContent = run.bestCombo ? String(run.bestCombo) : '—';
  element('run-opening').textContent = `${openings[run.opening].name} · ${challenge ? '同局挑战' : `${openings[run.opening].label}开局`}`;
  element('run-seed').textContent = challenge ? `已过 ${runScore(run).cleared} 波 · 对方 ${challenge.cleared}` : `种子码：${run.seed}`;

  const list = element('relic-list');
  list.hidden = !run.relics.length;
  list.replaceChildren(...run.relics.map(id => {
    const item = document.createElement('button');
    item.type = 'button';
    item.textContent = relics[id].name;
    item.setAttribute('aria-label', `${relics[id].name}：${relics[id].text}`);
    item.onclick = openRelicBag;
    return item;
  }));
  offers.forEach(({ card, preview, icon, name, meta, lock, buy, tryButton }, index) => {
    const offer = run.shop[index];
    const config = offer && catalog[offer.configId];
    card.style.setProperty('--offer', config?.color ?? '#56657e');
    const { copies, blocked, willMerge } = purchaseInfo(run, index, catalog);
    card.dataset.rarity = config?.rarity ?? '';
    card.dataset.merge = String(willMerge);
    iconPath(icon, config ? runeVectors[config.id] : emptyIcon);
    name.textContent = config?.name ?? '已售罄';
    meta.textContent = config ? willMerge ? '买下就升星' : copies ? `${rarityLabel[config.rarity]} · 已有 ${copies} 枚` : `${rarityLabel[config.rarity]} · ${archetypeLabel[config.archetype]}` : '换一批再来';
    preview.disabled = tryButton.disabled = !config || !arranging();
    tryButton.setAttribute('aria-label', config ? `试摆 ${config.name}` : '无库存');
    lock.hidden = !config;
    lock.disabled = !arranging();
    iconPath(lock, offer?.locked ? 'M8 14V9a8 8 0 0 1 16 0v5M5 14h22v15H5Z M16 20v4' : 'M9 14V9a8 8 0 0 1 15-4M5 14h22v15H5Z M16 20v4');
    lock.setAttribute('aria-pressed', String(!!offer?.locked));
    lock.setAttribute('aria-label', `${offer?.locked ? '解锁' : '锁定'} ${config?.name ?? ''}`);
    buy.textContent = config ? blocked === 'gold' ? `缺 ${config.cost - run.gold} 金` : blocked === 'bench' ? '满格' : `${config.cost} 金` : '售罄';
    buy.disabled = !arranging() || blocked !== null;
    buy.setAttribute('aria-label', config ? `购买 ${config.name}，${config.cost} 金${willMerge ? '，买入即可升星' : ''}` : '无库存');
  });
  if (save) persist();
}

function sellFrom(from: Slot) {
  if (!arranging()) return;
  undoStack.push(run);
  const paid = sellRune(run, from, catalog);
  if (paid) { click(); select(null); redraw(); notice(`已回收 · +${paid} 金`); }
  else { undoStack.pop(run); }
}

button('sell-selected').onclick = () => { if (renderer.selection) sellFrom(renderer.selection); };
const inspectClose = document.getElementById('inspect-close');
if (inspectClose) inspectClose.onclick = () => select(null);

bindDragDrop(renderer, {
  enabled: arranging, hasRune: slot => !!runeAt(run, slot), select,
  move(from, to) {
    undoStack.push(run);
    const movedRune = runeAt(run, from);
    if (swapRunes(run, from, to)) {
      click();
      select(to);
      if (movedRune) renderer.flash(to, catalog[movedRune.configId]?.color ?? '#d4af37', false);
      redraw();
    }
    else { undoStack.pop(run); }
  },
  sell: sellFrom,
  preview(from, to) {
    if (!arranging()) return;
    const hypothetical = from && to ? previewPlacement(run, from, to) : null;
    placement = hypothetical ? planTurn(hypothetical, catalog) : null;
    showForecast();
  },
});

const forecastDialog = element<HTMLDialogElement>('forecast-dialog');
const relicDialog = element<HTMLDialogElement>('relic-dialog');
const relicBag = element<HTMLDialogElement>('relic-bag');
relicDialog.addEventListener('cancel', event => event.preventDefault());
button('relic-bag-close').onclick = () => relicBag.close();

function openRelicBag() {
  click();
  element('relic-inventory').replaceChildren(...run.relics.map(id => {
    const item = document.createElement('li');
    const name = document.createElement('strong');
    const text = document.createElement('p');
    name.textContent = relics[id].name;
    text.textContent = relics[id].text;
    item.append(name, text);
    return item;
  }));
  relicBag.showModal();
}

function showRelicChoices() {
  element('relic-wave').textContent = `打过第 ${run.wave - 1} 波 · 选一件遗物`;
  const { baseline, choices } = previewRelics(run, catalog);
  element('relic-baseline-title').textContent = `第 ${run.wave} 波 · 当前阵容预估`;
  element('relic-baseline-damage').textContent = `伤害 ${formatNumber(baseline.result.damage)} / ${formatNumber(baseline.hp)}`;
  element('relic-baseline-gold').textContent = `结算 ${formatNumber(baseline.gold)} 金`;
  const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatNumber(Math.abs(value))}`;
  element('relic-choices').replaceChildren(...choices.map(({ id, result, gold }) => {
    const item = document.createElement('button');
    const name = document.createElement('strong');
    const text = document.createElement('span');
    const impact = document.createElement('small');
    name.textContent = relics[id].name;
    text.textContent = relics[id].text;
    impact.className = 'relic-impact';
    impact.dataset.win = String(result.win);
    const damageDelta = result.damage - baseline.result.damage;
    const goldDelta = gold - baseline.gold;
    const damageLabel = damageDelta ? `${signed(damageDelta)} 伤害` : '伤害持平';
    const goldLabel = goldDelta ? `${signed(goldDelta)} 金` : '金币持平';
    impact.textContent = `${damageLabel} · ${goldLabel} · ${result.win ? '能打过' : `还差 ${formatNumber(result.hp)} 点`}`;
    item.type = 'button';
    item.dataset.relic = id;
    item.append(name, text, impact);
    item.onclick = () => {
      if (!chooseRelic(run, id)) return;
      audio.unlock(); audio.merge();
      relicDialog.close(); redraw();
      notice(`拿到了：${relics[id].name}`);
    };
    return item;
  }));
  if (!relicDialog.open) relicDialog.showModal();
}

button('forecast-detail').onclick = () => {
  if (!arranging() || !forecast) return;
  click();
  const { byCell, result, hp, poisonDamage, tutorialDamage, enemyDelta } = forecast;
  const sources = byCell.flatMap(({ damage, activations }, index) => {
    const rune = run.board[index];
    return rune && (damage || activations) ? [{ label: `格 ${index + 1} · ${catalog[rune.configId].name}`, detail: `${activations} 次激活`, damage }] : [];
  });
  if (poisonDamage) sources.push({ label: '回合末剧毒', detail: '持续伤害', damage: poisonDamage });
  if (tutorialDamage) sources.push({ label: '首波教学共鸣', detail: '仅首波生效', damage: tutorialDamage });
  sources.sort((left, right) => right.damage - left.damage);
  const impact = enemyDelta ? `\n敌人的招式让伤害${enemyDelta > 0 ? '多' : '少'}了 ${formatNumber(Math.abs(enemyDelta))} 点，已计入总数。` : '';
  element('forecast-summary').textContent = `预计 ${formatNumber(result.damage)} 伤害 / ${formatNumber(hp)} 生命 · ${result.combo} 连击\n${result.win ? '这套阵容能打过。' : `还差 ${formatNumber(result.hp)} 点。`}${impact}`;
  const payout = victoryPayout(run, result.gold);
  const deltaGold = result.gold - run.gold;
  const combatGold = deltaGold < 0 ? `战斗花 ${formatNumber(-deltaGold)} 金` : `战斗赚 ${formatNumber(deltaGold)} 金`;
  element('forecast-gold').textContent = result.win
    ? `${combatGold} · 过关 ${payout.base} 金${payout.interest ? ` · 利息 ${payout.interest} 金` : ''}${payout.relic ? ` · 遗物 ${payout.relic} 金` : ''}${payout.trial ? ` · 悬赏 ${payout.trial} 金` : ''}。结束时有 ${formatNumber(result.gold + payout.total)} 金。`
    : `${combatGold}。打不过也会保留战斗后的 ${formatNumber(result.gold)} 金，但没有过关奖励。`;
  element('forecast-sources').replaceChildren(...sources.map(source => {
    const item = document.createElement('li');
    const label = document.createElement('span');
    const detail = document.createElement('small');
    const amount = document.createElement('strong');
    label.textContent = source.label; detail.textContent = source.detail; amount.textContent = formatNumber(source.damage);
    label.append(detail); item.append(label, amount);
    return item;
  }));
  forecastDialog.showModal();
};
button('forecast-close').onclick = () => forecastDialog.close();

interface Action { label: string; act: () => void | Promise<void>; primary?: boolean }
function showPanel(title: string, text: string, actions: Action[], dismissible = false) {
  dialogDismissible = dismissible;
  element('panel-title').textContent = title; element('panel-text').textContent = text;
  element('panel-actions').replaceChildren(...actions.map(action => {
    const item = document.createElement('button'); item.type = 'button'; item.textContent = action.label;
    if (action.primary) item.className = 'primary';
    item.addEventListener('click', () => { click(); void action.act(); });
    return item;
  }));
  if (!dialog.open) dialog.showModal();
}

dialog.addEventListener('cancel', event => { if (!dialogDismissible) event.preventDefault(); });
dialog.setAttribute('aria-labelledby', 'panel-title');
element('ad').setAttribute('aria-label', '模拟激励视频');

function resetTimeline() {
  clearTimeout(victoryTimer);
  clearTimeout(ghostTimer);
  renderer.waveComplete = false;
  renderer.setCombo(0);
  states.clear();
  renderer.clearEffects();
  bossArmorHits = 0;
  gateBreached = false;
  updateBossArmorUi(0);
  displayed = { hp: target().hp, poison: 0, gold: run.gold };
  ghostTarget = 100;
  const ghost = document.getElementById('hp-ghost');
  if (ghost) ghost.style.width = '100%';
}

const openingDialog = element<HTMLDialogElement>('opening-dialog');
const openingSeed = element<HTMLInputElement>('opening-seed');
let openingCandidate: OpeningId = 'chain';
let replacingOpening = false;
const selectedOpeningSeed = () => openingSeed.value.trim() || initialSeed;

function startOpening(id: OpeningId, customSeed?: string) {
  if (openingDialog.open) openingDialog.close();
  if (dialog.open) dialog.close();
  const seed = customSeed || selectedOpeningSeed();
  run = createOpeningRun(id, seed);
  undoStack.clear();
  renderer.setRun(run);
  renderer.cursor = null;
  resetTimeline();
  select(null);
  redraw();
  element('battle').focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
}

const openingChoices = openingIds.map(id => {
  const route = openings[id];
  const item = document.createElement('button');
  item.type = 'button';
  item.className = `opening-option opening-${id}`;
  item.setAttribute('aria-label', `${route.name} · ${route.label}`);
  const title = document.createElement('strong');
  title.textContent = route.name;
  const style = document.createElement('span');
  style.textContent = route.label;
  item.append(title, style);
  item.onclick = () => { click(); openingCandidate = id; previewOpening(); };
  return item;
});
element('opening-choices').replaceChildren(...openingChoices);

function previewOpening() {
  const name = openings[openingCandidate].name;
  openingChoices.forEach((item, index) => item.setAttribute('aria-pressed', String(openingIds[index] === openingCandidate)));
  const first = openingDialog.dataset.first === 'true';
  button('opening-close').textContent = first ? `用${name}开局` : '回到当前局';
  button('opening-play').textContent = replacingOpening ? `用${name}重开` : `用${name}开局`;
  renderOpeningPreview(element('opening-preview'), createOpeningRun(openingCandidate, selectedOpeningSeed()), catalog,
    records[openingCandidate], (owner, id) => iconPath(owner, runeVectors[id] ?? emptyIcon), formatNumber, click);
}

function openOpenings(first = false) {
  openingCandidate = first ? 'chain' : run.opening;
  replacingOpening = run.status === 'active' && !first;
  openingDialog.dataset.first = String(first);
  element('opening-confirm').hidden = true;
  element('opening-setup').hidden = false;
  button('opening-close').classList.toggle('primary', first);
  button('opening-play').hidden = first;
  button('opening-daily').hidden = !first;
  element('opening-note').textContent = first && (invalidChallenge || invalidBoard)
    ? '邀请链接无法读取，可以从这里开一局。' : '点亮着的符文，看看它第一波怎么打。';
  if (!openingSeed.value) openingSeed.value = initialSeed;
  element<HTMLDetailsElement>('opening-seed-options').open = false;
  previewOpening();
  openingDialog.showModal();
}

button('openings').onclick = () => {
  if (!arranging()) return;
  click();
  if (challenge) challengeRoom(challenge, run);
  else openOpenings();
};
openingSeed.oninput = previewOpening;
button('random-seed').onclick = () => { click(); openingSeed.value = generateSeedCode().code; previewOpening(); };
button('opening-play').onclick = () => {
  click();
  if (!replacingOpening) { startOpening(openingCandidate); return; }
  element('opening-warning').textContent = `要用「${openings[openingCandidate].name}」重开吗？这局的阵容、金币和遗物不会带过去，最高纪录会保留。`;
  element('opening-setup').hidden = true;
  element('opening-confirm').hidden = false;
  button('opening-back').focus();
};
button('opening-start').onclick = () => { click(); startOpening(openingCandidate); };
button('opening-back').onclick = () => {
  click();
  element('opening-confirm').hidden = true;
  element('opening-setup').hidden = false;
  button('opening-play').focus();
};
button('opening-close').onclick = () => {
  click();
  if (openingDialog.dataset.first === 'true') startOpening(openingCandidate);
  else openingDialog.close();
};
openingDialog.addEventListener('cancel', event => {
  if (openingDialog.dataset.first !== 'true') return;
  event.preventDefault();
  button('opening-close').focus();
});

function showOutcome() {
  if (run.pendingRelics.length) { showRelicChoices(); return; }
  if (run.pendingLoss) {
    const after = (protectedRetry: boolean) => {
      dialog.close(); resolveLoss(run, protectedRetry); resetTimeline(); redraw();
      if (run.status === 'defeat') showOutcome();
      else notice(protectedRetry ? '护盾保留。现在可以重新布阵。' : '护盾 −1，重新布阵后可再次挑战。');
    };
    const { trial, encounter } = target();
    const missing = Math.max(0, foughtHealth(run.lastJournal, run.wave, run.trialWave, run.trialRoute) - run.lastDamage);
    const retry = trial ? '重新布阵后，可到悬赏里改走原路。' : `重来时${encounters[encounter].name}会回满血。`;
    showPanel(`第 ${run.wave} 波没打过`, `你打了 ${formatNumber(run.lastDamage)} 点，还差 ${formatNumber(missing)} 点。\n${retry}看一次模拟广告可以保住护盾。`, [
      ...(run.lastJournal ? [{ label: '看看怎么打的', act: reviewLast }] : []),
      { label: '看广告 · 无损改阵重打', primary: true, act: async () => { if (await platform.showRewardedVideo('retry')) after(true); } },
      { label: '扣除 1 点护盾', act: () => after(false) },
    ]);
  } else if (run.status !== 'active') {
    const won = run.status === 'victory';
    const actions: Action[] = [
      { label: '分享同局挑战', act: shareRun },
      { label: '导出战绩 PNG', act: async () => { if (!await platform.exportScore(run)) notice('战绩导出失败，请再试一次。'); } },
      ...(run.lastJournal ? [{ label: '复盘最后一波', act: reviewLast }] : []),
      ...(challenge ? [
        { label: '对比战绩', act: () => challengeRoom(challenge, run) },
        { label: '同种子再打', act: () => startOpening(challenge.opening, challenge.seed), primary: !won },
      ] : [{ label: '新开一局', act: () => openOpenings(), primary: !won }]),
    ];
    if (won) actions.unshift({ label: '继续无尽模式', primary: true, act: () => {
      dialog.close();
      const prng = createMulberry32(run.rngState);
      startEndless(run, catalog, prng);
      run.rngState = prng.getState();
      resetTimeline(); redraw();
    } });
    const score = runScore(run);
    showPanel(won ? '打完二十波了' : '护盾用完了',
      `打过 ${score.cleared} 波，最高 ${score.combo} 连击。\n最后一轮打了 ${formatNumber(run.lastDamage)} 点。\n本局种子码：${run.seed}`, actions);
  }
}

function playbackProgress(value: number) {
  const progress = element<HTMLProgressElement>('battle-progress');
  progress.value = value;
  element('battle-steps').textContent = `${value} / ${progress.max} 次触发`;
}

function consume(event: BattleEvent, maxHp: number) {
  renderer.play(event, maxHp);
  switch (event.type) {
    case 'CELL_ACTIVATE':
      audio.combo(event.combo);
      playbackProgress(event.combo);
      if (!event.isChain) element('board-count').textContent = `扫到第 ${event.index + 1} 格`;
      return;
    case 'DAMAGE': {
      displayed.hp = event.hp;
      if (event.crit) audio.crit();
      const boss = target();
      if (event.kind === 'rune' && event.amount > 0 && bossArmorHits < armorLayers(boss.encounter)) {
        bossArmorHits++;
        updateBossArmorUi(bossArmorHits, true);
      }
      if (event.breach) {
        gateBreached = true;
        updateBossArmorUi(bossArmorHits);
        updateGateUi();
        renderer.pulseBorder();
      }
      if (event.crit || event.breach || event.amount >= maxHp * 0.15) {
        const emblem = document.getElementById('boss-emblem-wrap');
        if (emblem) {
          emblem.classList.remove('boss-hit');
          void emblem.offsetWidth;
          emblem.classList.add('boss-hit');
        }
      }
      break;
    }
    case 'POISON': displayed.poison = event.poison; break;
    case 'GOLD': displayed.gold = event.gold; break;
    case 'RUNE_STATE': states.set(event.index, event.state); if (renderer.selection?.zone === 'board' && renderer.selection.index === event.index) inspect(); return;
    default: return;
  }
  updateHud();
}

button('battle').onclick = async event => {
  if (!arranging() || event.detail > 1) return;
  const startingBoard = run.board.map(rune => rune ? { ...rune } : null);
  const startingGold = run.gold;
  const prepared = prepareBattle(run, catalog);
  const { events } = prepared;
  const panel = element('forecast');
  panel.style.minHeight = `${panel.offsetHeight}px`;
  element<HTMLProgressElement>('battle-progress').max = Math.max(1, events.filter(entry => entry.type === 'CELL_ACTIVATE').length);
  playbackProgress(0);
  undoStack.clear();
  click(); resetTimeline(); phase = 'PLAYBACK'; redraw(false);

  const result = await player.play(events, consume, {
    maxHp: prepared.hp,
    onHitStop: () => {
      renderer.pulseBorder();
      audio.hitStopChord();
    },
  });
  phase = 'ARRANGE'; panel.style.minHeight = ''; states.clear(); renderer.clearEffects(); audio.finish(result.win);
  run.lastJournal = { wave: run.wave, trialWave: run.trialWave, trialRoute: run.trialRoute, gold: startingGold, board: startingBoard, events };
  const payout = victoryPayout(run, result.gold);
  run.board = prepared.board;
  const prng = createMulberry32(prepared.rngState);
  settleTurn(run, result, catalog, prng);
  run.rngState = prng.getState();
  redraw();
  if (result.win && run.status === 'active' && !run.pendingRelics.length) {
    renderer.waveComplete = true; renderer.invalidate();
    victoryTimer = setTimeout(() => { renderer.waveComplete = false; renderer.invalidate(); }, 1500);
    notice(`打过第 ${run.wave - 1} 波 · ${formatNumber(result.damage)} 伤害 · 过关 +${payout.total} 金${payout.trial ? `（悬赏 +${payout.trial}）` : ''}`);
  }
  showOutcome();
};

button('refresh').onclick = () => {
  if (!arranging()) return;
  undoStack.push(run);
  const prng = createMulberry32(run.rngState);
  if (refreshShop(run, catalog, prng)) {
    run.rngState = prng.getState();
    click(); redraw();
  } else {
    undoStack.pop(run);
  }
};

element<HTMLSelectElement>('shop-focus').onchange = event => {
  if (!arranging()) return;
  const value = (event.currentTarget as HTMLSelectElement).value;
  if (value === 'any' || isOpening(value)) {
    run.shopFocus = value;
    persist();
  }
};

button('speed').onclick = () => {
  click();
  player.speed = player.speed === 1 ? 2 : player.speed === 2 ? 0 : 1;
  if (phase === 'PLAYBACK' && player.speed === 0) player.skip();
  syncControls(); persist();
};
button('skip').onclick = () => { click(); player.skip(); };
button('inspect-jump').onclick = () => { click(); element('inspector').focus(); };
button('board-jump').onclick = () => { click(); element('arena').focus(); };
button('sound').onclick = () => { audio.muted = !audio.muted; click(); syncControls(); persist(); };
button('reward').onclick = async () => {
  click();
  if (arranging() && await platform.showRewardedVideo('refresh')) { run.freeRefreshes += 2; redraw(); notice('获得 2 次免费刷新'); }
};
button('support').onclick = async () => {
  click();
  if (await platform.showRewardedVideo('support')) {
    skin = true; redraw(); showPanel('谢谢这瓶可乐', '送你一套紫铜配色。下次打开游戏还在。', [{ label: '回棋盘', primary: true, act: () => dialog.close() }], true);
  }
};
button('help').onclick = () => {
  click(); showPanel('怎么玩', '符文从左上角开始，逐行触发。折射镜会让右边的符文当场再触发一次。起手阵都已经摆好，可以直接打第一波。\n\n拖动符文可以换位，也可以先点符文，再点目标格。三枚同名同星的符文会自动升一星。\n\n离火位多触发一次。玄冰位增加 45% 暴击率。聚灵位上的符文在相邻符文激活时，永久威力 +2。',
    [{ label: '知道了', primary: true, act: () => dialog.close() }], true);
};

redraw(!!saved);
function showLanding() {
  if (challenge && !saved) challengeRoom(challenge, run, true);
  else if (saved) {
    showOutcome();
    if (invalidChallenge) notice('这条同局邀请已失效。已回到主线。');
    if (invalidBoard) notice('这条试阵链接无法读取。已回到主线。');
  }
  else openOpenings(true);
}
if (sharedBoard) {
  openBoardTrial(sharedBoard, catalog, (owner, id) => iconPath(owner, runeVectors[id] ?? emptyIcon), formatNumber, click, journal, { leave: () => {
    const address = new URL(location.href);
    address.hash = '';
    history.replaceState(history.state, '', address);
    location.reload();
  } });
} else if (!dailyRoom.openShared()) showLanding();
window.addEventListener('hashchange', () => {
  if (location.hash.startsWith(boardSharePrefix) || sharedBoard) location.reload();
});
