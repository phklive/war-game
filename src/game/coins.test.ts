import { describe, expect, it } from 'vitest';
import { COIN_LIFE, GRAVITY, GROUND_Y, WORLD_W } from './config';
import { collectAllCoins, collectCoin, dropCoins, magnetRadius, pickupRadius, updateCoins } from './coins';
import { GOLD } from './effects';
import { createGame } from './state';
import type { Coin, Game } from './types';

function coin(overrides: Partial<Coin> = {}): Coin {
  return { x: 100, y: 100, vx: 0, vy: 0, value: 5, life: COIN_LIFE, grounded: false, magnet: false, ...overrides };
}

/** Player's coin-attraction point (feet minus 7). */
const target = (g: Game): { x: number; y: number } => ({ x: g.player.x, y: g.player.y - 7 });

describe('dropCoins', () => {
  it('drops a single coin for small values', () => {
    const g = createGame(1);
    dropCoins(g, 50, 100, 6);
    expect(g.coins).toHaveLength(1);
    expect(g.coins[0]).toMatchObject({ x: 50, y: 100, value: 6, life: COIN_LIFE, grounded: false, magnet: false });
  });

  it('splits large values into at most 8 coins whose values sum to the total', () => {
    const g = createGame(1);
    dropCoins(g, 50, 100, 300);
    expect(g.coins.map((c) => c.value)).toEqual([38, 38, 38, 38, 37, 37, 37, 37]);
    const g2 = createGame(1);
    dropCoins(g2, 50, 100, 30);
    expect(g2.coins.map((c) => c.value)).toEqual([8, 8, 7, 7]);
  });

  it('never spawns coins below the ground line', () => {
    const g = createGame(1);
    dropCoins(g, 50, GROUND_Y + 10, 6);
    expect(g.coins[0].y).toBe(GROUND_Y - 3);
  });

  it('launches coins upward with random horizontal spread', () => {
    const g = createGame(1);
    g.rng = () => 0;
    dropCoins(g, 50, 100, 6);
    expect(g.coins[0].vx).toBe(-45);
    expect(g.coins[0].vy).toBe(-80);
    g.rng = () => 0.5;
    dropCoins(g, 50, 100, 6);
    expect(g.coins[1].vx).toBe(0);
    expect(g.coins[1].vy).toBe(-125);
  });
});

describe('radii', () => {
  it('grows the pickup radius with magnet level', () => {
    const p = createGame(1).player;
    expect(pickupRadius(p)).toBe(12);
    p.magnetLevel = 2;
    expect(pickupRadius(p)).toBe(40);
  });

  it('has no magnet radius without the upgrade', () => {
    const p = createGame(1).player;
    expect(magnetRadius(p)).toBe(0);
    p.magnetLevel = 1;
    expect(magnetRadius(p)).toBe(60);
    p.magnetLevel = 3;
    expect(magnetRadius(p)).toBe(120);
  });
});

describe('collectCoin', () => {
  it('credits money and stats with text, sparkle and sound', () => {
    const g = createGame(1);
    collectCoin(g, coin({ x: 70, y: 80, value: 7 }));
    expect(g.money).toBe(60 + 7);
    expect(g.stats.earned).toBe(7);
    expect(g.texts).toEqual([{ x: 70, y: 74, text: '+$7', color: '#ffd23f', life: 0.9 }]);
    expect(g.particles).toHaveLength(3);
    expect(g.particles.every((p) => GOLD.includes(p.color) && p.gravity === 0)).toBe(true);
    expect(g.sfx).toEqual(['coin']);
  });
});

describe('collectAllCoins', () => {
  it('collects every coin and empties the list', () => {
    const g = createGame(1);
    g.coins.push(coin({ value: 3 }), coin({ value: 4 }));
    collectAllCoins(g);
    expect(g.coins).toEqual([]);
    expect(g.money).toBe(67);
    expect(g.stats.earned).toBe(7);
    expect(g.sfx).toEqual(['coin', 'coin']);
  });
});

describe('updateCoins', () => {
  it('collects coins within pickup radius of a live player', () => {
    const g = createGame(1);
    const t = target(g);
    g.coins.push(coin({ x: t.x + 5, y: t.y, value: 9 }), coin({ x: 100, y: 100, value: 1 }));
    updateCoins(g, 0.01);
    expect(g.money).toBe(69);
    expect(g.coins).toHaveLength(1);
    expect(g.coins[0].value).toBe(1);
    expect(g.sfx).toEqual(['coin']);
  });

  it('does not let a dead player pick up coins', () => {
    const g = createGame(1);
    g.player.alive = false;
    const t = target(g);
    g.coins.push(coin({ x: t.x, y: t.y, grounded: true }));
    updateCoins(g, 0.1);
    expect(g.money).toBe(60);
    expect(g.coins).toHaveLength(1);
    expect(g.coins[0].life).toBeCloseTo(COIN_LIFE - 0.1);
  });

  it('pulls magnetized coins toward the player quickly without aging them', () => {
    const g = createGame(1);
    const t = target(g);
    g.coins.push(coin({ x: t.x - 100, y: t.y, magnet: true, life: 1 }));
    updateCoins(g, 0.1);
    expect(g.coins[0].x).toBeCloseTo(t.x - 100 + 100 * 0.38);
    expect(g.coins[0].y).toBeCloseTo(t.y);
    expect(g.coins[0].life).toBe(1);
  });

  it('still pulls magnetized coins toward a dead player', () => {
    const g = createGame(1);
    g.player.alive = false;
    const t = target(g);
    g.coins.push(coin({ x: t.x, y: t.y - 100, magnet: true }));
    updateCoins(g, 0.1);
    expect(g.coins[0].y).toBeCloseTo(t.y - 100 + 38);
    expect(g.money).toBe(60);
  });

  it('attracts nearby coins with the magnet upgrade', () => {
    const g = createGame(1);
    g.player.magnetLevel = 1;
    const t = target(g);
    g.coins.push(coin({ x: t.x - 40, y: t.y }));
    updateCoins(g, 0.1);
    expect(g.coins[0].x).toBeCloseTo(t.x - 40 + 40 * 0.55);
    expect(g.coins[0].grounded).toBe(false);
  });

  it('never overshoots the player when attracting', () => {
    const g = createGame(1);
    g.player.magnetLevel = 1;
    const t = target(g);
    g.coins.push(coin({ x: t.x - 50, y: t.y }));
    updateCoins(g, 1);
    expect(g.coins[0].x).toBeCloseTo(t.x);
    expect(g.coins[0].y).toBeCloseTo(t.y);
  });

  it('does not attract coins near a dead player even with the magnet', () => {
    const g = createGame(1);
    g.player.magnetLevel = 1;
    g.player.alive = false;
    const t = target(g);
    g.coins.push(coin({ x: t.x - 40, y: t.y, grounded: true }));
    updateCoins(g, 0.1);
    expect(g.coins[0].x).toBe(t.x - 40);
  });

  it('does not attract coins just outside the pickup radius without the magnet', () => {
    const g = createGame(1);
    const t = target(g);
    g.coins.push(coin({ x: t.x - 13, y: t.y, grounded: true }));
    updateCoins(g, 0.1);
    expect(g.coins[0].x).toBe(t.x - 13);
    expect(g.money).toBe(60);
  });

  it('removes coins whose life runs out', () => {
    const g = createGame(1);
    g.coins.push(coin({ life: 0.05, grounded: true }), coin({ life: 0.1, grounded: true }));
    updateCoins(g, 0.1);
    expect(g.coins).toEqual([]);
    expect(g.money).toBe(60);
  });

  it('applies gravity and velocity to airborne coins', () => {
    const g = createGame(1);
    g.coins.push(coin({ x: 100, y: 100, vx: 30, vy: 0 }));
    updateCoins(g, 0.1);
    expect(g.coins[0].vy).toBeCloseTo(GRAVITY * 0.1);
    expect(g.coins[0].x).toBeCloseTo(103);
    expect(g.coins[0].y).toBeCloseTo(100 + GRAVITY * 0.01);
    expect(g.coins[0].grounded).toBe(false);
  });

  it('keeps coins inside the world horizontally', () => {
    const g = createGame(1);
    g.coins.push(coin({ x: 4, vx: -100 }), coin({ x: WORLD_W - 4, vx: 100 }));
    updateCoins(g, 0.1);
    expect(g.coins[0].x).toBe(3);
    expect(g.coins[1].x).toBe(WORLD_W - 3);
  });

  it('bounces fast-falling coins off the ground', () => {
    const g = createGame(1);
    g.coins.push(coin({ y: GROUND_Y - 4, vx: 10, vy: 300 }));
    updateCoins(g, 0.1);
    const c = g.coins[0];
    expect(c.y).toBe(GROUND_Y - 3);
    expect(c.vy).toBeCloseTo(-(300 + GRAVITY * 0.1) * 0.35);
    expect(c.vx).toBeCloseTo(6);
    expect(c.grounded).toBe(false);
  });

  it('settles slow coins on the ground and then leaves them still', () => {
    const g = createGame(1);
    g.coins.push(coin({ y: GROUND_Y - 3.5, vx: 50, vy: 0 }));
    updateCoins(g, 0.1);
    const c = g.coins[0];
    expect(c.grounded).toBe(true);
    expect(c.y).toBe(GROUND_Y - 3);
    const x = c.x;
    updateCoins(g, 0.1);
    expect(g.coins[0].x).toBe(x);
    expect(g.coins[0].y).toBe(GROUND_Y - 3);
    expect(g.coins[0].life).toBeCloseTo(COIN_LIFE - 0.2);
  });
});
