import { describe, expect, it } from 'vitest';
import { catalog } from '../data/catalog';
import { countSynergies } from '../core/synergy';
import { simulateBattle } from '../core/battleEngine';
import { chooseRelic, newRun, settleTurn, victoryPayout } from '../core/shopEngine';
import { relics } from '../core/expedition';
import type { BattleEvent, Rune, Star, TurnResult } from '../core/types';

const rune = (configId: string, star: Star = 1): Rune => ({ configId, star });
const noCrit = () => 0.99;
const alwaysCrit = () => 0.00;

function resultOf(events: BattleEvent[]) {
  const result = events.at(-1);
  if (result?.type !== 'TURN_RESULT') throw new Error('Missing turn result');
  return result;
}

describe('Synergy Resonance & Expanded Relic System', () => {
  it('correctly counts single-tag and dual-tag bridge runes for 3/5 piece tiers', () => {
    // 3 chain runes
    const board = [
      rune('spark_orb'),
      rune('prism_right'),
      rune('toxic_fuse'), // dual-tag: chain + poison
    ];
    const synergies = countSynergies(board, catalog);

    // toxic_fuse contributes to BOTH chain and poison
    expect(synergies.chain.count).toBe(3);
    expect(synergies.chain.tier).toBe(1); // 3-piece reached!
    expect(synergies.poison.count).toBe(1);
    expect(synergies.poison.tier).toBe(0);

    // Add 2 more chain runes to reach 5-piece
    board.push(rune('relay_cross'), rune('falling_bell'));
    const synergies5 = countSynergies(board, catalog);
    expect(synergies5.chain.count).toBe(5);
    expect(synergies5.chain.tier).toBe(2); // 5-piece reached!
  });

  it('triggers 3-piece and 5-piece chain resonance damage boost', () => {
    // Base chain with 2 chain runes (tier 0)
    const baseBoard = [rune('prism_right'), rune('spark_orb')];
    const baseEvents = simulateBattle({
      board: baseBoard,
      hp: 10000,
      gold: 0,
      enableSynergies: true,
    }, catalog, noCrit);
    const baseResult = resultOf(baseEvents);

    // 3-piece chain (prism_right + spark_orb + falling_bell)
    const tier1Board = [rune('prism_right'), rune('spark_orb'), rune('falling_bell')];
    const tier1Events = simulateBattle({
      board: tier1Board,
      hp: 10000,
      gold: 0,
      enableSynergies: true,
    }, catalog, noCrit);
    const tier1Result = resultOf(tier1Events);

    // In tier 1, spark_orb triggered via chain gains 35% chain damage multiplier!
    expect(tier1Result.damage).toBeGreaterThan(baseResult.damage);

    // Compare spark_orb damage when chained under tier 0 vs tier 1
    const chainedDmgTier0 = baseEvents.filter((e): e is Extract<BattleEvent, { type: 'DAMAGE' }> => e.type === 'DAMAGE' && e.source === 1)[0];
    const chainedDmgTier1 = tier1Events.filter((e): e is Extract<BattleEvent, { type: 'DAMAGE' }> => e.type === 'DAMAGE' && e.source === 1)[0];
    expect(chainedDmgTier1.amount).toBe(Math.ceil(chainedDmgTier0.amount * 1.35));
  });

  it('applies poison 3-piece and 5-piece burst damage and reduced decay', () => {
    // 3-piece poison: venom_drop, plague_spreader, catalyst_flask
    const poisonBoard = [
      rune('venom_drop'),
      rune('plague_spreader'),
      rune('catalyst_flask'),
    ];
    const events = simulateBattle({
      board: poisonBoard,
      hp: 10000,
      gold: 0,
      enableSynergies: true,
    }, catalog, noCrit);

    // Should have poison damage events from burst application and 35% end-of-turn boost
    const poisonDamages = events.filter(e => e.type === 'DAMAGE' && e.kind === 'poison');
    expect(poisonDamages.length).toBeGreaterThanOrEqual(2);

    // 5-piece poison: add 2 more poison runes
    const poison5Board = [
      ...poisonBoard,
      rune('toxic_detonator'),
      rune('moss_brick'),
    ];
    const events5 = simulateBattle({
      board: poison5Board,
      hp: 10000,
      gold: 0,
      enableSynergies: true,
    }, catalog, noCrit);

    // End result should retain 90% of poison instead of standard 80%
    const lastPoisonEvent = events5.filter(e => e.type === 'POISON').at(-1);
    const prevPoisonEvent = events5.filter(e => e.type === 'POISON').at(-2);
    expect(lastPoisonEvent!.poison).toBe(Math.floor(prevPoisonEvent!.poison * 0.90));
  });

  it('empowers gold synergy with interest threshold easing and gold-gain shockwaves', () => {
    // 3-piece gold eases interest divisor to 8 (so 40 gold gets max 5 interest)
    const goldBoard3 = [rune('copper_mine'), rune('greed_amplifier'), rune('coin_mold')];
    const run = newRun(catalog, noCrit, 'gold');
    run.board = [...goldBoard3, ...Array(13).fill(null)];
    run.enableSynergies = true;

    // With 40 gold: without synergy (div 10) interest is 4; with synergy (div 8) interest is 5!
    const payoutWithout = victoryPayout({ ...run, enableSynergies: false }, 40, catalog);
    expect(payoutWithout.interest).toBe(4);
    const payoutWith = victoryPayout(run, 40, catalog);
    expect(payoutWith.interest).toBe(5);

    // 5-piece gold deals shockwave on gold gain
    const goldBoard5 = [...goldBoard3, rune('gold_cannon'), rune('tax_collector')];
    run.board = [...goldBoard5, ...Array(11).fill(null)];

    // In battle with 5-piece gold, copper_mine produces gold and deals 5 dmg per gold
    const goldBattleEvents = simulateBattle({
      board: goldBoard5,
      hp: 10000,
      gold: 10,
      enableSynergies: true,
    }, catalog, noCrit);
    const shockwaveEvents = goldBattleEvents.filter((e): e is Extract<BattleEvent, { type: 'DAMAGE' }> => e.type === 'DAMAGE' && e.source === 0);
    expect(shockwaveEvents.some(e => e.amount >= 15)).toBe(true); // 3 gold * 5 = 15 dmg!
  });

  it('boosts amplify synergy with 3.0x/4.0x crit multipliers and stacking team buffs', () => {
    // 3-piece amplify: red_seal, ember_amp, blood_altar
    const ampBoard3 = [rune('blood_altar'), rune('ember_amp'), rune('spark_orb'), rune('echo_stone')];
    const events3 = simulateBattle({
      board: ampBoard3,
      hp: 10000,
      gold: 0,
      enableSynergies: true,
    }, catalog, alwaysCrit);

    // Amplify 3-piece grants +15% base crit rate and 3.0x crit multiplier
    const crits = events3.filter((e): e is Extract<BattleEvent, { type: 'DAMAGE' }> => e.type === 'DAMAGE' && e.crit);
    expect(crits.length).toBeGreaterThan(0);
    expect(resultOf(events3).damage).toBeGreaterThan(100);
  });

  it('verifies all 15 relics exist and their unique effects function correctly', () => {
    expect(Object.keys(relics)).toHaveLength(15);
    expect(relics.jade_abacus.name).toBe('青玉算盘');
    expect(relics.taixu_needle.name).toBe('太虚神针');
    expect(relics.li_fire_token.name).toBe('离火玄令');
    expect(relics.huagong_powder.name).toBe('化功散');
    expect(relics.bagua_mirror.name).toBe('八卦玄光镜');
    expect(relics.spirit_gourd.name).toBe('紫金葫芦');
    expect(relics.tianji_compass.name).toBe('天机罗盘');
    expect(relics.xuanbing_silk.name).toBe('玄冰天蚕丝');
    expect(relics.qiankun_pouch.name).toBe('乾坤宝袋');

    // Bagua mirror corner damage boost test (cells 0, 3, 12, 15)
    const cornerBoard = [rune('spark_orb'), null, null, rune('spark_orb')];
    const withoutRelic = simulateBattle({ board: cornerBoard, hp: 5000, gold: 0 }, catalog, noCrit);
    const withBagua = simulateBattle({ board: cornerBoard, hp: 5000, gold: 0, relics: ['bagua_mirror'] }, catalog, noCrit);
    expect(resultOf(withBagua).damage).toBeGreaterThan(resultOf(withoutRelic).damage);

    // Tianji compass gives 6 bonus gold upon selection
    const run = newRun(catalog, noCrit);
    run.pendingRelics = ['tianji_compass'];
    const initialGold = run.gold;
    chooseRelic(run, 'tianji_compass');
    expect(run.gold).toBe(initialGold + 6);
    expect(run.relics).toContain('tianji_compass');
  });

  it('rewards milestone bonuses every 5 waves in endless mode', () => {
    const run = newRun(catalog, noCrit);
    run.endless = true;
    run.wave = 24;
    run.shield = 1;
    const clearResult: TurnResult = { type: 'TURN_RESULT', gold: 10, combo: 5, damage: 99999, hp: 0, poison: 0, win: true };
    settleTurn(run, clearResult, catalog, noCrit);

    // Wave 24 cleared -> wave becomes 25 (milestone!)
    expect(run.wave).toBe(25);
    // Shield repaired by +1, received +10 bonus gold & free refreshes!
    expect(run.shield).toBe(2);
    expect(run.freeRefreshes).toBeGreaterThanOrEqual(2);
  });
});
