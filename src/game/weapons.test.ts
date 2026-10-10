import { describe, expect, it } from 'vitest';
import { waveGame } from '../test/helpers';
import { BASE_X, GROUND_Y, ROOF_Y, VIEW_W, WEAPONS, type WeaponDef, type WeaponId } from './config';
import { SPARK, WATER } from './effects';
import { createAlien } from './state';
import type { Alien, Game } from './types';
import { fireWeapon, hitscan, muzzle, rayBox, shoulder, viewExit } from './weapons';

const LASER_COLORS = ['#ff3df0', '#53f5ff', '#fff36b'];

/** Wave-1 game with the player on the roof and an rng that yields no spread and no goo. */
function armed(weapon: WeaponId, aim = 0): Game {
  const g = waveGame(1);
  g.rng = () => 0.5;
  g.player.weapon = weapon;
  g.player.aim = aim;
  return g;
}

function grunt(g: Game, x: number, y: number, hp = 100): Alien {
  const a = createAlien(g, 'grunt', x, y, 'active');
  a.hp = hp;
  return a;
}

/** A shielded alien facing left, i.e. its shield faces shots travelling right. */
function crab(g: Game, type: 'crab' | 'ironcrab', x: number, hp = 100): Alien {
  const a = createAlien(g, type, x, GROUND_Y, 'active');
  a.facing = -1;
  a.hp = hp;
  return a;
}

/** Right edge of the visible screen in world coordinates. */
const viewRight = (g: Game): number => g.camX + VIEW_W;

describe('shoulder and muzzle', () => {
  it('raises the shoulder slightly higher in the tank', () => {
    const g = armed('pistol');
    expect(shoulder(g.player)).toEqual({ x: 600, y: ROOF_Y - 9 });
    g.player.weapon = 'tank';
    expect(shoulder(g.player)).toEqual({ x: 600, y: ROOF_Y - 10 });
  });

  it('places the muzzle at barrel length along the aim', () => {
    const g = armed('sniper');
    expect(muzzle(g.player)).toEqual({ x: 600 + WEAPONS.sniper.barrel, y: ROOF_Y - 9 });
    g.player.aim = Math.PI / 2;
    const m = muzzle(g.player);
    expect(m.x).toBeCloseTo(600);
    expect(m.y).toBeCloseTo(ROOF_Y - 9 + WEAPONS.sniper.barrel);
  });
});

describe('fireWeapon: knife', () => {
  it('slashes aliens in front, knocking them away', () => {
    const g = armed('knife');
    const front = grunt(g, 615, ROOF_Y);
    const behind = grunt(g, 585, ROOF_Y);
    const below = grunt(g, 615, GROUND_Y);
    fireWeapon(g);
    expect(front.hp).toBe(100 - WEAPONS.knife.damage);
    expect(front.kx).toBe(WEAPONS.knife.knock);
    expect(behind.hp).toBe(100);
    expect(below.hp).toBe(100);
    expect(g.player.cooldown).toBe(WEAPONS.knife.cooldown);
    expect(g.player.swing).toBe(0.15);
    expect(g.player.muzzle).toBe(0);
    expect(g.shake).toBe(WEAPONS.knife.shake);
    expect(g.sfx).toEqual(['knife', 'hit']);
    expect(g.projectiles).toEqual([]);
  });

  it('does not cut the minis of a splitter it just killed', () => {
    const g = armed('knife');
    const sp = createAlien(g, 'splitter', 612, ROOF_Y, 'active');
    sp.hp = 1;
    fireWeapon(g);
    const minis = g.aliens.filter((a) => a.type === 'mini');
    expect(minis).toHaveLength(2);
    for (const m of minis) expect(m.hp).toBeGreaterThan(0);
  });

  it('slashes to the left when aiming left', () => {
    const g = armed('knife', Math.PI);
    const front = grunt(g, 615, ROOF_Y);
    const behind = grunt(g, 585, ROOF_Y);
    fireWeapon(g);
    expect(behind.hp).toBe(100 - WEAPONS.knife.damage);
    expect(behind.kx).toBe(-WEAPONS.knife.knock);
    expect(front.hp).toBe(100);
  });

  it('whiffs without a hit sound when nothing is in reach, skipping dead aliens', () => {
    const g = armed('knife');
    const corpse = grunt(g, 615, ROOF_Y, 0);
    fireWeapon(g);
    expect(corpse.flash).toBe(0);
    expect(g.sfx).toEqual(['knife']);
    expect(g.player.swing).toBe(0.15);
  });

  it('cannot reach burrowed aliens', () => {
    const g = armed('knife');
    const w = createAlien(g, 'worm', 615, ROOF_Y, 'active');
    w.burrowed = true;
    w.hp = 100;
    fireWeapon(g);
    expect(w.hp).toBe(100);
    expect(g.sfx).toEqual(['knife']);
  });

  it('cuts past crab shields', () => {
    const g = armed('knife');
    const c = createAlien(g, 'crab', 615, ROOF_Y, 'active');
    c.facing = -1;
    c.hp = 100;
    fireWeapon(g);
    expect(c.hp).toBe(100 - WEAPONS.knife.damage);
  });
});

describe('fireWeapon: projectiles', () => {
  it('fires a pistol bullet from the shoulder along the aim', () => {
    const g = armed('pistol');
    fireWeapon(g);
    const w = WEAPONS.pistol;
    expect(g.projectiles).toHaveLength(1);
    const pr = g.projectiles[0];
    expect(pr).toMatchObject({ kind: 'bullet', team: 'player', x: 600, y: ROOF_Y - 9, damage: w.damage, gravity: 0, pierce: w.pierce, knock: w.knock, hit: [] });
    expect(pr.vx).toBeCloseTo(w.speed);
    expect(pr.vy).toBeCloseTo(0);
    expect(pr.life).toBeCloseTo(w.range / w.speed);
    expect(g.player.cooldown).toBe(w.cooldown);
    expect(g.player.muzzle).toBe(0.05);
    expect(g.sfx).toEqual(['pistol']);
    expect(g.shake).toBe(w.shake);
    expect(g.particles).toEqual([]);
  });

  it('applies random spread within the weapon spread', () => {
    const g = armed('pistol');
    g.rng = () => 0;
    fireWeapon(g);
    const pr = g.projectiles[0];
    expect(Math.atan2(pr.vy, pr.vx)).toBeCloseTo(-WEAPONS.pistol.spread);
  });

  it('fires assault rifle rounds as bullets', () => {
    const g = armed('ar');
    fireWeapon(g);
    expect(g.projectiles[0]).toMatchObject({ kind: 'bullet', gravity: 0, damage: WEAPONS.ar.damage });
    expect(g.sfx).toEqual(['ar']);
  });

  it('sprays arcing water with a splash at the muzzle', () => {
    const g = armed('water');
    fireWeapon(g);
    expect(g.projectiles[0]).toMatchObject({ kind: 'water', gravity: 420, x: 600, y: ROOF_Y - 9 });
    expect(g.particles).toHaveLength(1);
    expect(g.particles[0]).toMatchObject({ x: 600 + WEAPONS.water.barrel, y: ROOF_Y - 9 });
    expect(WATER).toContain(g.particles[0].color);
    expect(g.sfx).toEqual(['water']);
  });

  it('blows floating bubbles', () => {
    const g = armed('bubble');
    fireWeapon(g);
    expect(g.projectiles[0]).toMatchObject({ kind: 'bubble', gravity: -18, knock: 0 });
    expect(g.particles).toEqual([]);
  });

  it('lobs tank shells from the higher tank shoulder with a big shake', () => {
    const g = armed('tank');
    fireWeapon(g);
    expect(g.projectiles[0]).toMatchObject({ kind: 'shell', gravity: 180, x: 600, y: ROOF_Y - 10, damage: WEAPONS.tank.damage });
    expect(g.shake).toBe(WEAPONS.tank.shake);
    expect(g.sfx).toEqual(['tank']);
  });
});

describe('fireWeapon: hitscan', () => {
  it('fires the sniper as an instant white tracer from the muzzle to the screen edge', () => {
    const g = armed('sniper');
    const a = grunt(g, 700, ROOF_Y - 2);
    fireWeapon(g);
    expect(g.projectiles).toEqual([]);
    expect(a.hp).toBe(100 - WEAPONS.sniper.damage);
    expect(a.kx).toBe(WEAPONS.sniper.knock);
    expect(g.tracers).toHaveLength(1);
    expect(g.tracers[0]).toMatchObject({ x1: 600 + WEAPONS.sniper.barrel, y1: ROOF_Y - 9, color: '#ffffff', width: 1, life: 0.22 });
    expect(g.tracers[0].x2).toBeCloseTo(viewRight(g));
    expect(g.particles).toHaveLength(5);
    expect(g.particles.every((p) => SPARK.includes(p.color))).toBe(true);
    expect(g.player.muzzle).toBe(0.05);
    expect(g.sfx).toEqual(['sniper']);
  });

  it('fires the laser as a thin flickering beam', () => {
    const g = armed('laser');
    g.time = 0.05;
    fireWeapon(g);
    expect(g.tracers[0]).toMatchObject({ color: LASER_COLORS[1], width: 2, life: 0.06 });
    expect(g.particles).toHaveLength(1);
    expect(g.sfx).toEqual(['laser']);
  });

  it('hits an alien hugging the player, between shoulder and muzzle', () => {
    const g = armed('sniper');
    const a = grunt(g, 600 + 8, ROOF_Y);
    fireWeapon(g);
    expect(a.hp).toBe(100 - WEAPONS.sniper.damage);
  });

  it('fires the laser from the shoulder, limited by its range when the screen extends farther', () => {
    const g = armed('laser');
    g.camX = 200;
    g.player.aim = Math.PI;
    fireWeapon(g);
    expect(g.tracers[0]).toMatchObject({ x1: 600 - WEAPONS.laser.barrel, y1: ROOF_Y - 9 });
    expect(g.tracers[0].x2).toBeCloseTo(600 - WEAPONS.laser.range);
  });
});

describe('viewExit', () => {
  const g = armed('sniper');
  const left = g.camX;
  const right = left + VIEW_W;

  it('measures to the right or left screen edge for horizontal rays', () => {
    expect(viewExit(g, BASE_X, 100, 1, 0)).toBe(right - BASE_X);
    expect(viewExit(g, BASE_X, 100, -1, 0)).toBe(BASE_X - left);
    expect(viewExit(g, BASE_X, 100, 2, 0)).toBe((right - BASE_X) / 2);
  });

  it('measures to the ground or the top of the screen for vertical rays', () => {
    expect(viewExit(g, BASE_X, 100, 0, 1)).toBe(GROUND_Y - 100);
    expect(viewExit(g, BASE_X, 100, 0, -1)).toBe(100);
  });

  it('takes the nearest exit for diagonal rays', () => {
    expect(viewExit(g, right - 10, GROUND_Y - 100, 1, 1)).toBe(10);
    expect(viewExit(g, right - 100, GROUND_Y - 10, 1, 1)).toBe(10);
    expect(viewExit(g, left + 10, 50, -1, -1)).toBe(10);
    expect(viewExit(g, left + 100, 5, -1, -1)).toBe(5);
  });

  it('is unbounded for a zero-length direction', () => {
    expect(viewExit(g, BASE_X, 100, 0, 0)).toBe(Infinity);
  });

  it('is zero once the origin is already outside the screen in that direction', () => {
    expect(viewExit(g, right + 5, 100, 1, 0)).toBe(0);
    expect(viewExit(g, left - 5, 100, -1, 0)).toBe(0);
    expect(viewExit(g, BASE_X, GROUND_Y + 5, 0, 1)).toBe(0);
  });
});

describe('rayBox', () => {
  const b = { x0: 10, y0: 0, x1: 20, y1: 10 };

  it('returns the entry distance for a horizontal hit', () => {
    expect(rayBox(0, 5, 1, 0, b)).toBe(10);
    expect(rayBox(25, 5, -1, 0, b)).toBe(5);
  });

  it('returns the entry distance for a vertical hit', () => {
    expect(rayBox(15, -10, 0, 1, b)).toBe(10);
  });

  it('misses axis-parallel rays outside the slab', () => {
    expect(rayBox(0, 15, 1, 0, b)).toBeNull();
    expect(rayBox(0, -5, 1, 0, b)).toBeNull();
    expect(rayBox(5, -10, 0, 1, b)).toBeNull();
  });

  it('misses boxes behind the origin', () => {
    expect(rayBox(30, 5, 1, 0, b)).toBeNull();
  });

  it('returns zero when starting inside the box', () => {
    expect(rayBox(15, 5, 1, 0, b)).toBe(0);
    expect(rayBox(15, 5, 0, 0, b)).toBe(0);
  });

  it('handles diagonal hits and misses', () => {
    expect(rayBox(0, -20, 1, 1, b)).toBe(20);
    expect(rayBox(0, -30, 1, 1, b)).toBeNull();
  });
});

describe('hitscan', () => {
  const W: WeaponDef = { ...WEAPONS.sniper, damage: 10, range: 500, pierce: 2 };
  const Y = GROUND_Y - 5;

  it('hits the nearest aliens first up to its pierce count, stopping the tracer at the last one', () => {
    const g = armed('sniper');
    const mid = grunt(g, 700, GROUND_Y);
    const near = grunt(g, 650, GROUND_Y);
    const far = grunt(g, 750, GROUND_Y);
    hitscan(g, 600, Y, 0, W, false);
    expect(near.hp).toBe(90);
    expect(mid.hp).toBe(90);
    expect(far.hp).toBe(100);
    expect(g.tracers[0]).toMatchObject({ x1: 600 + W.barrel, y1: Y, x2: 695, y2: Y });
  });

  it('runs to the screen edge when it hits fewer aliens than its pierce count', () => {
    const g = armed('sniper');
    const a = grunt(g, 650, GROUND_Y);
    hitscan(g, 600, Y, 0, W, false);
    expect(a.hp).toBe(90);
    expect(g.tracers[0].x2).toBe(viewRight(g));
  });

  it('stops at its range when the screen edge is farther', () => {
    const g = armed('sniper');
    const short: WeaponDef = { ...W, range: 100 };
    const outOfRange = grunt(g, 600 + 100 + 6, GROUND_Y);
    hitscan(g, 600, Y, 0, short, false);
    expect(outOfRange.hp).toBe(100);
    expect(g.tracers[0].x2).toBe(700);
  });

  it('cannot hit aliens beyond the screen edge, even within range', () => {
    const g = armed('sniper');
    const offscreen = grunt(g, viewRight(g) + 6, GROUND_Y);
    hitscan(g, 600, Y, 0, W, false);
    expect(offscreen.hp).toBe(100);
  });

  it('ignores aliens off the line, already dead, or burrowed', () => {
    const g = armed('sniper');
    const above = grunt(g, 700, 100);
    const dead = grunt(g, 650, GROUND_Y, 0);
    const worm = createAlien(g, 'worm', 680, GROUND_Y, 'active');
    worm.burrowed = true;
    worm.hp = 100;
    hitscan(g, 600, Y, 0, W, false);
    expect(above.hp).toBe(100);
    expect(dead.hp).toBe(0);
    expect(dead.flash).toBe(0);
    expect(worm.hp).toBe(100);
    expect(g.tracers[0].x2).toBe(viewRight(g));
  });

  it('starts the tracer at the hit point when an alien is closer than the barrel', () => {
    const g = armed('sniper');
    const one: WeaponDef = { ...W, pierce: 1 };
    const hugger = grunt(g, 600, GROUND_Y);
    hitscan(g, 600, Y, 0, one, false);
    expect(hugger.hp).toBe(90);
    expect(g.tracers[0]).toMatchObject({ x1: 600, x2: 600 });
  });

  it('is stopped dead by a crab shield, with a tink', () => {
    const g = armed('sniper');
    const c = crab(g, 'crab', 650);
    const behind = grunt(g, 700, GROUND_Y);
    hitscan(g, 600, Y, 0, W, false);
    expect(c.hp).toBe(100);
    expect(c.flash).toBe(0);
    expect(behind.hp).toBe(100);
    expect(g.tracers[0].x2).toBe(650 - 8);
    expect(g.sfx).toEqual(['tink']);
  });

  it('hits a crab from behind', () => {
    const g = armed('sniper');
    const c = crab(g, 'crab', 550);
    hitscan(g, 600, Y, Math.PI, W, false);
    expect(c.hp).toBe(90);
    expect(g.sfx).toEqual([]);
  });

  it('pierces the iron crab shield for a quarter damage and keeps going', () => {
    const g = armed('sniper');
    const boss = crab(g, 'ironcrab', 660);
    const behind = grunt(g, 720, GROUND_Y);
    hitscan(g, 600, Y, 0, W, false);
    expect(boss.hp).toBeCloseTo(100 - 10 * 0.25);
    expect(behind.hp).toBe(90);
    expect(g.sfx).toEqual([]);
  });

  it('stops upward shots at the top of the screen', () => {
    const g = armed('sniper');
    hitscan(g, 600, 100, -Math.PI / 2, W, false);
    expect(g.tracers[0].y2).toBeCloseTo(0);
  });

  it('stops downward shots at the ground', () => {
    const g = armed('sniper');
    const a = grunt(g, 600, GROUND_Y);
    hitscan(g, 600, 200, Math.PI / 2, W, false);
    expect(a.hp).toBe(90);
    expect(g.tracers[0].x2).toBeCloseTo(600);
    expect(g.tracers[0].y2).toBeCloseTo(GROUND_Y);
  });

  it('knocks aliens leftward when shooting left', () => {
    const g = armed('sniper');
    const a = grunt(g, 500, GROUND_Y);
    hitscan(g, 600, Y, Math.PI, W, false);
    expect(a.hp).toBe(90);
    expect(a.kx).toBe(-W.knock);
  });

  it('cycles laser colors over time', () => {
    const g = armed('laser');
    const colors: string[] = [];
    for (const t of [0, 0.05, 0.1, 0.15]) {
      g.time = t;
      hitscan(g, 600, 100, 0, WEAPONS.laser, true);
      colors.push(g.tracers[g.tracers.length - 1].color);
    }
    expect(colors).toEqual([LASER_COLORS[0], LASER_COLORS[1], LASER_COLORS[2], LASER_COLORS[0]]);
  });
});
