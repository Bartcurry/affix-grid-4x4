/// <reference types="vite/client" />
import './style.css';
import { simulateBattle } from './core/battleEngine';
import { battleTargetFor, bountyCount, bountyPerkLabel, engravingPower, offersBounties } from './core/bounties';
import { boardThemes, type BoardThemeId } from './core/boardThemes';
import { claimEngraving } from './core/engraving';
import { findFirstSupply } from './core/firstSupply';
import { claimCamp } from './core/endlessCamp';
import { canReforge, prepareReforge } from './core/reforge';
import { previewRelicPick, type RelicPlacement } from './core/relicPreview';
import { toCoords } from './core/grid';
import { affixAt, armorHitsFor, encounters, endlessSegment, relics } from './core/expedition';
import { difficultyLabel, isOpening, openingIds, openings, runScore, updateRecords } from './core/openings';
import { challengeParam, challengeSaveKey, matchesChallenge, readChallenge } from './core/challenge';
import { boardShareParam, boardShareUrl, encodeBoardToken, readSharedBoard, sameBattleSetup, sameFormation, type SharedBoard } from './core/boardShare';
import { formationDuelParam, readFormationDuel } from './core/formationDuel';
import { dailyRouteParam, readDailyLink } from './core/daily';
import { campaignUrl, isDailyPage } from './core/sitePaths';
import { readRelayLink, relayParam } from './core/weeklyRelay';
import { createMulberry32, decodeSeed, generateSeedCode } from './core/rng';
import { planTurn, previewPlacement, runeFootprint, usesTutorial } from './core/tactics';
import { canArrange, canRetryWithoutLosingShield, createSnapshot, newRun, purchaseInfo, refreshShop, resolveLoss, restoreSnapshot, runeAt, selectBounty, sellRune, sellValue, settleTurn, startEndless, swapRunes, toggleLock, UndoStack, victoryPayout } from './core/shopEngine';
import { preparePurchase } from './core/purchasePreview';
import { STAR_MULT, initialRuneState, type BattleEvent, type BountyRoute, type OpeningId, type RelicId, type Rune, type Run, type RuneState, type Slot } from './core/types';
import { catalog } from './data/catalog';
import { CanvasRenderer, formatNumber, runeVectors, tileStamp } from './render/canvasRenderer';
import { getArchetypeEmblemPath, getBossSvgPath, getRelicSvgPath } from './render/glyphs';
import { archetypeLabel, countSynergies, synergyTypes } from './core/synergy';
import { bindDragDrop } from './render/dragDrop';
import { bindUpgradeBook } from './render/upgradeBook';
import { bindChallengeRoom, bindShareRoom } from './render/challengeRoom';
import { bindDailyRoom } from './render/dailyRoom';
import { bindAppearanceRoom } from './render/appearanceRoom';
import { bindDrillRoom } from './render/drillRoom';
import { bindWeeklyRelay } from './render/weeklyRelayRoom';
import { bindScoreShareRoom } from './render/scoreShareRoom';
import { bindBoardTrial } from './render/boardTrialRoom';
import { bindBattleJournal } from './render/battleJournal';
import { bindBattleRecap } from './render/battleRecap';
import { bindBattleRibbon } from './render/battleRibbon';
import { bindEncounterRoom } from './render/encounterRoom';
import { bindFormationLessons } from './render/formationLessons';
import { bindStarterGuide } from './render/starterGuide';
import { bindRetryScout } from './render/retryScout';
import { bindPurchaseRoom } from './render/purchaseRoom';
import { bindBountyRoom } from './render/bountyRoom';
import { bindEngravingRoom } from './render/engravingRoom';
import { bindFirstSupplyRoom } from './render/firstSupplyRoom';
import { bindLobby } from './render/lobby';
import { bindChainDemo } from './render/chainDemo';
import { bindEndlessCampRoom } from './render/endlessCampRoom';
import { bindReforgeRoom } from './render/reforgeRoom';
import { bindRelicRoom } from './render/relicRoom';
import { renderOpeningPreview } from './render/openingPreview';
import { PlaybackController, type PlaybackBeat } from './render/playbackController';
import { SynthAudio } from './audio/synthAudio';
import { migrateSave, WebSaveAdapter } from './platform/webMockAdapter';
import { archiveBoard, updateArchive } from './platform/runArchive';
import { appearanceKey, createAppearance } from './platform/appearance';
import { runePlacement } from './data/tacticalTips';
import { formationLessons } from './data/formationLessons';
import type { RunArchive } from './platform/adapter';

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {});
  });
}

function element<ElementType extends HTMLElement = HTMLElement>(id: string): ElementType {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing UI element: ${id}`);
  return node as ElementType;
}

const button = (id: string) => element<HTMLButtonElement>(id);
const game = element('game');
const dialog = element<HTMLDialogElement>('panel');
const settingsDialog = element<HTMLDialogElement>('settings-dialog');
const synergyDialog = element<HTMLDialogElement>('synergy-dialog');
const audio = new SynthAudio();
const player = new PlaybackController();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const params = new URLSearchParams(location.search);
const invite = params.get(challengeParam);
const boardRequest = params.get(boardShareParam);
const duelRequest = params.get(formationDuelParam);
const boardRequested = boardRequest !== null || duelRequest !== null || location.hash.startsWith('#board=');
const boardCandidate = readSharedBoard(boardRequest, catalog);
const formationDuel = boardCandidate && readFormationDuel(duelRequest, boardCandidate, catalog);
const sharedBoard = duelRequest === null || formationDuel ? boardCandidate : undefined;
const challenge = sharedBoard ? undefined : readChallenge(invite);
const dailyRequest = params.get('daily');
const sharedDaily = challenge || sharedBoard ? undefined : readDailyLink(dailyRequest);
const relayRequest = params.get(relayParam);
const sharedRelay = challenge || sharedBoard || sharedDaily ? undefined : readRelayLink(relayRequest);
const fromDailyPage = isDailyPage(location.pathname);
const dailyPageLanding = fromDailyPage && !challenge && !sharedBoard && !sharedRelay;
let sideLanding = !!(sharedDaily || dailyPageLanding || sharedBoard || sharedRelay);
let appliedSharedBoard = false;
const createPlatform = (key?: string) => new WebSaveAdapter(catalog, key);
const platform = createPlatform(challenge ? challengeSaveKey(challenge) : undefined);
const loaded = platform.load(!sideLanding);
const saved = challenge && loaded && !matchesChallenge(loaded.run, challenge) ? null : loaded;
const mainSave = challenge ? createPlatform().load(false) : loaded;
const mainRun = challenge && !saved ? mainSave?.run : undefined;
const matchingMain = challenge && mainRun && matchesChallenge(mainRun, challenge) ? mainRun : undefined;
let challengeEntered = !challenge;
let campaignStarted = !!saved;

const initialSeed = challenge?.seed ?? generateSeedCode().code;
let run = saved?.run ?? makeOpening(challenge?.opening ?? 'chain', initialSeed);
let records = saved?.records ?? {};
let beginnerRecords = saved?.beginnerRecords ?? {};
let expertRecords = saved?.expertRecords ?? {};
const recordsFor = (difficulty: Run['difficulty']) => difficulty === 'expert' ? expertRecords : difficulty === 'beginner' ? beginnerRecords : records;
let history: RunArchive[] = saved?.history ?? [];
let forecast: ReturnType<typeof planTurn> | null = null;
let placement: ReturnType<typeof planTurn> | null = null;
const appearance = createAppearance(!!(saved?.skin || mainSave?.skin));
let appliedTheme: BoardThemeId | undefined;
let exactForecast = saved?.exactForecast ?? false;
let trackedUpgrade = saved?.trackedUpgrade;
audio.muted = saved?.muted ?? false;
audio.ambientMuted = saved?.ambientMuted ?? false;
player.speed = saved?.speed ?? 1;

let phase: 'ARRANGE' | 'PLAYBACK' = 'ARRANGE';
const currentTarget = () => battleTargetFor(run);
let displayed = { hp: currentTarget().hp, poison: 0, gold: run.gold, combo: 0 };
let shopInspect: number | null = null;
let inspectorOpen = false;
let noticeTimer: ReturnType<typeof setTimeout>;
let victoryTimer: ReturnType<typeof setTimeout>;
let ghostTimer: ReturnType<typeof setTimeout>;
let dialogDismissible = false;
let bossArmorHits = 0;
let bossGateColumn: number | undefined;
let firstClearPayout = saved?.firstClearPayout;
let lastBattleAt = -Infinity;
const states = new Map<number, RuneState>();
const renderer = new CanvasRenderer(element('arena'), run, catalog);
const undoStack = new UndoStack();

const rarityLabel = { common: '普通', rare: '稀有', epic: '史诗' };

const arranging = () => challengeEntered && !sideLanding && phase === 'ARRANGE' && canArrange(run);
const persist = () => {
  if (!challengeEntered || sideLanding) return;
  if (run.difficulty === 'beginner') beginnerRecords = updateRecords(beginnerRecords, run);
  else if (run.difficulty === 'expert') expertRecords = updateRecords(expertRecords, run);
  else records = updateRecords(records, run);
  platform.save({
    schemaVersion: 2,
    run,
    skin: appearance.read().unlocked.has('violet'),
    muted: audio.muted,
    speed: player.speed,
    exactForecast,
    trackedUpgrade,
    firstClearPayout,
    records,
    ...(Object.keys(beginnerRecords).length ? { beginnerRecords } : {}),
    ...(Object.keys(expertRecords).length ? { expertRecords } : {}),
    history,
    ambientMuted: audio.ambientMuted,
  });
};
const click = () => { audio.unlock(); audio.click(); };
const shareRoom = bindShareRoom();
const showChallenge = bindChallengeRoom(quick => {
  click();
  if (!challengeEntered) {
    challengeEntered = true;
    redraw();
  }
  if (quick) button('battle').click();
  else showOutcome();
}, leaveChallenge, local => { click(); shareRoom(local, true); });

function leaveChallenge() {
  const address = campaignUrl(location.href);
  address.searchParams.delete(challengeParam);
  location.assign(address.href);
}

button('share-open').onclick = () => {
  if (phase === 'ARRANGE') {
    click();
    shareRoom(run, !!challenge, arranging() ? boardShareUrl(location.href, run) : undefined);
  }
};

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
const runeGlyph = (node: HTMLElement, id: string) => iconPath(node, runeVectors[id] ?? emptyIcon);
const scoreShare = bindScoreShareRoom(catalog, click);
const daily = bindDailyRoom(catalog, runeGlyph, click, scoreShare.puzzle, () => appearance.unlock('frost'));
const drillsRoom = bindDrillRoom(catalog, runeGlyph, click, () => appearance.unlock('jade'));
const showAppearance = bindAppearanceRoom(catalog, appearance, click, syncAppearance);
const relay = bindWeeklyRelay(catalog, runeGlyph, click, scoreShare.puzzle);
const boardTrial = bindBoardTrial(catalog, runeGlyph, formatNumber, click);
const showPurchase = bindPurchaseRoom(catalog, runeGlyph, click);
const showReforge = bindReforgeRoom(catalog, runeGlyph, click);
const showEngraving = bindEngravingRoom(catalog, runeGlyph, click);
const showFirstSupply = bindFirstSupplyRoom(catalog, runeGlyph, click);
const showEndlessCamp = bindEndlessCampRoom(catalog, runeGlyph, click, choice => {
  if (!claimCamp(run, choice)) return false;
  click();
  select(null);
  redraw();
  notice(choice.id === 'move' ? `离火位移到了第 ${choice.cell + 1} 格` : choice.id === 'repair' ? '护盾 +1' : '营地补给已领取');
  return true;
});
const showBounties = bindBountyRoom(catalog, click);
button('bounty-open').onclick = () => {
  if (!arranging() || !offersBounties(run)) return;
  click();
  const original = run;
  const saved = platform.load(false);
  const checkpoint = JSON.stringify(saved);
  const saveMatches = !saved || JSON.stringify(saved.run) === JSON.stringify(migrateSave({ run }, catalog).run);
  const current = () => saveMatches && run === original && arranging() && JSON.stringify(platform.load(false)) === checkpoint;
  const apply = (route: BountyRoute | undefined, board?: SharedBoard) => {
    if (!current()) return false;
    const prior = { ...run };
    if (route !== prior.bountyRoute && !selectBounty(run, route)) return false;
    if (board) applyBoardLayout(board, prior);
    else undoStack.push(prior);
    resetTimeline();
    if (board) select(null);
    redraw();
    if (board) notice('已保存路线和布阵，可以一起撤销。');
    return true;
  };
  showBounties(run, {
    choose: apply,
    trial(route, quickFind, close) {
      if (!current()) return false;
      const source = { ...run, bountyRoute: route };
      const label = route === run.bountyRoute ? '应用改阵' : route ? '接悬赏并应用改阵' : '走原路并应用改阵';
      boardTrial.open(source, {
        label,
        matches: board => !sameFormation(source, board),
        apply: board => {
          if (!sameBattleSetup(source, board) || !apply(route, board)) return false;
          boardTrial.dialog.addEventListener('close', close, { once: true });
          return true;
        },
        searchEmptyText: '一两步内没找到更高伤害的摆法。可以手动换位，或返回比较其他路线。',
        settlement: (board, result) => {
          const payout = result.win ? victoryPayout({ ...source, board: board.board }, result.gold, catalog).total : 0;
          return `${result.win ? '过关' : '失利'}后有 ${formatNumber(result.gold + payout)} 金。`;
        },
      }, true, undefined, quickFind);
      return true;
    },
  });
};
button('reforge-open').onclick = () => {
  if (!arranging() || !forecast || !canReforge(run)) return;
  click();
  const original = run;
  const checkpoint = JSON.stringify(platform.load(false)?.run);
  showReforge(run, forecast.result.damage, (from, target, swap) => {
    if (!arranging() || run !== original || JSON.stringify(platform.load(false)?.run) !== checkpoint) return false;
    const prepared = prepareReforge(run, from, target, catalog, swap);
    if (!prepared) return false;
    undoStack.push(run);
    restoreSnapshot(run, createSnapshot(prepared.candidate));
    select(prepared.final.slot);
    renderer.flash(prepared.final.slot, catalog[target].color, prepared.merges.length > 0);
    click();
    audio.jadeChime();
    redraw();
    notice(swap ? '已完成转铸和换位，可以一起撤销。' : `已转铸为${catalog[target].name}，可以撤销。`);
    return true;
  });
};
const retryScout = bindRetryScout(catalog, click, openRetryTrial);
const showFormationLessons = bindFormationLessons(catalog, runeGlyph, click,
  (board, name, damage) => boardTrial.open(board, undefined, true, { name, damage }));
const openStarterGuide = bindStarterGuide(catalog, runeGlyph, click,
  () => button('opening-quick').focus({ preventScroll: true }),
  () => chooseOpening(true));
button('opening-guide').onclick = () => openStarterGuide(true);
const quickGuide = element<HTMLDialogElement>('quick-guide-dialog');
const guideSeenKey = 'affix-grid-4x4.intro-seen.v1';
let guideSeen = false;
try { guideSeen = localStorage.getItem(guideSeenKey) === '1'; } catch {}
const guideBattle = button('quick-guide-battle');
const resetGuideDemo = bindChainDemo(element('guide-demo'), catalog, runeGlyph, click, linked => {
  guideBattle.disabled = !linked;
});
function showQuickGuide(automatic = false) {
  if (phase !== 'ARRANGE' || quickGuide.open) return;
  click();
  quickGuide.dataset.automatic = String(automatic);
  button('quick-guide-skip').hidden = !automatic;
  button('quick-guide-close').hidden = automatic;
  guideBattle.hidden = !automatic;
  resetGuideDemo(true);
  quickGuide.showModal();
  element('quick-guide-title').focus({ preventScroll: true });
  quickGuide.scrollTop = 0;
}
button('lobby-guide').onclick = button('opening-quick-guide').onclick = button('guide-open').onclick = button('help').onclick = () => showQuickGuide();
button('quick-guide-close').onclick = button('quick-guide-skip').onclick = () => { click(); quickGuide.close(); };
button('quick-guide-practice').onclick = () => openStarterGuide(false);
guideBattle.onclick = () => {
  if (!quickGuide.open || quickGuide.dataset.automatic !== 'true' || campaignStarted || phase !== 'ARRANGE') return;
  click();
  quickGuide.close();
  openingDifficulty = 'beginner';
  startOpening('chain', generateSeedCode().code, true);
};
quickGuide.addEventListener('close', () => {
  if (quickGuide.open || quickGuide.dataset.automatic !== 'true') return;
  guideSeen = true;
  try { localStorage.setItem(guideSeenKey, '1'); } catch {}
});
const lobby = bindLobby(catalog, runeGlyph, click);
const activities = element<HTMLDialogElement>('activity-dialog');
function showActivities(kind: 'shorts' | 'practice') {
  if (phase !== 'ARRANGE' || activities.open) return;
  click();
  const shorts = kind === 'shorts';
  element('activity-shorts').hidden = !shorts;
  element('activity-practice').hidden = shorts;
  const title = element('activity-title');
  title.textContent = shorts ? '短局挑战' : '阵型练习';
  activities.showModal();
  title.focus({ preventScroll: true });
  activities.scrollTop = 0;
}
button('activity-close').onclick = () => { click(); activities.close(); };
button('lobby-shorts').onclick = button('shorts-open').onclick = () => showActivities('shorts');
button('lobby-practice').onclick = () => showActivities('practice');
button('practice-starter').onclick = () => openStarterGuide(false, '返回练习');
const showEncounters = bindEncounterRoom(catalog, click, wave => {
  if (!arranging()) return;
  if (wave === run.wave) openCampaignTrial();
  else boardTrial.open({ ...run, wave, bountyRoute: undefined }, undefined, true);
});
button('boss-intel').onclick = () => {
  if (phase !== 'ARRANGE') return;
  click();
  showEncounters(run, arranging(), recordsFor(run.difficulty)[run.opening]?.cleared);
};
const showJournal = bindBattleJournal(catalog, formatNumber, runeGlyph, board => { click(); boardTrial.open(board, undefined, true); });
const reviewLast = (step = 0) => showJournal(run.lastJournal, step);
const reviewHit = (step: number) => { if (phase === 'ARRANGE') { click(); reviewLast(step); } };
const updateBattleRecap = bindBattleRecap(element('battle-recap'), catalog, formatNumber, reviewHit);
const updateOutcomeRecap = bindBattleRecap(element('outcome-recap'), catalog, formatNumber, reviewHit);
button('journal-open').onclick = () => { if (phase === 'ARRANGE') { click(); reviewLast(); } };
button('opening-daily').onclick = () => { if (phase === 'ARRANGE') { click(); daily.open(); } };
button('opening-drills').onclick = () => { if (phase === 'ARRANGE') drillsRoom.open(); };
button('daily-appearance').onclick = () => openAppearance('frost');
button('drill-appearance').onclick = () => openAppearance('jade');
button('opening-relay').onclick = () => { if (phase === 'ARRANGE') { click(); relay.open(); } };
const updateUpgrades = bindUpgradeBook(catalog, runeGlyph, formatNumber,
  id => { trackedUpgrade = id; click(); redraw(); },
  slot => { click(); select(slot); element('arena').focus(); },
  index => { click(); offers[index].preview.focus(); },
  (index, id) => run.shop[index]?.configId === id && buyOffer(index));

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
    hint.dataset.delta = change > 0 ? 'up' : change < 0 ? 'down' : 'same';
    hint.textContent = `放置后 ${formatNumber(placement.result.damage)} 伤害 · ${change ? `${change > 0 ? '+' : '−'}${formatNumber(Math.abs(change))}` : '持平'}`;
  } else if (arranging() && renderer.selection) {
    const rune = runeAt(run, renderer.selection);
    hint.textContent = rune ? catalog[rune.configId].name : '点符文，再点目标格';
  } else {
    const scanning = renderer.currentScanSlot && runeAt(run, renderer.currentScanSlot);
    hint.textContent = phase === 'PLAYBACK' ? (scanning ? catalog[scanning.configId].name : '按顺序触发符文') : challenge
      ? `同局 · 已过 ${formatNumber(runScore(run).cleared)} / ${formatNumber(challenge.cleared)} 波`
      : '点符文，再点目标格';
  }
}

function showForecast() {
  const panel = element('forecast');
  panel.hidden = !forecast || !arranging();
  showArenaHint();
  if (panel.hidden || !forecast) return;
  const { hp, result } = placement ?? forecast;
  const change = result.damage - forecast.result.damage;
  const exactVerdict = exactForecast || !!placement;
  panel.dataset.verdict = exactVerdict ? (result.win ? 'win' : 'gap') : forecast.verdict;
  const verdict = element('forecast-verdict');
  const scout = button('forecast-scout');
  const hasRunes = run.board.some(Boolean) || run.bench.some(Boolean);
  const scoutLabel = run.wave === 2 ? '试阵备战' : hasRunes ? '找打法' : '试买现货';
  scout.hidden = !!placement || forecast.result.win || (!hasRunes && !run.shop.some(Boolean));
  verdict.hidden = !scout.hidden;
  verdict.textContent = exactVerdict ? (result.win ? '可击破' : '伤害不足') : forecast.verdictText;
  element('forecast-scout-label').textContent = scoutLabel;
  scout.setAttribute('aria-label', `还差 ${formatNumber(forecast.result.hp)} 伤害，${scoutLabel}`);
  element('forecast-fill').style.width = `${Math.min(100, 100 * result.damage / hp)}%`;

  if (exactForecast) {
    const delta = change ? ` · ${change > 0 ? '+' : '−'}${formatNumber(Math.abs(change))} 伤害` : '';
    element('forecast-readout').textContent = `${placement ? '放置后' : '预计伤害'} ${formatNumber(result.damage)} / ${formatNumber(hp)} · ${result.combo} 连击${delta}`;
  } else {
    const delta = change ? ` · ${change > 0 ? '+' : '−'}${formatNumber(Math.abs(change))}` : '';
    element('forecast-readout').textContent = `${placement ? '放置后' : '战果预估'} ${formatNumber(forecast.minDamage)} ~ ${formatNumber(forecast.expectedDamage)} / ${formatNumber(hp)} · ${result.combo} 连击${delta}`;
  }
  button('forecast-detail').disabled = !!placement;
  button('forecast-trial').disabled = !!placement || !hasRunes;
}

const bossArmor = element('boss-armor-shields');
const armorIcons = [1, 2, 3].map(index => element(`boss-shield-${index}`));
const isArmorHit = (event: BattleEvent): event is Extract<BattleEvent, { type: 'DAMAGE' }> =>
  event.type === 'DAMAGE' && event.kind === 'rune' && event.amount > 0;

function updateBossArmorUi(hits: number, breaking = false, column?: number) {
  const { encounter } = currentTarget();
  const layers = armorHitsFor(encounter);
  const remaining = Math.max(0, layers - hits);
  const gate = element('boss-gate');
  gate.hidden = encounter !== 'regent_seal' || remaining > 0 || column === undefined;
  gate.textContent = column === undefined ? '' : `封第 ${column + 1} 列`;
  renderer.setBossGate(phase === 'PLAYBACK' && !gate.hidden ? column : undefined);
  bossArmor.hidden = !layers || !gate.hidden;
  bossArmor.setAttribute('aria-label', `剩余 ${remaining} / ${layers} 层护甲`);
  bossArmor.dataset.broken = String(remaining === 0);
  element('boss-armor-name').textContent = remaining ? '护甲' : '破甲';
  armorIcons.forEach((icon, index) => {
    icon.hidden = index >= layers;
    icon.classList.toggle('broken', index < hits);
    if (!breaking || index + 1 === hits) icon.classList.toggle('breaking', breaking);
  });
}

function updateHud() {
  const badge = element('beginner-badge');
  badge.hidden = !run.difficulty || run.endless;
  badge.dataset.difficulty = run.difficulty ?? 'standard';
  badge.textContent = difficultyLabel(run.difficulty);
  const maxHp = currentTarget().hp;
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
  const health = element('hp-meter');
  health.dataset.health = hp === 0 ? 'empty' : pct <= 25 ? 'low' : 'high';
  health.setAttribute('aria-valuemax', String(maxHp));
  health.setAttribute('aria-valuenow', String(hp));
  element('shield').textContent = `${run.shield}/3`;
  const poison = phase === 'PLAYBACK' ? displayed.poison : showOutcomeState ? run.lastPoison : 0;
  const gold = phase === 'PLAYBACK' ? displayed.gold : run.gold;
  element('gold').textContent = formatNumber(gold);
  element('hp-poison-badge').hidden = poison <= 0;
  element('hp-poison-text').textContent = formatNumber(poison);

  element('phase').textContent = phase === 'PLAYBACK' ? '连锁中' : run.pendingRelics.length ? '挑选遗物' : run.pendingLoss ? '待结算护盾' :
    run.pendingEngraving ? '悬赏刻印' : run.pendingCamp ? '营地补给' : run.status !== 'active' ? '战斗结束' : '布阵';
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

const lastSynergyTiers = { chain: 0, poison: 0, gold: 0, amplify: 0 };

function updateSynergiesUi() {
  const container = element('hud-synergies');
  container.hidden = run.enableSynergies === false;
  if (container.hidden) {
    container.replaceChildren();
    return;
  }
  const synergies = countSynergies(run.board, catalog);
  let newTierUnlocked = false;
  let unlockedName = '';
  let unlockedDesc = '';

  for (const type of synergyTypes) {
    const syn = synergies[type];
    const prevTier = lastSynergyTiers[type] ?? 0;
    if (syn.tier > prevTier && arranging()) {
      newTierUnlocked = true;
      unlockedName = syn.name;
      unlockedDesc = syn.activeDesc;
    }
    lastSynergyTiers[type] = syn.tier;
  }

  if (newTierUnlocked) {
    audio.unlock();
    audio.synergyChime();
    notice(`【${unlockedName}】共鸣激活！${unlockedDesc}`);
  }

  const items = synergyTypes.map(type => {
    const syn = synergies[type];
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `synergy-hud-chip synergy-${type} tier-${syn.tier}`;
    chip.dataset.tier = String(syn.tier);
    chip.setAttribute('aria-haspopup', 'dialog');
    chip.setAttribute('aria-label', `${archetypeLabel[type]}共鸣，已布阵 ${syn.count} 枚`);

    const icon = document.createElement('span');
    icon.className = 'synergy-icon';
    iconPath(icon, getArchetypeEmblemPath(type));

    const name = document.createElement('span');
    name.className = 'synergy-name';
    name.textContent = archetypeLabel[type];

    const count = document.createElement('span');
    count.className = 'synergy-count';
    const next = syn.tier === 0 ? syn.tier1Threshold : syn.tier2Threshold;
    count.textContent = syn.tier === 2 ? `${next} 件套` : `${syn.count}/${next}`;

    chip.append(icon, name, count);
    chip.onclick = () => {
      if (phase === 'PLAYBACK') return;
      click();
      element('synergy-title').textContent = `${archetypeLabel[type]} · ${syn.name}`;
      const status = syn.tier === 2 ? `${next} 件套已激活` : `还差 ${next - syn.count} 枚激活 ${next} 件套`;
      element('synergy-status').textContent = `棋盘上有 ${syn.count} 枚 · ${status}`;
      const first = element('synergy-first');
      const second = element('synergy-second');
      first.dataset.state = syn.tier === 1 ? 'active' : syn.tier === 2 ? 'reached' : 'locked';
      second.dataset.state = syn.tier === 2 ? 'active' : 'locked';
      first.querySelector('h3')!.textContent = `${syn.tier1Threshold} 件套${syn.tier === 1 ? ' · 当前' : ''}`;
      second.querySelector('h3')!.textContent = `${syn.tier2Threshold} 件套${syn.tier === 2 ? ' · 当前' : ''}`;
      first.querySelector('p')!.textContent = syn.tier1Desc;
      second.querySelector('p')!.textContent = syn.tier2Desc;
      synergyDialog.showModal();
    };
    return chip;
  });
  container.replaceChildren(...items);
}

function markWaves() {
  const track = element('wave-track');
  const { from, through } = run.endless ? endlessSegment(run.wave) : { from: 1, through: 20 };
  const length = through - from + 1;
  track.style.setProperty('--wave-steps', String(length));
  track.replaceChildren(...Array.from({ length }, (_, index) => {
    const notch = document.createElement('span');
    const wave = from + index;
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
    name.textContent = config?.name ?? (run.wave === 1 ? '试试起手阵' : '先挑一枚符文');
    info.textContent = config?.desc ?? (run.wave === 1 ? openings[run.opening].note : '点棋盘或店里的一枚符文，就能看到它的作用。');
  }
  const stats = config && rune ? [rarityLabel[config.rarity], `${rune.star} 星`] : emptyTileMod ? ['特殊阵眼', `格 ${slot!.index + 1}`] : [];

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
    if (links.size) labels.push('箭头 · 连锁方向');
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
  const jump = button('inspect-jump');
  jump.hidden = !slot || !arranging() || !(selected || emptyTileMod);
  jump.setAttribute('aria-expanded', String(inspectorOpen && !jump.hidden));
  sell.hidden = !selected;
  sell.disabled = !arranging();
  sell.textContent = `回收 +${price} 金`;
  sell.setAttribute('aria-label', selected ? `回收 ${config?.name}，获得 ${price} 金` : '回收符文');
  showArenaHint();
  const inspector = element('inspector');
  const visible = arranging() && inspectorOpen && Boolean(selected || offer || emptyTileMod);
  inspector.dataset.visible = String(visible);
  inspector.inert = !visible;
  renderer.sellLabel = selected ? `拖到此处回收 · +${price} 金` : '拖到此处回收符文';
  for (const [index, card] of offers.entries()) card.card.dataset.selected = String(index === shopInspect);
  renderer.invalidate();
}

function select(slot: Slot | null) { shopInspect = null; inspectorOpen = false; renderer.selection = slot; inspect(); }

function syncAppearance() {
  const { selected } = appearance.read();
  if (appliedTheme === selected) return;
  appliedTheme = selected;
  renderer.setTheme(selected);
  game.dataset.boardTheme = selected;
  const [primary, bright, dark] = boardThemes[selected].accent;
  const properties = { '--gold-primary': primary, '--gold-bright': bright, '--gold-dark': dark, '--gold-glow': primary + '4d' };
  for (const [key, color] of Object.entries(properties)) {
    if (selected === 'obsidian') game.style.removeProperty(key);
    else game.style.setProperty(key, color);
  }
  element('appearance-current').textContent = boardThemes[selected].name;
}

function syncControls() {
  syncAppearance();
  game.dataset.phase = phase.toLowerCase();
  button('sound').setAttribute('aria-pressed', String(!audio.muted));
  button('ambient').setAttribute('aria-pressed', String(!audio.ambientMuted));
  button('settings-open').disabled = phase === 'PLAYBACK';
  button('codex').disabled = phase === 'PLAYBACK';
  button('guide-open').disabled = phase === 'PLAYBACK';
  for (const chip of element('hud-synergies').querySelectorAll('button')) chip.disabled = phase === 'PLAYBACK';
  button('speed').textContent = player.speed === 0 ? '即结' : `${player.speed}×`;
  button('speed').setAttribute('aria-label', player.speed === 0 ? '立即结算，点击切回一倍速' : `播放速度 ${player.speed} 倍，点击切换`);
  button('undo').hidden = phase === 'PLAYBACK';
  button('skip').disabled = phase !== 'PLAYBACK';
  button('skip').hidden = phase !== 'PLAYBACK';
  const showPlayback = phase === 'PLAYBACK' && player.speed !== 0 && !reducedMotion.matches;
  element('battle-timeline').hidden = !showPlayback;
  element('arena-controls').hidden = showPlayback;
  button('market-jump').hidden = phase === 'PLAYBACK';
  button('undo').disabled = !arranging() || undoStack.length === 0;
  button('battle').disabled = !arranging();
  button('purchase-open').disabled = !arranging() || !run.shop.some(Boolean);
  button('battle').textContent = phase === 'PLAYBACK' ? '连锁结算中' : '启动法阵';
  button('refresh').textContent = run.shop.every(offer => offer?.locked) ? '商品已全锁定' :
    run.freeRefreshes ? `免费刷新 ×${run.freeRefreshes}` : '刷新 · 2 金';
  button('refresh').disabled = !arranging() || (!run.freeRefreshes && run.gold < 2) || run.shop.every(offer => offer?.locked);
  const focus = element<HTMLSelectElement>('shop-focus');
  focus.value = run.shopFocus;
  focus.disabled = !arranging();
  button('share-open').disabled = phase === 'PLAYBACK';
  button('journal-open').hidden = !run.lastJournal || phase === 'PLAYBACK';
  button('shorts-open').disabled = phase === 'PLAYBACK';
  button('share-open').hidden = run.enableSynergies === false;
  button('share-open').textContent = challenge ? '发战绩' : '分享';
  button('openings').disabled = challenge ? !challengeEntered || phase === 'PLAYBACK' : !arranging();
  if (challenge) {
    button('openings').textContent = '同局';
    button('openings').title = '查看同局战绩';
  }
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
    renderer.selection = null; shopInspect = index; inspectorOpen = true; inspect();
  };
  preview.addEventListener('click', () => { click(); look(); element('inspector').scrollIntoView({ block: 'nearest' }); });
  lock.addEventListener('click', () => {
    if (toggleLock(run, index)) { click(); redraw(); }
  });
  buy.addEventListener('click', () => { buyOffer(index); });
  return { card, preview, icon, name, meta, lock, buy };
});

function openPurchase(first?: number, trial?: SharedBoard) {
  if (!arranging() || !forecast || !run.shop.some(Boolean) || (trial && !sameBattleSetup(run, trial))) return;
  click();
  const original = run;
  const visible = JSON.stringify(run);
  const saved = platform.load(false)?.run;
  const checkpoint = JSON.stringify(saved);
  const saveMatches = !saved || (canArrange(saved) && sameBattleSetup(saved, run) && sameFormation(saved, run) &&
    JSON.stringify(saved.shop) === JSON.stringify(run.shop));
  const changed = trial && !sameFormation(run, trial);
  const layout = changed ? { ...run, board: [...trial.board], bench: [...trial.bench] } : run;
  const current = changed ? planTurn(layout, catalog).result : forecast.result;
  showPurchase(layout, first, current, (index, target) => {
    if (!saveMatches || run !== original || JSON.stringify(run) !== visible ||
      JSON.stringify(platform.load(false)?.run) !== checkpoint || !buyOffer(index, target, changed ? layout : undefined)) return false;
    if (trial) boardTrial.dialog.close();
    return true;
  }, changed);
}

button('purchase-open').onclick = () => {
  openPurchase(shopInspect !== null && run.shop[shopInspect] ? shopInspect : undefined);
};

function buyOffer(index: number, target?: Slot, layout = run) {
  if (!arranging()) return false;
  const prepared = preparePurchase(layout, index, catalog);
  if (!prepared || (target && !swapRunes(prepared.candidate, prepared.slot, target))) return false;
  undoStack.push(run);
  restoreSnapshot(run, createSnapshot(prepared.candidate));
  const { merges, slot } = prepared;
  click();
  spawnGoldParticles(offers[index].buy);
  audio.jadeChime();
  for (const merge of merges) {
    const upgraded = target && merge.slot.zone === slot.zone && merge.slot.index === slot.index ? target : merge.slot;
    renderer.flash(upgraded, catalog[merge.rune.configId].color, true);
  }
  if (merges.length) audio.merge();
  const selected = target ?? merges.at(-1)?.slot ?? slot;
  select(selected);
  if (!merges.length) renderer.land(selected);
  if (layout !== run) notice(`已应用改阵并买入${target ? `，新符文落在第 ${target.index + 1} 格` : ''}。可以一起撤销。`);
  else if (target) notice(`已买入并放到棋盘第 ${target.index + 1} 格，可以一起撤销。`);
  else if (!merges.length) notice('买到了。在备战区，拖上棋盘才会触发。');
  redraw();
  return true;
}

function showFirstClear() {
  const banner = element('first-clear');
  banner.hidden = firstClearPayout === undefined || run.wave !== 2 || !arranging();
  if (banner.hidden || !forecast) return;
  const { result } = forecast;
  banner.dataset.ready = String(result.win);
  element('first-clear-score').textContent = `首胜 +${firstClearPayout} 金 · 第 2 波${result.win ? '可开战' : `差 ${formatNumber(result.hp)} 伤害`}`;
  const action = button('first-clear-supply');
  action.hidden = result.win;
}

function openFirstSupply(): boolean {
  if (run.wave !== 2 || !forecast) return false;
  const plan = findFirstSupply(run, catalog, forecast.result);
  if (!plan) return false;
  click();
  const original = run;
  const visible = JSON.stringify(run);
  const checkpoint = JSON.stringify(platform.load(false)?.run);
  showFirstSupply(run, forecast.result, plan, draft => {
    if (!arranging() || run !== original || JSON.stringify(run) !== visible ||
      JSON.stringify(platform.load(false)?.run) !== checkpoint) return false;
    undoStack.push(run);
    restoreSnapshot(run, createSnapshot(draft));
    click();
    audio.jadeChime();
    select(null);
    redraw();
    return true;
  });
  return true;
}

button('first-clear-supply').onclick = recoverFormation;

button('first-clear-close').onclick = () => {
  click();
  firstClearPayout = undefined;
  showFirstClear();
  persist();
};

function redraw(save = true) {
  if (arranging()) forecast = planTurn(run, catalog);
  placement = null;
  renderer.placementTarget = null;
  updateHud(); updateSynergiesUi(); markWaves(); syncControls(); showForecast(); inspect();
  const { encounter, bounty } = currentTarget();
  const enemy = encounters[encounter];
  element('enemy-name').textContent = enemy.name;

  updateBattleRecap(run.lastJournal, phase === 'ARRANGE');
  const recordedHits = run.pendingLoss || run.status !== 'active' ? run.lastJournal?.events.filter(isArmorHit) ?? [] : [];
  const latest = recordedHits.at(-1)?.source;
  const column = phase === 'PLAYBACK' ? bossGateColumn : typeof latest === 'number' ? toCoords(latest).col : undefined;
  updateBossArmorUi(phase === 'PLAYBACK' ? bossArmorHits : recordedHits.length, false, column);

  element('game').dataset.enemy = encounter;
  document.getElementById('boss-emblem-path')?.setAttribute('d', getBossSvgPath(encounter));

  const affix = affixAt(run.wave);
  element('boss-intel-text').textContent = affix?.name ?? enemy.trait;
  button('boss-intel').disabled = phase === 'PLAYBACK';
  button('bounty-open').hidden = !arranging() || !offersBounties(run);
  button('reforge-open').hidden = !arranging() || !canReforge(run) || (!run.board.some(Boolean) && !run.bench.some(Boolean));
  element('bounty-current').textContent = bounty?.name ?? '可挑战额外奖励';

  element('board-count').textContent = `已布阵 ${run.board.filter(Boolean).length}/16`;
  element('bench-count').textContent = `备战区 ${run.bench.filter(Boolean).length}/4`;
  element('last-damage').textContent = run.bestCombo || run.lastDamage || run.attempts ? formatNumber(run.lastDamage) : '—';
  element('best-combo').textContent = run.bestCombo ? String(run.bestCombo) : '—';
  element('run-opening').textContent = `${openings[run.opening].name} · ${openings[run.opening].label}开局`;
  element('run-seed').textContent = `种子码：${run.seed}`;

  element('relic-list').hidden = !run.relics.length;
  button('relic-inventory-open').textContent = `遗物 ${run.relics.length}`;
  const tracked = updateUpgrades(run, trackedUpgrade, arranging(), forecast?.result.damage ?? 0);
  offers.forEach(({ card, preview, icon, name, meta, lock, buy }, index) => {
    const offer = run.shop[index];
    const config = offer && catalog[offer.configId];
    card.style.setProperty('--offer', config?.color ?? '#56657e');
    const { copies, blocked, willMerge } = purchaseInfo(run, index, catalog);
    card.dataset.rarity = config?.rarity ?? '';
    card.dataset.merge = String(willMerge);
    card.toggleAttribute('data-tracked', !!tracked && config?.id === tracked);
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
  showFirstClear();
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
function closeInspector() {
  const previousOffer = shopInspect;
  inspectorOpen = false;
  shopInspect = null;
  inspect();
  if (previousOffer !== null) offers[previousOffer]?.preview.focus({ preventScroll: true });
  else if (!button('inspect-jump').hidden) button('inspect-jump').focus({ preventScroll: true });
}
button('inspect-close').onclick = closeInspector;
element('inspector').addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeInspector();
  }
});

bindDragDrop(renderer, {
  enabled: arranging, hasRune: slot => !!runeAt(run, slot), select,
  move(from, to) {
    undoStack.push(run);
    if (swapRunes(run, from, to)) {
      click();
      select(to);
      renderer.land(to);
      if (runeAt(run, from)) renderer.land(from);
      redraw();
    }
    else { undoStack.pop(run); }
  },
  sell: sellFrom,
  preview(from, to) {
    if (!arranging()) return;
    const hypothetical = from && to ? previewPlacement(run, from, to) : null;
    placement = hypothetical ? planTurn(hypothetical, catalog) : null;
    renderer.placementTarget = hypothetical ? to : null;
    showForecast();
  },
  describeCursor(slot) {
    const status = element('board-cursor-status');
    if (!slot) { status.textContent = ''; return; }
    const rune = runeAt(run, slot);
    const place = `${slot.zone === 'board' ? '棋盘' : '备战区'}第 ${slot.index + 1} 格`;
    const mark = slot.zone === 'board' ? run.tileModifiers[slot.index] : undefined;
    const tile = mark && tileStamp[mark];
    status.textContent = `${place}，${rune ? `${catalog[rune.configId].name}，${rune.star} 星` : '空格'}${tile ? `，${tile.name}` : ''}${placement ? `。放置后 ${formatNumber(placement.result.damage)} 伤害。` : ''}`;
  },
});

const forecastDialog = element<HTMLDialogElement>('forecast-dialog');
const relicBag = element<HTMLDialogElement>('relic-bag');
button('relic-inventory-open').onclick = openRelicBag;
button('relic-bag-close').onclick = () => relicBag.close();
const showRelicChoices = bindRelicRoom(catalog, (node, id) => iconPath(node, getRelicSvgPath(id)), runeGlyph, formatNumber, click);

function claimRelic(id: RelicId, placement: RelicPlacement | undefined, close: () => void) {
  const picked = previewRelicPick(run, id);
  if (!picked) return false;
  const moved = placement && canArrange(picked) ? previewPlacement(picked, placement.from, placement.to) : null;
  if (placement && !moved) return false;
  Object.assign(run, picked);
  if (moved && placement) {
    undoStack.push(run);
    run.board = moved.board;
    run.bench = moved.bench;
    select(placement.to);
  }
  audio.unlock();
  audio.jadeChime();
  audio.synergyChime();
  close();
  redraw();
  notice(placement ? `拿到了 ${relics[id].name}，已换位。可撤销换位。` : `拿到了 ${relics[id].name}`);
  if (run.pendingCamp || run.pendingEngraving) showOutcome();
  return true;
}

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

button('forecast-detail').onclick = () => {
  if (!arranging() || !forecast) return;
  click();
  const { byCell, result, hp, poisonDamage, tutorialDamage, enemyDelta, events } = forecast;
  const sources = byCell.flatMap(({ damage, activations }, index) => {
    const rune = run.board[index];
    return rune && (damage || activations) ? [{ label: `格 ${index + 1} · ${catalog[rune.configId].name}`, detail: `${activations} 次激活`, damage }] : [];
  });
  if (poisonDamage) sources.push({ label: '回合末剧毒', detail: '持续伤害', damage: poisonDamage });
  if (tutorialDamage) sources.push({ label: '首波教学共鸣', detail: '仅首波生效', damage: tutorialDamage });
  sources.sort((left, right) => right.damage - left.damage);
  const impact = enemyDelta ? `\n敌人的招式让伤害${enemyDelta > 0 ? '多' : '少'}了 ${formatNumber(Math.abs(enemyDelta))} 点，已计入总数。` : '';
  const gateHits = events.filter(event => event.type === 'DAMAGE' && event.gateBlocked).length;
  const lockNote = gateHits ? `\n同列轮锁削弱了 ${gateHits} 次直伤。试着让主力从不同列交替出手。` : '';
  element('forecast-summary').textContent = `预计 ${formatNumber(result.damage)} 伤害 / ${formatNumber(hp)} 生命 · ${result.combo} 连击\n${result.win ? '这套阵容能打过。' : `还差 ${formatNumber(result.hp)} 点。`}${impact}${lockNote}`;
  const payout = victoryPayout(run, result.gold, catalog);
  const deltaGold = result.gold - run.gold;
  const combatGold = deltaGold < 0 ? `战斗花 ${formatNumber(-deltaGold)} 金` : `战斗赚 ${formatNumber(deltaGold)} 金`;
  element('forecast-gold').textContent = result.win
    ? `${combatGold} · 过关 ${payout.base} 金${payout.interest ? ` · 利息 ${payout.interest} 金` : ''}${payout.relic ? ` · 遗物 ${payout.relic} 金` : ''}${payout.bounty ? ` · 悬赏 ${payout.bounty} 金` : ''}。结束时有 ${formatNumber(result.gold + payout.total)} 金。${payout.perk ? bountyPerkLabel(payout.perk, run) + '。' : ''}${run.difficulty === 'beginner' && !run.endless && run.shield + Number(payout.perk === 'repair') < 3 ? '入门过关补 1 点护盾。' : ''}`
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
function openCampaignTrial(quickFind = false) {
  const checkpoint = JSON.stringify(platform.load(false));
  boardTrial.open(run, {
    matches: canReplaceFormation,
    shop: run.shop.some(Boolean) ? board => openPurchase(undefined, board) : undefined,
    apply: board => {
      if (!arranging() || JSON.stringify(platform.load(false)) !== checkpoint || !replaceFormation(board)) return false;
      select(null);
      redraw();
      notice('已应用改阵，可以撤销。');
      return true;
    },
  }, true, undefined, quickFind);
}
button('forecast-trial').onclick = () => {
  if (!arranging()) return;
  click();
  openCampaignTrial();
};
function recoverFormation() {
  if (!arranging() || !forecast || forecast.result.win || openFirstSupply()) return;
  if (!run.board.some(Boolean) && !run.bench.some(Boolean)) {
    if (run.shop.some(Boolean)) openPurchase();
    else button('refresh').focus();
    return;
  }
  click();
  openCampaignTrial(true);
}
button('forecast-scout').onclick = recoverFormation;

function openRetryTrial(source: SharedBoard, preserving: boolean, quickFind = false) {
  if (!run.pendingLoss || source.shield <= 0 || (preserving && !canRetryWithoutLosingShield(run))) return;
  const failed = run;
  const savedRun = platform.load(false)?.run;
  const checkpoint = JSON.stringify(savedRun);
  const saveMatches = !savedRun || (savedRun.pendingLoss && savedRun.attempts === failed.attempts &&
    sameBattleSetup(savedRun, failed) && sameFormation(savedRun, failed));
  const matches = (board: SharedBoard) => run === failed && run.pendingLoss &&
    sameBattleSetup({ ...run, shield: source.shield }, board) && !sameFormation(run, board);
  boardTrial.open(source, {
    label: '保存改阵',
    note: `第 ${source.wave} 波重打 · ${preserving ? '保留' : '扣盾后剩'} ${source.shield} 点护盾 · ${formatNumber(source.gold)} 金`,
    searchEmptyText: '一两步内没找到更高伤害的摆法。可以手动换位，或回结算页选重打方式。',
    matches,
    apply: board => {
      if (!saveMatches || !matches(board) || JSON.stringify(platform.load(false)?.run) !== checkpoint) return false;
      applyBoardLayout(board);
      select(null);
      redraw();
      retryScout.saved();
      return true;
    },
  }, true, undefined, quickFind);
}

interface Action { label: string; act: () => void | Promise<void>; primary?: boolean }
function showPanel(title: string, text: string, actions: Action[], dismissible = false, mvpHtml?: string, outcome?: Run) {
  dialogDismissible = dismissible;
  element('panel-title').textContent = title;
  element('panel-text').textContent = text;
  element('retry-scout').hidden = true;
  element('outcome-recap').hidden = true;
  element('panel-score').hidden = !outcome;
  if (outcome) {
    const score = runScore(outcome);
    element('panel-cleared').textContent = formatNumber(score.cleared);
    element('panel-combo').textContent = formatNumber(score.combo);
    element('panel-damage').textContent = formatNumber(outcome.lastDamage);
  }

  const isVictory = outcome?.status === 'victory';
  const stampWrap = document.getElementById('panel-stamp-wrap');
  if (stampWrap) {
    stampWrap.hidden = !isVictory;
    if (isVictory) {
      stampWrap.classList.remove('stamp-slam');
      void stampWrap.offsetWidth;
      stampWrap.classList.add('stamp-slam');
      audio.stampSlam();
      try { navigator.vibrate?.([40, 50, 70]); } catch {}
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

function resetTimeline() {
  clearTimeout(victoryTimer);
  clearTimeout(ghostTimer);
  renderer.waveComplete = false;
  renderer.setCombo(0);
  states.clear();
  renderer.clearEffects();
  bossArmorHits = 0;
  bossGateColumn = undefined;
  updateBossArmorUi(0);
  displayed = { hp: currentTarget().hp, poison: 0, gold: run.gold, combo: 0 };
  const ghost = document.getElementById('hp-ghost');
  if (ghost) ghost.style.width = '100%';
}

function recordRunHistory(runToRecord: Run) {
  if (runToRecord.attempts === 0 && runToRecord.wave === 1 && runToRecord.status === 'active') return;
  const entry: RunArchive = {
    id: `${runToRecord.seed}-${runToRecord.wave}-${Date.now()}`,
    seed: runToRecord.seed,
    wave: runToRecord.wave,
    opening: runToRecord.opening,
    ...(runToRecord.difficulty ? { difficulty: runToRecord.difficulty } : {}),
    status: runToRecord.status,
    lastDamage: runToRecord.lastDamage,
    bestCombo: runToRecord.bestCombo,
    date: new Date().toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    relicsCount: runToRecord.relics.length,
    ...(runToRecord.enableSynergies === false ? { enableSynergies: false } : {}),
    ...(runToRecord.altarRule === 1 ? { altarRule: 1 } : {}),
    ...(runToRecord.bountyRule === 1 ? { bountyRule: 1 } : {}),
    ...(runToRecord.engravingRule === 1 ? { engravingRule: 1 } : {}),
    ...(runToRecord.bountiesCleared ? { bountiesCleared: runToRecord.bountiesCleared } : {}),
    ...(runToRecord.endlessRule === 1 ? { endlessRule: 1 } : {}),
    ...(runToRecord.reforgeRule === 1 ? { reforgeRule: 1 } : {}),
    ...(runToRecord.finaleRule === 1 ? { finaleRule: 1 } : {}),
    ...(runToRecord.firstWaveRule === 1 ? { firstWaveRule: 1 } : {}),
    ...(runToRecord.endless ? { endless: true } : {}),
  };
  const formation = runToRecord.lastJournal?.formation;
  if (formation && archiveBoard({ ...entry, formation }, catalog)) entry.formation = formation;
  history = updateArchive(history, entry);
  persist();
}

const openingDialog = element<HTMLDialogElement>('opening-dialog');
const openingSeed = element<HTMLInputElement>('opening-seed');
let fallbackOpeningSeed = initialSeed;
let openingCandidate: OpeningId = 'chain';
let openingDifficulty: Run['difficulty'];
let openingReplacesRun = false;
let openingQuick = false;
const chosenSeed = () => openingSeed.value.trim() || fallbackOpeningSeed;
function makeOpening(id: OpeningId, seed: string, difficulty?: Run['difficulty'], archived?: RunArchive) {
  const rules = challenge ?? archived;
  const next = newRun(catalog, createMulberry32(decodeSeed(seed)), id, seed,
    rules ? rules.difficulty : difficulty, !rules || rules.firstWaveRule === 1 ? 1 : 0);
  if (challenge && !challenge.altarRule) delete next.altarRule;
  if (challenge && !challenge.bountyRule) delete next.bountyRule;
  if (challenge && !challenge.engravingRule) delete next.engravingRule;
  if (challenge && !challenge.endlessRule) delete next.endlessRule;
  if (challenge && !challenge.reforgeRule) delete next.reforgeRule;
  if (challenge && !challenge.finaleRule) delete next.finaleRule;
  return next;
}

function startOpening(id: OpeningId, customSeed?: string, quick = false, archived?: RunArchive) {
  if (run && (run.attempts > 0 || run.wave > 1)) {
    recordRunHistory(run);
  }
  if (openingDialog.open) openingDialog.close();
  if (lobby.dialog.open) lobby.dialog.close();
  if (dialog.open) dialog.close();
  run = makeOpening(challenge?.opening ?? id, challenge?.seed || customSeed || chosenSeed(), openingDifficulty, archived);
  if (!challenge && archived?.enableSynergies === false) run.enableSynergies = false;
  if (!challenge && archived && !archived.altarRule) delete run.altarRule;
  if (!challenge && archived && !archived.bountyRule) delete run.bountyRule;
  if (!challenge && archived && !archived.engravingRule) delete run.engravingRule;
  if (!challenge && archived && !archived.endlessRule) delete run.endlessRule;
  if (!challenge && archived && !archived.reforgeRule) delete run.reforgeRule;
  if (!challenge && archived && !archived.finaleRule) delete run.finaleRule;
  trackedUpgrade = undefined;
  firstClearPayout = undefined;
  lastBattleAt = -Infinity;
  campaignStarted = true;
  undoStack.clear();
  renderer.setRun(run);
  renderer.cursor = null;
  resetTimeline();
  select(null);
  for (const type of synergyTypes) lastSynergyTiers[type] = 0;
  redraw();
  window.scrollTo({ top: 0 });
  if (quick) {
    element('arena').focus({ preventScroll: true });
    void startBattle(true);
  } else element('battle').focus({ preventScroll: true });
}

function openingConfirm(visible: boolean) {
  element('opening-confirm').hidden = !visible;
  for (const id of ['opening-loadout', 'opening-preview', 'opening-actions', 'opening-settings', 'opening-modes']) element(id).hidden = visible;
}

const openingChoices = openingIds.map(id => {
  const route = openings[id];
  const item = document.createElement('button');
  item.type = 'button';
  item.className = `opening-card-grand opening-${id}`;
  const emblem = document.createElement('span');
  emblem.className = 'opening-emblem-wrap';
  iconPath(emblem, getArchetypeEmblemPath(id));
  const name = document.createElement('strong');
  name.textContent = `${route.name} · ${route.label}`;
  const detail = document.createElement('span');
  detail.textContent = route.play;
  item.append(emblem, name, detail);
  item.onclick = () => { click(); openingCandidate = id; showOpeningPreview(); };
  return item;
});
element('opening-choices').replaceChildren(...openingChoices);

function showOpeningPreview() {
  for (const [index, id] of openingIds.entries()) openingChoices[index].setAttribute('aria-pressed', String(id === openingCandidate));
  for (const mode of ['beginner', 'standard', 'expert']) {
    button(`difficulty-${mode}`).setAttribute('aria-pressed', String(mode === (openingDifficulty ?? 'standard')));
  }
  element('opening-quick-detail').textContent = `${difficultyLabel(openingDifficulty)} · ${openings[openingCandidate].name}`;
  const sample = makeOpening(openingCandidate, chosenSeed(), openingDifficulty);
  renderOpeningPreview(element('opening-preview'), sample, catalog,
    recordsFor(openingDifficulty)[openingCandidate], runeGlyph, formatNumber, click);
}

function openOpenings(first = false) {
  openingCandidate = first ? 'chain' : run.opening;
  openingDifficulty = first ? 'beginner' : run.difficulty;
  openingReplacesRun = run.status === 'active' && !first;
  openingConfirm(false);
  fallbackOpeningSeed = generateSeedCode().code;
  openingSeed.value = fallbackOpeningSeed;
  element<HTMLDetailsElement>('opening-settings').open = false;
  element('opening-title').textContent = first ? '挑一套起手阵' : '挑一套新开局';
  element('opening-note').textContent = openingReplacesRun ? '选好起手阵，再确认开新局。'
    : first && invite !== null ? '这个邀请来自旧版或已失效。你可以选一套阵直接开局。'
    : first && dailyRequest !== null && !sharedDaily ? '这条每日链接已失效。可以直接玩今天的题。'
    : first && boardRequested && !sharedBoard ? '这条阵型链接已失效。可以选一套起手阵开始。'
    : '摆符文，打连锁，守住 20 波。';
  const back = button('opening-close');
  back.hidden = !lobby.dialog.open && (first || run.status !== 'active');
  back.title = lobby.dialog.open ? '返回模式' : '回到当前局';
  back.setAttribute('aria-label', back.title);
  openingDialog.dataset.first = String(first);
  showOpeningPreview();
  openingDialog.showModal();
  button('opening-quick').focus({ preventScroll: true });
  openingDialog.scrollTop = 0;
}

function chooseOpening(quick: boolean) {
  click();
  if (!openingReplacesRun) { startOpening(openingCandidate, chosenSeed(), quick); return; }
  openingQuick = quick;
  element('opening-warning').textContent = `要用「${openings[openingCandidate].name}」开一局${difficultyLabel(openingDifficulty)}战役吗？当前局会结束，最高纪录会保留。`;
  button('opening-start').textContent = quick ? '确认开局并打首波' : '确认开新局';
  openingConfirm(true);
  button('opening-back').focus();
}

button('openings').onclick = () => {
  if (challenge && challengeEntered && phase === 'ARRANGE') { click(); showChallenge(challenge, run, false, false); }
  else if (arranging()) { click(); lobby.open(`第 ${formatNumber(run.wave)} 波 · ${difficultyLabel(run.difficulty)} · ${openings[run.opening].name}`); }
};
button('lobby-campaign').onclick = () => {
  click();
  if (campaignStarted) lobby.dialog.close();
  else openOpenings(true);
};
button('lobby-new').onclick = () => { click(); openOpenings(); };
button('opening-quick').onclick = () => chooseOpening(true);
button('opening-prepare').onclick = () => chooseOpening(false);
button('difficulty-beginner').onclick = () => { click(); openingDifficulty = 'beginner'; showOpeningPreview(); };
button('difficulty-standard').onclick = () => { click(); openingDifficulty = undefined; showOpeningPreview(); };
button('difficulty-expert').onclick = () => { click(); openingDifficulty = 'expert'; showOpeningPreview(); };
button('opening-start').onclick = () => { click(); startOpening(openingCandidate, chosenSeed(), openingQuick); };
button('opening-back').onclick = () => { click(); openingConfirm(false); openingChoices[openingIds.indexOf(openingCandidate)].focus(); };
button('opening-close').onclick = () => openingDialog.close();
openingSeed.oninput = showOpeningPreview;
button('random-seed').onclick = () => {
  click();
  openingSeed.value = generateSeedCode().code;
  showOpeningPreview();
};
function showOutcome(archive = true) {
  if (run.pendingRelics.length) {
    const offered = run;
    const checkpoint = JSON.stringify(platform.load(false)?.run);
    if (showRelicChoices(offered, (id, placement, close) => run === offered &&
      JSON.stringify(platform.load(false)?.run) === checkpoint && claimRelic(id, placement, close))) {
      audio.unlock(); audio.singingBowl();
    }
    return;
  }
  if (run.pendingEngraving) {
    const rewarded = run;
    const checkpoint = JSON.stringify(platform.load(false)?.run);
    showEngraving(rewarded, index => {
      if (run !== rewarded || JSON.stringify(platform.load(false)?.run) !== checkpoint || !claimEngraving(run, index)) return false;
      click();
      audio.jadeChime();
      const slot: Slot = { zone: 'board', index };
      const rune = run.board[index]!;
      select(slot);
      renderer.flash(slot, catalog[rune.configId].color);
      redraw();
      notice(`${catalog[rune.configId].name}永久威力 +${engravingPower}`);
      return true;
    });
    return;
  }
  if (run.pendingCamp) { showEndlessCamp(run); return; }
  if (run.pendingLoss) {
    const failed = run;
    const retry = (protectedRetry: boolean, quick = false) => {
      if (run !== failed || !run.pendingLoss || (quick && !protectedRetry && run.shield <= 1)) return;
      const savedRun = platform.load(false)?.run;
      if (savedRun && (!savedRun.pendingLoss || savedRun.attempts !== run.attempts ||
        !sameBattleSetup(savedRun, run) || !sameFormation(savedRun, run))) {
        retryScout.changed();
        return;
      }
      if (!resolveLoss(run, protectedRetry)) return;
      dialog.close(); resetTimeline(); redraw();
      if (run.status === 'defeat') showOutcome();
      else if (quick) void startBattle(true);
      else notice(protectedRetry ? '护盾保留。现在可以重新布阵。' : '护盾 −1，重新布阵后可再次挑战。');
    };
    const { encounter, hp } = currentTarget();
    const enemy = encounters[encounter];
    const freeRetry = canRetryWithoutLosingShield(run);
    const retryNote = freeRetry ? '本波首次战败可保盾重打。' : '本波再次重打需扣除 1 点护盾。';
    showPanel(`第 ${run.wave} 波没打过`, `对${enemy.name}打了 ${formatNumber(run.lastDamage)} 点，还差 ${formatNumber(Math.max(0, hp - run.lastDamage))} 点。${retryNote}`, [
      ...(run.lastJournal ? [{ label: '看看怎么打的', act: reviewLast }] : []),
      ...(freeRetry ? [{ label: '保留护盾，重新布阵', act: () => retry(true), primary: true }] : []),
      { label: '扣除 1 点护盾', act: () => retry(false) },
    ]);
    updateOutcomeRecap(run.lastJournal);
    retryScout.open(failed, preserve => { click(); retry(preserve, true); });
  } else if (run.status !== 'active') {
    const won = run.status === 'victory';
    const earnedCopper = won && runScore(run).cleared >= 20 && appearance.unlock('copper');
    if (archive) recordRunHistory(run);
    if (won) {
      renderer.spawnVictoryCelebration();
    }
    let mvpHtml = '';
    const cellDamages = run.lastCellDamage ?? (forecast?.byCell ? forecast.byCell.map(c => c.damage) : null);
    const foughtBoard = run.lastJournal ? readSharedBoard(run.lastJournal.formation, catalog, true)?.board ?? run.board : run.board;
    if (cellDamages) {
      let maxDmg = -1;
      let mvpIdx = -1;
      cellDamages.forEach((dmg, idx) => {
        if (dmg > maxDmg && foughtBoard[idx]) {
          maxDmg = dmg;
          mvpIdx = idx;
        }
      });
      if (mvpIdx >= 0 && foughtBoard[mvpIdx] && maxDmg > 0) {
        const r = foughtBoard[mvpIdx]!;
        const c = catalog[r.configId];
        const totalDmg = run.lastDamage > 0 ? run.lastDamage : maxDmg;
        const pct = Math.min(100, Math.round((maxDmg / totalDmg) * 100));
        mvpHtml = `
          <div class="mvp-label">末战输出最高</div>
          <div class="mvp-card-body">
            <span class="mvp-rune-name" style="color: ${c.color}">【${c.name}】${'★'.repeat(r.star)}</span>
            <span class="mvp-rune-stat">${formatNumber(maxDmg)} 伤害 · 占 ${pct}% · 第 ${mvpIdx + 1} 格</span>
          </div>
        `;
      }
    }
    const finale = won && run.wave === 20 && run.finaleRule === 1;
    const finalSetup = finale && run.lastJournal && readSharedBoard(run.lastJournal.formation, catalog);
    const finalBoardUrl = finalSetup ? boardShareUrl(location.href, finalSetup) : undefined;
    const actions: Action[] = [
      ...(run.lastJournal ? [{ label: '查看末战复盘', act: reviewLast }] : []),
      { label: '战绩卡', act: () => scoreShare.campaign(run) },
      ...(run.enableSynergies !== false ? [{ label: '分享链接', act: () => shareRoom(run, !!challenge, finalBoardUrl) }] : []),
      challenge ? { label: '再打一次', act: () => startOpening(challenge.opening), primary: !won }
        : { label: '新开一局', act: () => openOpenings(), primary: !won },
    ];
    if (challenge) actions.push({ label: '回主线', act: leaveChallenge });
    if (won && runScore(run).cleared >= 20) actions.push({ label: '预览赤铜棋盘', act: () => openAppearance('copper') });
    if (won) actions.unshift({ label: '继续无尽模式', primary: true, act: () => {
      dialog.close();
      const prng = createMulberry32(run.rngState);
      startEndless(run, catalog, prng);
      run.rngState = prng.getState();
      resetTimeline(); redraw(); showOutcome();
    } });
    const details = [difficultyLabel(run.difficulty), won ? '战役通关' : `止步第 ${formatNumber(run.wave)} 波`];
    if (earnedCopper) details.push('解锁赤铜棋盘');
    if (run.bountyRule) details.push(`悬赏 ${run.bountiesCleared ?? 0} / ${bountyCount}`);
    details.push(`种子 ${run.seed}`);
    showPanel(finale ? '闭门王已击破' : won ? '廿重劫尽 · 大获全胜' : '灵气耗竭 · 护盾归零',
      details.join(' · '), actions, false, mvpHtml, run);
  }
}

const battleRibbon = bindBattleRibbon(formatNumber, index => catalog[run.board[index]?.configId ?? '']?.name ?? `第 ${index + 1} 格`);

function consume(beat: PlaybackBeat, total: number) {
  let activation: Extract<BattleEvent, { type: 'CELL_ACTIVATE' }> | undefined;
  let link: Extract<BattleEvent, { type: 'CHAIN_LINK' }> | undefined;
  let pendingLink: typeof link;
  let tutorialLink: typeof link;
  let hit: Extract<BattleEvent, { type: 'DAMAGE' }> | undefined;
  let gold: Extract<BattleEvent, { type: 'GOLD' }> | undefined;
  let refreshInspect = false;
  const { encounter } = currentTarget();
  const armor = armorHitsFor(encounter);
  const oldArmorHits = bossArmorHits;
  const oldGateColumn = bossGateColumn;
  for (const event of beat.events) {
    switch (event.type) {
      case 'CELL_ACTIVATE':
        activation = event;
        displayed.combo = event.combo;
        link = pendingLink?.to === event.index ? pendingLink : undefined;
        pendingLink = undefined;
        break;
      case 'CHAIN_LINK':
        if (event.tutorial) tutorialLink = event;
        else pendingLink = event;
        break;
      case 'DAMAGE':
        displayed.hp = event.hp;
        if (!hit || hit.amount < event.amount) hit = event;
        if (isArmorHit(event)) {
          if (bossArmorHits < armor) bossArmorHits++;
          if (encounter === 'regent_seal' && bossArmorHits === armor && event.source !== null) bossGateColumn = toCoords(event.source).col;
        }
        break;
      case 'POISON': displayed.poison = event.poison; break;
      case 'GOLD': gold = event; displayed.gold = event.gold; break;
      case 'RUNE_STATE':
        states.set(event.index, event.state);
        renderer.play(event);
        if (renderer.selection?.zone === 'board' && renderer.selection.index === event.index) refreshInspect = true;
        break;
    }
  }
  if (activation) {
    renderer.play(activation);
    if (!beat.featured) audio.combo(activation.combo);
  }
  const visibleLink = tutorialLink ?? link;
  if (visibleLink) renderer.play(visibleLink);
  if (gold) renderer.play(gold);
  const impact = beat.featured ?? hit;
  if (impact) {
    renderer.play(impact);
    if (impact.crit && !beat.featured) audio.crit();
  }
  const brokeArmor = bossArmorHits !== oldArmorHits;
  if (brokeArmor || bossGateColumn !== oldGateColumn) updateBossArmorUi(bossArmorHits, brokeArmor, bossGateColumn);
  if (brokeArmor) renderer.spawnBronzeShatter({ x: 190, y: 55 });
  const marker = battleRibbon.show(beat);
  if (marker) renderer.markCombat(marker);
  if (beat.featured) {
    const emblem = element('boss-emblem-wrap');
    emblem.classList.remove('boss-hit');
    void emblem.offsetWidth;
    emblem.dataset.impact = beat.finishing ? 'finish' : 'hit';
    emblem.classList.add('boss-hit');
    renderer.pulseBorder();
    audio.hitStopChord();
  }
  battleRibbon.update(displayed.combo, total);
  if (refreshInspect) inspect();
  updateHud();
}

async function startBattle(quick = false) {
  if (!arranging() || (!quick && performance.now() - lastBattleAt < 300)) return;
  lastBattleAt = performance.now();
  if (run.wave !== 1) firstClearPayout = undefined;
  clearTimeout(noticeTimer);
  element('notice').textContent = '';
  undoStack.clear();
  click(); resetTimeline(); phase = 'PLAYBACK'; redraw(false);
  const formation = encodeBoardToken(run);
  const { hp: maxHp, encounter } = currentTarget();
  const battlePrng = createMulberry32(run.rngState);
  // Keep the saved formation intact while playback preferences can still be changed.
  const simulatedBoard = run.board.map(rune => rune ? { ...rune } : null);
  const events = simulateBattle({
    board: simulatedBoard,
    bench: run.bench,
    hp: maxHp,
    gold: run.gold,
    poison: 0,
    seed: battlePrng.getState(),
    tutorial: usesTutorial(run),
    encounter,
    relics: run.relics,
    tileModifiers: run.tileModifiers,
    affix: affixAt(run.wave)?.id,
    shield: run.shield,
    enableSynergies: run.enableSynergies ?? true,
  }, catalog, battlePrng);
  const cellDamage = Array(16).fill(0);
  for (const ev of events) {
    if (ev.type === 'DAMAGE' && ev.source !== null && ev.source >= 0 && ev.source < 16) {
      cellDamage[ev.source] += ev.amount;
    }
  }
  const final = events.at(-1);
  const total = final?.type === 'TURN_RESULT' ? final.combo : 0;
  battleRibbon.start(total);
  const result = await player.play(events, beat => consume(beat, total), reducedMotion.matches);
  phase = 'ARRANGE'; states.clear(); renderer.clearEffects(); audio.finish(result.win);
  const emblem = element('boss-emblem-wrap');
  emblem.classList.remove('boss-hit');
  delete emblem.dataset.impact;
  run.board = simulatedBoard;
  run.rngState = battlePrng.getState();
  run.lastCellDamage = cellDamage;
  run.lastJournal = formation ? { formation, maxHp, events } : undefined;
  const payout = victoryPayout(run, result.gold, catalog);
  const repairedByDifficulty = result.win && run.difficulty === 'beginner' && !run.endless && run.shield + Number(payout.perk === 'repair') < 3;
  const prng = createMulberry32(run.rngState);
  settleTurn(run, result, catalog, prng);
  run.rngState = prng.getState();
  if (result.win && run.wave === 2) firstClearPayout = payout.total;
  redraw();
  if (result.win && canArrange(run)) {
    if (run.wave - 1 >= 20) {
      renderer.spawnVictoryCelebration();
    }
    renderer.waveComplete = true; renderer.invalidate();
    victoryTimer = setTimeout(() => { renderer.waveComplete = false; renderer.invalidate(); }, 1500);
    if (run.wave !== 2 || repairedByDifficulty) notice(`${payout.bounty ? '悬赏完成' : `打过第 ${run.wave - 1} 波`} · ${formatNumber(result.damage)} 伤害 · 过关 +${payout.total} 金${payout.perk ? ` · ${bountyPerkLabel(payout.perk, run)}` : ''}${repairedByDifficulty ? ' · 入门补盾 +1' : ''}`);
  }
  showOutcome();
}
button('battle').onclick = () => { void startBattle(); };

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

button('speed').onclick = () => { click(); player.speed = player.speed === 1 ? 2 : player.speed === 2 ? 0 : 1; syncControls(); persist(); };
button('skip').onclick = () => { if (player.skip()) click(); };
button('market-jump').onclick = () => { click(); element('market').focus(); };
button('inspect-jump').onclick = () => {
  if (inspectorOpen) { closeInspector(); return; }
  click();
  inspectorOpen = true;
  inspect();
  element('inspector').focus({ preventScroll: true });
};
button('board-jump').onclick = () => { click(); element('arena').focus(); };
button('settings-open').onclick = () => { click(); settingsDialog.showModal(); };
button('appearance-open').onclick = () => openAppearance();
window.addEventListener('storage', event => { if (event.key === appearanceKey) syncAppearance(); });

function openAppearance(preferred?: BoardThemeId) {
  click();
  const { unlocked } = appearance.read();
  if (!unlocked.has('jade') && drillsRoom.hasCleared()) appearance.unlock('jade');
  if (!unlocked.has('frost') && daily.hasMastery()) appearance.unlock('frost');
  if (!unlocked.has('copper') && [records, beginnerRecords, expertRecords, mainSave?.records, mainSave?.beginnerRecords, mainSave?.expertRecords]
    .some(entry => entry && Object.values(entry).some(score => score.cleared >= 20))) appearance.unlock('copper');
  showAppearance(run, preferred);
}

button('sound').onclick = () => { audio.muted = !audio.muted; click(); syncControls(); persist(); };
button('violet-theme').onclick = () => {
  click();
  settingsDialog.close();
  appearance.unlock('violet');
  appearance.equip('violet');
  redraw();
  showPanel('紫铜棋盘已启用', '可以在设置里的棋盘外观随时更换。', [{ label: '回棋盘', primary: true, act: () => dialog.close() }], true);
};
const codexDialog = element<HTMLDialogElement>('codex-dialog');
let codexRuneFilter = 'all';
element('codex-star-note').textContent =
  `三枚同名同星符文合成一枚高一星的符文。常规伤害、施毒和产金的星级倍率为 ${STAR_MULT[1]} / ${STAR_MULT[2]} / ${STAR_MULT[3]}。能触发其他符文的词条升到三星后，会对每个目标多触发一次。催化和引爆的升星数值见对应词条。`;
button('codex-lessons').onclick = () => { click(); showFormationLessons(); };

function openCodex(tab: 'runes' | 'relics' | 'archives' = 'runes') {
  click();
  audio.singingBowl();
  switchCodexTab(tab);
  if (!codexDialog.open) codexDialog.showModal();
}

function switchCodexTab(tab: 'runes' | 'relics' | 'archives') {
  const tabs = ['runes', 'relics', 'archives'] as const;
  tabs.forEach(t => {
    const tabBtn = element(`tab-btn-${t}`);
    const tabSection = element(`codex-panel-${t}`);
    const isActive = t === tab;
    tabBtn.classList.toggle('active', isActive);
    tabBtn.setAttribute('aria-selected', String(isActive));
    tabSection.hidden = !isActive;
    tabSection.classList.toggle('active', isActive);
  });
  if (tab === 'runes') renderCodexRunes();
  if (tab === 'relics') renderCodexRelics();
  if (tab === 'archives') renderCodexArchives();
}

function renderCodexRunes() {
  const grid = element('codex-runes-grid');
  const allRunes = Object.values(catalog);
  const filtered = codexRuneFilter === 'all'
    ? allRunes
    : allRunes.filter(r => r.archetype === codexRuneFilter);

  grid.replaceChildren(...filtered.map(rune => {
    const card = document.createElement('div');
    card.className = 'codex-rune-card';
    card.dataset.rune = rune.id;
    card.style.setProperty('--card-accent', rune.color);

    const head = document.createElement('div');
    head.className = 'codex-rune-head';

    const iconWrap = document.createElement('div');
    iconWrap.className = 'codex-rune-icon-wrap';
    iconWrap.style.color = rune.color;
    runeGlyph(iconWrap, rune.id);

    const meta = document.createElement('div');
    meta.className = 'codex-rune-meta';

    const titleRow = document.createElement('div');
    titleRow.className = 'codex-rune-title-row';

    const name = document.createElement('strong');
    name.className = 'codex-rune-name';
    name.textContent = rune.name;

    const cost = document.createElement('span');
    cost.className = 'codex-rune-cost';
    cost.textContent = `${rune.cost} 金`;

    titleRow.append(name, cost);

    const tags = document.createElement('div');
    tags.className = 'codex-rune-tags';

    const archTag = document.createElement('span');
    archTag.className = 'codex-rune-tag';
    archTag.textContent = archetypeLabel[rune.archetype];

    const rarityTag = document.createElement('span');
    rarityTag.className = 'codex-rune-tag';
    rarityTag.textContent = rarityLabel[rune.rarity];

    tags.append(archTag, rarityTag);
    meta.append(titleRow, tags);
    head.append(iconWrap, meta);

    const desc = document.createElement('p');
    desc.className = 'codex-rune-desc';
    desc.textContent = rune.desc;

    const tip = document.createElement('details');
    tip.className = 'codex-placement';
    const summary = document.createElement('summary');
    summary.textContent = '怎么摆';
    const instruction = document.createElement('p');
    instruction.textContent = runePlacement[rune.id];
    tip.append(summary, instruction);
    const lesson = formationLessons.find(candidate => candidate.pieces.some(([, id]) => id === rune.id));
    if (lesson) {
      const tryLesson = document.createElement('button');
      tryLesson.type = 'button';
      tryLesson.textContent = `练习 · ${lesson.name}`;
      tryLesson.onclick = () => { click(); showFormationLessons(lesson.id); };
      tip.append(tryLesson);
    }

    card.append(head, desc, tip);
    return card;
  }));
}

function renderCodexRelics() {
  const grid = element('codex-relics-grid');
  grid.replaceChildren(...Object.entries(relics).map(([id, info]) => {
    const card = document.createElement('div');
    card.className = 'codex-relic-card';

    const head = document.createElement('div');
    head.className = 'codex-relic-head';

    const iconWrap = document.createElement('div');
    iconWrap.className = 'codex-relic-icon-wrap';
    iconPath(iconWrap, getRelicSvgPath(id));

    const title = document.createElement('strong');
    title.className = 'codex-relic-title';
    title.textContent = info.name;

    head.append(iconWrap, title);

    const desc = document.createElement('p');
    desc.className = 'codex-relic-desc';
    desc.textContent = info.text;

    card.append(head, desc);
    return card;
  }));
}

function renderCodexArchives() {
  const list = element('codex-archives-list');
  const status = element('codex-archive-status');
  status.textContent = '';
  if (!history.length) {
    const empty = document.createElement('p');
    empty.className = 'codex-empty-note';
    empty.textContent = '打过至少一场后，结束本局或开新局时会保存战绩。';
    list.replaceChildren(empty);
    return;
  }

  list.replaceChildren(...history.map(item => {
    const card = document.createElement('div');
    card.className = 'codex-archive-card';

    const head = document.createElement('div');
    head.className = 'codex-archive-head';

    const openingGroup = document.createElement('div');
    openingGroup.className = 'codex-archive-opening-group';

    const emblemWrap = document.createElement('div');
    emblemWrap.className = 'codex-archive-emblem';
    iconPath(emblemWrap, getArchetypeEmblemPath(item.opening));

    const openingName = document.createElement('strong');
    openingName.className = 'codex-archive-opening-name';
    const cleared = formatNumber(Math.max(0, runScore(item).cleared));
    const stage = item.endless ? `无尽 · 已过 ${cleared} 波` : item.status === 'victory' ? '20 波通关' : `已过 ${cleared} 波`;
    openingName.textContent = `${openings[item.opening].name} · ${difficultyLabel(item.difficulty)} · ${stage}`;

    openingGroup.append(emblemWrap, openingName);

    const badge = document.createElement('span');
    badge.className = `codex-archive-status-badge status-${item.status}`;
    badge.textContent = item.status === 'victory' ? '通关' : item.status === 'defeat' ? '战败' : '中途记录';

    head.append(openingGroup, badge);

    const body = document.createElement('div');
    body.className = 'codex-archive-body';
    const details = [`末战伤害 ${formatNumber(item.lastDamage)}`, `最高 ${item.bestCombo} 连击`, `遗物 ${item.relicsCount} 件`, item.date];
    if (item.bountyRule) details.push(`悬赏 ${item.bountiesCleared ?? 0} / ${bountyCount}`);
    if (item.enableSynergies === false) details.push('羁绊关闭');
    body.append(...details.map(text => {
      const detail = document.createElement('span');
      detail.textContent = text;
      return detail;
    }));

    const foot = document.createElement('div');
    foot.className = 'codex-archive-foot';

    const seedSpan = document.createElement('span');
    seedSpan.className = 'codex-archive-seed';
    const seed = document.createElement('code');
    seed.textContent = item.seed;
    seedSpan.append('种子 ', seed);

    const actions = document.createElement('div');
    actions.className = 'codex-archive-actions';

    const snapshot = archiveBoard(item, catalog);
    if (snapshot) {
      const trial = document.createElement('button');
      trial.type = 'button';
      trial.className = 'archive-trial';
      trial.textContent = `试打第 ${formatNumber(snapshot.wave)} 波`;
      trial.setAttribute('aria-haspopup', 'dialog');
      trial.onclick = () => {
        click();
        boardTrial.open(snapshot, undefined, true);
      };
      actions.append(trial);
    }

    const restart = document.createElement('button');
    restart.type = 'button';
    restart.textContent = '同种子重开';
    restart.setAttribute('aria-haspopup', 'dialog');
    restart.onclick = () => {
      click();
      const original = run;
      const stored = platform.load(false);
      const checkpoint = JSON.stringify(stored);
      showPanel('用同种子重开？', `将用「${openings[item.opening].name}」开启${difficultyLabel(item.difficulty)}战役，种子 ${item.seed}。当前局会结束。`, [
        { label: '返回战绩', act: () => dialog.close() },
        { label: '确认重开', primary: true, act: () => {
          if (run !== original || JSON.stringify(platform.load(false)) !== checkpoint ||
            (stored && JSON.stringify(stored.run) !== JSON.stringify(migrateSave({ run }, catalog).run))) {
            dialog.close();
            status.textContent = '战况已有更新，请刷新后再重开。';
            return;
          }
          audio.singingBowl();
          codexDialog.close();
          startOpening(item.opening, item.seed, false, item);
          notice(`已用种子 ${item.seed} 重开。`);
        } },
      ], true);
    };

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.textContent = '复制种子';
    copyBtn.onclick = async () => {
      click();
      try {
        await navigator.clipboard.writeText(item.seed);
        status.textContent = `已复制种子 ${item.seed}。`;
      } catch {
        window.getSelection()?.selectAllChildren(seed);
        status.textContent = '长按或选中种子码即可复制。';
      }
    };

    actions.append(restart, copyBtn);
    foot.append(seedSpan, actions);

    card.append(head, body, foot);
    return card;
  }));
}

button('codex').onclick = () => openCodex();
button('codex-close').onclick = () => codexDialog.close();
codexDialog.addEventListener('click', (event) => { if (event.target === codexDialog) codexDialog.close(); });

element('tab-btn-runes').onclick = () => { click(); switchCodexTab('runes'); };
element('tab-btn-relics').onclick = () => { click(); switchCodexTab('relics'); };
element('tab-btn-archives').onclick = () => { click(); switchCodexTab('archives'); };

document.querySelectorAll<HTMLButtonElement>('.codex-filter-btn').forEach(btn => {
  btn.onclick = () => {
    click();
    document.querySelectorAll('.codex-filter-btn').forEach(filter => {
      filter.classList.toggle('active', filter === btn);
      filter.setAttribute('aria-pressed', String(filter === btn));
    });
    codexRuneFilter = btn.dataset.filter ?? 'all';
    renderCodexRunes();
  };
});

button('ambient').onclick = () => {
  audio.unlock();
  audio.toggleAmbient();
  click();
  syncControls();
  persist();
};

function openLanding(archive = true) {
  if (challenge) { showChallenge(challenge, run, true, !saved, matchingMain); return; }
  const message = invite !== null ? '这个邀请来自旧版或已失效。'
    : dailyRequest !== null && !sharedDaily ? '这条每日链接已失效。可以从「短局」玩今天的题。'
    : relayRequest !== null && !sharedRelay ? '这条接力链接已失效。可以从「短局」玩本周的接力。'
    : boardRequested && !sharedBoard ? '这条阵型链接来自旧版或已失效。' : undefined;
  if (campaignStarted) {
    showOutcome(archive);
    if (message) notice(message);
  } else {
    lobby.open(undefined, message);
    if (!guideSeen) showQuickGuide(true);
  }
}

function resumeAfterSideRoom(room: HTMLDialogElement, ...shareParams: string[]) {
  room.addEventListener('close', () => {
    sideLanding = false;
    const address = campaignUrl(location.href);
    for (const param of shareParams) address.searchParams.delete(param);
    window.history.replaceState(window.history.state, '', address);
    if (fromDailyPage) document.title = '4×4 词条法阵 · 玄墨鎏金';
    redraw(false);
    openLanding(false);
    if (appliedSharedBoard) notice('已应用改阵，可以撤销。');
  }, { once: true });
}

function canReplaceFormation(board: SharedBoard) {
  return canArrange(run) && sameBattleSetup(run, board) && !sameFormation(run, board);
}

function replaceFormation(board: SharedBoard) {
  if (!canReplaceFormation(board)) return false;
  applyBoardLayout(board);
  return true;
}

function applyBoardLayout(board: SharedBoard, prior = run) {
  undoStack.push(prior);
  run.board = [...board.board];
  run.bench = [...board.bench];
}

function applySharedBoard(board: SharedBoard) {
  if (!saved || JSON.stringify(platform.load(false)) !== JSON.stringify(saved) || !replaceFormation(board)) return false;
  appliedSharedBoard = true;
  sideLanding = false;
  persist();
  return true;
}

redraw(!!saved && !challenge && !sideLanding);
if (sharedBoard) {
  boardTrial.open(sharedBoard, formationDuel ? undefined : { matches: board => !!saved && canReplaceFormation(board), apply: applySharedBoard }, false, formationDuel);
  resumeAfterSideRoom(boardTrial.dialog, boardShareParam, formationDuelParam);
} else if ((sharedDaily || dailyPageLanding) && daily.open(sharedDaily?.day, sharedDaily?.score, {
  expired: dailyRequest !== null && !sharedDaily, route: params.get(dailyRouteParam),
})) {
  if (dailyPageLanding) document.title = '每日残局 · 4×4 词条法阵';
  resumeAfterSideRoom(daily.dialog, 'daily', dailyRouteParam);
} else if (sharedRelay && relay.open(sharedRelay.day, sharedRelay.score)) {
  resumeAfterSideRoom(relay.dialog, relayParam);
} else {
  if (sideLanding) { sideLanding = false; redraw(false); }
  openLanding();
}
