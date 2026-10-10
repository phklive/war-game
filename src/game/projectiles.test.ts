import { describe, expect, it } from 'vitest';
import { waveGame } from '../test/helpers';
import { BASE_X, BLAST_RADIUS, BUBBLE_POP_DAMAGE, BUBBLE_TRAP_TIME, DT, GROUND_Y, ROOF_Y, SHELL_RADIUS, VIEW_W, WEB_SLOW, WORLD_W } from './config';
import { ACID, BUBBLE, DUST, FIRE, GOO, SPARK, WATER, WEB, ZAP } from './effects';
import { inView, updateProjectiles } from './projectiles';
import { createAlien, createSoldier } from './state';
import type { Alien, Game, Projectile } from './types';

function proj(overrides: Partial<Projectile> = {}): Projectile {
  return { kind: 'bullet', team: 'player', x: 100, y: 100, vx: 0, vy: 0, damage: 5, life: 1, gravity: 0, pierce: 1, knock: 0, hit: [], ...overrides };
}

/**
 * Wave-1 game whose rng never triggers the random goo splash on alien hits,
 * with the camera at the left edge of the world so the view spans x 0..VIEW_W.
 */
function quietGame(): Game {
  const g = waveGame(1);
  g.rng = () => 0.9;
  g.camX = 0;
  return g;
}

function grunt(g: Game, x = 300, hp = 100): Alien {
  const a = createAlien(g, 'grunt', x, GROUND_Y, 'active');
  a.hp = hp;
  return a;
}

/** A point inside a grunt standing on the ground at x. */
const HIT_Y = GROUND_Y - 8;

const colorsIn = (g: Game, palette: readonly string[]): number => g.particles.filter((p) => palette.includes(p.color)).length;

describe('updateProjectiles: flight', () => {
  it('ages, accelerates and moves projectiles that hit nothing', () => {
    const g = quietGame();
    g.projectiles.push(proj({ x: 100, y: 100, vx: 60, vy: -30, gravity: 120, life: 1 }));
    updateProjectiles(g, 0.5);
    expect(g.projectiles).toHaveLength(1);
    const pr = g.projectiles[0];
    expect(pr.life).toBe(0.5);
    expect(pr.vy).toBe(30);
    expect(pr.x).toBe(130);
    expect(pr.y).toBe(115);
  });

  it('removes expired projectiles quietly', () => {
    const g = quietGame();
    g.projectiles.push(proj({ life: 0.01 }));
    updateProjectiles(g, DT);
    expect(g.projectiles).toEqual([]);
    expect(g.sfx).toEqual([]);
    expect(g.particles).toEqual([]);
  });

  it('pops bubbles that expire', () => {
    const g = quietGame();
    g.projectiles.push(proj({ kind: 'bubble', life: 0.01 }));
    updateProjectiles(g, DT);
    expect(g.projectiles).toEqual([]);
    expect(g.sfx).toEqual(['pop']);
    expect(colorsIn(g, BUBBLE)).toBe(6);
  });

  it('removes alien projectiles that leave the world', () => {
    const g = quietGame();
    const alien = (o: Partial<Projectile>): Projectile => proj({ team: 'alien', kind: 'plasma', ...o });
    g.projectiles.push(alien({ x: -21 }), alien({ x: WORLD_W + 21 }), alien({ y: -81 }), alien({ x: -19, y: -79 }), alien({ x: WORLD_W + 19 }));
    updateProjectiles(g, 0.001);
    expect(g.projectiles.map((pr) => pr.x)).toEqual([-19, WORLD_W + 19]);
    expect(g.particles).toEqual([]);
  });

  it('removes player shots as soon as they leave the visible screen', () => {
    const g = quietGame();
    g.camX = 200;
    g.projectiles.push(proj({ x: 199 }), proj({ x: 200 + VIEW_W + 1 }), proj({ x: 300, y: -1 }), proj({ x: 200, y: 0 }), proj({ x: 200 + VIEW_W, y: 50 }));
    updateProjectiles(g, 0.001);
    expect(g.projectiles.map((pr) => [pr.x, pr.y])).toEqual([
      [200, 0],
      [200 + VIEW_W, 50],
    ]);
  });

  it('lets ally shots fly on off screen until they leave the world', () => {
    const g = quietGame();
    g.projectiles.push(proj({ team: 'ally', x: VIEW_W + 100 }), proj({ team: 'ally', x: WORLD_W + 21 }));
    updateProjectiles(g, 0.001);
    expect(g.projectiles.map((pr) => pr.x)).toEqual([VIEW_W + 100]);
  });

  it('does not let off-screen shots hit aliens', () => {
    const g = quietGame();
    const a = grunt(g, 300);
    g.camX = 400;
    g.projectiles.push(proj({ x: 300, y: HIT_Y }));
    updateProjectiles(g, 0.001);
    expect(a.hp).toBe(100);
    expect(g.projectiles).toEqual([]);
  });

  it('does not explode off-screen shells that reach the ground', () => {
    const g = quietGame();
    const a = grunt(g, 300);
    g.camX = 400;
    g.projectiles.push(proj({ kind: 'shell', x: 300, y: GROUND_Y + 1, damage: 14 }));
    updateProjectiles(g, 0.001);
    expect(a.hp).toBe(100);
    expect(g.sfx).toEqual([]);
    expect(g.projectiles).toEqual([]);
  });

  it('pops bubbles that drift off screen', () => {
    const g = quietGame();
    g.projectiles.push(proj({ kind: 'bubble', x: 100, y: 0, vy: -10 }));
    updateProjectiles(g, 0.5);
    expect(g.projectiles).toEqual([]);
    expect(g.sfx).toEqual(['pop']);
    expect(colorsIn(g, BUBBLE)).toBe(6);
  });
});

describe('inView', () => {
  it('covers the camera window horizontally, from the sky top down', () => {
    const g = quietGame();
    g.camX = 100;
    expect(inView(g, 100, 0)).toBe(true);
    expect(inView(g, 100 + VIEW_W, GROUND_Y + 50)).toBe(true);
    expect(inView(g, 99, 50)).toBe(false);
    expect(inView(g, 101 + VIEW_W, 50)).toBe(false);
    expect(inView(g, 200, -0.1)).toBe(false);
  });
});

describe('updateProjectiles: ground impact', () => {
  const ground = (kind: Projectile['kind'], team: Projectile['team'] = 'player'): Game => {
    const g = quietGame();
    g.projectiles.push(proj({ kind, team, x: 100, y: GROUND_Y - 1, vy: 120 }));
    updateProjectiles(g, DT);
    expect(g.projectiles).toEqual([]);
    return g;
  };

  it('explodes shells, splashing nearby aliens', () => {
    const g = quietGame();
    const near = grunt(g, 130);
    const far = grunt(g, 100 + SHELL_RADIUS + 20);
    g.projectiles.push(proj({ kind: 'shell', x: 100, y: GROUND_Y - 1, vy: 120, damage: 14 }));
    updateProjectiles(g, DT);
    expect(g.projectiles).toEqual([]);
    expect(g.sfx).toEqual(['explode']);
    expect(colorsIn(g, FIRE)).toBe(26);
    expect(near.hp).toBeLessThan(100);
    expect(near.hp).toBeGreaterThan(100 - 14);
    expect(far.hp).toBe(100);
  });

  it('pops bubbles', () => {
    const g = ground('bubble');
    expect(g.sfx).toEqual(['pop']);
    expect(colorsIn(g, BUBBLE)).toBe(6);
    expect(g.particles[0].y).toBe(GROUND_Y - 1);
  });

  it('splashes water', () => {
    const g = ground('water');
    expect(g.particles).toHaveLength(4);
    expect(colorsIn(g, WATER)).toBe(4);
    expect(g.sfx).toEqual([]);
  });

  it('splatters alien plasma', () => {
    const g = ground('plasma', 'alien');
    expect(g.particles).toHaveLength(4);
    expect(colorsIn(g, GOO)).toBe(4);
  });

  it('kicks up dust from bullets', () => {
    const g = ground('bullet');
    expect(g.particles).toHaveLength(2);
    expect(colorsIn(g, DUST)).toBe(2);
  });

  it('splashes acid, zaps and webs in their own colors', () => {
    expect(colorsIn(ground('acid', 'alien'), ACID)).toBe(4);
    expect(colorsIn(ground('zap', 'alien'), ZAP)).toBe(4);
    expect(colorsIn(ground('web', 'alien'), WEB)).toBe(4);
  });

  it('detonates alien bombs on the ground, hurting friendlies but not aliens', () => {
    const g = quietGame();
    const a = grunt(g, 100);
    const s = createSoldier(g);
    s.x = 110;
    g.projectiles.push(proj({ kind: 'bomb', team: 'alien', x: 100, y: GROUND_Y - 1, vy: 120, damage: 12 }));
    updateProjectiles(g, DT);
    expect(g.projectiles).toEqual([]);
    expect(s.hp).toBe(28);
    expect(a.hp).toBe(100);
    expect(g.sfx).toEqual(['explode']);
    expect(colorsIn(g, FIRE)).toBe(22);
  });
});

describe('updateProjectiles: hitting aliens', () => {
  it('damages the alien, records the hit, sparks, and is spent', () => {
    const g = quietGame();
    const a = grunt(g);
    g.projectiles.push(proj({ x: 300, y: HIT_Y, vx: 1, damage: 5, knock: 40 }));
    updateProjectiles(g, DT);
    expect(a.hp).toBe(95);
    expect(a.kx).toBe(40);
    expect(g.projectiles).toEqual([]);
    expect(g.particles).toHaveLength(2);
    expect(colorsIn(g, SPARK)).toBe(2);
  });

  it('knocks aliens in the direction of travel', () => {
    const g = quietGame();
    const a = grunt(g);
    g.projectiles.push(proj({ x: 300, y: HIT_Y, vx: -1, knock: 40 }));
    updateProjectiles(g, DT);
    expect(a.kx).toBe(-40);
  });

  it('accepts hits within a small padding around the alien box', () => {
    const g = quietGame();
    const a = grunt(g);
    g.projectiles.push(proj({ x: 300 + 5 + 2, y: HIT_Y }), proj({ x: 300 + 5 + 3, y: HIT_Y }));
    updateProjectiles(g, 0.001);
    expect(a.hp).toBe(95);
    expect(g.projectiles).toHaveLength(1);
  });

  it('pierces through aliens without hitting the same alien twice', () => {
    const g = quietGame();
    const a = grunt(g);
    g.projectiles.push(proj({ x: 300, y: HIT_Y, pierce: 2 }));
    updateProjectiles(g, 0.001);
    expect(a.hp).toBe(95);
    expect(g.projectiles).toHaveLength(1);
    expect(g.projectiles[0].hit).toEqual([a.id]);
    expect(g.projectiles[0].pierce).toBe(1);
    updateProjectiles(g, 0.001);
    expect(a.hp).toBe(95);
    expect(g.projectiles).toHaveLength(1);
  });

  it('pierces into a second alien in the same frame', () => {
    const g = quietGame();
    const a = grunt(g);
    const b = grunt(g, 302);
    g.projectiles.push(proj({ x: 301, y: HIT_Y, pierce: 2 }));
    updateProjectiles(g, 0.001);
    expect(a.hp).toBe(95);
    expect(b.hp).toBe(95);
    expect(g.projectiles).toEqual([]);
  });

  it('passes through dead aliens', () => {
    const g = quietGame();
    const a = grunt(g, 300, 0);
    g.projectiles.push(proj({ x: 300, y: HIT_Y }));
    updateProjectiles(g, 0.001);
    expect(a.hp).toBe(0);
    expect(g.projectiles).toHaveLength(1);
  });

  it('slows aliens hit by water', () => {
    const g = quietGame();
    const a = grunt(g);
    g.projectiles.push(proj({ kind: 'water', x: 300, y: HIT_Y, gravity: 380, damage: 0.5 }));
    updateProjectiles(g, 0.001);
    expect(a.hp).toBe(99.5);
    expect(a.slow).toBe(1.2);
    expect(colorsIn(g, WATER)).toBe(2);
    expect(g.projectiles).toEqual([]);
  });

  it('explodes shells on direct hits', () => {
    const g = quietGame();
    const a = grunt(g);
    const bystander = grunt(g, 320);
    g.projectiles.push(proj({ kind: 'shell', x: 300, y: HIT_Y, damage: 14, pierce: 1 }));
    updateProjectiles(g, 0.001);
    expect(a.hp).toBeLessThan(100);
    expect(bystander.hp).toBeLessThan(100);
    expect(g.sfx).toEqual(['explode']);
    expect(g.projectiles).toEqual([]);
  });

  it('credits ally kills to nobody but the stats', () => {
    const g = quietGame();
    const a = grunt(g, 300, 1);
    g.projectiles.push(proj({ team: 'ally', x: 300, y: HIT_Y }));
    updateProjectiles(g, 0.001);
    expect(a.hp).toBe(0);
    expect(g.stats.kills).toBe(1);
    expect(g.player.kills).toBe(0);
  });

  it('credits player kills to the player', () => {
    const g = quietGame();
    grunt(g, 300, 1);
    g.projectiles.push(proj({ x: 300, y: HIT_Y }));
    updateProjectiles(g, 0.001);
    expect(g.player.kills).toBe(1);
  });

  it('passes over burrowed aliens', () => {
    const g = quietGame();
    const w = createAlien(g, 'worm', 300, GROUND_Y, 'active');
    w.burrowed = true;
    w.hp = 100;
    g.projectiles.push(proj({ x: 300, y: HIT_Y }));
    updateProjectiles(g, 0.001);
    expect(w.hp).toBe(100);
    expect(g.projectiles).toHaveLength(1);
  });

  it('pings off a crab shield from the front without hurting it', () => {
    const g = quietGame();
    const c = createAlien(g, 'crab', 300, GROUND_Y, 'active');
    c.facing = -1;
    c.hp = 100;
    g.projectiles.push(proj({ x: 300, y: GROUND_Y - 5, vx: 500, damage: 5, pierce: 3 }));
    updateProjectiles(g, 0.0001);
    expect(c.hp).toBe(100);
    expect(g.projectiles).toEqual([]);
    expect(g.sfx).toEqual(['tink']);
    expect(colorsIn(g, SPARK)).toBe(4);
  });

  it('blocks bubbles on a crab shield too', () => {
    const g = quietGame();
    const c = createAlien(g, 'crab', 300, GROUND_Y, 'active');
    c.facing = -1;
    c.hp = 100;
    g.projectiles.push(proj({ kind: 'bubble', x: 300, y: GROUND_Y - 5, vx: 200 }));
    updateProjectiles(g, 0.0001);
    expect(c.hp).toBe(100);
    expect(c.trap).toBe(0);
    expect(g.sfx).toEqual(['tink']);
  });

  it('hurts a crab from behind', () => {
    const g = quietGame();
    const c = createAlien(g, 'crab', 300, GROUND_Y, 'active');
    c.facing = -1;
    c.hp = 100;
    g.projectiles.push(proj({ x: 300, y: GROUND_Y - 5, vx: -500, damage: 5 }));
    updateProjectiles(g, 0.0001);
    expect(c.hp).toBe(95);
    expect(g.sfx).toEqual([]);
  });

  it('deals a quarter damage into the iron crab front', () => {
    const g = quietGame();
    const c = createAlien(g, 'ironcrab', 300, GROUND_Y, 'active');
    c.facing = -1;
    c.hp = 100;
    g.projectiles.push(proj({ x: 300, y: GROUND_Y - 5, vx: 500, damage: 8 }));
    updateProjectiles(g, 0.0001);
    expect(c.hp).toBe(98);
    expect(g.projectiles).toEqual([]);
  });

  it('blasts shells through shields', () => {
    const g = quietGame();
    const c = createAlien(g, 'crab', 300, GROUND_Y, 'active');
    c.facing = -1;
    c.hp = 100;
    g.projectiles.push(proj({ kind: 'shell', x: 300, y: GROUND_Y - 5, vx: 500, damage: 14 }));
    updateProjectiles(g, 0.0001);
    expect(c.hp).toBeLessThan(100);
    expect(g.sfx).toEqual(['explode']);
  });
});

describe('updateProjectiles: bubbles', () => {
  const bubble = (overrides: Partial<Projectile> = {}): Projectile => proj({ kind: 'bubble', x: 300, y: HIT_Y, damage: 1, ...overrides });

  it('traps a light alien in place', () => {
    const g = quietGame();
    const a = grunt(g);
    a.state = 'descend';
    a.vy = 50;
    g.projectiles.push(bubble());
    updateProjectiles(g, 0.001);
    expect(a.hp).toBe(99);
    expect(a.trap).toBe(BUBBLE_TRAP_TIME);
    expect(a.state).toBe('active');
    expect(a.vy).toBe(0);
    expect(g.sfx).toEqual(['pop']);
    expect(g.projectiles).toEqual([]);
  });

  it('pops harmlessly-ish on heavy aliens without trapping them', () => {
    const g = quietGame();
    const a = createAlien(g, 'brute', 300, GROUND_Y, 'active');
    a.hp = 100;
    g.projectiles.push(bubble());
    updateProjectiles(g, 0.001);
    expect(a.hp).toBe(100 - BUBBLE_POP_DAMAGE / 2);
    expect(a.trap).toBe(0);
    expect(a.kx).toBe(0);
  });

  it('pops on an already-trapped alien without resetting the trap', () => {
    const g = quietGame();
    const a = grunt(g);
    a.trap = 1;
    g.projectiles.push(bubble());
    updateProjectiles(g, 0.001);
    expect(a.hp).toBe(100 - BUBBLE_POP_DAMAGE / 2);
    expect(a.trap).toBe(1);
  });

  it('does not trap an alien it kills', () => {
    const g = quietGame();
    const a = grunt(g, 300, 0.5);
    a.state = 'descend';
    a.vy = 50;
    g.projectiles.push(bubble());
    updateProjectiles(g, 0.001);
    expect(a.hp).toBe(0);
    expect(a.trap).toBe(0);
    expect(a.state).toBe('descend');
    expect(g.sfx).toEqual(['pop', 'alienDie']);
  });
});

describe('updateProjectiles: alien fire', () => {
  const plasma = (x: number, y: number): Projectile => proj({ kind: 'plasma', team: 'alien', x, y, damage: 10 });

  it('hurts a live player it touches', () => {
    const g = quietGame();
    g.projectiles.push(plasma(g.player.x, g.player.y - 5));
    updateProjectiles(g, 0.001);
    expect(g.player.hp).toBe(90);
    expect(g.sfx).toEqual(['playerHit']);
    expect(g.projectiles).toEqual([]);
    expect(colorsIn(g, GOO)).toBe(6);
  });

  it('passes through a dead player', () => {
    const g = quietGame();
    g.player.alive = false;
    g.projectiles.push(plasma(g.player.x, g.player.y - 5));
    updateProjectiles(g, 0.001);
    expect(g.projectiles).toHaveLength(1);
    expect(g.sfx).toEqual([]);
  });

  it('hurts a living soldier it touches', () => {
    const g = quietGame();
    const s = createSoldier(g);
    g.projectiles.push(plasma(s.x, GROUND_Y - 5));
    updateProjectiles(g, 0.001);
    expect(s.hp).toBe(30);
    expect(s.flash).toBe(0.1);
    expect(g.projectiles).toEqual([]);
    expect(g.player.hp).toBe(100);
  });

  it('passes through dead soldiers', () => {
    const g = quietGame();
    const s = createSoldier(g);
    s.hp = 0;
    g.projectiles.push(plasma(s.x, GROUND_Y - 5));
    updateProjectiles(g, 0.001);
    expect(g.projectiles).toHaveLength(1);
    expect(g.base.hp).toBe(300);
  });

  it('damages the base', () => {
    const g = quietGame();
    g.projectiles.push(plasma(g.player.x, GROUND_Y - 10));
    updateProjectiles(g, 0.001);
    expect(g.base.hp).toBe(290);
    expect(g.sfx).toEqual(['baseHit']);
    expect(g.projectiles).toEqual([]);
  });

  it('ignores aliens', () => {
    const g = quietGame();
    const a = grunt(g);
    g.projectiles.push(plasma(300, HIT_Y));
    updateProjectiles(g, 0.001);
    expect(a.hp).toBe(100);
    expect(g.projectiles).toHaveLength(1);
  });

  it('hits the player before an overlapping soldier', () => {
    const g = quietGame();
    const s = createSoldier(g);
    g.player.x = 300;
    g.player.y = GROUND_Y;
    s.x = 300;
    g.projectiles.push(plasma(300, GROUND_Y - 5));
    updateProjectiles(g, 0.001);
    expect(g.player.hp).toBe(90);
    expect(s.hp).toBe(40);
    expect(g.projectiles).toEqual([]);
  });

  it('hits the player standing on the roof before the base', () => {
    const g = quietGame();
    g.projectiles.push(plasma(g.player.x, ROOF_Y));
    updateProjectiles(g, 0.001);
    expect(g.player.hp).toBe(90);
    expect(g.base.hp).toBe(300);
  });

  it('hits a soldier in front of the base before the base', () => {
    const g = quietGame();
    const s = createSoldier(g);
    s.x = BASE_X - 38;
    g.projectiles.push(plasma(BASE_X - 38, GROUND_Y - 5));
    updateProjectiles(g, 0.001);
    expect(s.hp).toBe(30);
    expect(g.base.hp).toBe(300);
  });

  it('webs slow down the player they hit', () => {
    const g = quietGame();
    g.projectiles.push(proj({ kind: 'web', team: 'alien', x: g.player.x, y: g.player.y - 5, damage: 3 }));
    updateProjectiles(g, 0.001);
    expect(g.player.hp).toBe(97);
    expect(g.player.slow).toBe(WEB_SLOW);
    expect(g.sfx).toEqual(['playerHit', 'web']);
    expect(colorsIn(g, WEB)).toBe(6);
  });

  it('webs that hit soldiers or the base only deal damage', () => {
    const g = quietGame();
    const s = createSoldier(g);
    g.projectiles.push(proj({ kind: 'web', team: 'alien', x: s.x, y: GROUND_Y - 5, damage: 3 }));
    g.projectiles.push(proj({ kind: 'web', team: 'alien', x: BASE_X, y: GROUND_Y - 10, damage: 3 }));
    updateProjectiles(g, 0.001);
    expect(s.hp).toBe(37);
    expect(g.base.hp).toBe(297);
    expect(g.player.slow).toBe(0);
    expect(g.sfx).not.toContain('web');
  });

  it('webs still slow an invulnerable player, though they deal no damage', () => {
    const g = quietGame();
    g.player.invuln = 0.3;
    g.projectiles.push(proj({ kind: 'web', team: 'alien', x: g.player.x, y: g.player.y - 5, damage: 3 }));
    updateProjectiles(g, 0.001);
    expect(g.player.hp).toBe(100);
    expect(g.player.slow).toBe(WEB_SLOW);
  });

  it('splashes acid and zaps in their own colors on impact', () => {
    const g = quietGame();
    g.projectiles.push(proj({ kind: 'acid', team: 'alien', x: BASE_X, y: GROUND_Y - 10 }));
    g.projectiles.push(proj({ kind: 'zap', team: 'alien', x: BASE_X + 10, y: GROUND_Y - 10 }));
    updateProjectiles(g, 0.001);
    expect(colorsIn(g, ACID)).toBe(6);
    expect(colorsIn(g, ZAP)).toBe(6);
  });

  it('detonates bombs on contact with the player', () => {
    const g = quietGame();
    g.player.x = 900;
    g.player.y = GROUND_Y;
    g.projectiles.push(proj({ kind: 'bomb', team: 'alien', x: 900, y: GROUND_Y - 5, damage: 12 }));
    updateProjectiles(g, 0.001);
    expect(g.player.hp).toBe(88);
    expect(g.projectiles).toEqual([]);
    expect(g.sfx).toEqual(['playerHit', 'explode']);
    expect(colorsIn(g, FIRE)).toBe(22);
  });

  it('detonates bombs that strike the base, catching nearby soldiers but not a distant player', () => {
    const g = quietGame();
    const s = createSoldier(g);
    g.player.x = BASE_X + 10;
    const x = BASE_X - 30;
    expect(Math.abs(s.x - x)).toBeLessThanOrEqual(BLAST_RADIUS);
    g.projectiles.push(proj({ kind: 'bomb', team: 'alien', x, y: GROUND_Y - 5, damage: 12 }));
    updateProjectiles(g, 0.001);
    expect(g.base.hp).toBe(288);
    expect(s.hp).toBe(28);
    expect(g.player.hp).toBe(100);
    expect(g.sfx).toEqual(['baseHit', 'explode']);
    expect(g.projectiles).toEqual([]);
  });
});
