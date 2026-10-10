import { describe, expect, it, vi } from 'vitest';
import { idleInput, ticks, waveGame } from '../test/helpers';
import { ALIENS, BASE_HALF_W, BASE_X, BOSS_DELAY, CLEAR_TIME, DT, ELITE_HP, FLY_Y, GROUND_Y, PLAYER_STATS, PRICES, START_MONEY, TOTAL_WAVES, VIEW_W, hpMultiplier, waveBonus } from './config';
import { killAlien } from './combat';
import { BUBBLE, FIRE, GOLD, SMOKE } from './effects';
import { createAlien, createGame } from './state';
import type { Coin, Game, PendingBoss, Projectile, Ufo } from './types';
import { step } from './update';

/** An rng that replays the given values in a loop. */
function seq(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

function coin(over: Partial<Coin> = {}): Coin {
  return { x: 100, y: GROUND_Y - 3, vx: 0, vy: 0, value: 7, life: 20, grounded: true, magnet: false, ...over };
}

function shot(over: Partial<Projectile> = {}): Projectile {
  return { kind: 'bullet', team: 'player', x: 100, y: 100, vx: 0, vy: 0, damage: 1, life: 5, gravity: 0, pierce: 1, knock: 0, hit: [], ...over };
}

function idleUfo(): Ufo {
  return { x: 300, y: 22, state: 'idle', timer: 100, targetX: 0, cargo: null, anim: 0 };
}

/** A wave in progress that cannot end on its own (one alien is still queued with no UFO to carry it). */
function busyWave(): Game {
  const g = waveGame();
  g.spawnQueue = ['grunt'];
  return g;
}

/** A wave whose horde is already cleared, with its boss still to come. */
function bossWave(over: Partial<PendingBoss> = {}): Game {
  const g = waveGame();
  g.pendingBoss = { type: 'brood', elite: false, timer: BOSS_DELAY, announced: false, ...over };
  return g;
}

/** Steps until the pending boss has been dropped in; returns the number of ticks taken. */
function runUntilBoss(g: Game, max = 1000): number {
  let n = 0;
  while (g.pendingBoss && n < max) {
    step(g, idleInput(), DT);
    n++;
  }
  return n;
}

function runWhile(g: Game, phase: Game['phase'], max = 1000): number {
  let n = 0;
  while (g.phase === phase && n < max) {
    step(g, idleInput(), DT);
    n++;
  }
  return n;
}

describe('step', () => {
  it('always advances the clock', () => {
    const g = createGame(1);
    step(g, idleInput(), DT);
    step(g, idleInput(), DT);
    expect(g.time).toBeCloseTo(2 * DT);
  });

  describe('title', () => {
    it('waits for confirmation', () => {
      const g = createGame(1);
      step(g, idleInput({ pressed: ['KeyA'] }), DT);
      expect(g.phase).toBe('title');
      expect(g.wave).toBe(0);
    });

    it.each([
      ['Enter', idleInput({ pressed: ['Enter'] })],
      ['a click', idleInput({ clicks: [{ x: 10, y: 10 }] })],
    ])('starts wave 1 on %s', (_label, input) => {
      const g = createGame(1);
      step(g, input, DT);
      expect(g.phase).toBe('wave');
      expect(g.wave).toBe(1);
      expect(g.spawnQueue).toHaveLength(14);
      expect(g.pendingBoss).toEqual({ type: 'carrier', elite: false, timer: BOSS_DELAY, announced: false });
      expect(g.sfx).toEqual(['waveStart']);
    });
  });

  describe('wave', () => {
    it('simulates the world', () => {
      const g = busyWave();
      const a = createAlien(g, 'grunt', 100, GROUND_Y, 'active');
      g.ufos = [idleUfo()];
      step(g, idleInput({ right: true }), DT);
      expect(g.phase).toBe('wave');
      expect(g.player.x).toBeCloseTo(BASE_X + PLAYER_STATS.speed * DT);
      expect(a.x).toBeGreaterThan(100);
      expect(g.ufos[0].anim).toBeCloseTo(DT);
    });

    it('pauses and resumes with P or Escape', () => {
      const g = busyWave();
      step(g, idleInput({ pressed: ['KeyP'], right: true }), DT);
      expect(g.paused).toBe(true);
      expect(g.player.x).toBe(BASE_X);

      step(g, idleInput({ right: true }), DT);
      expect(g.paused).toBe(true);
      expect(g.player.x).toBe(BASE_X);
      expect(g.time).toBeCloseTo(2 * DT);

      step(g, idleInput({ pressed: ['Escape'], right: true }), DT);
      expect(g.paused).toBe(false);
      expect(g.player.x).toBeCloseTo(BASE_X + PLAYER_STATS.speed * DT);
    });

    it('eases the camera toward the player, leaning toward the mouse', () => {
      const g = busyWave();
      const cam = g.camX;
      step(g, idleInput(), DT);
      expect(g.camX).toBe(cam);
      step(g, idleInput({ mouseX: VIEW_W }), 0.1);
      expect(g.camX).toBeCloseTo(cam + (VIEW_W / 2) * 0.3 * 0.6);
    });

    it('focuses the camera on the base while the player is dead', () => {
      const g = busyWave();
      Object.assign(g.player, { alive: false, respawn: 10, x: 100, y: GROUND_Y });
      g.camX = 0;
      step(g, idleInput(), 0.1);
      expect(g.camX).toBeCloseTo((BASE_X - VIEW_W / 2) * 0.6);

      const alive = busyWave();
      Object.assign(alive.player, { x: 100, y: GROUND_Y });
      alive.camX = 0;
      step(alive, idleInput(), 0.1);
      expect(alive.camX).toBe(0);
    });

    it('is lost when an alien destroys the base', () => {
      const g = waveGame();
      g.base.hp = 1;
      createAlien(g, 'grunt', BASE_X - BASE_HALF_W - 7, GROUND_Y, 'active').atkCd = 0;
      step(g, idleInput(), DT);
      expect(g.base.hp).toBe(0);
      expect(g.phase).toBe('gameover');
      expect(g.phaseTimer).toBe(1.5);
      expect(g.shake).toBe(14);
      expect(g.sfx.slice(-2)).toEqual(['explode', 'lose']);
      expect(g.particles.filter((p) => FIRE.includes(p.color))).toHaveLength(6 * 14);
      expect(g.particles.filter((p) => SMOKE.includes(p.color)).length).toBeGreaterThanOrEqual(30);
    });

    it('is lost rather than cleared when the base falls with the last alien', () => {
      const g = waveGame();
      g.base.hp = 0;
      step(g, idleInput(), DT);
      expect(g.phase).toBe('gameover');
    });

    it('is lost rather than calling in the boss when the base falls', () => {
      const g = bossWave();
      g.base.hp = 0;
      step(g, idleInput(), DT);
      expect(g.phase).toBe('gameover');
      expect(g.pendingBoss).toMatchObject({ announced: false, timer: BOSS_DELAY });
      expect(g.sfx).not.toContain('boss');
    });

    it('is cleared once the boss and every alien are dealt with', () => {
      const g = waveGame();
      const c = coin();
      const mine = shot({ x: BASE_X });
      g.coins = [c];
      g.projectiles = [mine, shot({ kind: 'plasma', team: 'alien', x: 900 })];
      g.ufos = [idleUfo()];
      Object.assign(g.player, { alive: false, respawn: 3, x: 100, y: GROUND_Y });
      step(g, idleInput(), DT);
      const bonus = waveBonus(1);
      expect(g.phase).toBe('clear');
      expect(g.phaseTimer).toBe(CLEAR_TIME);
      expect(g.money).toBe(START_MONEY + bonus);
      expect(g.stats.earned).toBe(bonus);
      expect(g.player.alive).toBe(true);
      expect(g.player.x).toBe(BASE_X);
      expect(c.magnet).toBe(true);
      expect(g.ufos[0].state).toBe('leave');
      expect(g.projectiles).toEqual([mine]);
      expect(g.banner).toMatchObject({ text: 'WAVE 1 CLEARED!', sub: `BONUS +$${bonus}` });
      expect(g.sfx).toContain('waveClear');
    });

    it('does not respawn a living player on clear', () => {
      const g = waveGame();
      g.player.x = 300;
      g.player.y = GROUND_Y;
      step(g, idleInput(), DT);
      expect(g.phase).toBe('clear');
      expect(g.player.x).toBe(300);
      expect(g.particles).toHaveLength(0);
    });
  });

  describe('boss phase', () => {
    it('holds the boss back while any of the horde remains', () => {
      const g = bossWave();
      g.spawnQueue = ['grunt'];
      step(g, idleInput(), DT);
      expect(g.phase).toBe('wave');
      expect(g.pendingBoss).toEqual({ type: 'brood', elite: false, timer: BOSS_DELAY, announced: false });
      expect(g.sfx).toEqual([]);
    });

    it('announces the boss once the horde is cleared, instead of clearing the wave', () => {
      const g = bossWave();
      step(g, idleInput(), DT);
      expect(g.phase).toBe('wave');
      expect(g.pendingBoss).toMatchObject({ type: 'brood', announced: true });
      expect(g.pendingBoss?.timer).toBeCloseTo(BOSS_DELAY - DT);
      expect(g.banner).toEqual({ text: 'BOSS INCOMING!', sub: ALIENS.brood.name, color: '#ff4040', life: 2.6 });
      expect(g.sfx).toEqual(['boss']);
      expect(g.money).toBe(START_MONEY);
      expect(g.aliens).toHaveLength(0);

      step(g, idleInput(), DT);
      expect(g.sfx).toEqual(['boss']);
      expect(g.pendingBoss?.timer).toBeCloseTo(BOSS_DELAY - 2 * DT);
    });

    it('drops the boss in after the delay, and only clears the wave once it is dead', () => {
      const g = bossWave();
      const n = runUntilBoss(g);
      expect(Math.abs(n - ticks(BOSS_DELAY))).toBeLessThanOrEqual(1);
      expect(g.phase).toBe('wave');
      expect(g.aliens).toHaveLength(1);
      const boss = g.aliens[0];
      expect(boss).toMatchObject({ type: 'brood', elite: false });
      expect(boss.hp).toBeCloseTo(ALIENS.brood.hp * hpMultiplier(1));
      expect(g.banner?.text).toBe(ALIENS.brood.name);

      for (let i = 0; i < 30; i++) step(g, idleInput(), DT);
      expect(g.phase).toBe('wave');
      expect(g.sfx).not.toContain('waveClear');

      killAlien(g, boss, 'player');
      step(g, idleInput(), DT);
      expect(g.aliens).toHaveLength(0);
      expect(g.phase).toBe('clear');
      expect(g.money).toBe(START_MONEY + waveBonus(1));
      expect(g.sfx).toContain('waveClear');
    });

    it('drops an elite boss with extra health', () => {
      const g = bossWave({ type: 'carrier', elite: true });
      g.wave = 6;
      step(g, idleInput(), DT);
      expect(g.banner?.sub).toBe(`ELITE ${ALIENS.carrier.name}`);
      runUntilBoss(g);
      expect(g.aliens).toHaveLength(1);
      expect(g.aliens[0]).toMatchObject({ type: 'carrier', elite: true });
      expect(g.aliens[0].maxHp).toBeCloseTo(ALIENS.carrier.hp * hpMultiplier(6) * ELITE_HP);
    });

    it('keeps the wave going while the boss spawns minions after the horde', () => {
      const g = bossWave();
      runUntilBoss(g);
      createAlien(g, 'bug', 100, 140, 'active');
      killAlien(g, g.aliens[0], 'player');
      step(g, idleInput(), DT);
      expect(g.phase).toBe('wave');
      expect(g.aliens.map((a) => a.type)).toEqual(['bug']);
    });
  });

  describe('clear', () => {
    it('keeps the world running until the timer expires', () => {
      const g = waveGame();
      g.phase = 'clear';
      g.phaseTimer = 1;
      step(g, idleInput({ right: true }), DT);
      expect(g.phase).toBe('clear');
      expect(g.phaseTimer).toBeCloseTo(1 - DT);
      expect(g.player.x).toBeCloseTo(BASE_X + PLAYER_STATS.speed * DT);
    });

    it('collects leftover coins, clears shots and opens the shop', () => {
      const g = waveGame();
      g.phase = 'clear';
      g.phaseTimer = 0.001;
      g.coins = [coin({ magnet: true })];
      g.projectiles = [shot()];
      step(g, idleInput(), DT);
      expect(g.phase).toBe('shop');
      expect(g.money).toBe(START_MONEY + 7);
      expect(g.coins).toEqual([]);
      expect(g.projectiles).toEqual([]);
      expect(g.sfx).toContain('coin');
    });

    it('moves from a cleared wave to the shop after the clear delay', () => {
      const g = waveGame();
      step(g, idleInput(), DT);
      const n = runWhile(g, 'clear');
      expect(Math.abs(n - ticks(CLEAR_TIME))).toBeLessThanOrEqual(1);
      expect(g.phase).toBe('shop');
    });

    it('wins the game after clearing the final wave', () => {
      const g = waveGame();
      g.wave = TOTAL_WAVES;
      step(g, idleInput(), DT);
      expect(g.money).toBe(START_MONEY + waveBonus(TOTAL_WAVES));
      runWhile(g, 'clear');
      expect(g.phase).toBe('victory');
      expect(g.phaseTimer).toBe(1.5);
      expect(g.banner).toEqual({ text: 'VICTORY!', sub: 'EARTH IS SAFE... FOR NOW', color: '#ffd23f', life: 4 });
      expect(g.sfx).toContain('win');
    });
  });

  describe('shop', () => {
    it('handles purchases and keeps effects animating', () => {
      const g = waveGame();
      g.phase = 'shop';
      g.money = 100;
      g.texts.push({ x: 0, y: 0, life: 0.01, text: '+$1', color: '#fff' });
      step(g, idleInput({ pressed: ['Digit6'] }), DT);
      expect(g.player.armorLevel).toBe(1);
      expect(g.money).toBe(100 - PRICES.armor[0]);
      expect(g.texts).toEqual([]);
    });

    it('starts the next wave on Enter', () => {
      const g = waveGame();
      g.phase = 'shop';
      step(g, idleInput({ pressed: ['Enter'] }), DT);
      expect(g.phase).toBe('wave');
      expect(g.wave).toBe(2);
    });
  });

  describe('game over', () => {
    function overGame(timer: number): Game {
      const g = waveGame();
      g.phase = 'gameover';
      g.phaseTimer = timer;
      g.wave = 5;
      g.money = 999;
      return g;
    }

    it('shows no fireworks', () => {
      const g = overGame(1);
      const rng = vi.fn(() => 0);
      g.rng = rng;
      step(g, idleInput(), DT);
      expect(rng).not.toHaveBeenCalled();
      expect(g.particles).toHaveLength(0);
      expect(g.phaseTimer).toBeCloseTo(1 - DT);
    });

    it('ignores confirmation until the delay has passed', () => {
      const g = overGame(1);
      step(g, idleInput({ pressed: ['Enter'] }), DT);
      expect(g.phase).toBe('gameover');
    });

    it('waits for confirmation once the delay has passed', () => {
      const g = overGame(0.001);
      step(g, idleInput(), DT);
      expect(g.phase).toBe('gameover');
      expect(g.phaseTimer).toBeLessThan(0);
    });

    it('restarts from the title screen when confirmed', () => {
      const g = overGame(0.001);
      step(g, idleInput({ clicks: [{ x: 1, y: 1 }] }), DT);
      expect(g.phase).toBe('title');
      expect(g.wave).toBe(0);
      expect(g.money).toBe(START_MONEY);
      expect(g.time).toBe(0);
    });
  });

  describe('victory', () => {
    function wonGame(): Game {
      const g = waveGame();
      g.phase = 'victory';
      g.phaseTimer = 10;
      return g;
    }

    it('launches golden fireworks', () => {
      const g = wonGame();
      g.rng = () => 0;
      step(g, idleInput(), DT);
      expect(g.particles).toHaveLength(30);
      expect(g.particles.every((p) => GOLD.includes(p.color))).toBe(true);
      expect(g.sfx).toEqual(['pop']);
    });

    it('launches bubbly fireworks across the sky', () => {
      const g = wonGame();
      g.rng = seq(0, 0.5, 0.5, 0.75);
      step(g, idleInput(), 0.001);
      expect(g.particles).toHaveLength(30);
      expect(g.particles.every((p) => BUBBLE.includes(p.color))).toBe(true);
      const xs = g.particles.map((p) => p.x);
      expect(Math.min(...xs)).toBeGreaterThan(g.camX + 40 + 0.5 * (VIEW_W - 80) - 1);
      expect(Math.max(...xs)).toBeLessThan(g.camX + 40 + 0.5 * (VIEW_W - 80) + 1);
      expect(g.particles[0].y).toBeLessThan(FLY_Y);
    });

    it('only sometimes launches fireworks', () => {
      const g = wonGame();
      g.rng = () => 0.5;
      step(g, idleInput(), DT);
      expect(g.particles).toHaveLength(0);
      expect(g.sfx).toEqual([]);
    });

    it('restarts when confirmed after the delay', () => {
      const g = wonGame();
      g.phaseTimer = 0.001;
      step(g, idleInput({ pressed: ['Enter'] }), DT);
      expect(g.phase).toBe('title');
    });
  });
});
