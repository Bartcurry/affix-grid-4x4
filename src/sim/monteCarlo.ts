import { describe, it, expect } from 'vitest';
import { catalog } from '../data/catalog';
import { type EncounterId, encounters } from '../core/expedition';
import { openingIds } from '../core/openings';
import { createMulberry32 } from '../core/rng';
import {
  buyRune,
  chooseRelic,
  newRun,
  purchaseInfo,
  refreshShop,
  resolveLoss,
  selectTrial,
  sellRune,
  settleTurn,
  swapRunes,
} from '../core/shopEngine';
import { prepareBattle } from '../core/tactics';
import { battleTarget, trialAt } from '../core/trials';
import type { OpeningId, Random, RelicId, Run, Slot } from '../core/types';

interface SimulationResult {
  opening: OpeningId;
  clearedWave20: boolean;
  deathWave: number | null; // null if cleared
  deathEncounter: EncounterId | null;
  wavesCleared: number;
  bountiesCleared: number;
}

const RELIC_PREFERENCES: Record<OpeningId, RelicId[]> = {
  chain: ['chain_ring', 'whetstone', 'red_lens', 'gate_tithe', 'copper_ledger', 'moss_bowl'],
  poison: ['moss_bowl', 'gate_tithe', 'whetstone', 'chain_ring', 'copper_ledger', 'red_lens'],
  gold: ['copper_ledger', 'gate_tithe', 'chain_ring', 'whetstone', 'red_lens', 'moss_bowl'],
  amplify: ['whetstone', 'chain_ring', 'gate_tithe', 'red_lens', 'copper_ledger', 'moss_bowl'],
};

function scoreRune(run: Run, configId: string): number {
  const config = catalog[configId];
  if (!config) return 0;
  let score = 0;

  // Check 3-merge readiness
  const ownedCount = [...run.board, ...run.bench].filter(r => r?.configId === configId && r.star === 1).length;
  if (ownedCount === 2) score += 100;
  else if (ownedCount === 1) score += 25;

  const tags = config.tags;
  switch (run.opening) {
    case 'chain':
      if (tags.includes('chain')) score += 35;
      if (tags.includes('crit')) score += 20;
      if (['storm_gambler', 'toxic_fuse', 'alchemy_bell', 'blood_prism'].includes(configId)) score += 15;
      break;
    case 'poison':
      if (tags.includes('poison')) score += 40;
      if (tags.includes('amplify')) score += 15;
      if (['toxic_fuse', 'gilded_fang', 'plague_crown'].includes(configId)) score += 20;
      break;
    case 'gold':
      if (tags.includes('gold')) score += 40;
      if (tags.includes('chain')) score += 20;
      if (['gilded_fang', 'alchemy_bell', 'vault_guard'].includes(configId)) score += 15;
      break;
    case 'amplify':
      if (tags.includes('amplify')) score += 35;
      if (tags.includes('crit')) score += 20;
      if (tags.includes('chain')) score += 15;
      if (['blood_prism', 'plague_crown', 'storm_gambler'].includes(configId)) score += 25;
      if (['combo_finisher', 'spark_orb', 'overclock_core', 'blood_altar'].includes(configId)) score += 40;
      break;
  }

  return score;
}

function preview(run: Run) {
  const prepared = prepareBattle(run, catalog);
  const result = prepared.events.at(-1);
  if (result?.type !== 'TURN_RESULT') throw new Error('Missing simulated battle result');
  return { ...prepared, result };
}

function fillBoard(run: Run) {
  for (const [index, rune] of run.bench.entries()) {
    if (!rune) continue;
    const cell = run.board.indexOf(null);
    if (cell < 0) break;
    swapRunes(run, { zone: 'bench', index }, { zone: 'board', index: cell });
  }
}

function shop(run: Run) {
  for (let action = 0; action < 6; action++) {
    let bestIndex = -1;
    let bestScore = -1;
    for (const [index, offer] of run.shop.entries()) {
      if (!offer || purchaseInfo(run, index, catalog).blocked) continue;
      const score = scoreRune(run, offer.configId);
      if (score <= bestScore || (score < 20 && run.board.filter(Boolean).length >= 12)) continue;
      bestScore = score;
      bestIndex = index;
    }
    if (bestIndex !== -1) {
      buyRune(run, bestIndex, catalog);
      fillBoard(run);
      continue;
    }
    if (!run.freeRefreshes && (run.gold < 25 || run.wave < 5)) break;
    if (!refreshShop(run, catalog, createMulberry32(run.rngState))) break;
  }
}

const boardSlots = Array.from({ length: 16 }, (_, index): Slot => ({ zone: 'board', index }));
const benchSlots = Array.from({ length: 4 }, (_, index): Slot => ({ zone: 'bench', index }));

function arrange(run: Run, rng: Random) {
  let best = preview(run).result;
  for (let step = 0; step < 24; step++) {
    const occupied = [...boardSlots, ...benchSlots].filter(slot => run[slot.zone][slot.index]);
    const from = occupied[Math.floor(rng() * occupied.length)];
    const to = boardSlots[Math.floor(rng() * boardSlots.length)];
    if (!from || (from.zone === to.zone && from.index === to.index)) continue;
    swapRunes(run, from, to);
    const candidate = preview(run).result;
    if (candidate.damage > best.damage || (candidate.damage === best.damage && candidate.gold >= best.gold)) best = candidate;
    else swapRunes(run, to, from);
  }
}

function sellWeakestBenchRune(run: Run) {
  if (run.bench.includes(null)) return;
  const lowest = benchSlots.reduce((best, slot) => {
    const rune = run.bench[slot.index]!;
    const current = run.bench[best.index]!;
    return scoreRune(run, rune.configId) + rune.star * 25 < scoreRune(run, current.configId) + current.star * 25 ? slot : best;
  });
  sellRune(run, lowest, catalog);
}

function simulateBotRun(opening: OpeningId, seed: number, runeStats: Record<string, { damage: number; fielded: number }>): SimulationResult {
  const run = newRun(catalog, createMulberry32(seed), opening);
  const decisionRng = createMulberry32(seed ^ 0x3fce42d);
  while (run.status === 'active') {
    const choice = RELIC_PREFERENCES[opening].find(id => run.pendingRelics.includes(id));
    if (choice) chooseRelic(run, choice);
    const alreadyWins = preview(run).result.win;
    if (run.wave > 1 || !alreadyWins) {
      if (!alreadyWins) sellWeakestBenchRune(run);
      shop(run);
      arrange(run, decisionRng);
    }
    const bounty = trialAt(run.wave);
    if (bounty && preview({ ...run, trialWave: run.wave }).result.win) selectTrial(run, true);

    const { events, result, rngState, board } = preview(run);
    for (const rune of board) if (rune) runeStats[rune.configId].fielded++;
    const poisonRunes = board.flatMap(rune => rune && catalog[rune.configId].tags.includes('poison') ? [rune.configId] : []);
    for (const event of events) {
      if (event.type !== 'DAMAGE') continue;
      if (event.source !== null) {
        const rune = board[event.source];
        if (rune) runeStats[rune.configId].damage += event.amount;
      } else if (event.kind === 'poison') {
        for (const id of poisonRunes) runeStats[id].damage += event.amount / poisonRunes.length;
      }
    }
    const settlementRng = createMulberry32(rngState);
    run.board = board;
    settleTurn(run, result, catalog, settlementRng);
    run.rngState = settlementRng.getState();
    if (run.pendingLoss) resolveLoss(run, false);
  }
  const clearedWave20 = run.status === 'victory';
  return {
    opening,
    clearedWave20,
    deathWave: clearedWave20 ? null : run.wave,
    deathEncounter: clearedWave20 ? null : battleTarget(run.wave, run.trialWave).encounter,
    wavesCleared: clearedWave20 ? 20 : run.wave - 1,
    bountiesCleared: run.clearedTrials?.length ?? 0,
  };
}

describe('Monte Carlo campaign balance (800 runs)', () => {
  it('runs 800 games across 4 archetypes and outputs detailed balance report', () => {
    const archetypes = openingIds;
    const RUNS_PER_ARCHETYPE = 200;
    const results: SimulationResult[] = [];
    const runeStats: Record<string, { damage: number; fielded: number }> = {};

    for (const id of Object.keys(catalog)) {
      runeStats[id] = { damage: 0, fielded: 0 };
    }

    const startTime = Date.now();

    for (const opening of archetypes) {
      for (let i = 0; i < RUNS_PER_ARCHETYPE; i++) {
        const seed = (i + 1) * 31337 + opening.charCodeAt(0) * 997;
        const res = simulateBotRun(opening, seed, runeStats);
        results.push(res);
      }
    }

    const duration = Date.now() - startTime;

    // 1. Archetype stats
    const archetypeSummary: Record<string, { total: number; wins: number; avgDeathWave: number; avgWaveReached: number }> = {};
    for (const arc of archetypes) {
      const arcResults = results.filter(r => r.opening === arc);
      const wins = arcResults.filter(r => r.clearedWave20).length;
      const defeated = arcResults.filter(r => !r.clearedWave20);
      const avgDeathWave = defeated.length ? defeated.reduce((sum, r) => sum + (r.deathWave ?? 0), 0) / defeated.length : 20;
      const avgWaveReached = arcResults.reduce((sum, r) => sum + r.wavesCleared, 0) / arcResults.length;
      archetypeSummary[arc] = {
        total: arcResults.length,
        wins,
        avgDeathWave: Math.round(avgDeathWave * 10) / 10,
        avgWaveReached: Math.round(avgWaveReached * 10) / 10,
      };
    }

    // 2. Boss kill failures
    const bossFailures: Record<string, number> = {};
    for (const b of Object.keys(encounters)) {
      bossFailures[b] = 0;
    }
    const defeatedResults = results.filter(r => !r.clearedWave20 && r.deathEncounter);
    for (const r of defeatedResults) {
      if (r.deathEncounter) {
        bossFailures[r.deathEncounter] = (bossFailures[r.deathEncounter] ?? 0) + 1;
      }
    }

    // 3. Rune damage rankings
    let totalAllDamage = 0;
    for (const id of Object.keys(catalog)) {
      totalAllDamage += runeStats[id].damage;
    }

    const rankedRunes = Object.keys(catalog)
      .map(id => {
        const stat = runeStats[id];
        const avgDmgPerFielded = stat.fielded > 0 ? Math.round(stat.damage / stat.fielded) : 0;
        const share = totalAllDamage > 0 ? (stat.damage / totalAllDamage) * 100 : 0;
        return {
          id,
          name: catalog[id].name,
          rarity: catalog[id].rarity,
          tags: catalog[id].tags.join('/'),
          totalDamage: Math.round(stat.damage),
          fielded: stat.fielded,
          avgDmgPerFielded,
          share: Math.round(share * 10) / 10,
        };
      })
      .sort((a, b) => b.totalDamage - a.totalDamage);

    // Format console output
    console.log('\n========================================================================');
    console.log('              《4×4 词条法阵》蒙特卡洛 800 局平衡巡检报告              ');
    console.log(`                     耗时: ${duration} ms (平均 ${(duration / results.length).toFixed(2)} ms/局)                   `);
    console.log('========================================================================\n');

    console.log('一、各开局流派 20 波通关率与死亡波次统计 (各 200 局，共 800 局)：');
    console.log('┌──────────┬──────────┬──────────┬──────────────┬──────────────┐');
    console.log('│ 开局流派 │ 模拟局数 │ 通关率   │ 平均通关波次 │ 阵亡平均波次 │');
    console.log('├──────────┼──────────┼──────────┼──────────────┼──────────────┤');
    for (const arc of archetypes) {
      const s = archetypeSummary[arc];
      const winRate = ((s.wins / s.total) * 100).toFixed(1) + '%';
      const name = arc === 'chain' ? '借火(连锁)' : arc === 'poison' ? '养苔(剧毒)' : arc === 'gold' ? '攒钱(金币)' : '落印(增幅)';
      console.log(`│ ${name.padEnd(8, ' ')} │ ${String(s.total).padStart(8, ' ')} │ ${winRate.padStart(8, ' ')} │ ${String(s.avgWaveReached).padStart(12, ' ')} │ ${String(s.avgDeathWave).padStart(12, ' ')} │`);
    }
    console.log('└──────────┴──────────┴──────────┴──────────────┴──────────────┘\n');

    console.table(Array.from({ length: 20 }, (_, index) => {
      const wave = index + 1;
      return {
        wave,
        reached: results.filter(result => result.wavesCleared >= wave - 1).length,
        lost: results.filter(result => result.deathWave === wave).length,
        ...Object.fromEntries(archetypes.map(opening => [opening, results.filter(result => result.opening === opening && result.deathWave === wave).length])),
      };
    }));
    console.log(`Bounties cleared: ${results.reduce((total, result) => total + result.bountiesCleared, 0)}`);

    console.log('二、Boss 击杀失败 (团灭) 分布占比：');
    console.log('┌──────────────┬──────────────┬────────────┬──────────────┐');
    console.log('│ Boss 标识    │ Boss 名称    │ 击杀失败数 │ 失败占比     │');
    console.log('├──────────────┼──────────────┼────────────┼──────────────┤');
    const totalDefeats = defeatedResults.length;
    for (const [bId, count] of Object.entries(bossFailures)) {
      const bossName = (encounters as any)[bId]?.name ?? bId;
      const pct = totalDefeats > 0 ? ((count / totalDefeats) * 100).toFixed(1) + '%' : '0.0%';
      console.log(`│ ${bId.padEnd(12, ' ')} │ ${bossName.padEnd(10, ' ')} │ ${String(count).padStart(10, ' ')} │ ${pct.padStart(12, ' ')} │`);
    }
    console.log('└──────────────┴──────────────┴────────────┴──────────────┘\n');

    console.log('三、全 26 种符文伤害贡献排行榜 (含 6 种新双标签桥梁符文)：');
    console.log('┌────┬────────────────┬──────────┬────────┬──────────────┬──────────┬──────────┬────────┐');
    console.log('│ 序 │ 符文名称       │ ID       │ 稀有度 │ 标签         │ 出战次数 │ 平均输出 │ 伤害占 │');
    console.log('├────┼────────────────┼──────────┼────────┼──────────────┼──────────┼──────────┼────────┤');
    rankedRunes.forEach((r, idx) => {
      const rank = String(idx + 1).padStart(2, ' ');
      const name = r.name.padEnd(12, ' ');
      const id = r.id.padEnd(14, ' ');
      const rar = r.rarity.padEnd(6, ' ');
      const tags = r.tags.padEnd(12, ' ');
      const fielded = String(r.fielded).padStart(8, ' ');
      const avg = String(r.avgDmgPerFielded).padStart(8, ' ');
      const share = (r.share.toFixed(1) + '%').padStart(6, ' ');
      console.log(`│ ${rank} │ ${name} │ ${id} │ ${rar} │ ${tags} │ ${fielded} │ ${avg} │ ${share} │`);
    });
    console.log('└────┴────────────────┴──────────┴────────┴──────────────┴──────────┴──────────┴────────┘\n');

    for (const arc of archetypes) {
      const rate = (archetypeSummary[arc].wins / archetypeSummary[arc].total) * 100;
      expect(rate).toBeGreaterThanOrEqual(15);
      expect(rate).toBeLessThanOrEqual(95);
    }
    expect(runeStats.gold_cannon.damage / totalAllDamage).toBeLessThan(.5);
  }, 60000); // 60s timeout limit
});
