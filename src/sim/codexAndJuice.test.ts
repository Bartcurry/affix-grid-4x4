import { describe, expect, it } from 'vitest';
import { catalog, runes } from '../data/catalog';
import { relics } from '../core/expedition';
import { getRelicSvgPath } from '../render/glyphs';
import { getRuneTacticalInfo, runeTacticalMap } from '../data/tacticalTips';
import { migrateSave } from '../platform/webMockAdapter';
import type { RunArchive } from '../platform/adapter';
import { STAR_MULT } from '../core/types';
import { SynthAudio } from '../audio/synthAudio';
import { CanvasRenderer } from '../render/canvasRenderer';
import { createMulberry32 } from '../core/rng';
import { newRun } from '../core/shopEngine';
import fs from 'node:fs';
import path from 'node:path';

describe('Cycle 1: PWA & Service Worker Configuration', () => {
  it('validates manifest.webmanifest format and required fields', () => {
    const manifestPath = path.resolve(__dirname, '../../public/manifest.webmanifest');
    expect(fs.existsSync(manifestPath)).toBe(true);

    const raw = fs.readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(raw);

    expect(manifest.name).toBe('4×4 词条法阵 · 玄墨鎏金');
    expect(manifest.short_name).toBe('词条法阵');
    expect(manifest.start_url).toBe('./');
    expect(manifest.display).toBe('standalone');
    expect(manifest.theme_color).toBe('#090B10');
    expect(manifest.background_color).toBe('#090B10');
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);

    for (const icon of manifest.icons) {
      expect(icon.src).toBeDefined();
      expect(icon.sizes).toBeDefined();
      expect(icon.type).toBeDefined();
    }
  });

  it('validates service worker sw.js file existence and cache key', () => {
    const swPath = path.resolve(__dirname, '../../public/sw.js');
    expect(fs.existsSync(swPath)).toBe(true);
    const content = fs.readFileSync(swPath, 'utf-8');
    expect(content).toContain('affix-grid-cache');
    expect(content).toContain('addEventListener');
    expect(content).toContain('install');
    expect(content).toContain('activate');
    expect(content).toContain('fetch');
    // Verify robustness: origin check, cloning, and awaited fallbacks
    expect(content).toContain('url.origin === location.origin');
    expect(content).toContain('.clone()');
    expect(content).toContain('await caches.match');
    expect(content).toContain('fallbackIndex');
  });
});

describe('Cycle 2: Codex (天机图鉴) & Tactical Tips Coverage', () => {
  it('ensures all 26 runes in catalog have full tactical guidance', () => {
    expect(runes.length).toBe(26);
    expect(Object.keys(catalog).length).toBe(26);

    for (const rune of runes) {
      const tactical = getRuneTacticalInfo(rune.id);
      expect(tactical.tip.length).toBeGreaterThan(10);
      expect(tactical.synergyAdvice.length).toBeGreaterThan(5);
      expect(tactical.recommendedPosition.length).toBeGreaterThan(5);
      expect(runeTacticalMap[rune.id]).toBeDefined();
    }
  });

  it('verifies all 15 relics have names, descriptions and valid SVG glyph paths', () => {
    const relicEntries = Object.entries(relics);
    expect(relicEntries.length).toBe(15);

    for (const [id, relic] of relicEntries) {
      expect(relic.name.length).toBeGreaterThan(0);
      expect(relic.text.length).toBeGreaterThan(0);
      const svgPath = getRelicSvgPath(id);
      expect(typeof svgPath).toBe('string');
      expect(svgPath.length).toBeGreaterThan(10);
      expect(svgPath).toMatch(/^[MCLHVZSAamclhvzsa0-9\s.,-]+$/);
    }
  });

  it('verifies 3-tier star multipliers calculate properly across all runes', () => {
    expect(STAR_MULT[1]).toBe(1);
    expect(STAR_MULT[2]).toBe(2.2);
    expect(STAR_MULT[3]).toBe(5);

    for (const rune of runes) {
      for (const rule of rune.triggers) {
        if (rule.value?.base) {
          const base = rule.value.base;
          const star1 = base * STAR_MULT[1];
          const star2 = base * STAR_MULT[2];
          const star3 = base * STAR_MULT[3];
          expect(star1).toBe(base);
          expect(star2).toBeCloseTo(base * 2.2);
          expect(star3).toBe(base * 5);
        }
      }
    }
  });

  it('migrates and preserves run history properly with max 5 items cap', () => {
    const sampleHistory: RunArchive[] = [
      { id: '1', seed: 'SEED-0001', wave: 20, opening: 'chain', status: 'victory', lastDamage: 99999, bestCombo: 24, date: '11-20 12:00', relicsCount: 4 },
      { id: '2', seed: 'SEED-0002', wave: 14, opening: 'poison', status: 'defeat', lastDamage: 45000, bestCombo: 16, date: '11-20 11:30', relicsCount: 3 },
      { id: '3', seed: 'SEED-0003', wave: 20, opening: 'gold', status: 'victory', lastDamage: 120000, bestCombo: 28, date: '11-20 11:00', relicsCount: 5 },
      { id: '4', seed: 'SEED-0004', wave: 8, opening: 'amplify', status: 'defeat', lastDamage: 12000, bestCombo: 9, date: '11-20 10:30', relicsCount: 2 },
      { id: '5', seed: 'SEED-0005', wave: 20, opening: 'chain', status: 'victory', lastDamage: 88000, bestCombo: 21, date: '11-20 10:00', relicsCount: 4 },
      { id: '6', seed: 'SEED-0006', wave: 5, opening: 'poison', status: 'defeat', lastDamage: 3000, bestCombo: 5, date: '11-20 09:30', relicsCount: 1 },
    ];

    const rawData = {
      schemaVersion: 2,
      records: {},
      history: sampleHistory,
      muted: true,
      ambientMuted: false,
    };

    const migrated = migrateSave(rawData, catalog);
    expect(migrated.history).toBeDefined();
    expect(migrated.history?.length).toBe(5);
    expect(migrated.history?.[0].seed).toBe('SEED-0001');
    expect(migrated.history?.[4].seed).toBe('SEED-0005');
    expect(migrated.muted).toBe(true);
    expect(migrated.ambientMuted).toBe(false);
  });

  it('handles invalid or corrupted history gracefully in migrateSave', () => {
    const corrupted = {
      schemaVersion: 2,
      history: [null, undefined, { seed: 123 }, { opening: 'unknown' }, 'random_string'],
    };
    const migrated = migrateSave(corrupted, catalog);
    expect(Array.isArray(migrated.history)).toBe(true);
    expect(migrated.history?.length).toBe(0);
  });

  it('updates existing run entry in history when recording same seed', () => {
    let history: RunArchive[] = [];
    const record = (entry: RunArchive) => {
      const idx = history.findIndex(h => h.seed === entry.seed);
      if (idx >= 0) {
        history[idx] = entry;
      } else {
        history.unshift(entry);
        if (history.length > 5) history = history.slice(0, 5);
      }
    };

    record({ id: '1', seed: 'SEED-A', wave: 5, opening: 'chain', status: 'active', lastDamage: 500, bestCombo: 5, date: '11-20', relicsCount: 1 });
    record({ id: '2', seed: 'SEED-B', wave: 10, opening: 'poison', status: 'active', lastDamage: 2000, bestCombo: 10, date: '11-20', relicsCount: 2 });
    expect(history.length).toBe(2);

    // Progress in SEED-A to wave 20 victory
    record({ id: '3', seed: 'SEED-A', wave: 20, opening: 'chain', status: 'victory', lastDamage: 50000, bestCombo: 22, date: '11-20', relicsCount: 4 });
    expect(history.length).toBe(2);
    expect(history.find(h => h.seed === 'SEED-A')?.wave).toBe(20);
    expect(history.find(h => h.seed === 'SEED-A')?.status).toBe('victory');
  });
});

describe('Cycle 3: Native Canvas Particle Engine & Extreme Juice', () => {
  if (typeof globalThis.requestAnimationFrame === 'undefined') {
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => setTimeout(cb, 16) as unknown as number) as typeof requestAnimationFrame;
  }

  function createMockCanvas(): HTMLCanvasElement {
    const mockCtx = {
      save: () => {},
      restore: () => {},
      setTransform: () => {},
      clearRect: () => {},
      fillRect: () => {},
      strokeRect: () => {},
      fillText: () => {},
      strokeText: () => {},
      beginPath: () => {},
      closePath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      arc: () => {},
      fill: () => {},
      stroke: () => {},
      translate: () => {},
      rotate: () => {},
      scale: () => {},
      setLineDash: () => {},
      roundRect: () => {},
      createLinearGradient: () => ({ addColorStop: () => {} }),
      createRadialGradient: () => ({ addColorStop: () => {} }),
    } as unknown as CanvasRenderingContext2D;

    return {
      getContext: () => mockCtx,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 380, height: 477 }),
      width: 380,
      height: 477,
    } as unknown as HTMLCanvasElement;
  }

  it('spawns golden crit sparks without error and bounds within limit', () => {
    const run = newRun(catalog, createMulberry32(1), 'chain');
    const renderer = new CanvasRenderer(createMockCanvas(), run, catalog);

    renderer.spawnCritSparks({ x: 190, y: 150 });
    // @ts-expect-error accessing private for unit test verification
    const count = renderer.particles.length;
    expect(count).toBeGreaterThan(15);
    expect(count).toBeLessThanOrEqual(30);

    // Multiple rapid calls should not exceed MAX_PARTICLES
    for (let i = 0; i < 20; i++) {
      renderer.spawnCritSparks({ x: 190, y: 150 });
    }
    // @ts-expect-error accessing private
    expect(renderer.particles.length).toBeLessThanOrEqual(220);
  });

  it('spawns emerald poison mist and bronze shatter shards', () => {
    const run = newRun(catalog, createMulberry32(1), 'poison');
    const renderer = new CanvasRenderer(createMockCanvas(), run, catalog);

    renderer.spawnPoisonMist({ x: 100, y: 100 });
    // @ts-expect-error accessing private
    const poisonCount = renderer.particles.filter(p => p.kind === 'poison_mist').length;
    expect(poisonCount).toBeGreaterThan(10);

    renderer.spawnBronzeShatter({ x: 190, y: 55 });
    // @ts-expect-error accessing private
    const bronzeCount = renderer.particles.filter(p => p.kind === 'bronze_shard').length;
    expect(bronzeCount).toBeGreaterThan(12);
  });

  it('spawns victory coin rain and confetti streamers', () => {
    const run = newRun(catalog, createMulberry32(1), 'gold');
    const renderer = new CanvasRenderer(createMockCanvas(), run, catalog);

    renderer.spawnVictoryCelebration();
    // @ts-expect-error accessing private
    const coins = renderer.particles.filter(p => p.kind === 'coin').length;
    // @ts-expect-error accessing private
    const ribbons = renderer.particles.filter(p => p.kind === 'confetti').length;

    expect(coins).toBeGreaterThanOrEqual(30);
    expect(ribbons).toBeGreaterThanOrEqual(30);
  });

  it('clears particles cleanly on clearEffects', () => {
    const run = newRun(catalog, createMulberry32(1), 'chain');
    const renderer = new CanvasRenderer(createMockCanvas(), run, catalog);

    renderer.spawnVictoryCelebration();
    // @ts-expect-error accessing private
    expect(renderer.particles.length).toBeGreaterThan(50);

    renderer.clearEffects();
    // @ts-expect-error accessing private
    expect(renderer.particles.length).toBe(0);
  });

  it('does not schedule infinite animation frames when completely idle', () => {
    let rafCallCount = 0;
    const originalRaf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = () => {
      rafCallCount++;
      return 1;
    };

    try {
      const run = newRun(catalog, createMulberry32(1), 'chain');
      const renderer = new CanvasRenderer(createMockCanvas(), run, catalog);
      // @ts-expect-error accessing private
      renderer.frame = 0;
      rafCallCount = 0;

      // Draw while completely idle (no animations, no particles, no combo, no drag)
      // @ts-expect-error accessing private
      renderer.draw(1000);

      // Should NOT have scheduled another rAF frame because idle
      expect(rafCallCount).toBe(0);

      // Now add a particle and draw again
      renderer.spawnCritSparks({ x: 190, y: 150 });
      // @ts-expect-error accessing private
      renderer.frame = 0;
      rafCallCount = 0;
      // @ts-expect-error accessing private
      renderer.draw(1050);

      // Should HAVE scheduled another rAF frame because active particles exist
      expect(rafCallCount).toBe(1);
    } finally {
      globalThis.requestAnimationFrame = originalRaf;
    }
  });
});

describe('Cycle 4: Procedural Web Audio Pentatonic Ambient', () => {
  it('manages ambient audio state and toggling correctly', () => {
    const audio = new SynthAudio();
    expect(audio.ambientMuted).toBe(false);

    const isUnmuted1 = audio.toggleAmbient();
    expect(isUnmuted1).toBe(false);
    expect(audio.ambientMuted).toBe(true);

    const isUnmuted2 = audio.toggleAmbient();
    expect(isUnmuted2).toBe(true);
    expect(audio.ambientMuted).toBe(false);

    audio.setMuted(true);
    expect(audio.muted).toBe(true);
    audio.setMuted(false);
    expect(audio.muted).toBe(false);

    // Direct property assignment reactive test
    audio.muted = true;
    expect(audio.muted).toBe(true);
    // @ts-expect-error accessing private
    expect(audio.isAmbientRunning).toBe(false);

    audio.ambientMuted = true;
    expect(audio.ambientMuted).toBe(true);
    // @ts-expect-error accessing private
    expect(audio.isAmbientRunning).toBe(false);
  });

  it('runs safely in headless/Node.js environment without crashing', () => {
    const audio = new SynthAudio();
    expect(() => {
      audio.unlock();
      audio.click();
      audio.jadeChime();
      audio.singingBowl();
      audio.stampSlam();
      audio.synergyChime();
      audio.thunderChord();
      audio.hitStopChord();
      audio.startAmbient();
      audio.stopAmbient();
    }).not.toThrow();
  });
});

describe('Cycle 5: Arena Layout, Sizing & No-Overlap Invariant', () => {
  it('ensures .arena-bar is positioned as arena header above canvas with zero clipping', () => {
    const htmlPath = path.resolve(__dirname, '../../index.html');
    const html = fs.readFileSync(htmlPath, 'utf-8');

    const arenaWrapIdx = html.indexOf('class="arena-wrap');
    const arenaBarIdx = html.indexOf('class="arena-bar"');
    const canvasIdx = html.indexOf('id="arena"');

    expect(arenaWrapIdx).toBeGreaterThan(0);
    expect(arenaBarIdx).toBeGreaterThan(arenaWrapIdx);
    expect(canvasIdx).toBeGreaterThan(arenaBarIdx);

    // Required elements inside arena-bar
    expect(html).toContain('id="board-count"');
    expect(html).toContain('id="arena-hint"');
    expect(html).toContain('id="phase"');
  });

  it('validates CSS layout constraints preventing middle-bottom clipping and overflow', () => {
    const cssPath = path.resolve(__dirname, '../../src/style.css');
    const css = fs.readFileSync(cssPath, 'utf-8');

    // Canvas must not take 100% height inside .arena-wrap to avoid crowding out .arena-bar
    expect(css).toContain('max-height: calc(100% - 1.8rem)');
    // .arena-bar must have controlled height, box-sizing and dynamic canvas width sync
    expect(css).toContain('.arena-bar');
    expect(css).toContain('min-height: 1.5rem');
    expect(css).toContain('box-sizing: border-box');
    expect(css).toContain('var(--canvas-width');

    // Compact shop header must not break words across lines on narrow viewports
    expect(css).toContain('.market-title');
    expect(css).toContain('white-space: nowrap');
  });

  it('validates canvasRenderer dynamic width synchronization to parent container', () => {
    const rendererPath = path.resolve(__dirname, '../../src/render/canvasRenderer.ts');
    const code = fs.readFileSync(rendererPath, 'utf-8');
    expect(code).toContain('--canvas-width');
  });
});
