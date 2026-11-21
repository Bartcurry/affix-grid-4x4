import { describe, it, expect } from 'vitest';
import { catalog } from '../data/catalog';
import { simulateBattle } from '../core/battleEngine';
import { battleTargetFor } from '../core/bounties';
import { encounterAt, affixAt, EncounterId, encounters } from '../core/expedition';
import { countSynergies } from '../core/synergy';
import { createMulberry32 } from '../core/rng';
import {
  buyRune,
  chooseRelic,
  newRun,
  purchaseInfo,
  refreshShop,
  resolveLoss,
  settleTurn,
  swapRunes,
} from '../core/shopEngine';
import { planTurn, usesTutorial } from '../core/tactics';
import type { OpeningId, Run } from '../core/types';

interface SimulationResult {
  opening: OpeningId;
  clearedWave20: boolean;
  deathWave: number | null; // null if cleared
  deathEncounter: EncounterId | null;
  wavesCleared: number;
}

const RELIC_PREFERENCES: Record<OpeningId, string[]> = {
  chain: ['chain_ring', 'whetstone', 'red_lens', 'gate_tithe', 'copper_ledger', 'moss_bowl', 'taixu_needle', 'li_fire_token'],
  poison: ['moss_bowl', 'huagong_powder', 'gate_tithe', 'whetstone', 'chain_ring', 'copper_ledger', 'red_lens'],
  gold: ['copper_ledger', 'gate_tithe', 'chain_ring', 'whetstone', 'red_lens', 'moss_bowl'],
  amplify: ['whetstone', 'taixu_needle', 'red_lens', 'chain_ring', 'gate_tithe', 'copper_ledger', 'moss_bowl'],
};

function scoreRune(run: Run, configId: string): number {
  const config = catalog[configId];
  if (!config) return 0;
  let score = 0;

  // Check 3-merge readiness
  const ownedCount = [...run.board, ...run.bench].filter(r => r?.configId === configId && r.star === 1).length;
  if (ownedCount === 2) score += 100;
  else if (ownedCount === 1) score += 25;

  const synergies = countSynergies(run.board, catalog);
  if (run.opening !== 'gold' && (config.tags.includes(run.opening) || config.archetype === run.opening)) {
    if (synergies[run.opening].count < 3) score += 35;
    else if (synergies[run.opening].count < 5) score += 20;
  }

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
      if (tags.includes('gold')) score += 20;
      if (tags.includes('chain')) score += 10;
      if (['gilded_fang', 'alchemy_bell', 'vault_guard'].includes(configId)) score += 5;
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

function simulateBotRun(opening: OpeningId, seed: number, runeStats: Record<string, { damage: number; fielded: number }>): SimulationResult {
  const rng = createMulberry32(seed);
  const run = newRun(catalog, rng, opening);

  for (let wave = 1; wave <= 20; wave++) {
    if (run.status === 'defeat') break;

    // 1. Pick relic if available
    if (run.pendingRelics.length > 0) {
      const prefs = RELIC_PREFERENCES[opening];
      const pick = prefs.find(p => run.pendingRelics.includes(p as any)) ?? run.pendingRelics[0];
      if (pick) chooseRelic(run, pick as any);
    }

    // 2. Shop phase
    let shopActions = 0;
    while (shopActions < 6) {
      shopActions++;
      // Check for best buyable rune
      let bestIndex = -1;
      let bestScore = -1;
      for (let i = 0; i < run.shop.length; i++) {
        const offer = run.shop[i];
        if (!offer) continue;
        const info = purchaseInfo(run, i, catalog);
        if (info.blocked === null && run.gold >= catalog[offer.configId].cost) {
          const s = scoreRune(run, offer.configId);
          if (s > bestScore && (s >= 20 || run.board.filter(Boolean).length < 12)) {
            bestScore = s;
            bestIndex = i;
          }
        }
      }

      if (bestIndex >= 0) {
        buyRune(run, bestIndex, catalog);
        continue;
      }

      // If no buy, check free refresh
      if (run.freeRefreshes > 0) {
        refreshShop(run, catalog, rng);
        continue;
      }

      // Paid refresh if excess gold
      if (run.gold >= 25 && wave >= 5) {
        refreshShop(run, catalog, rng);
        continue;
      }

      break;
    }

    // 3. Move bench runes to board
    for (let b = 0; b < run.bench.length; b++) {
      if (!run.bench[b]) continue;
      const emptyBoardIdx = run.board.findIndex(r => r === null);
      if (emptyBoardIdx >= 0) {
        swapRunes(run, { zone: 'bench', index: b }, { zone: 'board', index: emptyBoardIdx });
      }
    }

    // 4. Board optimization: simple hill climbing using planTurn
    if (wave === 2 && opening === 'chain') {
      if (run.board[0]?.configId === 'spark_orb' && run.board[1]?.configId === 'prism_right') {
        swapRunes(run, { zone: 'board', index: 0 }, { zone: 'board', index: 1 });
      }
    }

    if (wave > 1 || opening !== 'chain') {
      let currentPlan = planTurn(run, catalog);
      const occupiedIndices = run.board.map((r, i) => (r ? i : -1)).filter(i => i >= 0);
      if (occupiedIndices.length >= 2) {
        for (let step = 0; step < 24; step++) {
          const i1 = occupiedIndices[Math.floor(rng() * occupiedIndices.length)];
          const i2 = occupiedIndices[Math.floor(rng() * occupiedIndices.length)];
          if (i1 === i2) continue;
          swapRunes(run, { zone: 'board', index: i1 }, { zone: 'board', index: i2 });
          const newPlan = planTurn(run, catalog);
          if (newPlan.expectedDamage >= currentPlan.expectedDamage) {
            currentPlan = newPlan;
          } else {
            // Revert swap
            swapRunes(run, { zone: 'board', index: i1 }, { zone: 'board', index: i2 });
          }
        }
      }
    }

    // 5. Battle execution
    let wonWave = false;
    while (!wonWave && run.status === 'active') {
      // Record fielding
      for (const r of run.board) {
        if (r) {
          if (!runeStats[r.configId]) runeStats[r.configId] = { damage: 0, fielded: 0 };
          runeStats[r.configId].fielded++;
        }
      }

      const target = battleTargetFor(run);
      const battleInput = {
        board: run.board,
        bench: run.bench,
        hp: target.hp,
        gold: run.gold,
        seed: rng(),
        tutorial: usesTutorial(run),
        encounter: target.encounter,
        relics: run.relics,
        tileModifiers: run.tileModifiers,
        affix: affixAt(run.wave)?.id,
        shield: run.shield ?? 3,
        enableSynergies: run.enableSynergies ?? true,
      };

      const events = simulateBattle(battleInput, catalog, rng);
      const result = events.at(-1);
      if (result?.type !== 'TURN_RESULT') break;

      // Attribute damage
      for (const ev of events) {
        if (ev.type === 'DAMAGE') {
          if (ev.source !== null && battleInput.board[ev.source]) {
            const rId = battleInput.board[ev.source]!.configId;
            runeStats[rId].damage += ev.amount;
          } else if (ev.kind === 'poison') {
            const poisonRunes = battleInput.board.filter(r => r && catalog[r.configId]?.tags.includes('poison'));
            if (poisonRunes.length > 0) {
              const portion = ev.amount / poisonRunes.length;
              for (const pr of poisonRunes) {
                runeStats[pr!.configId].damage += portion;
              }
            }
          }
        }
      }

      settleTurn(run, result, catalog, rng);
      if (result.win) {
        wonWave = true;
      } else {
        const encounter = encounterAt(run.wave);
        resolveLoss(run, false);
        if ((run as Run).status === 'defeat') {
          return {
            opening,
            clearedWave20: false,
            deathWave: run.wave,
            deathEncounter: encounter,
            wavesCleared: run.wave - 1,
          };
        }

      }
    }
  }

  return {
    opening,
    clearedWave20: run.status === 'victory' || run.wave > 20 || (run.wave === 20 && run.status === 'active'),
    deathWave: null,
    deathEncounter: null,
    wavesCleared: 20,
  };
}

describe('Module 5: Monte Carlo Balance Inspection (800 Runs)', () => {
  it('runs 800 games across 4 archetypes and outputs detailed balance report', () => {
    const archetypes: OpeningId[] = ['chain', 'poison', 'gold', 'amplify'];
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
    console.log(`                     耗时: ${duration} ms (平均 ${(duration / 800).toFixed(2)} ms/局)                   `);
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
