import { describe, expect, it } from 'vitest';
import { waveGame } from '../test/helpers';
import { ALIENS, BASE_HALF_W, BASE_X, BLAST_RADIUS, GROUND_Y, PLAYER_STATS, RESPAWN_TIME, ROOF_Y, SHELL_RADIUS, TANK_STATS } from './config';
import {
  BASE_BOX,
  alienBox,
  alienDamage,
  boxesOverlap,
  checkUnlock,
  damageAlien,
  equipWeapon,
  explode,
  explodeFriendly,
  hurtBase,
  hurtPlayer,
  hurtSoldier,
  killAlien,
  playerBox,
  pointInBox,
  shieldFactor,
  soldierBox,
  targetable,
} from './combat';
import { BLOOD, DUST, FIRE, GOO, SPARK } from './effects';
import { createAlien, createPlayer, createSoldier } from './state';
import type { Alien, Game } from './types';

/** A wave-1 game whose rng never triggers the 50% goo splash on hits. */
function quietGame(): Game {
  const g = waveGame(1);
  g.rng = () => 0.9;
  return g;
}

function grunt(g: Game, x = 300, hp = 100): Alien {
  const a = createAlien(g, 'grunt', x, GROUND_Y, 'active');
  a.hp = hp;
  return a;
}

const coinTotal = (g: Game): number => g.coins.reduce((s, c) => s + c.value, 0);

/** Explosion damage at distance dist from the blast edge, as computed by explode(). */
const falloff = (damage: number, dist: number, radius: number): number => damage * (1 - (0.5 * dist) / radius);

/** Distance from (x, y) to the nearest edge of an alien's body, as computed by explode(). */
const blastDist = (a: Alien, x: number, y: number): number => Math.max(0, Math.hypot(a.x - x, a.y - ALIENS[a.type].h / 2 - y) - ALIENS[a.type].w / 2);

describe('boxes', () => {
  it('covers the base from roof to ground', () => {
    expect(BASE_BOX).toEqual({ x0: BASE_X - BASE_HALF_W, y0: ROOF_Y, x1: BASE_X + BASE_HALF_W, y1: GROUND_Y });
  });

  it('builds an alien box centered on x with feet at y', () => {
    const g = waveGame();
    const a = createAlien(g, 'brute', 100, 200, 'active');
    expect(alienBox(a)).toEqual({ x0: 90, y0: 170, x1: 110, y1: 200 });
  });

  it('builds a player box that grows in the tank', () => {
    const p = createPlayer();
    p.x = 100;
    p.y = 200;
    expect(playerBox(p)).toEqual({ x0: 100 - PLAYER_STATS.w / 2, y0: 200 - PLAYER_STATS.h, x1: 100 + PLAYER_STATS.w / 2, y1: 200 });
    p.weapon = 'tank';
    expect(playerBox(p)).toEqual({ x0: 100 - TANK_STATS.w / 2, y0: 200 - TANK_STATS.h, x1: 100 + TANK_STATS.w / 2, y1: 200 });
  });

  it('builds a soldier box standing on the ground', () => {
    const g = waveGame();
    const s = createSoldier(g);
    expect(soldierBox(s)).toEqual({ x0: s.x - 4, y0: GROUND_Y - 15, x1: s.x + 4, y1: GROUND_Y });
  });

  it('tests points against a box inclusively, with optional padding', () => {
    const b = { x0: 0, y0: 0, x1: 10, y1: 10 };
    expect(pointInBox(5, 5, b)).toBe(true);
    expect(pointInBox(0, 10, b)).toBe(true);
    expect(pointInBox(-1, 5, b)).toBe(false);
    expect(pointInBox(11, 5, b)).toBe(false);
    expect(pointInBox(5, -1, b)).toBe(false);
    expect(pointInBox(5, 11, b)).toBe(false);
    expect(pointInBox(-1, 11, b, 1)).toBe(true);
    expect(pointInBox(-2, 5, b, 1)).toBe(false);
  });

  it('detects strict box overlap', () => {
    const a = { x0: 0, y0: 0, x1: 10, y1: 10 };
    expect(boxesOverlap(a, { x0: 5, y0: 5, x1: 15, y1: 15 })).toBe(true);
    expect(boxesOverlap(a, { x0: 2, y0: 2, x1: 3, y1: 3 })).toBe(true);
    expect(boxesOverlap(a, { x0: 10, y0: 0, x1: 20, y1: 10 })).toBe(false);
    expect(boxesOverlap(a, { x0: -10, y0: 0, x1: 0, y1: 10 })).toBe(false);
    expect(boxesOverlap(a, { x0: 0, y0: 10, x1: 10, y1: 20 })).toBe(false);
    expect(boxesOverlap(a, { x0: 0, y0: -10, x1: 10, y1: 0 })).toBe(false);
  });
});

describe('damageAlien', () => {
  it('reduces hp, flashes and knocks back a light alien', () => {
    const g = quietGame();
    const a = grunt(g);
    damageAlien(g, a, 3, 'player', -1, 50);
    expect(a.hp).toBe(97);
    expect(a.flash).toBe(0.08);
    expect(a.kx).toBe(-50);
    expect(g.particles).toEqual([]);
    expect(g.sfx).toEqual([]);
  });

  it('applies only 15% knockback to heavy aliens', () => {
    const g = quietGame();
    const a = createAlien(g, 'brute', 300, GROUND_Y, 'active');
    damageAlien(g, a, 1, 'player', 1, 100);
    expect(a.kx).toBeCloseTo(15);
  });

  it('applies no knockback by default', () => {
    const g = quietGame();
    const a = grunt(g);
    damageAlien(g, a, 1, 'ally');
    expect(a.kx).toBe(0);
    expect(a.hp).toBe(99);
  });

  it('sometimes splashes goo on hit', () => {
    const g = waveGame();
    g.rng = () => 0.1;
    const a = grunt(g);
    damageAlien(g, a, 1, 'player');
    expect(g.particles).toHaveLength(2);
    expect(g.particles.every((p) => GOO.includes(p.color))).toBe(true);
    expect(g.particles[0].y).toBeCloseTo(a.y - ALIENS.grunt.h * 0.6);
  });

  it('ignores aliens that are already dead', () => {
    const g = waveGame();
    g.rng = () => 0.1;
    const a = grunt(g, 300, 0);
    damageAlien(g, a, 5, 'player', 1, 100);
    expect(a.hp).toBe(0);
    expect(a.flash).toBe(0);
    expect(a.kx).toBe(0);
    expect(g.particles).toEqual([]);
    expect(g.stats.kills).toBe(0);
  });

  it('kills the alien when hp reaches zero', () => {
    const g = quietGame();
    const a = grunt(g, 300, 2);
    damageAlien(g, a, 5, 'player');
    expect(a.hp).toBe(0);
    expect(g.stats.kills).toBe(1);
    expect(g.player.kills).toBe(1);
    expect(g.sfx).toContain('alienDie');
  });
});

describe('killAlien', () => {
  it('drops coins, bursts goo, shakes lightly and credits the player', () => {
    const g = quietGame();
    const a = grunt(g, 300, 3);
    killAlien(g, a, 'player');
    expect(a.hp).toBe(0);
    expect(coinTotal(g)).toBe(ALIENS.grunt.coin);
    expect(g.coins[0].x).toBe(300);
    expect(g.particles).toHaveLength(16);
    expect(g.sfx).toEqual(['alienDie']);
    expect(g.shake).toBe(1.5);
    expect(g.stats.kills).toBe(1);
    expect(g.player.kills).toBe(1);
    expect(g.banner).toBeNull();
  });

  it('shakes harder for heavy aliens', () => {
    const g = quietGame();
    const a = createAlien(g, 'brute', 300, GROUND_Y, 'active');
    killAlien(g, a, 'player');
    expect(g.shake).toBe(6);
    expect(coinTotal(g)).toBe(ALIENS.brute.coin);
    expect(g.particles).toHaveLength(8 + 2 * 8);
  });

  it('does not credit the player for ally kills', () => {
    const g = quietGame();
    g.player.kills = 9;
    killAlien(g, grunt(g), 'ally');
    expect(g.stats.kills).toBe(1);
    expect(g.player.kills).toBe(9);
    expect(g.player.weapon).toBe('knife');
  });

  it('unlocks the next weapon when a player kill crosses the threshold', () => {
    const g = quietGame();
    g.player.kills = 9;
    killAlien(g, grunt(g), 'player');
    expect(g.player.kills).toBe(10);
    expect(g.player.unlocked).toBe(1);
    expect(g.player.weapon).toBe('pistol');
    expect(g.sfx).toEqual(['alienDie', 'swap', 'unlock']);
  });

  it('celebrates killing the overlord', () => {
    const g = quietGame();
    const a = createAlien(g, 'overlord', 300, GROUND_Y, 'active');
    killAlien(g, a, 'ally');
    expect(g.banner).toMatchObject({ text: 'OVERLORD DOWN!', sub: 'FINISH THE REST!' });
    expect(g.shake).toBe(12);
    expect(g.sfx).toEqual(['alienDie', 'explode']);
    expect(coinTotal(g)).toBe(ALIENS.overlord.coin);
    expect(g.particles.filter((p) => FIRE.includes(p.color))).toHaveLength(60);
  });

  it('names every boss in its defeat banner', () => {
    const g = quietGame();
    killAlien(g, createAlien(g, 'ironcrab', 300, GROUND_Y, 'active'), 'player');
    expect(g.banner?.text).toBe('IRON CRAB DOWN!');
    killAlien(g, createAlien(g, 'wormking', 300, GROUND_Y, 'active'), 'player');
    expect(g.banner?.text).toBe('WORM KING DOWN!');
  });

  it('detonates a dying blob, hurting nearby aliens and crediting the killer', () => {
    const g = quietGame();
    const blob = createAlien(g, 'blob', 300, GROUND_Y, 'active');
    const near = grunt(g, 310);
    const far = grunt(g, 300 + BLAST_RADIUS + 20);
    const bx = 300;
    const by = GROUND_Y - ALIENS.blob.h / 2;
    killAlien(g, blob, 'player');
    expect(near.hp).toBeCloseTo(100 - falloff(8, blastDist(near, bx, by), BLAST_RADIUS));
    expect(near.kx).toBe(220);
    expect(far.hp).toBe(100);
    expect(g.player.hp).toBe(100);
    expect(g.base.hp).toBe(300);
    expect(g.sfx).toEqual(['alienDie', 'explode']);
    expect(g.shake).toBe(6);
  });

  it('chains blob blasts into further kills credited to the same team', () => {
    const g = quietGame();
    const blob = createAlien(g, 'blob', 300, GROUND_Y, 'active');
    const victim = grunt(g, 305, 1);
    killAlien(g, blob, 'player');
    expect(victim.hp).toBe(0);
    expect(g.player.kills).toBe(2);
    expect(g.stats.kills).toBe(2);
    expect(g.sfx).toEqual(['alienDie', 'alienDie', 'explode']);
  });

  it('does not credit the player for blob blasts set off by allies', () => {
    const g = quietGame();
    const blob = createAlien(g, 'blob', 300, GROUND_Y, 'active');
    grunt(g, 305, 1);
    killAlien(g, blob, 'ally');
    expect(g.stats.kills).toBe(2);
    expect(g.player.kills).toBe(0);
  });

  it('splits a dying splitter into two minis flung apart', () => {
    const g = quietGame();
    const sp = createAlien(g, 'splitter', 300, GROUND_Y, 'active');
    killAlien(g, sp, 'player');
    const minis = g.aliens.filter((a) => a.type === 'mini');
    expect(minis).toHaveLength(2);
    expect(minis[0]).toMatchObject({ x: 296, y: GROUND_Y, kx: -120, state: 'active', hp: ALIENS.mini.hp });
    expect(minis[1]).toMatchObject({ x: 304, y: GROUND_Y, kx: 120, state: 'active', hp: ALIENS.mini.hp });
    expect(g.sfx).toEqual(['alienDie', 'split']);
  });

  it('lets the minis of a splitter killed by a blast survive that blast', () => {
    const g = quietGame();
    const sp = createAlien(g, 'splitter', 300, GROUND_Y, 'active');
    sp.hp = 1;
    explode(g, 300, GROUND_Y - 6, 40, 50, 'player');
    const minis = g.aliens.filter((a) => a.type === 'mini');
    expect(minis).toHaveLength(2);
    for (const m of minis) expect(m.hp).toBe(ALIENS.mini.hp);
    expect(g.player.kills).toBe(1);
  });

  it('does not split other aliens', () => {
    const g = quietGame();
    killAlien(g, grunt(g), 'player');
    expect(g.aliens).toHaveLength(1);
    expect(g.sfx).not.toContain('split');
  });
});

describe('checkUnlock', () => {
  it('does nothing while below the next threshold', () => {
    const g = quietGame();
    g.player.kills = 9;
    checkUnlock(g);
    expect(g.player.weapon).toBe('knife');
    expect(g.sfx).toEqual([]);
    expect(g.banner).toBeNull();
  });

  it('unlocks, equips and announces the new weapon with its hotkey', () => {
    const g = quietGame();
    g.player.kills = 25;
    checkUnlock(g);
    expect(g.player.unlocked).toBe(2);
    expect(g.player.weapon).toBe('water');
    expect(g.player.cooldown).toBe(0.15);
    expect(g.player.hp).toBe(100);
    expect(g.banner).toMatchObject({ text: 'NEW WEAPON!', sub: 'WATER GUN - PRESS 3' });
    expect(g.sfx).toEqual(['swap', 'unlock']);
    expect(g.particles).toHaveLength(24);
    expect(g.particles.every((p) => SPARK.includes(p.color))).toBe(true);
  });

  it('does not re-announce a weapon that is already unlocked, even if another is held', () => {
    const g = quietGame();
    g.player.unlocked = 2;
    g.player.kills = 29;
    g.player.weapon = 'knife';
    checkUnlock(g);
    expect(g.player.weapon).toBe('knife');
    expect(g.player.unlocked).toBe(2);
    expect(g.sfx).toEqual([]);
    expect(g.banner).toBeNull();
  });

  it('doubles hp when the tank unlocks and stops there', () => {
    const g = quietGame();
    g.player.weapon = 'laser';
    g.player.hp = 80;
    g.player.kills = 70;
    checkUnlock(g);
    expect(g.player.weapon).toBe('tank');
    expect(g.player.unlocked).toBe(7);
    expect(g.player.hp).toBe(160);
    expect(g.banner?.sub).toBe('BATTLE TANK - PRESS 8');
    g.player.kills = 500;
    g.sfx = [];
    checkUnlock(g);
    expect(g.player.weapon).toBe('tank');
    expect(g.player.hp).toBe(160);
    expect(g.sfx).toEqual([]);
  });
});

describe('equipWeapon', () => {
  it('switches weapon with a short swap delay, cancelling any swing', () => {
    const g = quietGame();
    g.player.swing = 0.1;
    equipWeapon(g, 'ar');
    expect(g.player.weapon).toBe('ar');
    expect(g.player.cooldown).toBe(0.15);
    expect(g.player.swing).toBe(0);
    expect(g.player.hp).toBe(100);
    expect(g.sfx).toEqual(['swap']);
  });

  it('keeps a longer pending cooldown', () => {
    const g = quietGame();
    g.player.cooldown = 0.5;
    equipWeapon(g, 'sniper');
    expect(g.player.cooldown).toBe(0.5);
  });

  it('keeps the same fraction of health when entering and leaving the tank', () => {
    const g = quietGame();
    g.player.hp = 50;
    equipWeapon(g, 'tank');
    expect(g.player.hp).toBe(100);
    equipWeapon(g, 'pistol');
    expect(g.player.hp).toBe(50);
  });

  it('accounts for armor when scaling health', () => {
    const g = quietGame();
    g.player.armorLevel = 2;
    g.player.hp = 75;
    equipWeapon(g, 'tank');
    expect(g.player.hp).toBe(150);
  });

  it('does nothing when the weapon is already equipped', () => {
    const g = quietGame();
    g.player.weapon = 'laser';
    g.player.hp = 40;
    g.player.swing = 0.1;
    equipWeapon(g, 'laser');
    expect(g.player).toMatchObject({ weapon: 'laser', hp: 40, cooldown: 0, swing: 0.1 });
    expect(g.sfx).toEqual([]);
  });
});

describe('targetable', () => {
  it('accepts living aliens above ground', () => {
    const g = quietGame();
    expect(targetable(grunt(g))).toBe(true);
  });

  it('rejects dead aliens', () => {
    const g = quietGame();
    expect(targetable(grunt(g, 300, 0))).toBe(false);
  });

  it('rejects burrowed aliens', () => {
    const g = quietGame();
    const w = createAlien(g, 'worm', 300, GROUND_Y, 'active');
    w.burrowed = true;
    expect(targetable(w)).toBe(false);
  });
});

describe('alienDamage', () => {
  it('uses the base damage on wave 1 and scales it up in later waves', () => {
    const g = quietGame();
    const a = grunt(g);
    expect(alienDamage(g, a)).toBe(ALIENS.grunt.damage);
    g.wave = 5;
    expect(alienDamage(g, a)).toBeCloseTo(ALIENS.grunt.damage * 1.24);
  });
});

describe('shieldFactor', () => {
  /** A shielded alien facing left (toward the base from the right side). */
  function crab(g: Game, type: 'crab' | 'ironcrab' = 'crab'): Alien {
    const a = createAlien(g, type, BASE_X + 200, GROUND_Y, 'active');
    expect(a.facing).toBe(-1);
    return a;
  }

  it('lets every hit through on unshielded aliens', () => {
    const g = quietGame();
    const a = createAlien(g, 'grunt', BASE_X + 200, GROUND_Y, 'active');
    expect(shieldFactor(a, 1, 0)).toBe(1);
  });

  it('fully blocks shallow shots into a crab front', () => {
    const g = quietGame();
    const a = crab(g);
    expect(shieldFactor(a, 1, 0)).toBe(0);
    expect(shieldFactor(a, 10, 7.9)).toBe(0);
    expect(shieldFactor(a, 10, -7.9)).toBe(0);
  });

  it('blocks according to which way the crab faces', () => {
    const g = quietGame();
    const a = createAlien(g, 'crab', BASE_X - 200, GROUND_Y, 'active');
    expect(a.facing).toBe(1);
    expect(shieldFactor(a, -1, 0)).toBe(0);
    expect(shieldFactor(a, 1, 0)).toBe(1);
  });

  it('lets shots from behind through', () => {
    const g = quietGame();
    expect(shieldFactor(crab(g), -1, 0)).toBe(1);
  });

  it('lets steep and vertical shots over the shield', () => {
    const g = quietGame();
    const a = crab(g);
    expect(shieldFactor(a, 10, 8)).toBe(1);
    expect(shieldFactor(a, 1, -5)).toBe(1);
    expect(shieldFactor(a, 0, 1)).toBe(1);
  });

  it('only reduces frontal damage to a quarter on the iron crab boss', () => {
    const g = quietGame();
    const a = crab(g, 'ironcrab');
    expect(shieldFactor(a, 1, 0)).toBe(0.25);
    expect(shieldFactor(a, -1, 0)).toBe(1);
  });
});

describe('hurtPlayer', () => {
  it('damages the player and grants brief invulnerability', () => {
    const g = quietGame();
    hurtPlayer(g, 30);
    const p = g.player;
    expect(p.hp).toBe(70);
    expect(p.invuln).toBe(0.45);
    expect(p.hurt).toBe(0.25);
    expect(p.alive).toBe(true);
    expect(g.shake).toBe(3);
    expect(g.sfx).toEqual(['playerHit']);
    expect(g.particles).toHaveLength(6);
    expect(g.particles.every((pt) => BLOOD.includes(pt.color))).toBe(true);
  });

  it('ignores damage while invulnerable', () => {
    const g = quietGame();
    hurtPlayer(g, 30);
    hurtPlayer(g, 30);
    expect(g.player.hp).toBe(70);
    expect(g.sfx).toEqual(['playerHit']);
  });

  it('ignores damage when already dead', () => {
    const g = quietGame();
    g.player.alive = false;
    g.player.hp = 0;
    hurtPlayer(g, 30);
    expect(g.player.hp).toBe(0);
    expect(g.sfx).toEqual([]);
    expect(g.particles).toEqual([]);
  });

  it('kills the player and schedules a respawn on lethal damage', () => {
    const g = quietGame();
    hurtPlayer(g, 150);
    const p = g.player;
    expect(p.hp).toBe(0);
    expect(p.alive).toBe(false);
    expect(p.respawn).toBe(RESPAWN_TIME);
    expect(g.sfx).toEqual(['playerDie']);
    expect(g.texts.map((t) => t.text)).toEqual(['MAN DOWN!']);
    expect(g.particles).toHaveLength(6 + 30);
  });

  it('treats exactly zero hp as death', () => {
    const g = quietGame();
    hurtPlayer(g, 100);
    expect(g.player.alive).toBe(false);
  });
});

describe('hurtSoldier', () => {
  it('damages and flashes a soldier', () => {
    const g = quietGame();
    const s = createSoldier(g);
    hurtSoldier(g, s, 15);
    expect(s.hp).toBe(25);
    expect(s.flash).toBe(0.1);
    expect(g.sfx).toEqual([]);
    expect(g.texts).toEqual([]);
  });

  it('announces a lost soldier on lethal damage', () => {
    const g = quietGame();
    const s = createSoldier(g);
    hurtSoldier(g, s, 40);
    expect(s.hp).toBe(0);
    expect(g.sfx).toEqual(['playerDie']);
    expect(g.texts.map((t) => t.text)).toEqual(['SOLDIER LOST']);
    expect(g.particles).toHaveLength(20);
  });

  it('ignores soldiers that are already dead', () => {
    const g = quietGame();
    const s = createSoldier(g);
    s.hp = 0;
    hurtSoldier(g, s, 10);
    expect(s.hp).toBe(0);
    expect(s.flash).toBe(0);
    expect(g.sfx).toEqual([]);
  });
});

describe('hurtBase', () => {
  it('damages an unarmored base and kicks up dust', () => {
    const g = quietGame();
    g.rng = () => 0.5;
    hurtBase(g, 10);
    expect(g.base.hp).toBe(290);
    expect(g.base.flash).toBe(0.1);
    expect(g.shake).toBe(2);
    expect(g.sfx).toEqual(['baseHit']);
    expect(g.particles).toHaveLength(4);
    expect(g.particles.every((p) => DUST.includes(p.color) && p.x === BASE_X && p.y === ROOF_Y + 15)).toBe(true);
  });

  it('reduces damage by base armor', () => {
    const g = quietGame();
    g.base.level = 3;
    g.base.hp = 650;
    hurtBase(g, 10);
    expect(g.base.hp).toBeCloseTo(642);
  });

  it('never drops base hp below zero', () => {
    const g = quietGame();
    g.base.hp = 5;
    hurtBase(g, 50);
    expect(g.base.hp).toBe(0);
  });
});

describe('explode', () => {
  it('damages living aliens in radius with falloff and outward knockback', () => {
    const g = quietGame();
    const cy = GROUND_Y - ALIENS.grunt.h / 2;
    const center = grunt(g, 300);
    const edge = grunt(g, 300 + SHELL_RADIUS + 5);
    const left = grunt(g, 300 - 20);
    const far = grunt(g, 300 + SHELL_RADIUS + 6);
    const dead = grunt(g, 300, 0);
    explode(g, 300, cy, SHELL_RADIUS, 10, 'player');
    expect(center.hp).toBe(90);
    expect(center.kx).toBe(220);
    expect(edge.hp).toBeCloseTo(95);
    expect(edge.kx).toBe(220);
    expect(left.hp).toBeCloseTo(100 - 10 * (1 - (0.5 * 15) / SHELL_RADIUS));
    expect(left.kx).toBe(-220);
    expect(far.hp).toBe(100);
    expect(far.kx).toBe(0);
    expect(dead.hp).toBe(0);
    expect(dead.flash).toBe(0);
  });

  it('bursts fire and smoke, shakes, and plays an explosion', () => {
    const g = quietGame();
    explode(g, 100, 100, SHELL_RADIUS, 10, 'player');
    expect(g.particles).toHaveLength(36);
    expect(g.particles.filter((p) => FIRE.includes(p.color))).toHaveLength(26);
    expect(g.shake).toBe(6);
    expect(g.sfx).toEqual(['explode']);
  });

  it('reaches burrowed aliens', () => {
    const g = quietGame();
    const w = createAlien(g, 'worm', 300, GROUND_Y, 'active');
    w.burrowed = true;
    w.hp = 100;
    explode(g, 300, GROUND_Y - 7, SHELL_RADIUS, 10, 'player');
    expect(w.hp).toBe(90);
  });

  it('kills aliens it reduces to zero hp, crediting the given team', () => {
    const g = quietGame();
    const a = grunt(g, 300, 1);
    explode(g, 300, GROUND_Y - 7.5, SHELL_RADIUS, 10, 'ally');
    expect(a.hp).toBe(0);
    expect(g.stats.kills).toBe(1);
    expect(g.player.kills).toBe(0);
    expect(g.sfx).toEqual(['alienDie', 'explode']);
  });
});

describe('explodeFriendly', () => {
  /** A quiet game with the player moved off the base, far from x = 100. */
  function field(): Game {
    const g = quietGame();
    g.player.x = 900;
    g.player.y = GROUND_Y;
    return g;
  }

  it('bursts fire and goo, shakes, and plays an explosion', () => {
    const g = field();
    explodeFriendly(g, 100, 100, BLAST_RADIUS, 10);
    expect(g.particles).toHaveLength(30);
    expect(g.particles.filter((p) => FIRE.includes(p.color))).toHaveLength(22);
    expect(g.shake).toBe(5);
    expect(g.sfx).toEqual(['explode']);
    expect(g.player.hp).toBe(100);
    expect(g.base.hp).toBe(300);
  });

  it('hurts a living player within reach of the blast', () => {
    const g = field();
    explodeFriendly(g, 900 + BLAST_RADIUS + 4, GROUND_Y - 7, BLAST_RADIUS, 20);
    expect(g.player.hp).toBe(80);
    expect(g.sfx).toEqual(['playerHit', 'explode']);
  });

  it('misses a player just out of reach', () => {
    const g = field();
    explodeFriendly(g, 900 + BLAST_RADIUS + 5, GROUND_Y - 7, BLAST_RADIUS, 20);
    expect(g.player.hp).toBe(100);
  });

  it('ignores a dead player', () => {
    const g = field();
    g.player.alive = false;
    explodeFriendly(g, 900, GROUND_Y - 7, BLAST_RADIUS, 20);
    expect(g.player.hp).toBe(100);
    expect(g.sfx).toEqual(['explode']);
  });

  it('hurts living soldiers within reach only', () => {
    const g = field();
    const [hit, dead, edge, far] = [createSoldier(g), createSoldier(g), createSoldier(g), createSoldier(g)];
    hit.x = 100;
    dead.x = 100;
    dead.hp = 0;
    edge.x = 100 + BLAST_RADIUS + 4;
    far.x = 100 + BLAST_RADIUS + 5;
    explodeFriendly(g, 100, GROUND_Y - 8, BLAST_RADIUS, 15);
    expect(hit.hp).toBe(25);
    expect(dead.hp).toBe(0);
    expect(dead.flash).toBe(0);
    expect(edge.hp).toBe(25);
    expect(far.hp).toBe(40);
  });

  it('damages the base when the blast touches its walls or roof', () => {
    const g = field();
    explodeFriendly(g, BASE_X, ROOF_Y - BLAST_RADIUS, BLAST_RADIUS, 10);
    expect(g.base.hp).toBe(290);
    explodeFriendly(g, BASE_X + BASE_HALF_W + BLAST_RADIUS, GROUND_Y - 10, BLAST_RADIUS, 10);
    expect(g.base.hp).toBe(280);
    explodeFriendly(g, BASE_X, GROUND_Y - 10, BLAST_RADIUS, 10);
    expect(g.base.hp).toBe(270);
    expect(g.sfx.filter((s) => s === 'baseHit')).toHaveLength(3);
  });

  it('spares the base just outside the blast', () => {
    const g = field();
    explodeFriendly(g, BASE_X - BASE_HALF_W - BLAST_RADIUS - 1, GROUND_Y - 10, BLAST_RADIUS, 10);
    explodeFriendly(g, BASE_X, ROOF_Y - BLAST_RADIUS - 1, BLAST_RADIUS, 10);
    expect(g.base.hp).toBe(300);
    expect(g.sfx).toEqual(['explode', 'explode']);
  });

  it('never hurts aliens', () => {
    const g = field();
    const a = grunt(g, 100);
    explodeFriendly(g, 100, GROUND_Y - 7, BLAST_RADIUS, 50);
    expect(a.hp).toBe(100);
  });
});
