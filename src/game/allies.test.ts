import { describe, expect, it, vi } from 'vitest';
import { waveGame } from '../test/helpers';
import { nearestAlien, turretPos, turretStats, updateAllies } from './allies';
import { ALIENS, BASE_HALF_W, BASE_X, DT, GROUND_Y, ROOF_Y, SOLDIER, TURRET, TURRET_SLOTS } from './config';
import { SMOKE } from './effects';
import { baseMaxHp, createAlien, createSoldier } from './state';
import type { Alien, Game, Turret } from './types';

const BULLET_SPEED = 500;
const GRUNT_MID = ALIENS.grunt.h / 2;

/** A grunt whose body center sits exactly at (x, y). */
function gruntAt(g: Game, x: number, y: number): Alien {
  return createAlien(g, 'grunt', x, y + GRUNT_MID, 'active');
}

function addTurret(g: Game, over: Partial<Turret> = {}): Turret {
  const t: Turret = { slot: 0, cd: 0, aim: 0, recoil: 0, ...over };
  g.turrets.push(t);
  return t;
}

describe('turretStats', () => {
  it('starts from the base turret stats at level 1', () => {
    expect(turretStats(1)).toEqual({ damage: TURRET.damage, cooldown: TURRET.cooldown, range: TURRET.range });
  });

  it('gets stronger, faster and longer-ranged per level', () => {
    const s = turretStats(3);
    expect(s.damage).toBeCloseTo(TURRET.damage + 2 * TURRET.damagePerLevel);
    expect(s.cooldown).toBeCloseTo(TURRET.cooldown * TURRET.cooldownMul ** 2);
    expect(s.range).toBe(TURRET.range + 2 * TURRET.rangePerLevel);
  });
});

describe('turretPos', () => {
  it('places each slot on the roof at its offset', () => {
    expect(turretPos(0)).toEqual({ x: BASE_X + TURRET_SLOTS[0], y: ROOF_Y - 5 });
    expect(turretPos(3)).toEqual({ x: BASE_X + TURRET_SLOTS[3], y: ROOF_Y - 5 });
  });
});

describe('nearestAlien', () => {
  it('returns null when there are no aliens', () => {
    expect(nearestAlien(waveGame(), 0, 0, 100)).toBeNull();
  });

  it('picks the closest living alien regardless of list order', () => {
    const g = waveGame();
    const far = gruntAt(g, 50, 0);
    const near = gruntAt(g, 20, 0);
    const farther = gruntAt(g, 80, 0);
    expect(nearestAlien(g, 0, 0, 100)).toBe(near);
    near.hp = 0;
    expect(nearestAlien(g, 0, 0, 100)).toBe(far);
    expect(farther.hp).toBeGreaterThan(0);
  });

  it('skips burrowed aliens, which are hidden underground', () => {
    const g = waveGame();
    const hidden = gruntAt(g, 10, 0);
    hidden.burrowed = true;
    const visible = gruntAt(g, 60, 0);
    expect(nearestAlien(g, 0, 0, 100)).toBe(visible);
    visible.burrowed = true;
    expect(nearestAlien(g, 0, 0, 100)).toBeNull();
    hidden.burrowed = false;
    expect(nearestAlien(g, 0, 0, 100)).toBe(hidden);
  });

  it('measures to the alien body center and excludes aliens at or beyond range', () => {
    const g = waveGame();
    const a = gruntAt(g, 100, 0);
    expect(nearestAlien(g, 0, 0, 100)).toBeNull();
    a.x = 99.9;
    expect(nearestAlien(g, 0, 0, 100)).toBe(a);
  });
});

describe('updateAllies', () => {
  describe('turrets', () => {
    it('fire at the nearest alien in range', () => {
      const g = waveGame();
      g.rng = () => 0.5; // zero spread
      const t = addTurret(g);
      const { x, y } = turretPos(0);
      gruntAt(g, x - 100, y + 37.5);
      updateAllies(g, DT);
      const angle = Math.atan2(37.5, -100);
      expect(t.aim).toBeCloseTo(angle);
      expect(t.cd).toBe(TURRET.cooldown);
      expect(t.recoil).toBe(0.08);
      expect(g.projectiles).toHaveLength(1);
      const pr = g.projectiles[0];
      expect(pr).toMatchObject({ kind: 'bullet', team: 'ally', damage: TURRET.damage, gravity: 0, pierce: 1, knock: 20, hit: [] });
      expect(pr.x).toBeCloseTo(x + Math.cos(angle) * 8);
      expect(pr.y).toBeCloseTo(y + Math.sin(angle) * 8);
      expect(pr.vx).toBeCloseTo(Math.cos(angle) * BULLET_SPEED);
      expect(pr.vy).toBeCloseTo(Math.sin(angle) * BULLET_SPEED);
      expect(pr.life).toBeCloseTo((TURRET.range * 1.2) / BULLET_SPEED);
      expect(g.sfx).toEqual(['turret']);
    });

    it('add a little random spread to each shot', () => {
      const g = waveGame();
      g.rng = () => 0.75;
      addTurret(g);
      const { x, y } = turretPos(0);
      gruntAt(g, x - 100, y);
      updateAllies(g, DT);
      const pr = g.projectiles[0];
      expect(Math.atan2(pr.vy, pr.vx)).toBeCloseTo(Math.PI + 0.02 - 2 * Math.PI);
    });

    it('track a target but hold fire while reloading', () => {
      const g = waveGame();
      const t = addTurret(g, { cd: 0.3, recoil: 0.05 });
      const { x, y } = turretPos(0);
      gruntAt(g, x + 50, y);
      updateAllies(g, 0.1);
      expect(t.aim).toBeCloseTo(0);
      expect(t.cd).toBeCloseTo(0.2);
      expect(t.recoil).toBe(0);
      expect(g.projectiles).toHaveLength(0);
      expect(g.sfx).toEqual([]);
    });

    it('stay idle with nothing in range', () => {
      const g = waveGame();
      const t = addTurret(g, { aim: 1 });
      const { x, y } = turretPos(0);
      gruntAt(g, x - 200, y);
      updateAllies(g, 0.1);
      expect(t.aim).toBe(1);
      expect(t.cd).toBeCloseTo(-0.1);
      expect(g.projectiles).toHaveLength(0);
    });

    it('ignore aliens burrowed underground', () => {
      const g = waveGame();
      const t = addTurret(g, { aim: 1 });
      const { x, y } = turretPos(0);
      const worm = createAlien(g, 'worm', x - 50, GROUND_Y, 'active');
      worm.burrowed = true;
      updateAllies(g, DT);
      expect(t.aim).toBe(1);
      expect(g.projectiles).toHaveLength(0);
      worm.burrowed = false;
      updateAllies(g, DT);
      expect(t.aim).toBeCloseTo(Math.atan2(GROUND_Y - ALIENS.worm.h / 2 - y, -50));
      expect(g.projectiles).toHaveLength(1);
    });

    it('reach farther and hit harder after an upgrade', () => {
      const g = waveGame();
      const t = addTurret(g);
      const { x, y } = turretPos(0);
      gruntAt(g, x - 200, y);
      g.base.turretLevel = 2;
      updateAllies(g, 0.1);
      expect(g.projectiles).toHaveLength(1);
      expect(g.projectiles[0].damage).toBeCloseTo(TURRET.damage + TURRET.damagePerLevel);
      expect(t.cd).toBeCloseTo(TURRET.cooldown * TURRET.cooldownMul);
    });
  });

  describe('soldiers', () => {
    it('shoot at the nearest alien in range', () => {
      const g = waveGame();
      g.rng = () => 0.5;
      const s = createSoldier(g);
      s.flash = 0.05;
      const y = GROUND_Y - 9;
      gruntAt(g, s.x - 150, y);
      updateAllies(g, 0.1);
      expect(s.aim).toBeCloseTo(Math.PI);
      expect(s.cd).toBe(SOLDIER.cooldown);
      expect(s.recoil).toBe(0.08);
      expect(s.flash).toBe(0);
      expect(g.projectiles).toHaveLength(1);
      expect(g.projectiles[0]).toMatchObject({ team: 'ally', damage: SOLDIER.damage });
      expect(g.projectiles[0].x).toBeCloseTo(s.x - 8);
      expect(g.projectiles[0].life).toBeCloseTo((SOLDIER.range * 1.2) / BULLET_SPEED);
      expect(g.sfx).toEqual(['turret']);
    });

    it('aim but hold fire while reloading', () => {
      const g = waveGame();
      const s = createSoldier(g);
      s.cd = 1;
      s.recoil = 0.05;
      gruntAt(g, s.x + 100, GROUND_Y - 9);
      updateAllies(g, 0.1);
      expect(s.aim).toBeCloseTo(0);
      expect(s.cd).toBeCloseTo(0.9);
      expect(s.recoil).toBe(0);
      expect(g.projectiles).toHaveLength(0);
    });

    it('stay idle with nothing in range', () => {
      const g = waveGame();
      const s = createSoldier(g);
      const aim = s.aim;
      gruntAt(g, s.x - SOLDIER.range - 1, GROUND_Y - 9);
      updateAllies(g, 0.1);
      expect(s.aim).toBe(aim);
      expect(g.projectiles).toHaveLength(0);
    });

    it('hold fire at burrowed aliens', () => {
      const g = waveGame();
      const s = createSoldier(g);
      const aim = s.aim;
      createAlien(g, 'worm', s.x - 30, GROUND_Y, 'active').burrowed = true;
      updateAllies(g, 0.1);
      expect(s.aim).toBe(aim);
      expect(g.projectiles).toHaveLength(0);
    });

    it('are removed once dead', () => {
      const g = waveGame();
      const dead = createSoldier(g);
      const alive = createSoldier(g);
      dead.hp = 0;
      updateAllies(g, 0.1);
      expect(g.soldiers).toEqual([alive]);
    });
  });

  describe('base', () => {
    it('fades the hit flash', () => {
      const g = waveGame();
      g.base.flash = 0.05;
      updateAllies(g, 0.1);
      expect(g.base.flash).toBe(0);
    });

    it.each([
      ['full health', 1],
      ['light damage', 0.6],
    ])('does not smoke at %s', (_label, frac) => {
      const g = waveGame();
      const rng = vi.fn(() => 0);
      g.rng = rng;
      g.base.hp = baseMaxHp(1) * frac;
      updateAllies(g, 0.1);
      expect(rng).not.toHaveBeenCalled();
      expect(g.particles).toHaveLength(0);
    });

    it('smokes when heavily damaged', () => {
      const g = waveGame();
      g.rng = () => 0;
      g.base.hp = baseMaxHp(1) * 0.3;
      updateAllies(g, 0.1);
      expect(g.particles).toHaveLength(1);
      expect(g.particles[0]).toMatchObject({ x: BASE_X - BASE_HALF_W * 0.8, y: ROOF_Y, color: SMOKE[0], gravity: -30, size: 2 });
    });

    it('only sometimes smokes when heavily damaged', () => {
      const g = waveGame();
      g.rng = () => 0.99;
      g.base.hp = baseMaxHp(1) * 0.3;
      updateAllies(g, 0.1);
      expect(g.particles).toHaveLength(0);
    });
  });
});
