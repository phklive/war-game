import { describe, expect, it } from 'vitest';
import { waveGame } from '../test/helpers';
import type { Ai } from './ai';
import { ALIENS, BASE_HALF_W, BASE_LEVELS, BASE_X, DT, GRAVITY, GROUND_Y, PLAYER_STATS, ROOF_Y, WORLD_W, ZAP_SPEED, damageMultiplier, type AlienType } from './config';
import { DIRT, DUST } from './effects';
import { blob, bug, drone, flyer, hopper, runner, spitter, squid, walker, worm } from './enemies';
import { createAlien } from './state';
import type { Alien, Game, Point, Projectile } from './types';

const HOP_AIR = (2 * 380) / GRAVITY;
const LEFT_WALL: Point = { x: BASE_X - BASE_HALF_W + 4, y: ROOF_Y + 14 };
const RIGHT_WALL: Point = { x: BASE_X + BASE_HALF_W - 4, y: ROOF_Y + 14 };

function spawn(g: Game, type: AlienType, x: number, y: number = GROUND_Y, over: Partial<Alien> = {}): Alien {
  return Object.assign(createAlien(g, type, x, y, 'active'), over);
}

/** Run one AI tick at the alien's base speed (or an explicit one). */
function step(g: Game, a: Alien, ai: Ai, dt: number, speed: number = ALIENS[a.type].speed): void {
  ai(g, a, ALIENS[a.type], dt, speed);
}

function playerAt(g: Game, x: number, y: number = GROUND_Y): void {
  g.player.x = x;
  g.player.y = y;
}

/** A game with the player out of the picture so aliens go for the base. */
function noPlayer(): Game {
  const g = waveGame();
  g.player.alive = false;
  return g;
}

const angleOf = (p: Projectile): number => Math.atan2(p.vy, p.vx);
const speedOf = (p: Projectile): number => Math.hypot(p.vx, p.vy);
/** Where a ballistic acid glob comes back down (life = flight time + 2). */
const landingX = (p: Projectile): number => p.x + p.vx * (p.life - 2);

describe('walker', () => {
  it('marches on the base from either side', () => {
    const g = noPlayer();
    const left = spawn(g, 'grunt', 100);
    const right = spawn(g, 'grunt', 1100);
    step(g, left, walker, 0.1, 40);
    step(g, right, walker, 0.1, 40);
    expect(left.x).toBeCloseTo(104);
    expect(left.facing).toBe(1);
    expect(left.attacking).toBe(false);
    expect(right.x).toBeCloseTo(1096);
    expect(right.facing).toBe(-1);
  });

  it('stops to hit whatever is in reach', () => {
    const g = waveGame();
    playerAt(g, 300);
    const a = spawn(g, 'grunt', 310, GROUND_Y, { atkCd: 0 });
    step(g, a, walker, DT);
    expect(a.x).toBe(310);
    expect(a.attacking).toBe(true);
    expect(g.player.hp).toBe(PLAYER_STATS.hp - ALIENS.grunt.damage);
  });
});

describe('runner', () => {
  it('peels off to chase a grounded player within 130px', () => {
    const g = waveGame();
    playerAt(g, 250, GROUND_Y - 4);
    const a = spawn(g, 'runner', 300);
    step(g, a, runner, 0.1);
    expect(a.x).toBeCloseTo(300 - ALIENS.runner.speed * 0.1);
    expect(a.facing).toBe(-1);
  });

  it.each([
    ['the player is dead', (g: Game) => (g.player.alive = false)],
    ['the player is airborne', (g: Game) => (g.player.y = GROUND_Y - 5)],
    ['the player is 130px away', (g: Game) => (g.player.x = 170)],
  ])('heads for the base when %s', (_label, tweak) => {
    const g = waveGame();
    playerAt(g, 250);
    tweak(g);
    const a = spawn(g, 'runner', 300);
    step(g, a, runner, 0.1);
    expect(a.x).toBeCloseTo(300 + ALIENS.runner.speed * 0.1);
    expect(a.facing).toBe(1);
  });

  it('stands and fights a target in reach', () => {
    const g = waveGame();
    playerAt(g, 300);
    const a = spawn(g, 'runner', 308, GROUND_Y, { atkCd: 0 });
    step(g, a, runner, DT);
    expect(a.x).toBe(308);
    expect(g.player.hp).toBe(PLAYER_STATS.hp - ALIENS.runner.damage);
  });
});

describe('spitter', () => {
  const d = ALIENS.spitter;

  it('advances on the base without attacking while nothing is in range', () => {
    const g = noPlayer();
    const left = spawn(g, 'spitter', 100, GROUND_Y, { special: 1 });
    const right = spawn(g, 'spitter', 1100, GROUND_Y, { special: 1 });
    step(g, left, spitter, 0.1);
    step(g, right, spitter, 0.1);
    expect(left.x).toBeCloseTo(100 + d.speed * 0.1);
    expect(left.facing).toBe(1);
    expect(left.attacking).toBe(false);
    expect(left.special).toBeCloseTo(0.9);
    expect(right.x).toBeCloseTo(1100 - d.speed * 0.1);
    expect(right.facing).toBe(-1);
    expect(g.projectiles).toHaveLength(0);
  });

  it('ignores a living player beyond its range', () => {
    const g = waveGame();
    playerAt(g, 100);
    const a = spawn(g, 'spitter', 300, GROUND_Y, { special: 0 });
    step(g, a, spitter, 0.1);
    expect(a.attacking).toBe(false);
    expect(g.projectiles).toHaveLength(0);
  });

  it('spits wave-scaled plasma at a nearby player while still advancing', () => {
    const g = waveGame();
    g.wave = 3;
    playerAt(g, 300);
    const a = spawn(g, 'spitter', 200, GROUND_Y, { special: 0.05 });
    step(g, a, spitter, 0.1);
    const x = 200 + d.speed * 0.1;
    expect(a.x).toBeCloseTo(x);
    expect(a.attacking).toBe(true);
    expect(a.facing).toBe(1);
    expect(a.special).toBe(d.attackRate);
    expect(g.projectiles).toHaveLength(1);
    const p = g.projectiles[0];
    expect(p).toMatchObject({ kind: 'plasma', team: 'alien', y: GROUND_Y - 11 });
    expect(p.damage).toBeCloseTo(d.damage * damageMultiplier(3));
    expect(p.x).toBeCloseTo(x);
    expect(speedOf(p)).toBeCloseTo(210);
    expect(angleOf(p)).toBeCloseTo(Math.atan2(3, 300 - x));
    expect(g.sfx).toEqual(['plasma']);
  });

  it('turns to face a player behind it and holds fire while reloading', () => {
    const g = waveGame();
    playerAt(g, 300);
    const a = spawn(g, 'spitter', 400, GROUND_Y, { special: 5 });
    step(g, a, spitter, 0.1);
    expect(a.x).toBeCloseTo(400 + d.speed * 0.1);
    expect(a.facing).toBe(-1);
    expect(a.attacking).toBe(true);
    expect(a.special).toBeCloseTo(4.9);
    expect(g.projectiles).toHaveLength(0);
  });

  it('holds position within 75% of its range and shells the base', () => {
    const g = noPlayer();
    const x = BASE_X - BASE_HALF_W - 100;
    const a = spawn(g, 'spitter', x, GROUND_Y, { special: 0 });
    step(g, a, spitter, 0.1);
    expect(a.x).toBe(x);
    expect(a.facing).toBe(1);
    expect(g.projectiles).toHaveLength(1);
    expect(angleOf(g.projectiles[0])).toBeCloseTo(Math.atan2(LEFT_WALL.y - (GROUND_Y - 11), LEFT_WALL.x - x));
  });

  it('keeps closing in while shelling from the edge of its range', () => {
    const g = noPlayer();
    const a = spawn(g, 'spitter', BASE_X + BASE_HALF_W + 130, GROUND_Y, { special: 0 });
    step(g, a, spitter, 0.1);
    const x = BASE_X + BASE_HALF_W + 130 - d.speed * 0.1;
    expect(a.x).toBeCloseTo(x);
    expect(a.facing).toBe(-1);
    expect(angleOf(g.projectiles[0])).toBeCloseTo(Math.atan2(RIGHT_WALL.y - (GROUND_Y - 11), RIGHT_WALL.x - x));
  });
});

describe('flyer', () => {
  const d = ALIENS.flyer;

  it('cruises toward the base at flying altitude from afar', () => {
    const g = noPlayer();
    const left = spawn(g, 'flyer', 100, d.alt, { id: 3, anim: 0 });
    const right = spawn(g, 'flyer', 1100, d.alt, { id: 10, anim: 0 });
    step(g, left, flyer, 0.1);
    step(g, right, flyer, 0.1);
    expect(left.x).toBeCloseTo(100 + d.speed * 0.1);
    expect(left.y).toBe(d.alt);
    expect(left.facing).toBe(1);
    expect(right.x).toBeCloseTo(1100 - d.speed * 0.1);
    expect(right.facing).toBe(-1);
  });

  it('bobs while cruising', () => {
    const g = noPlayer();
    const a = spawn(g, 'flyer', 100, d.alt, { id: 3, anim: Math.PI / 6 });
    step(g, a, flyer, 0.1);
    const k = (d.speed * 0.1) / Math.hypot(BASE_X - 100, 6);
    expect(a.x).toBeCloseTo(100 + (BASE_X - 100) * k);
    expect(a.y).toBeCloseTo(d.alt + 6 * k);
  });

  it('dives onto the roof once within 70px of the base', () => {
    const g = noPlayer();
    const a = spawn(g, 'flyer', BASE_X + 70, d.alt, { id: 3 });
    step(g, a, flyer, 0.1);
    const dy = ROOF_Y + 3 - d.alt;
    const k = (d.speed * 0.1) / Math.hypot(70, dy);
    expect(a.x).toBeCloseTo(BASE_X + 70 - 70 * k);
    expect(a.y).toBeCloseTo(d.alt + dy * k);
    expect(a.facing).toBe(-1);
  });

  it.each([
    [3, 0],
    [5, 18],
    [0, -27],
    [6, 27],
  ])('lands exactly on its roof slot (id %d -> %d)', (id, offset) => {
    const g = noPlayer();
    const a = spawn(g, 'flyer', BASE_X + offset + 2, ROOF_Y - 1, { id });
    step(g, a, flyer, 0.1);
    expect(a.x).toBe(BASE_X + offset);
    expect(a.y).toBe(ROOF_Y + 3);
  });

  it('attacks the base from the roof instead of moving', () => {
    const g = noPlayer();
    const a = spawn(g, 'flyer', BASE_X, ROOF_Y + 3, { id: 3, atkCd: 0 });
    step(g, a, flyer, DT);
    expect(a.attacking).toBe(true);
    expect(a.x).toBe(BASE_X);
    expect(g.base.hp).toBe(BASE_LEVELS[0].hp - d.damage);
  });
});

describe('squid', () => {
  const d = ALIENS.squid;

  it('floats up to its altitude and drifts toward the base while out of range', () => {
    const g = noPlayer();
    const a = spawn(g, 'squid', 100, 50, { id: 0, anim: 0, special: 1 });
    step(g, a, squid, 0.1);
    expect(a.y).toBeCloseTo(50 + (d.alt - 50) * 0.3);
    expect(a.x).toBeCloseTo(100 + d.speed * 0.1);
    expect(a.special).toBeCloseTo(0.9);
    expect(a.attacking).toBe(false);
    expect(g.projectiles).toHaveLength(0);
  });

  it('holds fire beyond 1.25x its range even when reloaded', () => {
    const g = noPlayer();
    const a = spawn(g, 'squid', BASE_X - BASE_HALF_W - 250, d.alt, { special: 0 });
    step(g, a, squid, 0.1);
    expect(a.x).toBeCloseTo(BASE_X - BASE_HALF_W - 250 + d.speed * 0.1);
    expect(g.projectiles).toHaveLength(0);
  });

  it('lobs acid at the base while closing the last stretch', () => {
    const g = noPlayer();
    const a = spawn(g, 'squid', BASE_X - BASE_HALF_W - 200, d.alt, { special: 0 });
    step(g, a, squid, 0.1);
    expect(a.x).toBeCloseTo(BASE_X - BASE_HALF_W - 200 + d.speed * 0.1);
    expect(a.special).toBe(d.attackRate);
    expect(a.attacking).toBe(true);
    expect(g.projectiles).toHaveLength(1);
    const p = g.projectiles[0];
    expect(p).toMatchObject({ kind: 'acid', team: 'alien', x: a.x, y: a.y - 2, damage: d.damage });
    expect(landingX(p)).toBeCloseTo(LEFT_WALL.x);
    expect(g.sfx).toEqual(['acid']);
  });

  it('hovers in range and lobs at a nearby player', () => {
    const g = waveGame();
    g.wave = 5;
    playerAt(g, 520);
    const x = BASE_X - BASE_HALF_W - 100;
    const a = spawn(g, 'squid', x, d.alt, { special: 0 });
    step(g, a, squid, 0.1);
    expect(a.x).toBe(x);
    const p = g.projectiles[0];
    expect(landingX(p)).toBeCloseTo(520);
    expect(p.damage).toBeCloseTo(d.damage * damageMultiplier(5));
  });

  it('waits for its reload', () => {
    const g = noPlayer();
    const a = spawn(g, 'squid', BASE_X - BASE_HALF_W - 100, d.alt, { special: 1 });
    step(g, a, squid, 0.1);
    expect(a.special).toBeCloseTo(0.9);
    expect(g.projectiles).toHaveLength(0);
  });
});

describe('drone', () => {
  const d = ALIENS.drone;

  it('picks a new strafe point on its own side of the base once it arrives', () => {
    const g = noPlayer();
    const left = spawn(g, 'drone', 300, d.alt, { tx: 301, special: 5 });
    const right = spawn(g, 'drone', 900, d.alt, { tx: 900, special: 5 });
    g.rng = () => 0.5;
    step(g, left, drone, 0.1);
    step(g, right, drone, 0.1);
    expect(left.tx).toBe(BASE_X - 125);
    expect(left.x).toBeCloseTo(300 + d.speed * 0.1);
    expect(left.facing).toBe(1);
    expect(right.tx).toBe(BASE_X + 125);
    expect(right.x).toBeCloseTo(900 - d.speed * 0.1);
  });

  it('keeps its strafe point until it gets there, easing toward its altitude', () => {
    const g = noPlayer();
    const a = spawn(g, 'drone', 300, 50, { tx: 200, anim: 0, special: 5 });
    step(g, a, drone, 0.1);
    expect(a.tx).toBe(200);
    expect(a.x).toBeCloseTo(300 - d.speed * 0.1);
    expect(a.y).toBeCloseTo(50 + (d.alt - 50) * 0.3);
  });

  it('stays quiet when reloaded but out of range', () => {
    const g = noPlayer();
    const a = spawn(g, 'drone', 100, d.alt, { tx: 50, special: 0 });
    step(g, a, drone, 0.1);
    expect(a.mode).toBe(0);
    expect(a.special).toBeCloseTo(-0.1);
    expect(g.projectiles).toHaveLength(0);
  });

  it('arms a three-shot burst in range, then fires zaps 0.12s apart', () => {
    const g = noPlayer();
    g.wave = 2;
    const a = spawn(g, 'drone', 420, d.alt, { tx: 300, special: 0 });
    step(g, a, drone, 0.05);
    expect(a.mode).toBe(3);
    expect(a.special).toBe(d.attackRate);
    expect(a.attacking).toBe(false);
    expect(g.projectiles).toHaveLength(0);

    step(g, a, drone, 0.05);
    expect(a.mode).toBe(2);
    expect(a.attacking).toBe(true);
    expect(g.projectiles).toHaveLength(1);
    const p = g.projectiles[0];
    expect(p).toMatchObject({ kind: 'zap', team: 'alien', x: a.x, y: a.y + 2 });
    expect(p.damage).toBeCloseTo(d.damage * damageMultiplier(2));
    expect(speedOf(p)).toBeCloseTo(ZAP_SPEED);
    expect(angleOf(p)).toBeCloseTo(Math.atan2(LEFT_WALL.y - a.y - 2, LEFT_WALL.x - a.x));

    step(g, a, drone, 0.05);
    expect(g.projectiles).toHaveLength(1);
    step(g, a, drone, 0.1);
    expect(a.mode).toBe(1);
    expect(g.projectiles).toHaveLength(2);
    step(g, a, drone, 0.12);
    expect(a.mode).toBe(0);
    expect(g.projectiles).toHaveLength(3);
    step(g, a, drone, 0.5);
    expect(g.projectiles).toHaveLength(3);
    expect(g.sfx).toEqual(['zap', 'zap', 'zap']);
  });
});

describe('hopper', () => {
  const d = ALIENS.hopper;

  it('waits out its landing pause on the ground', () => {
    const g = noPlayer();
    const a = spawn(g, 'hopper', 100, GROUND_Y, { timer: 0.3 });
    step(g, a, hopper, 0.1);
    expect(a.timer).toBeCloseTo(0.2);
    expect(a.vy).toBe(0);
    expect(a.x).toBe(100);
  });

  it('leaps at the base at full speed from afar', () => {
    const g = noPlayer();
    const left = spawn(g, 'hopper', 100);
    const right = spawn(g, 'hopper', 1100);
    step(g, left, hopper, 0.1);
    step(g, right, hopper, 0.1);
    expect(left).toMatchObject({ vy: -380, vx: d.speed, facing: 1, y: GROUND_Y, x: 100 });
    expect(right).toMatchObject({ vy: -380, vx: -d.speed, facing: -1 });
  });

  it('scales a short leap so it lands at the base wall', () => {
    const g = noPlayer();
    const a = spawn(g, 'hopper', BASE_X - BASE_HALF_W - 50);
    step(g, a, hopper, 0.1);
    expect(a.vx).toBeCloseTo(50 / HOP_AIR);
  });

  it('never hops slower than 20px/s', () => {
    const g = noPlayer();
    const a = spawn(g, 'hopper', BASE_X - BASE_HALF_W - 10);
    step(g, a, hopper, 0.1);
    expect(a.vx).toBe(20);
  });

  it('leaps at a grounded player within 110px', () => {
    const g = waveGame();
    playerAt(g, 250);
    const a = spawn(g, 'hopper', 280);
    step(g, a, hopper, 0.1);
    expect(a.facing).toBe(-1);
    expect(a.vx).toBeCloseTo(-30 / HOP_AIR);
  });

  it('ignores a player 110px away', () => {
    const g = waveGame();
    playerAt(g, 170);
    const a = spawn(g, 'hopper', 280);
    step(g, a, hopper, 0.1);
    expect(a.vx).toBe(d.speed);
  });

  it('flies on a ballistic arc while airborne', () => {
    const g = noPlayer();
    const a = spawn(g, 'hopper', 100, GROUND_Y, { vy: -380, vx: 100, timer: 0.5 });
    step(g, a, hopper, 0.1);
    expect(a.vy).toBeCloseTo(-380 + GRAVITY * 0.1);
    expect(a.x).toBeCloseTo(110);
    expect(a.y).toBeCloseTo(GROUND_Y + (-380 + GRAVITY * 0.1) * 0.1);
    expect(a.timer).toBe(0.5);
  });

  it('lands, pauses and kicks up dust', () => {
    const g = noPlayer();
    const a = spawn(g, 'hopper', 100, GROUND_Y - 1, { vy: 100, vx: 50 });
    step(g, a, hopper, 0.1);
    expect(a).toMatchObject({ y: GROUND_Y, vy: 0, vx: 0, timer: 0.4 });
    expect(a.x).toBeCloseTo(105);
    expect(g.particles).toHaveLength(3);
    expect(g.particles.every((p) => DUST.includes(p.color))).toBe(true);
  });

  it('is kept inside the world', () => {
    const g = noPlayer();
    const a = spawn(g, 'hopper', WORLD_W - 6, 200, { vx: 100 });
    step(g, a, hopper, 0.1);
    expect(a.x).toBe(WORLD_W - d.w / 2);
  });

  it('hits targets it touches mid-air', () => {
    const g = waveGame();
    playerAt(g, 300, GROUND_Y - 10);
    const a = spawn(g, 'hopper', 300, GROUND_Y - 20, { atkCd: 0 });
    step(g, a, hopper, DT);
    expect(a.attacking).toBe(true);
    expect(g.player.hp).toBe(PLAYER_STATS.hp - d.damage);
  });

  it('stops to fight on the ground instead of hopping', () => {
    const g = waveGame();
    playerAt(g, 300);
    const a = spawn(g, 'hopper', 308, GROUND_Y, { atkCd: 1, timer: 0 });
    step(g, a, hopper, 0.1);
    expect(a.attacking).toBe(true);
    expect(a.timer).toBe(0);
    expect(a.vy).toBe(0);
  });
});

describe('worm', () => {
  const d = ALIENS.worm;

  it('tunnels toward the base at full speed, passing under the player', () => {
    const g = waveGame();
    playerAt(g, 100);
    const a = spawn(g, 'worm', 100, GROUND_Y, { burrowed: true, atkCd: 0 });
    g.rng = () => 0.99;
    step(g, a, worm, DT);
    expect(a.x).toBeCloseTo(100 + d.speed * DT);
    expect(a.attacking).toBe(false);
    expect(g.player.hp).toBe(PLAYER_STATS.hp);
    expect(g.particles).toHaveLength(0);
  });

  it('churns up dirt as it tunnels', () => {
    const g = noPlayer();
    const a = spawn(g, 'worm', 100, GROUND_Y, { burrowed: true });
    g.rng = () => 0;
    step(g, a, worm, DT);
    expect(g.particles).toHaveLength(1);
    expect(DIRT).toContain(g.particles[0].color);
  });

  it('surfaces within 26px of the base', () => {
    const g = noPlayer();
    const x = BASE_X + BASE_HALF_W + 26;
    const a = spawn(g, 'worm', x, GROUND_Y, { burrowed: true });
    step(g, a, worm, 0.1);
    expect(a.burrowed).toBe(false);
    expect(a.x).toBe(x);
    expect(g.particles).toHaveLength(14);
    expect(g.sfx).toEqual(['burrow']);
  });

  it('crawls at 40% speed once surfaced', () => {
    const g = noPlayer();
    const a = spawn(g, 'worm', BASE_X - BASE_HALF_W - 26);
    step(g, a, worm, 0.1);
    expect(a.x).toBeCloseTo(BASE_X - BASE_HALF_W - 26 + d.speed * 0.4 * 0.1);
  });

  it('bites the base once surfaced alongside it', () => {
    const g = noPlayer();
    const a = spawn(g, 'worm', BASE_X - BASE_HALF_W - 5, GROUND_Y, { atkCd: 0 });
    step(g, a, worm, DT);
    expect(a.x).toBe(BASE_X - BASE_HALF_W - 5);
    expect(g.base.hp).toBe(BASE_LEVELS[0].hp - d.damage);
  });
});

describe('bug', () => {
  const d = ALIENS.bug;

  it('swarms toward the base at altitude', () => {
    const g = noPlayer();
    const a = spawn(g, 'bug', 100, d.alt, { id: 0, anim: 0 });
    step(g, a, bug, 0.1);
    expect(a.x).toBeCloseTo(100 + d.speed * 0.1);
    expect(a.y).toBe(d.alt);
  });

  it('weaves up and down by up to 16px', () => {
    const g = noPlayer();
    const a = spawn(g, 'bug', 100, d.alt, { id: 0, anim: Math.PI / 14 });
    step(g, a, bug, 0.1);
    expect(a.y).toBeCloseTo(d.alt + 16 * 0.4);
  });

  it('dives toward the roof within 80px of the base', () => {
    const g = noPlayer();
    const a = spawn(g, 'bug', 520, d.alt, { id: 0, anim: 0 });
    step(g, a, bug, 0.1);
    expect(a.x).toBeCloseTo(528);
    expect(a.y).toBeCloseTo(d.alt + (ROOF_Y + 2 - d.alt) * 0.4);
  });

  it('stings the base from the roof', () => {
    const g = noPlayer();
    const a = spawn(g, 'bug', BASE_X - 20, ROOF_Y + 2, { atkCd: 0 });
    step(g, a, bug, DT);
    expect(a.x).toBe(BASE_X - 20);
    expect(g.base.hp).toBe(BASE_LEVELS[0].hp - d.damage);
  });
});

describe('blob', () => {
  const d = ALIENS.blob;

  it('blows itself up on contact with the player', () => {
    const g = waveGame();
    playerAt(g, 300);
    const a = spawn(g, 'blob', 310);
    step(g, a, blob, DT);
    expect(a.hp).toBe(0);
    expect(a.x).toBe(310);
    expect(g.player.hp).toBe(PLAYER_STATS.hp - d.damage);
    expect(g.sfx).toContain('explode');
  });

  it('blows a wave-scaled hole in the base', () => {
    const g = noPlayer();
    g.wave = 3;
    const a = spawn(g, 'blob', BASE_X - BASE_HALF_W - 7);
    step(g, a, blob, DT);
    expect(a.hp).toBe(0);
    expect(g.base.hp).toBeCloseTo(BASE_LEVELS[0].hp - d.damage * damageMultiplier(3));
  });

  it('chases a grounded player within 120px', () => {
    const g = waveGame();
    playerAt(g, 200);
    const a = spawn(g, 'blob', 300);
    step(g, a, blob, 0.1);
    expect(a.x).toBeCloseTo(300 - d.speed * 0.1);
    expect(a.hp).toBeGreaterThan(0);
  });

  it.each([
    ['the player is dead', (g: Game) => (g.player.alive = false)],
    ['the player is airborne', (g: Game) => (g.player.y = GROUND_Y - 5)],
    ['the player is 120px away', (g: Game) => (g.player.x = 180)],
  ])('rolls toward the base when %s', (_label, tweak) => {
    const g = waveGame();
    playerAt(g, 200);
    tweak(g);
    const a = spawn(g, 'blob', 300);
    step(g, a, blob, 0.1);
    expect(a.x).toBeCloseTo(300 + d.speed * 0.1);
  });
});
