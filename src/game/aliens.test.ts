import { beforeEach, describe, expect, it, vi } from 'vitest';
import { waveGame } from '../test/helpers';
import type { Ai } from './ai';
import { updateAliens } from './aliens';
import * as bosses from './bosses';
import { ALIENS, ALIEN_ORDER, BUBBLE_POP_DAMAGE, DESCEND_SPEED, DT, FLY_Y, GRAVITY, GROUND_Y, PLAYER_STATS, WORLD_W, speedMultiplier, type AlienType } from './config';
import { BUBBLE, DIRT, DUST } from './effects';
import * as enemies from './enemies';
import { createAlien } from './state';
import type { Alien, Game } from './types';

// Spy on every AI while keeping its real behaviour, so dispatch can be asserted.
vi.mock('./enemies', { spy: true });
vi.mock('./bosses', { spy: true });

/** The AI each alien type must run. */
const AI_OF: Record<AlienType, Ai> = {
  grunt: enemies.walker,
  runner: enemies.runner,
  spitter: enemies.spitter,
  flyer: enemies.flyer,
  squid: enemies.squid,
  drone: enemies.drone,
  hopper: enemies.hopper,
  worm: enemies.worm,
  bug: enemies.bug,
  blob: enemies.blob,
  splitter: enemies.walker,
  mini: enemies.walker,
  crab: enemies.walker,
  brute: enemies.walker,
  carrier: bosses.carrier,
  brood: bosses.brood,
  kraken: bosses.kraken,
  ironcrab: bosses.ironcrab,
  wormking: bosses.wormking,
  overlord: bosses.overlord,
};
const ALL_AIS: Ai[] = [...new Set(Object.values(AI_OF))];

function spawn(g: Game, type: AlienType, x: number, y: number = GROUND_Y, over: Partial<Alien> = {}): Alien {
  return Object.assign(createAlien(g, type, x, y, 'active'), over);
}

function expectNoAi(): void {
  for (const ai of ALL_AIS) expect(ai).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('updateAliens', () => {
  it('updates each living alien once and drops the dead', () => {
    const g = waveGame();
    g.player.alive = false;
    const dead = spawn(g, 'grunt', 300, GROUND_Y, { hp: 0 });
    const live = spawn(g, 'grunt', 100);
    const deadAnim = dead.anim;
    updateAliens(g, DT);
    expect(g.aliens).toEqual([live]);
    expect(dead.anim).toBe(deadAnim);
    expect(dead.x).toBe(300);
    expect(enemies.walker).toHaveBeenCalledOnce();
    expect(enemies.walker).toHaveBeenCalledWith(g, live, ALIENS.grunt, DT, expect.any(Number));
  });

  it('removes aliens that die during their own update', () => {
    const g = waveGame();
    g.player.x = 300;
    g.player.y = GROUND_Y;
    spawn(g, 'blob', 310);
    updateAliens(g, DT);
    expect(g.aliens).toEqual([]);
    expect(g.player.hp).toBe(PLAYER_STATS.hp - ALIENS.blob.damage);
  });

  it('ticks the animation clock and decays hit flash and slow', () => {
    const g = waveGame();
    g.player.alive = false;
    const a = spawn(g, 'grunt', 100, GROUND_Y, { anim: 1, flash: 0.05, slow: 1 });
    updateAliens(g, 0.1);
    expect(a.anim).toBeCloseTo(1.1);
    expect(a.flash).toBe(0);
    expect(a.slow).toBeCloseTo(0.9);
  });

  it('clears the attacking flag before the AI decides again', () => {
    const g = waveGame();
    g.player.alive = false;
    const a = spawn(g, 'grunt', 100, GROUND_Y, { attacking: true });
    updateAliens(g, DT);
    expect(a.attacking).toBe(false);
  });

  describe('AI dispatch', () => {
    it.each(ALIEN_ORDER)('runs the right AI for a %s at wave- and pace-scaled speed', (type) => {
      const g = waveGame();
      g.wave = 5;
      g.player.alive = false;
      const d = ALIENS[type];
      const a = spawn(g, type, 300, d.alt || GROUND_Y);
      const ai = AI_OF[type];
      updateAliens(g, DT);
      expect(ai).toHaveBeenCalledOnce();
      expect(ai).toHaveBeenCalledWith(g, a, d, DT, d.speed * a.pace * speedMultiplier(5));
      for (const other of ALL_AIS) if (other !== ai && other !== enemies.walker) expect(other).not.toHaveBeenCalled();
    });

    it('halves the speed of slowed aliens', () => {
      const g = waveGame();
      const a = spawn(g, 'grunt', 100, GROUND_Y, { slow: 1 });
      updateAliens(g, 0.1);
      expect(enemies.walker).toHaveBeenCalledWith(g, a, ALIENS.grunt, 0.1, ALIENS.grunt.speed * a.pace * speedMultiplier(1) * 0.5);
    });

    it('restores full speed the tick the slow wears off', () => {
      const g = waveGame();
      const a = spawn(g, 'grunt', 100, GROUND_Y, { slow: 0.05 });
      updateAliens(g, 0.1);
      expect(a.slow).toBe(0);
      expect(enemies.walker).toHaveBeenCalledWith(g, a, ALIENS.grunt, 0.1, ALIENS.grunt.speed * a.pace * speedMultiplier(1));
    });
  });

  describe('knockback', () => {
    it('pushes the alien and decays the knock velocity', () => {
      const g = waveGame();
      const a = createAlien(g, 'grunt', 300, 50, 'descend');
      a.kx = 300;
      updateAliens(g, 0.1);
      expect(a.x).toBeCloseTo(330);
      expect(a.kx).toBeCloseTo(300 * Math.exp(-1));
    });

    it('zeroes a knock velocity that falls below 1', () => {
      const g = waveGame();
      const a = createAlien(g, 'grunt', 300, 50, 'descend');
      a.kx = 1.5;
      updateAliens(g, 0.1);
      expect(a.x).toBeCloseTo(300.15);
      expect(a.kx).toBe(0);
    });

    it.each([
      ['right', WORLD_W - 10, 1000, WORLD_W - ALIENS.grunt.w / 2],
      ['left', 10, -1000, ALIENS.grunt.w / 2],
    ])('cannot push an alien out of the %s edge of the world', (_side, x, kx, edge) => {
      const g = waveGame();
      const a = createAlien(g, 'grunt', x, 50, 'descend');
      a.kx = kx;
      updateAliens(g, 0.1);
      expect(a.x).toBe(edge);
    });

    it('applies before the AI moves an active alien', () => {
      const g = waveGame();
      g.player.alive = false;
      const a = spawn(g, 'grunt', 300, GROUND_Y, { kx: -300 });
      updateAliens(g, 0.1);
      const speed = ALIENS.grunt.speed * a.pace;
      expect(a.x).toBeCloseTo(300 - 30 + speed * 0.1);
    });
  });

  describe('descending from a UFO', () => {
    it('sinks at a fixed speed without running its AI, then lands with dust', () => {
      const g = waveGame();
      const a = createAlien(g, 'brute', 300, 100, 'descend');
      updateAliens(g, 0.5);
      expect(a.y).toBeCloseTo(100 + DESCEND_SPEED * 0.5);
      expect(a.state).toBe('descend');
      expect(g.particles).toHaveLength(0);

      updateAliens(g, 5);
      expect(a).toMatchObject({ y: GROUND_Y, state: 'active', x: 300, burrowed: false });
      expect(g.particles).toHaveLength(6 * ALIENS.brute.scale);
      expect(g.particles.every((p) => DUST.includes(p.color))).toBe(true);
      expect(g.sfx).toEqual([]);
      expectNoAi();
    });

    it.each(['flyer', 'kraken'] as const)('stops a %s at its cruising altitude without kicking up dust', (type) => {
      const g = waveGame();
      const a = createAlien(g, type, 300, 30, 'descend');
      updateAliens(g, 5);
      expect(a.y).toBe(ALIENS[type].alt);
      expect(a.state).toBe('active');
      expect(g.particles).toHaveLength(0);
      expectNoAi();
    });

    it('burrows a worm straight into the ground on landing', () => {
      const g = waveGame();
      const a = createAlien(g, 'worm', 300, GROUND_Y - 1, 'descend');
      updateAliens(g, 0.1);
      expect(a).toMatchObject({ y: GROUND_Y, state: 'active', burrowed: true });
      expect(g.particles).toHaveLength(6 + 10);
      expect(g.particles.slice(6).every((p) => DIRT.includes(p.color))).toBe(true);
      expect(g.sfx).toEqual(['burrow']);
      expectNoAi();
    });
  });

  describe('bubble trap', () => {
    it('floats a trapped alien upward without acting', () => {
      const g = waveGame();
      const a = spawn(g, 'brute', 300, 200, { trap: 1 });
      updateAliens(g, 0.1);
      expect(a.trap).toBeCloseTo(0.9);
      expect(a.y).toBeCloseTo(200 - 2.4);
      expect(a.x).toBe(300);
      expect(a.hp).toBe(a.maxHp);
      expect(g.sfx).toEqual([]);
      expectNoAi();
    });

    it('never floats above y=50', () => {
      const g = waveGame();
      const a = spawn(g, 'brute', 300, 51, { trap: 1 });
      updateAliens(g, 0.1);
      expect(a.y).toBe(50);
    });

    it('pops when the trap expires, damaging the alien', () => {
      const g = waveGame();
      const a = spawn(g, 'brute', 300, 200, { trap: 0.05 });
      updateAliens(g, 0.1);
      expect(a.trap).toBe(0);
      expect(a.hp).toBeCloseTo(a.maxHp - BUBBLE_POP_DAMAGE);
      expect(g.sfx).toEqual(['pop']);
      expect(g.particles.filter((p) => BUBBLE.includes(p.color)).length).toBeGreaterThanOrEqual(10);
      expectNoAi();
    });

    it('credits the player when the pop kills the alien', () => {
      const g = waveGame();
      spawn(g, 'grunt', 300, 200, { trap: 0.05 });
      updateAliens(g, 0.1);
      expect(g.aliens).toHaveLength(0);
      expect(g.player.kills).toBe(1);
      expect(g.sfx).toEqual(['pop', 'alienDie']);
      expect(g.coins.length).toBeGreaterThan(0);
    });
  });

  describe('falling', () => {
    it('drops airborne ground aliens under gravity until they hit the ground', () => {
      const g = waveGame();
      const a = spawn(g, 'grunt', 300, 150);
      updateAliens(g, 0.1);
      expect(a.vy).toBeCloseTo(GRAVITY * 0.1);
      expect(a.y).toBeCloseTo(150 + GRAVITY * 0.01);
      expect(a.x).toBe(300);
      expectNoAi();

      updateAliens(g, 1);
      expect(a.y).toBe(GROUND_Y);
      expect(a.vy).toBe(0);
      expectNoAi();
    });

    it('leaves flying aliens to their AI', () => {
      const g = waveGame();
      const a = spawn(g, 'flyer', 100, FLY_Y);
      updateAliens(g, 0.1);
      expect(a.vy).toBe(0);
      expect(enemies.flyer).toHaveBeenCalledOnce();
    });

    it('lets hoppers handle their own jump arcs', () => {
      const g = waveGame();
      const a = spawn(g, 'hopper', 300, 150);
      updateAliens(g, 0.1);
      expect(enemies.hopper).toHaveBeenCalledOnce();
      expect(a.vy).toBeCloseTo(GRAVITY * 0.1);
    });
  });
});
