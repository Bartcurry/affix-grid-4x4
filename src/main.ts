import './style.css';
import { bossHealth, simulateBattle } from './core/battleEngine';
import { affixAt, encounterAt, encounters, relics, upcomingEncounter } from './core/expedition';
import { isOpening, openingIds, openings, updateRecords } from './core/openings';
import { createMulberry32, decodeSeed, generateSeedCode } from './core/rng';
import { planTurn, previewPlacement, runeFootprint, usesTutorial } from './core/tactics';
import { buyRune, canArrange, chooseRelic, newRun, purchaseInfo, refreshShop, resolveLoss, runeAt, sellRune, sellValue, settleTurn, startEndless, swapRunes, toggleLock, UndoStack, victoryPayout } from './core/shopEngine';
import { STAR_MULT, initialRuneState, type BattleEvent, type OpeningId, type Rune, type RuneState, type Slot } from './core/types';
import { catalog } from './data/catalog';
import { CanvasRenderer, formatNumber, runeVectors } from './render/canvasRenderer';
import { getArchetypeEmblemPath, getBossSvgPath, getRelicSvgPath } from './render/glyphs';
import { countSynergies } from './core/synergy';
import { bindDragDrop } from './render/dragDrop';
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
const platform = new WebMockAdapter(catalog, element('ad'), element('ad-text'), button('cancel-ad'));
const saved = platform.load();

const initialSeed = generateSeedCode();
let run = saved?.run ?? newRun(catalog, createMulberry32(initialSeed.seed), 'chain', initialSeed.code);
let records = saved?.records ?? {};
let forecast: ReturnType<typeof planTurn> | null = null;
let placement: ReturnType<typeof planTurn> | null = null;
let skin = saved?.skin ?? false;
let exactForecast = saved?.exactForecast ?? false;
audio.muted = saved?.muted ?? false;
player.speed = saved?.speed ?? 1;

let phase: 'ARRANGE' | 'PLAYBACK' = 'ARRANGE';
let displayed = { hp: bossHealth(run.wave), poison: 0, gold: run.gold, combo: 0 };
let shopInspect: number | null = null;
let noticeTimer: ReturnType<typeof setTimeout>;
let victoryTimer: ReturnType<typeof setTimeout>;
let ghostTimer: ReturnType<typeof setTimeout>;
let dialogDismissible = false;
let bossArmorHits = 0;
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
};

const rarityLabel = { common: '普通', rare: '稀有', epic: '史诗' };
const archetypeLabel = { chain: '连锁', poison: '剧毒', gold: '金币', amplify: '增幅' };

const arranging = () => phase === 'ARRANGE' && canArrange(run);
const persist = () => {
  records = updateRecords(records, run);
  platform.save({ schemaVersion: 2, run, skin, muted: audio.muted, speed: player.speed, exactForecast, records });
};
const tutorials = () => usesTutorial(run);
const click = () => { audio.unlock(); audio.click(); };

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
  panel.hidden = !forecast || !arranging();
  showArenaHint();
  if (panel.hidden || !forecast) return;
  const { hp, result } = placement ?? forecast;
  const change = result.damage - forecast.result.damage;
  panel.dataset.verdict = forecast.verdict;
  element('forecast-verdict').textContent = forecast.verdictText;
  element('forecast-fill').style.width = `${Math.min(100, 100 * result.damage / hp)}%`;

  if (exactForecast) {
    const delta = change ? ` · ${change > 0 ? '+' : '−'}${formatNumber(Math.abs(change))} 伤害` : '';
    element('forecast-readout').textContent = `${placement ? '放置后' : '预计伤害'} ${formatNumber(result.damage)} / ${formatNumber(hp)} · ${result.combo} 连击${delta}`;
  } else {
    const delta = change ? ` · ${change > 0 ? '+' : '−'}${formatNumber(Math.abs(change))}` : '';
    element('forecast-readout').textContent = `${placement ? '放置后' : '战果预估'} ${formatNumber(forecast.minDamage)} ~ ${formatNumber(forecast.expectedDamage)} / ${formatNumber(hp)} · ${result.combo} 连击${delta}`;
  }
  button('forecast-detail').disabled = !!placement;
}

function updateBossArmorUi(hits: number, breaking = false) {
  const s1 = document.getElementById('boss-shield-1');
  const s2 = document.getElementById('boss-shield-2');
  if (s1) {
    s1.className = hits >= 1 ? (breaking && hits === 1 ? 'boss-shield-icon broken breaking' : 'boss-shield-icon broken') : 'boss-shield-icon';
  }
  if (s2) {
    s2.className = hits >= 2 ? (breaking && hits === 2 ? 'boss-shield-icon broken breaking' : 'boss-shield-icon broken') : 'boss-shield-icon';
  }
}

function updateHud() {
  const maxHp = bossHealth(run.wave);
  const showOutcomeState = run.pendingLoss || run.status !== 'active';
  const hp = phase === 'PLAYBACK' ? displayed.hp : showOutcomeState ? Math.max(0, maxHp - run.lastDamage) : maxHp;
  const pct = Math.max(0, Math.min(100, (100 * hp) / maxHp));

  element('wave').textContent = run.endless ? `无尽 · 第 ${run.wave} 波` : `第 ${run.wave} / 20 波`;
  element('hp-fill').style.width = `${pct}%`;

  // 双层延迟残影血条：实际瞬扣，残影条平滑追平
  clearTimeout(ghostTimer);
  ghostTimer = setTimeout(() => {
    const ghost = document.getElementById('hp-ghost');
    if (ghost) ghost.style.width = `${pct}%`;
  }, 280);

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

  element('phase').textContent = phase === 'PLAYBACK' ? `连锁中 · ${displayed.combo} 连击` : run.pendingRelics.length ? '挑选遗物' : run.pendingLoss ? '待结算护盾' :
    run.status !== 'active' ? '战斗结束' : '布阵';
  updateSynergiesUi();
}

function spawnGoldParticles(sourceEl: HTMLElement) {
  const rect = sourceEl.getBoundingClientRect();
  for (let i = 0; i < 6; i++) {
    const coin = document.createElement('div');
    coin.className = 'flying-coin-particle';
    coin.textContent = '◆';
    coin.style.left = `${rect.left + rect.width / 2}px`;
    coin.style.top = `${rect.top + rect.height / 2}px`;
    const dx = (Math.random() - 0.5) * 90;
    const dy = -40 - Math.random() * 60;
    coin.style.setProperty('--dx', `${dx}px`);
    coin.style.setProperty('--dy', `${dy}px`);
    document.body.appendChild(coin);
    setTimeout(() => coin.remove(), 600);
  }
}

function updateSynergiesUi() {
  const container = document.getElementById('hud-synergies');
  if (!container) return;
  const synergies = countSynergies(run.board, catalog);
  const items = (['chain', 'poison', 'gold', 'amplify'] as const).map(type => {
    const syn = synergies[type];
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `synergy-hud-chip synergy-${type} tier-${syn.tier}`;
    chip.dataset.tier = String(syn.tier);
    chip.title = `${syn.name} (${syn.count}件)\n${syn.activeDesc}\n• 3件套：${syn.tier1Desc}\n• 5件套：${syn.tier2Desc}`;

    const icon = document.createElement('span');
    icon.className = 'synergy-icon';
    icon.textContent = type === 'chain' ? '⚡' : type === 'poison' ? '💧' : type === 'gold' ? '◆' : '✦';

    const name = document.createElement('span');
    name.className = 'synergy-name';
    name.textContent = syn.name.slice(0, 2);

    const count = document.createElement('span');
    count.className = 'synergy-count';
    count.textContent = `${syn.count}/${syn.tier >= 1 ? (syn.tier >= 2 ? 5 : 3) : 3}`;

    chip.append(icon, name, count);
    chip.onclick = () => {
      click();
      notice(`【${syn.name}】已布阵 ${syn.count} 件 · ${syn.activeDesc}`);
    };
    return chip;
  });
  container.replaceChildren(...items);
}

function markWaves() {
  const track = element('wave-track');
  track.hidden = run.endless;
  track.replaceChildren(...Array.from({ length: 20 }, (_, index) => {
    const notch = document.createElement('span');
    const wave = index + 1;
    notch.dataset.state = wave < run.wave || run.status === 'victory' ? 'cleared' : wave === run.wave ? 'current' : 'ahead';
    return notch;
  }));
}

function inspect() {
  const slot = renderer.selection;
  const selected = slot && runeAt(run, slot);
  const offer = shopInspect === null ? null : run.shop[shopInspect];
  const rune: Rune | null = selected || (offer ? { configId: offer.configId, star: 1 } : null);
  const icon = element('rune-icon');
  const name = element('rune-name');
  const info = element('rune-desc');
  const config = rune && catalog[rune.configId];
  const state = slot?.zone === 'board' ? states.get(slot.index) ?? initialRuneState() : initialRuneState();
  element('inspector').style.setProperty('--accent', config?.color ?? 'var(--gold)');
  iconPath(icon, rune ? runeVectors[rune.configId] : emptyIcon);
  element('rune-context').textContent = config ? `${offer ? '店内' : slot?.zone === 'board' ? '棋盘' : '备战区'} · ${archetypeLabel[config.archetype]}` : '';
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
    name.textContent = config?.name ?? (run.wave === 1 ? tutorials() ? '第一波可以直接打' : openings[run.opening].name : '先挑一枚符文');
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
  const hasSelection = Boolean(selected || offer || emptyTileMod);
  element('inspector').dataset.visible = String(hasSelection);
  renderer.sellLabel = selected ? `拖到此处回收 · +${price} 金` : '拖到此处回收符文';
  for (const [index, card] of offers.entries()) card.card.dataset.selected = String(index === shopInspect);
  renderer.invalidate();
}

function select(slot: Slot | null) { shopInspect = null; renderer.selection = slot; inspect(); }

function syncControls() {
  game.classList.toggle('skin', skin);
  game.dataset.phase = phase.toLowerCase();
  button('sound').setAttribute('aria-pressed', String(!audio.muted));
  button('sound').textContent = audio.muted ? '静音' : '音效';
  button('speed').textContent = `${player.speed}×`;
  button('speed').setAttribute('aria-label', `播放速度 ${player.speed} 倍，点击切换`);
  button('skip').disabled = phase !== 'PLAYBACK';
  button('skip').hidden = phase !== 'PLAYBACK';
  button('market-jump').hidden = phase === 'PLAYBACK';
  button('undo').disabled = !arranging() || undoStack.length === 0;
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
  button('help').disabled = phase === 'PLAYBACK';
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

const offers = Array.from({ length: 3 }, (_, index) => {
  const card = document.createElement('div'); card.className = 'offer';
  const preview = document.createElement('button'); preview.className = 'offer-info';
  const icon = document.createElement('span'); icon.className = 'offer-icon'; icon.setAttribute('aria-hidden', 'true');
  const name = document.createElement('span'); name.className = 'offer-name';
  const meta = document.createElement('span'); meta.className = 'offer-meta';
  preview.append(icon, name, meta);
  const lock = document.createElement('button'); lock.className = 'lock'; lock.type = 'button';
  const buy = document.createElement('button'); buy.className = 'offer-buy';
  card.append(preview, lock, buy); element('offers').append(card);
  const look = () => {
    const offer = run.shop[index];
    if (!offer) return;
    renderer.selection = null; shopInspect = index; inspect();
  };
  preview.addEventListener('click', () => { click(); look(); element('inspector').scrollIntoView({ block: 'nearest' }); });
  lock.addEventListener('click', () => {
    if (toggleLock(run, index)) { click(); redraw(); }
  });
  buy.addEventListener('click', () => {
    if (!arranging()) return;
    click(); look();
    spawnGoldParticles(buy);
    audio.jadeChime();
    const benchIndex = run.bench.indexOf(null);
    undoStack.push(run);
    const merges = buyRune(run, index, catalog);
    if (!merges) {
      undoStack.pop(run);
      return;
    }
    for (const merge of merges) renderer.flash(merge.slot, catalog[merge.rune.configId].color, true);
    if (merges.length) { audio.merge(); select(merges.at(-1)!.slot); }
    else {
      if (benchIndex >= 0) {
        select({ zone: 'bench', index: benchIndex });
        const placedRune = run.bench[benchIndex];
        if (placedRune) renderer.flash({ zone: 'bench', index: benchIndex }, catalog[placedRune.configId]?.color ?? '#d4af37', false);
      }
      notice('买到了。在备战区，拖上棋盘才会触发。');
    }
    redraw();
  });
  return { card, preview, icon, name, meta, lock, buy };
});

function redraw(save = true) {
  if (arranging()) forecast = planTurn(run, catalog);
  placement = null;
  updateHud(); markWaves(); syncControls(); showForecast(); inspect();
  const encounter = encounterAt(run.wave);
  const enemy = encounters[encounter];
  element('enemy-name').textContent = enemy.name;

  const armorShields = document.getElementById('boss-armor-shields');
  if (armorShields) {
    armorShields.hidden = encounter !== 'armor';
    updateBossArmorUi(bossArmorHits);
  }

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

  // 2 waves advance boss preview
  const upcoming = upcomingEncounter(run.wave, 2);
  element('boss-intel-text').textContent = `2波后：${upcoming.name} · ${upcoming.hint}`;

  element('game').dataset.enemy = encounter;
  element('board-count').textContent = `已布阵 ${run.board.filter(Boolean).length}/16`;
  element('bench-count').textContent = `备战区 ${run.bench.filter(Boolean).length}/4`;
  element('last-damage').textContent = run.bestCombo || run.lastDamage || run.attempts ? formatNumber(run.lastDamage) : '—';
  element('best-combo').textContent = run.bestCombo ? String(run.bestCombo) : '—';
  element('run-opening').textContent = `${openings[run.opening].name} · ${openings[run.opening].label}开局`;
  element('run-seed').textContent = `种子码：${run.seed}`;

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
  offers.forEach(({ card, preview, icon, name, meta, lock, buy }, index) => {
    const offer = run.shop[index];
    const config = offer && catalog[offer.configId];
    card.style.setProperty('--offer', config?.color ?? '#56657e');
    const { copies, blocked, willMerge } = purchaseInfo(run, index, catalog);
    card.dataset.rarity = config?.rarity ?? '';
    card.dataset.merge = String(willMerge);
    iconPath(icon, config ? runeVectors[config.id] : emptyIcon);
    name.textContent = config?.name ?? '已售罄';
    meta.textContent = config ? willMerge ? '买下就升星' : copies ? `${rarityLabel[config.rarity]} · 已有 ${copies} 枚` : `${rarityLabel[config.rarity]} · ${archetypeLabel[config.archetype]}` : '换一批再来';
    preview.disabled = !config || phase === 'PLAYBACK';
    lock.hidden = !config;
    lock.disabled = !arranging();
    iconPath(lock, offer?.locked ? 'M8 14V9a8 8 0 0 1 16 0v5M5 14h22v15H5Z M16 20v4' : 'M9 14V9a8 8 0 0 1 15-4M5 14h22v15H5Z M16 20v4');
    lock.setAttribute('aria-pressed', String(!!offer?.locked));
    lock.setAttribute('aria-label', `${offer?.locked ? '解锁' : '锁定'} ${config?.name ?? ''}`);
    buy.textContent = config ? blocked === 'gold' ? `缺 ${config.cost - run.gold} 金` : blocked === 'bench' ? '备战区已满' : `购买 · ${config.cost} 金` : '无库存';
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
  element('relic-wave').textContent = `突破第 ${run.wave - 1} 波 · 天机显圣`;
  audio.unlock();
  audio.singingBowl();
  element('relic-choices').replaceChildren(...run.pendingRelics.map((id, idx) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'celestial-talisman-card';
    item.style.animationDelay = `${idx * 100}ms`;

    const iconWrap = document.createElement('div');
    iconWrap.className = 'celestial-relic-icon';
    iconPath(iconWrap, getRelicSvgPath(id));

    const name = document.createElement('strong');
    name.className = 'celestial-relic-name';
    name.textContent = relics[id].name;

    const pill = document.createElement('span');
    pill.className = 'celestial-relic-pill';
    pill.textContent = '仙家灵宝';

    const text = document.createElement('span');
    text.className = 'celestial-relic-desc';
    text.textContent = relics[id].text;

    const action = document.createElement('span');
    action.className = 'celestial-pick-label';
    action.textContent = '参悟纳宝';

    item.append(pill, iconWrap, name, text, action);
    item.onclick = () => {
      if (!chooseRelic(run, id)) return;
      audio.unlock();
      audio.jadeChime();
      audio.synergyChime();
      relicDialog.close();
      redraw();
      notice(`天机感应，已收纳秘宝：${relics[id].name}`);
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
    ? `${combatGold} · 过关 ${payout.base} 金${payout.interest ? ` · 利息 ${payout.interest} 金` : ''}${payout.relic ? ` · 遗物 ${payout.relic} 金` : ''}。结束时有 ${formatNumber(result.gold + payout.total)} 金。`
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
function showPanel(title: string, text: string, actions: Action[], dismissible = false, mvpHtml?: string, isVictory = false) {
  dialogDismissible = dismissible;
  element('panel-title').textContent = title;
  element('panel-text').textContent = text;

  const stampWrap = document.getElementById('panel-stamp-wrap');
  if (stampWrap) {
    stampWrap.hidden = !isVictory;
    if (isVictory) {
      stampWrap.classList.remove('stamp-slam');
      void stampWrap.offsetWidth;
      stampWrap.classList.add('stamp-slam');
      audio.stampSlam();
    }
  }

  const mvpCard = document.getElementById('panel-mvp-card');
  if (mvpCard) {
    mvpCard.hidden = !mvpHtml;
    mvpCard.innerHTML = mvpHtml ?? '';
  }

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
  updateBossArmorUi(0);
  displayed = { hp: bossHealth(run.wave), poison: 0, gold: run.gold, combo: 0 };
  const ghost = document.getElementById('hp-ghost');
  if (ghost) ghost.style.width = '100%';
}

const openingDialog = element<HTMLDialogElement>('opening-dialog');
let openingCandidate: OpeningId | null = null;

function startOpening(id: OpeningId, customSeed?: string) {
  if (openingDialog.open) openingDialog.close();
  if (dialog.open) dialog.close();
  const seed = customSeed || element<HTMLInputElement>('opening-seed')?.value.trim() || undefined;
  const initialPrng = createMulberry32(seed ? decodeSeed(seed) : 1);
  run = newRun(catalog, initialPrng, id, seed);
  undoStack.clear();
  renderer.setRun(run);
  renderer.cursor = null;
  resetTimeline();
  select(null);
  redraw();
  element('battle').focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
}

function resetOpeningChoice() {
  openingCandidate = null;
  element('opening-confirm').hidden = true;
  element('opening-choices').hidden = false;
  element('opening-close').hidden = false;
}

function openOpenings(first = false) {
  resetOpeningChoice();
  const replacing = run.status === 'active' && !first;
  element('opening-note').textContent = replacing
    ? '换开局会另开一局。现在这局的最高纪录会保留。'
    : '四套阵都能直接打第一波，后面怎么摆由你。';
  button('opening-close').textContent = first ? '用借火开局' : '回到当前局';
  openingDialog.dataset.first = String(first);

  const seedInput = element<HTMLInputElement>('opening-seed');
  if (seedInput && !seedInput.value) {
    seedInput.value = generateSeedCode().code;
  }
  const randomSeedBtn = button('random-seed');
  if (randomSeedBtn) {
    randomSeedBtn.onclick = () => {
      click();
      seedInput.value = generateSeedCode().code;
    };
  }

  element('opening-choices').replaceChildren(...openingIds.map(id => {
    const route = openings[id];
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `opening-option opening-card-grand opening-${id}`;

    const emblemWrap = document.createElement('div');
    emblemWrap.className = 'opening-emblem-wrap';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 32 32');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('opening-emblem-svg');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', getArchetypeEmblemPath(id));
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '2');
    svg.append(path);
    emblemWrap.append(svg);

    const titleRow = document.createElement('div');
    titleRow.className = 'opening-title-row';
    const title = document.createElement('strong');
    title.className = 'opening-title-text';
    title.textContent = route.title;
    const goldPill = document.createElement('span');
    goldPill.className = 'opening-gold-pill';
    goldPill.textContent = `${route.gold} 金起手`;
    titleRow.append(title, goldPill);

    const hook = document.createElement('div');
    hook.className = 'opening-hook-text';
    hook.textContent = route.slogan;

    const pieces = document.createElement('div');
    pieces.className = 'opening-pieces-row';
    pieces.innerHTML = `<span class="pieces-tag">本命初始：</span>${route.pieces.map(([, configId]) => `<span class="rune-micro-pill">${catalog[configId].name}</span>`).join('')}`;

    const note = document.createElement('p');
    note.className = 'opening-note-text';
    note.textContent = route.note;

    item.append(emblemWrap, titleRow, hook, pieces, note);

    const record = records[id];
    if (record) {
      const history = document.createElement('small');
      history.className = 'opening-record-text';
      history.textContent = `最高纪录：打过 ${record.cleared} 波 · ${record.combo} 连击`;
      item.append(history);
    }
    item.onclick = () => {
      click();
      audio.singingBowl();
      if (!replacing) { startOpening(id); return; }
      openingCandidate = id;
      element('opening-warning').textContent = `要以「${route.title}」重开吗？当前局的阵容、金币与遗物将归零。`;
      element('opening-choices').hidden = true;
      element('opening-close').hidden = true;
      element('opening-confirm').hidden = false;
      button('opening-back').focus();
    };
    return item;
  }));
  openingDialog.showModal();
}

button('openings').onclick = () => { if (arranging()) { click(); openOpenings(); } };
button('opening-start').onclick = () => { if (openingCandidate) { click(); startOpening(openingCandidate); } };
button('opening-back').onclick = () => { click(); resetOpeningChoice(); element('opening-choices').querySelector('button')?.focus(); };
button('opening-close').onclick = () => {
  if (openingDialog.dataset.first === 'true') startOpening('chain');
  else openingDialog.close();
};
openingDialog.addEventListener('cancel', event => {
  if (openingDialog.dataset.first !== 'true') return;
  event.preventDefault();
  startOpening('chain');
});

function showOutcome() {
  if (run.pendingRelics.length) { showRelicChoices(); return; }
  if (run.pendingLoss) {
    const after = (protectedRetry: boolean) => {
      dialog.close(); resolveLoss(run, protectedRetry); resetTimeline(); redraw();
      if (run.status === 'defeat') showOutcome();
      else notice(protectedRetry ? '护盾保留。现在可以重新布阵。' : '护盾 −1，重新布阵后可再次挑战。');
    };
    showPanel(`第 ${run.wave} 波没打过`, `你打了 ${formatNumber(run.lastDamage)} 点，还差 ${formatNumber(bossHealth(run.wave) - run.lastDamage)} 点。\n重来时${encounters[encounterAt(run.wave)].name}会回满血；看一次模拟广告可以保住护盾。`, [
      { label: '看广告 · 无损改阵重打', primary: true, act: async () => { if (await platform.showRewardedVideo('retry')) after(true); } },
      { label: '扣除 1 点护盾', act: () => after(false) },
    ]);
  } else if (run.status !== 'active') {
    const won = run.status === 'victory';
    let mvpHtml = '';
    if (forecast?.byCell) {
      let maxDmg = -1;
      let mvpIdx = -1;
      forecast.byCell.forEach((c, idx) => {
        if (c.damage > maxDmg && run.board[idx]) {
          maxDmg = c.damage;
          mvpIdx = idx;
        }
      });
      if (mvpIdx >= 0 && run.board[mvpIdx] && maxDmg > 0) {
        const r = run.board[mvpIdx]!;
        const c = catalog[r.configId];
        const pct = run.lastDamage > 0 ? Math.round((maxDmg / run.lastDamage) * 100) : 100;
        mvpHtml = `
          <div class="mvp-label">功勋阵眼 · 本局 MVP 符文</div>
          <div class="mvp-card-body">
            <span class="mvp-rune-name" style="color: ${c.color}">【${c.name}】${'★'.repeat(r.star)}</span>
            <span class="mvp-rune-stat">输出 ${formatNumber(maxDmg)} · 战损占比 ${pct}% · 第 ${mvpIdx + 1} 格</span>
          </div>
        `;
      }
    }
    const actions: Action[] = [
      { label: '导出战绩 PNG', act: async () => { if (!await platform.exportScore(run)) notice('战绩导出失败，请再试一次。'); } },
      { label: '复制种子码', act: () => { void navigator.clipboard?.writeText(run.seed); notice(`已复制种子码：${run.seed}`); } },
      { label: '新开一局', act: () => openOpenings(), primary: !won },
    ];
    if (won) actions.unshift({ label: '继续无尽模式', primary: true, act: () => {
      dialog.close();
      const prng = createMulberry32(run.rngState);
      startEndless(run, catalog, prng);
      run.rngState = prng.getState();
      resetTimeline(); redraw();
    } });
    showPanel(won ? '廿重劫尽 · 大获全胜' : '灵气耗竭 · 护盾归零',
      `破阵至第 ${run.wave} 波，最高 ${run.bestCombo} 连击。\n最后一轮倾泻 ${formatNumber(run.lastDamage)} 点伤害。\n本局天机玄码：${run.seed}`, actions, false, mvpHtml, won);
  }
}

function consume(event: BattleEvent) {
  renderer.play(event);
  switch (event.type) {
    case 'CELL_ACTIVATE':
      displayed.combo = event.combo;
      audio.combo(event.combo);
      renderer.setCombo(event.combo);
      break;
    case 'DAMAGE':
      displayed.hp = event.hp;
      if (event.crit) audio.crit();
      if (event.kind === 'rune' && event.amount > 0 && encounterAt(run.wave) === 'armor' && bossArmorHits < 2) {
        bossArmorHits++;
        updateBossArmorUi(bossArmorHits, true);
      }
      if (event.crit || event.amount >= bossHealth(run.wave) * 0.15) {
        const emblem = document.getElementById('boss-emblem-wrap');
        if (emblem) {
          emblem.classList.remove('boss-hit');
          void emblem.offsetWidth;
          emblem.classList.add('boss-hit');
        }
      }
      break;
    case 'POISON': displayed.poison = event.poison; break;
    case 'GOLD': displayed.gold = event.gold; break;
    case 'RUNE_STATE': states.set(event.index, event.state); if (renderer.selection?.zone === 'board' && renderer.selection.index === event.index) inspect(); break;
  }
  updateHud();
}

button('battle').onclick = async () => {
  if (!arranging()) return;
  undoStack.clear();
  click(); resetTimeline(); phase = 'PLAYBACK'; redraw(false);
  const battlePrng = createMulberry32(run.rngState);
  const events = simulateBattle({
    board: run.board,
    hp: bossHealth(run.wave),
    gold: run.gold,
    poison: 0,
    seed: battlePrng.getState(),
    tutorial: usesTutorial(run),
    encounter: encounterAt(run.wave),
    relics: run.relics,
    tileModifiers: run.tileModifiers,
    affix: affixAt(run.wave)?.id,
    shield: run.shield,
    enableSynergies: run.enableSynergies ?? true,
  }, catalog, battlePrng);
  run.rngState = battlePrng.getState();

  const result = await player.play(events, consume, {
    maxHp: bossHealth(run.wave),
    onHitStop: () => {
      renderer.pulseBorder();
      audio.hitStopChord();
    },
  });
  phase = 'ARRANGE'; states.clear(); renderer.clearEffects(); audio.finish(result.win);
  const prng = createMulberry32(run.rngState);
  settleTurn(run, result, catalog, prng);
  run.rngState = prng.getState();
  redraw();
  if (result.win && run.status === 'active' && !run.pendingRelics.length) {
    renderer.waveComplete = true; renderer.invalidate();
    victoryTimer = setTimeout(() => { renderer.waveComplete = false; renderer.invalidate(); }, 1500);
    notice(`打过第 ${run.wave - 1} 波 · ${formatNumber(result.damage)} 伤害 · 过关 +${victoryPayout(run, result.gold, catalog).total} 金`);
  }
  showOutcome();
};

button('refresh').onclick = () => {
  if (!arranging()) return;
  undoStack.push(run);
  const prng = createMulberry32(run.rngState);
  if (refreshShop(run, catalog, prng)) {
    run.rngState = prng.getState();
    audio.unlock();
    audio.jadeChime();
    shopInspect = null;
    offers.forEach(({ card }, idx) => {
      card.classList.remove('offer-flip');
      void card.offsetWidth;
      card.style.animationDelay = `${idx * 60}ms`;
      card.classList.add('offer-flip');
    });
    redraw();
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

button('speed').onclick = () => { click(); player.speed = player.speed === 1 ? 2 : 1; syncControls(); persist(); };
button('skip').onclick = () => { click(); player.skip(); };
button('market-jump').onclick = () => { click(); element('market').focus(); };
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
  click(); showPanel('怎么玩', '先把符文放置在棋盘上。符文从左上角开始，逐行触发；比如折射镜会再触发右边那一枚。\n\n点击已选中的符文，再点击目标格即可快速交换（支持手机单手操作），拖拽换位时悬浮符文自动向上偏移防遮挡。\n\n棋盘中生成了【离火位】（额外触发1次）、【玄冰位】（暴击率+45%）和【聚灵位】（相邻激活永久威力+2）。\n\n三枚同名同星的符文会自动升一级。开局两枚先别挪，直接打就能过第一波。',
    [{ label: '知道了', primary: true, act: () => dialog.close() }], true);
};

redraw(!!saved);
if (saved) showOutcome();
else openOpenings(true);
