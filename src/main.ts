import './style.css';
import { bossHealth, simulateBattle } from './core/battleEngine';
import { buyRune, canArrange, newRun, refreshShop, resolveLoss, runeAt, sellRune, sellValue, settleTurn, startEndless, swapRunes, toggleLock } from './core/shopEngine';
import { STAR_MULT, initialRuneState, type BattleEvent, type Rune, type RuneState, type Slot } from './core/types';
import { catalog } from './data/catalog';
import { CanvasRenderer } from './render/canvasRenderer';
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
let run = saved?.run ?? newRun(catalog, Math.random);
let skin = saved?.skin ?? false;
audio.muted = saved?.muted ?? false;
player.speed = saved?.speed ?? 1;

let phase: 'ARRANGE' | 'PLAYBACK' = 'ARRANGE';
let displayed = { hp: bossHealth(run.wave), poison: 0, gold: run.gold, combo: 0 };
let shopInspect: string | null = null;
let noticeTimer: ReturnType<typeof setTimeout>;
let dialogDismissible = false;
const states = new Map<number, RuneState>();
const renderer = new CanvasRenderer(element('arena'), run, catalog);
const rarityLabel = { common: '普通', rare: '稀有', epic: '史诗' };
const number = new Intl.NumberFormat('zh-CN');
const format = (value: number) => value >= 1_000_000 ? value.toExponential(2) : number.format(value);
const arranging = () => phase === 'ARRANGE' && canArrange(run);
const persist = () => platform.save({ run, skin, muted: audio.muted, speed: player.speed });
const tutorials = () => run.wave === 1 && run.board[0]?.configId === 'spark_orb' && run.board[1]?.configId === 'prism_right';
const click = () => { audio.unlock(); audio.click(); };

function notice(text: string) {
  const target = element('notice');
  clearTimeout(noticeTimer);
  target.textContent = text;
  noticeTimer = setTimeout(() => { target.textContent = ''; }, 2200);
}

function updateHud() {
  const maxHp = bossHealth(run.wave);
  const showOutcomeState = run.pendingLoss || run.status !== 'active';
  const hp = phase === 'PLAYBACK' ? displayed.hp : showOutcomeState ? Math.max(0, maxHp - run.lastDamage) : maxHp;
  element('wave').textContent = `WAVE ${String(run.wave).padStart(2, '0')} / ${run.endless ? '∞' : '20'}`;
  element('hp-fill').style.width = `${100 * hp / maxHp}%`;
  element('hp-text').textContent = `${format(hp)} / ${format(maxHp)}`;
  element('hp-meter').setAttribute('aria-valuemax', String(maxHp));
  element('hp-meter').setAttribute('aria-valuenow', String(hp));
  element('shield').textContent = `⛨ ${run.shield}`;
  element('shield').setAttribute('aria-label', `护盾 ${run.shield}`);
  const poison = phase === 'PLAYBACK' ? displayed.poison : showOutcomeState ? run.lastPoison : 0;
  const gold = phase === 'PLAYBACK' ? displayed.gold : run.gold;
  element('poison').textContent = `☣ ${format(poison)}`;
  element('poison').setAttribute('aria-label', `剧毒 ${poison}`);
  element('gold').textContent = `◆ ${format(gold)}`;
  element('gold').setAttribute('aria-label', `金币 ${gold}`);
  element('phase').textContent = phase === 'PLAYBACK' ? `连锁中 · ${displayed.combo} HIT` : run.pendingLoss ? '待结算护盾' :
    run.status !== 'active' ? '战斗结束' : run.endless ? '无尽布阵中' : '布阵中';
}

function inspect() {
  const slot = renderer.selection;
  const selected = slot && runeAt(run, slot);
  const rune: Rune | null = selected || (shopInspect ? { configId: shopInspect, star: 1 } : null);
  const icon = element('rune-icon');
  const name = element('rune-name');
  const info = element('rune-desc');
  const config = rune && catalog[rune.configId];
  const state = slot?.zone === 'board' ? states.get(slot.index) ?? initialRuneState() : initialRuneState();
  element('inspector').style.setProperty('--accent', config?.color ?? '#75efff');
  icon.textContent = config?.symbol ?? '✳';
  name.textContent = config && rune ? `${config.name}  ${'★'.repeat(rune.star)} · ${rarityLabel[config.rarity]}` : '战术提示';
  info.textContent = config && rune ? `${config.desc} 星级×${STAR_MULT[rune.star]} · 倍率×${+state.tempMult.toFixed(2)} · 暴击${Math.round(state.tempCritChance * 100)}% · 充能${state.chargeStacks}` :
    tutorials() ? '首波保持初始布局，开战时触发教学共鸣，额外造成 42 点伤害。' : '按住拖动布阵。相同的 3 个符文自动升星；点击符文查看作用范围。';
  renderer.sellLabel = selected ? `拖到此处出售 · 可得 ${sellValue(selected, catalog)} 金` : '拖到此处出售符文';
  renderer.invalidate();
}

function select(slot: Slot | null) { shopInspect = null; renderer.selection = slot; inspect(); }

function syncControls() {
  game.classList.toggle('skin', skin);
  button('sound').setAttribute('aria-pressed', String(!audio.muted));
  button('sound').textContent = audio.muted ? '静音' : '音效';
  button('speed').textContent = `${player.speed}×`;
  button('speed').setAttribute('aria-label', `播放速度 ${player.speed} 倍，点击切换`);
  button('skip').disabled = phase !== 'PLAYBACK';
  button('battle').disabled = !arranging();
  button('battle').textContent = phase === 'PLAYBACK' ? '结算中' : '开始结算';
  button('refresh').textContent = run.freeRefreshes ? `刷新 · 免费${run.freeRefreshes}` : '刷新 · 2 金';
  button('refresh').disabled = !arranging() || (!run.freeRefreshes && run.gold < 2) || run.shop.every(offer => offer?.locked);
  button('reward').disabled = !arranging();
  button('support').disabled = phase === 'PLAYBACK';
  button('help').disabled = phase === 'PLAYBACK';
}

const offers = Array.from({ length: 3 }, (_, index) => {
  const card = document.createElement('div'); card.className = 'offer';
  const preview = document.createElement('button'); preview.className = 'offer-info';
  const icon = document.createElement('span'); icon.className = 'offer-icon';
  const name = document.createElement('span'); name.className = 'offer-name';
  const meta = document.createElement('span'); meta.className = 'offer-meta';
  preview.append(icon, name, meta);
  const lock = document.createElement('button'); lock.className = 'lock';
  const buy = document.createElement('button'); buy.className = 'offer-buy';
  card.append(preview, lock, buy); element('offers').append(card);
  const look = () => {
    const offer = run.shop[index];
    if (!offer) return;
    renderer.selection = null; shopInspect = offer.configId; inspect();
  };
  preview.addEventListener('click', () => { click(); look(); });
  lock.addEventListener('click', () => { if (toggleLock(run, index)) { click(); redraw(); } });
  buy.addEventListener('click', () => {
    if (!arranging()) return;
    click(); look();
    const merges = buyRune(run, index, catalog);
    if (!merges) { notice('备战区已满，先腾出一格或凑齐三合一。'); return; }
    for (const merge of merges) renderer.flash(merge.slot, catalog[merge.rune.configId].color, true);
    if (merges.length) { audio.merge(); select(merges.at(-1)!.slot); }
    else notice('已购入备战区，拖入法阵生效。');
    redraw();
  });
  return { card, preview, icon, name, meta, lock, buy };
});

function redraw(save = true) {
  updateHud(); syncControls(); inspect();
  offers.forEach(({ card, preview, icon, name, meta, lock, buy }, index) => {
    const offer = run.shop[index];
    const config = offer && catalog[offer.configId];
    card.style.setProperty('--offer', config?.color ?? '#56657e');
    icon.textContent = config?.symbol ?? '·';
    name.textContent = config?.name ?? '已售罄';
    meta.textContent = config ? rarityLabel[config.rarity] : '等待刷新';
    preview.disabled = !config || phase === 'PLAYBACK';
    lock.hidden = !config;
    lock.disabled = !arranging();
    lock.textContent = offer?.locked ? '解锁' : '锁定';
    lock.setAttribute('aria-pressed', String(!!offer?.locked));
    lock.setAttribute('aria-label', `${lock.textContent} ${config?.name ?? ''}`);
    buy.textContent = config ? `购买 · ${config.cost} 金` : '无库存';
    buy.disabled = !arranging() || !config || run.gold < config.cost;
    buy.setAttribute('aria-label', config ? `购买 ${config.name}，${config.cost} 金` : '无库存');
  });
  if (save) persist();
}

bindDragDrop(renderer, {
  enabled: arranging, hasRune: slot => !!runeAt(run, slot), select,
  move(from, to) { if (swapRunes(run, from, to)) { click(); select(to); redraw(); } },
  sell(from) {
    const paid = sellRune(run, from, catalog);
    if (paid) { click(); select(null); redraw(); notice(`已出售 · +${paid} 金`); }
  },
});

interface Action { label: string; act: () => void | Promise<void>; primary?: boolean }
function showPanel(tag: string, title: string, text: string, actions: Action[], dismissible = false) {
  dialogDismissible = dismissible;
  element('panel-tag').textContent = tag; element('panel-title').textContent = title; element('panel-text').textContent = text;
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

function resetTimeline() { states.clear(); renderer.clearEffects(); displayed = { hp: bossHealth(run.wave), poison: 0, gold: run.gold, combo: 0 }; }
function restart() { dialog.close(); run = newRun(catalog, Math.random); renderer.setRun(run); select(null); resetTimeline(); redraw(); }

function showOutcome() {
  if (run.pendingLoss) {
    const after = (protectedRetry: boolean) => {
      dialog.close(); resolveLoss(run, protectedRetry); resetTimeline(); redraw();
      if (run.status === 'defeat') showOutcome();
      else notice(protectedRetry ? '护盾保留。现在可以重新布阵。' : '护盾 −1，重新布阵后可再次挑战。');
    };
    showPanel('RETRY / 守门核心未击破', `第 ${run.wave} 波未通过`, `造成 ${format(run.lastDamage)} 点伤害。失去 1 点护盾，或观看模拟广告保留护盾。重试时 Boss 恢复满血。`, [
      { label: '看广告 · 无损改阵重打', primary: true, act: async () => { if (await platform.showRewardedVideo('retry')) after(true); } },
      { label: '扣除 1 点护盾', act: () => after(false) },
    ]);
  } else if (run.status !== 'active') {
    const won = run.status === 'victory';
    const actions: Action[] = [
      { label: '导出战绩 PNG', act: async () => { if (!await platform.exportScore(run)) notice('战绩导出失败，请再试一次。'); } },
      { label: '新开一局', act: restart, primary: !won },
    ];
    if (won) actions.unshift({ label: '继续无尽模式', primary: true, act: () => {
      dialog.close(); startEndless(run, catalog, Math.random); resetTimeline(); redraw();
    } });
    showPanel(won ? 'MATRIX COMPLETE' : 'RUN COMPLETE', won ? '二十波通关！' : '法阵已熄灭',
      `抵达第 ${run.wave} 波 · 最高 ${run.bestCombo} 连击\n最后一击总伤害：${format(run.lastDamage)}`, actions);
  }
}

function consume(event: BattleEvent) {
  renderer.play(event);
  switch (event.type) {
    case 'CELL_ACTIVATE': displayed.combo = event.combo; audio.combo(event.combo); break;
    case 'DAMAGE': displayed.hp = event.hp; if (event.crit) audio.crit(); break;
    case 'POISON': displayed.poison = event.poison; break;
    case 'GOLD': displayed.gold = event.gold; break;
    case 'RUNE_STATE': states.set(event.index, event.state); if (renderer.selection?.zone === 'board' && renderer.selection.index === event.index) inspect(); break;
  }
  updateHud();
}

button('battle').onclick = async () => {
  if (!arranging()) return;
  click(); resetTimeline(); phase = 'PLAYBACK'; redraw(false);
  const events = simulateBattle({ board: run.board, hp: displayed.hp, gold: run.gold, tutorial: tutorials(),
    seed: Math.imul(run.wave, 8191) ^ Math.imul(run.attempts + 1, 131071) }, catalog);
  const result = await player.play(events, consume);
  phase = 'ARRANGE'; states.clear(); renderer.clearEffects(); audio.finish(result.win);
  settleTurn(run, result, catalog, Math.random);
  redraw();
  if (result.win && run.status === 'active') notice(`击破核心！${format(result.damage)} 伤害 · ${result.combo} 连击`);
  showOutcome();
};

button('refresh').onclick = () => { if (refreshShop(run, catalog, Math.random)) { click(); shopInspect = null; redraw(); } };
button('speed').onclick = () => { click(); player.speed = player.speed === 1 ? 2 : 1; syncControls(); persist(); };
button('skip').onclick = () => { click(); player.skip(); };
button('sound').onclick = () => { audio.muted = !audio.muted; click(); syncControls(); persist(); };
button('reward').onclick = async () => {
  click();
  if (arranging() && await platform.showRewardedVideo('refresh')) { run.freeRefreshes += 2; redraw(); notice('获得 2 次免费刷新'); }
};
button('support').onclick = async () => {
  click();
  if (await platform.showRewardedVideo('support')) {
    skin = true; redraw(); showPanel('NEON / 彩蛋', '可乐收到啦！', '谢谢支持。霓虹边框已解锁，刷新页面后仍会保留。', [{ label: '返回法阵', primary: true, act: () => dialog.close() }], true);
  }
};
button('help').onclick = () => {
  click(); showPanel('FIELD MANUAL', '布阵手册', '符文从左到右、从上到下激活；连锁即时结算。买到的符文先进入四格备战区。\n\n三个相同符文自动升星，最多三星。点击查看范围，拖动交换或出售。\n\n开局保留原位可触发首波教学共鸣。击破 20 波后解锁无尽模式。',
    [{ label: '返回法阵', primary: true, act: () => dialog.close() }], true);
};

redraw(); showOutcome();
