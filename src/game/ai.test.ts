import { describe, expect, it } from 'vitest';
import { waveGame } from '../test/helpers';
import { aimPoint, alienShot, baseEdge, hoverAt, lob, meleeTarget, strike, tryMelee, walkTo } from './ai';
import { ACID_GRAVITY, ALIENS, BASE_HALF_W, BASE_LEVELS, BASE_X, GROUND_Y, PLAYER_STATS, ROOF_Y, SOLDIER, damageMultiplier, type AlienType } from './config';
import { createAlien, createSoldier } from './state';
import type { Alien, Game } from './types';

function spawn(g: Game, type: AlienType, x: number, y: number = GROUND_Y, over: Partial<Alien> = {}): Alien {
  return Object.assign(createAlien(g, type, x, y, 'active'), over);
}

function playerAt(g: Game, x: number, y: number = GROUND_Y): void {
  g.player.x = x;
  g.player.y = y;
}

describe('baseEdge', () => {
  it.each([
    ['left of the base', BASE_X - BASE_HALF_W - 25, 25],
    ['right of the base', BASE_X + BASE_HALF_W + 10, 10],
    ['inside the base', BASE_X - 10, 10 - BASE_HALF_W],
  ])('measures the gap to the nearest wall when %s', (_label, x, gap) => {
    expect(baseEdge(spawn(waveGame(), 'grunt', x))).toBe(gap);
  });
});

describe('meleeTarget', () => {
  it('prefers a living player in reach over soldiers', () => {
    const g = waveGame();
    playerAt(g, 300);
    createSoldier(g).x = 300;
    expect(meleeTarget(g, spawn(g, 'grunt', 310))).toEqual({ kind: 'player' });
  });

  it('reaches 3px past its body', () => {
    // grunt half-width 5 + reach 3 + player half-width 4 = 12
    const g = waveGame();
    const a = spawn(g, 'grunt', 300);
    playerAt(g, 311.9);
    expect(meleeTarget(g, a)).toEqual({ kind: 'player' });
    playerAt(g, 312);
    expect(meleeTarget(g, a)).toBeNull();
  });

  it('skips a dead player and dead soldiers, picking the first living soldier in reach', () => {
    const g = waveGame();
    playerAt(g, 300);
    g.player.alive = false;
    const dead = createSoldier(g);
    dead.x = 300;
    dead.hp = 0;
    createSoldier(g).x = 100;
    const near = createSoldier(g);
    near.x = 305;
    createSoldier(g).x = 300;
    expect(meleeTarget(g, spawn(g, 'grunt', 310))).toEqual({ kind: 'soldier', s: near });
  });

  it.each([
    ['left', BASE_X - BASE_HALF_W - 7],
    ['right', BASE_X + BASE_HALF_W + 7],
  ])('targets the base wall from the %s', (_side, x) => {
    const g = waveGame();
    expect(meleeTarget(g, spawn(g, 'grunt', x))).toEqual({ kind: 'base' });
  });

  it('returns null when nothing is in reach', () => {
    const g = waveGame();
    expect(meleeTarget(g, spawn(g, 'grunt', BASE_X - BASE_HALF_W - 8))).toBeNull();
  });
});

describe('strike', () => {
  it('hurts the player', () => {
    const g = waveGame();
    strike(g, { kind: 'player' }, 12);
    expect(g.player.hp).toBe(PLAYER_STATS.hp - 12);
    expect(g.sfx).toEqual(['playerHit']);
  });

  it('hurts a soldier', () => {
    const g = waveGame();
    const s = createSoldier(g);
    strike(g, { kind: 'soldier', s }, 12);
    expect(s.hp).toBe(SOLDIER.hp - 12);
    expect(s.flash).toBe(0.1);
    expect(g.player.hp).toBe(PLAYER_STATS.hp);
  });

  it('hurts the base', () => {
    const g = waveGame();
    strike(g, { kind: 'base' }, 12);
    expect(g.base.hp).toBe(BASE_LEVELS[0].hp - 12);
    expect(g.sfx).toEqual(['baseHit']);
  });
});

describe('tryMelee', () => {
  it('reports idle and caps the cooldown so the first hit lands quickly', () => {
    const g = waveGame();
    const slow = spawn(g, 'grunt', 100, GROUND_Y, { atkCd: 2 });
    const quick = spawn(g, 'grunt', 200, GROUND_Y, { atkCd: 0.1 });
    expect(tryMelee(g, slow, ALIENS.grunt, 0.1)).toBe(false);
    expect(tryMelee(g, quick, ALIENS.grunt, 0.1)).toBe(false);
    expect(slow.atkCd).toBe(0.35);
    expect(quick.atkCd).toBe(0.1);
    expect(slow.attacking).toBe(false);
  });

  it('winds up, then strikes for wave-scaled damage and resets the cooldown', () => {
    const g = waveGame();
    g.wave = 4;
    playerAt(g, 300);
    const a = spawn(g, 'grunt', 310, GROUND_Y, { atkCd: 0.3 });
    expect(tryMelee(g, a, ALIENS.grunt, 0.2)).toBe(true);
    expect(a.attacking).toBe(true);
    expect(a.atkCd).toBeCloseTo(0.1);
    expect(g.player.hp).toBe(PLAYER_STATS.hp);

    expect(tryMelee(g, a, ALIENS.grunt, 0.2)).toBe(true);
    expect(a.atkCd).toBe(ALIENS.grunt.attackRate);
    expect(g.player.hp).toBeCloseTo(PLAYER_STATS.hp - ALIENS.grunt.damage * damageMultiplier(4));
  });
});

describe('walkTo', () => {
  it.each([
    ['right', 200, 105, 1],
    ['left', 0, 95, -1],
    ['exactly onto a near target', 102, 102, 1],
    ['nowhere when already there, facing right', 100, 100, 1],
  ])('steps %s', (_label, tx, x, facing) => {
    const a = spawn(waveGame(), 'grunt', 100, GROUND_Y, { facing: -1 });
    walkTo(a, tx, 50, 0.1);
    expect(a.x).toBeCloseTo(x);
    expect(a.facing).toBe(facing);
  });
});

describe('hoverAt', () => {
  it('eases toward the cruising altitude', () => {
    const a = spawn(waveGame(), 'squid', 100, 50, { id: 0, anim: 0 });
    hoverAt(a, 100, 0.1);
    expect(a.y).toBeCloseTo(50 + 50 * 0.3);
    expect(a.x).toBe(100);
  });

  it('bobs up to 6px around the altitude', () => {
    const a = spawn(waveGame(), 'squid', 100, 0, { id: 0, anim: Math.PI / 4 });
    hoverAt(a, 100, 1);
    expect(a.y).toBeCloseTo(106);
  });
});

describe('aimPoint', () => {
  it('aims at the chest of a player in range', () => {
    const g = waveGame();
    playerAt(g, 350);
    expect(aimPoint(g, spawn(g, 'spitter', 300), 100)).toEqual({ x: 350, y: GROUND_Y - 8 });
  });

  it('aims at the near base wall when the player is out of range', () => {
    const g = waveGame();
    playerAt(g, 400);
    expect(aimPoint(g, spawn(g, 'spitter', 300), 100)).toEqual({ x: BASE_X - BASE_HALF_W + 4, y: ROOF_Y + 14 });
  });

  it('aims at the right wall from the right, ignoring a dead player', () => {
    const g = waveGame();
    playerAt(g, 900);
    g.player.alive = false;
    expect(aimPoint(g, spawn(g, 'spitter', 900), 100)).toEqual({ x: BASE_X + BASE_HALF_W - 4, y: ROOF_Y + 14 });
  });
});

describe('alienShot', () => {
  it('fires an alien projectile along the angle', () => {
    const g = waveGame();
    alienShot(g, 'plasma', 10, 20, Math.PI / 2, 100, 9);
    expect(g.projectiles).toEqual([
      { kind: 'plasma', team: 'alien', x: 10, y: 20, vx: Math.cos(Math.PI / 2) * 100, vy: 100, damage: 9, life: 4, gravity: 0, pierce: 1, knock: 0, hit: [] },
    ]);
  });

  it.each(['plasma', 'zap', 'web'] as const)('plays the %s sound', (kind) => {
    const g = waveGame();
    alienShot(g, kind, 0, 0, 0, 100, 1);
    expect(g.projectiles[0].kind).toBe(kind);
    expect(g.sfx).toEqual([kind]);
  });
});

describe('lob', () => {
  it.each([
    ['short', 50, 0.6],
    ['medium', 160, 1],
    ['long', 400, 1.5],
    ['backward', -200, 1.25],
  ])('lands a %s lob on its target', (_label, dx, flight) => {
    const g = waveGame();
    const x = 300;
    const y = 100;
    lob(g, x, y, x + dx, GROUND_Y, 7);
    const p = g.projectiles[0];
    expect(p).toMatchObject({ kind: 'acid', team: 'alien', x, y, damage: 7, gravity: ACID_GRAVITY, pierce: 1, knock: 0, hit: [] });
    expect(p.life).toBeCloseTo(flight + 2);
    expect(x + p.vx * flight).toBeCloseTo(x + dx);
    expect(y + p.vy * flight + 0.5 * ACID_GRAVITY * flight ** 2).toBeCloseTo(GROUND_Y);
    expect(g.sfx).toEqual(['acid']);
  });
});
