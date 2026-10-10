import { describe, expect, it } from 'vitest';
import { GROUND_Y } from './config';
import { FIRE, GOO, addShake, addText, addTracer, burst, sfx, showBanner, updateEffects } from './effects';
import { createGame } from './state';
import type { Particle } from './types';

const MAX_PARTICLES = 700;

function particle(overrides: Partial<Particle> = {}): Particle {
  return { x: 0, y: 0, vx: 0, vy: 0, life: 1, max: 1, size: 1, gravity: 0, color: '#000', ...overrides };
}

describe('burst', () => {
  it('spawns n particles with default options, cycling through the palette', () => {
    const g = createGame(1);
    g.rng = () => 0;
    burst(g, 10, 20, 4, GOO);
    expect(g.particles).toHaveLength(4);
    expect(g.particles.map((p) => p.color)).toEqual([GOO[0], GOO[1], GOO[2], GOO[0]]);
    for (const p of g.particles) {
      expect(p).toMatchObject({ x: 10, y: 20, max: 0.5, size: 1, gravity: 300 });
      expect(p.vx).toBeCloseTo(80 * 0.3);
      expect(p.vy).toBeCloseTo(0);
      expect(p.life).toBeCloseTo(0.25);
    }
  });

  it('applies custom speed, life, gravity, size and upward kick', () => {
    const g = createGame(1);
    g.rng = () => 0.25;
    burst(g, 0, 0, 2, FIRE, { speed: 100, life: 2, gravity: -40, size: 3, up: 10 });
    for (const p of g.particles) {
      expect(p).toMatchObject({ max: 2, size: 3, gravity: -40 });
      expect(p.vx).toBeCloseTo(0);
      expect(p.vy).toBeCloseTo(100 * 0.475 - 10);
      expect(p.life).toBeCloseTo(2 * 0.625);
    }
  });

  it('randomizes particle speed within bounds using the game rng', () => {
    const g = createGame(3);
    burst(g, 0, 0, 50, GOO, { speed: 100, life: 1 });
    for (const p of g.particles) {
      const speed = Math.hypot(p.vx, p.vy);
      expect(speed).toBeGreaterThanOrEqual(30 - 1e-9);
      expect(speed).toBeLessThanOrEqual(100 + 1e-9);
      expect(p.life).toBeGreaterThanOrEqual(0.5);
      expect(p.life).toBeLessThanOrEqual(1);
    }
  });

  it('does nothing for zero particles', () => {
    const g = createGame(1);
    burst(g, 0, 0, 0, GOO);
    expect(g.particles).toEqual([]);
  });

  it('caps the particle pool by dropping the oldest particles', () => {
    const g = createGame(1);
    for (let i = 0; i < MAX_PARTICLES - 10; i++) g.particles.push(particle({ color: `old-${i}` }));
    burst(g, 0, 0, 20, GOO);
    expect(g.particles).toHaveLength(MAX_PARTICLES);
    expect(g.particles[0].color).toBe('old-10');
    expect(g.particles[MAX_PARTICLES - 1].color).toBe(GOO[19 % GOO.length]);
  });

  it('does not trim a pool that is exactly at the cap', () => {
    const g = createGame(1);
    for (let i = 0; i < MAX_PARTICLES - 5; i++) g.particles.push(particle({ color: `old-${i}` }));
    burst(g, 0, 0, 5, GOO);
    expect(g.particles).toHaveLength(MAX_PARTICLES);
    expect(g.particles[0].color).toBe('old-0');
  });
});

describe('simple effect helpers', () => {
  it('adds floating text', () => {
    const g = createGame(1);
    addText(g, 5, 6, '+$3', '#fff');
    expect(g.texts).toEqual([{ x: 5, y: 6, text: '+$3', color: '#fff', life: 0.9 }]);
  });

  it('adds a tracer whose max life equals its life', () => {
    const g = createGame(1);
    addTracer(g, 1, 2, 3, 4, '#f00', 2, 0.3);
    expect(g.tracers).toEqual([{ x1: 1, y1: 2, x2: 3, y2: 4, color: '#f00', width: 2, life: 0.3, max: 0.3 }]);
  });

  it('keeps the strongest screen shake', () => {
    const g = createGame(1);
    addShake(g, 4);
    expect(g.shake).toBe(4);
    addShake(g, 2);
    expect(g.shake).toBe(4);
    addShake(g, 9);
    expect(g.shake).toBe(9);
  });

  it('queues sound effects in order', () => {
    const g = createGame(1);
    sfx(g, 'coin');
    sfx(g, 'explode');
    expect(g.sfx).toEqual(['coin', 'explode']);
  });

  it('shows a banner with a default or custom lifetime', () => {
    const g = createGame(1);
    showBanner(g, 'HI', 'THERE', '#0f0');
    expect(g.banner).toEqual({ text: 'HI', sub: 'THERE', color: '#0f0', life: 2.4 });
    showBanner(g, 'BYE', '', '#f00', 4);
    expect(g.banner).toEqual({ text: 'BYE', sub: '', color: '#f00', life: 4 });
  });
});

describe('updateEffects', () => {
  it('integrates particle gravity and velocity', () => {
    const g = createGame(1);
    g.particles.push(particle({ x: 0, y: 100, vx: 10, vy: 0, gravity: 60, life: 1 }));
    updateEffects(g, 0.5);
    expect(g.particles).toHaveLength(1);
    expect(g.particles[0]).toMatchObject({ x: 5, y: 115, vy: 30, life: 0.5 });
  });

  it('bounces particles off the ground with damping', () => {
    const g = createGame(1);
    g.particles.push(particle({ x: 0, y: GROUND_Y - 1, vx: 10, vy: 100, life: 1 }));
    updateEffects(g, 0.1);
    const p = g.particles[0];
    expect(p.y).toBe(GROUND_Y);
    expect(p.vy).toBeCloseTo(-30);
    expect(p.vx).toBeCloseTo(6);
    expect(p.x).toBeCloseTo(1);
  });

  it('removes expired particles, tracers and texts', () => {
    const g = createGame(1);
    g.particles.push(particle({ life: 0.05 }), particle({ life: 0.1 }), particle({ life: 0.5, color: 'keep' }));
    addTracer(g, 0, 0, 1, 1, '#fff', 1, 0.05);
    addTracer(g, 0, 0, 1, 1, '#abc', 1, 0.2);
    g.texts.push({ x: 0, y: 50, life: 0.05, text: 'gone', color: '#fff' });
    addText(g, 0, 50, 'stay', '#fff');
    updateEffects(g, 0.1);
    expect(g.particles.map((p) => p.color)).toEqual(['keep']);
    expect(g.tracers).toHaveLength(1);
    expect(g.tracers[0].color).toBe('#abc');
    expect(g.tracers[0].life).toBeCloseTo(0.1);
    expect(g.texts).toHaveLength(1);
    expect(g.texts[0].text).toBe('stay');
    expect(g.texts[0].y).toBeCloseTo(50 - 2.2);
    expect(g.texts[0].life).toBeCloseTo(0.8);
  });

  it('counts down the banner and clears it when it expires', () => {
    const g = createGame(1);
    showBanner(g, 'A', 'B', '#fff', 0.15);
    updateEffects(g, 0.1);
    expect(g.banner?.life).toBeCloseTo(0.05);
    updateEffects(g, 0.1);
    expect(g.banner).toBeNull();
    updateEffects(g, 0.1);
    expect(g.banner).toBeNull();
  });

  it('decays screen shake toward zero', () => {
    const g = createGame(1);
    g.shake = 5;
    updateEffects(g, 0.1);
    expect(g.shake).toBeCloseTo(2);
    updateEffects(g, 0.1);
    expect(g.shake).toBe(0);
  });
});
