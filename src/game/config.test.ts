import { describe, expect, it } from 'vitest';
import {
  ALIENS,
  ALIEN_ORDER,
  BASE_H,
  BASE_HALF_W,
  BASE_LEVELS,
  BASE_X,
  BOSS_ORDER,
  ENEMY_ORDER,
  GROUND_Y,
  PRICES,
  ROOF_Y,
  TOTAL_WAVES,
  TURRET,
  TURRET_SLOTS,
  WAVES,
  WEAPONS,
  WEAPON_ORDER,
  WORLD_W,
  damageMultiplier,
  hpMultiplier,
  spawnInterval,
  speedMultiplier,
  ufoCount,
  waveBonus,
  type EnemyType,
} from './config';

describe('wave scaling', () => {
  it('scales alien hp by 27% per wave', () => {
    expect(hpMultiplier(1)).toBe(1);
    expect(hpMultiplier(2)).toBeCloseTo(1.27);
    expect(hpMultiplier(10)).toBeCloseTo(3.43);
  });

  it('scales alien speed by 4% per wave', () => {
    expect(speedMultiplier(1)).toBe(1);
    expect(speedMultiplier(2)).toBeCloseTo(1.04);
    expect(speedMultiplier(10)).toBeCloseTo(1.36);
  });

  it('scales alien damage by 6% per wave', () => {
    expect(damageMultiplier(1)).toBe(1);
    expect(damageMultiplier(2)).toBeCloseTo(1.06);
    expect(damageMultiplier(10)).toBeCloseTo(1.54);
  });

  it('shortens the spawn interval each wave but keeps it positive', () => {
    expect(spawnInterval(1)).toBeCloseTo(0.95);
    expect(spawnInterval(2)).toBeCloseTo(0.89);
    expect(spawnInterval(TOTAL_WAVES)).toBeCloseTo(0.41);
    for (let w = 1; w <= TOTAL_WAVES; w++) expect(spawnInterval(w)).toBeGreaterThan(0);
  });

  it('starts with two UFOs and adds one every three waves', () => {
    expect([1, 2, 3, 4, 6, 7, 10].map(ufoCount)).toEqual([2, 2, 2, 3, 3, 4, 5]);
  });

  it('pays a growing wave-clear bonus', () => {
    expect(waveBonus(1)).toBe(25);
    expect(waveBonus(10)).toBe(115);
  });
});

describe('prices', () => {
  it('makes each extra turret more expensive', () => {
    expect(PRICES.turret(0)).toBe(110);
    expect(PRICES.turret(1)).toBe(170);
    expect(PRICES.turret(3)).toBe(290);
  });

  it('makes each extra soldier more expensive', () => {
    expect(PRICES.soldier(0)).toBe(60);
    expect(PRICES.soldier(1)).toBe(85);
    expect(PRICES.soldier(4)).toBe(160);
  });

  it('has one base upgrade price per level beyond the first', () => {
    expect(PRICES.base).toHaveLength(BASE_LEVELS.length - 1);
  });

  it('has one turret upgrade price per level beyond the first', () => {
    expect(PRICES.turretLevel).toHaveLength(TURRET.maxLevel - 1);
  });
});

describe('static tables', () => {
  it('derives base geometry from the world size', () => {
    expect(BASE_X).toBe(WORLD_W / 2);
    expect(ROOF_Y).toBe(GROUND_Y - BASE_H);
  });

  it('lists every weapon exactly once in unlock order, ending with the tank', () => {
    expect([...WEAPON_ORDER].sort()).toEqual(Object.keys(WEAPONS).sort());
    expect(WEAPON_ORDER[0]).toBe('knife');
    expect(WEAPON_ORDER[WEAPON_ORDER.length - 1]).toBe('tank');
  });

  it('lists every alien type exactly once, regular enemies before bosses', () => {
    expect([...ALIEN_ORDER].sort()).toEqual(Object.keys(ALIENS).sort());
    expect(ALIEN_ORDER).toEqual([...ENEMY_ORDER, ...BOSS_ORDER]);
    expect(new Set(ALIEN_ORDER).size).toBe(ALIEN_ORDER.length);
  });

  it('flags exactly the boss types as bosses, and every boss as heavy', () => {
    for (const t of ENEMY_ORDER) expect(ALIENS[t].boss).toBe(false);
    for (const t of BOSS_ORDER) {
      expect(ALIENS[t].boss).toBe(true);
      expect(ALIENS[t].heavy).toBe(true);
    }
    expect(ALIENS.overlord.name).toBe('OVERLORD');
  });

  it('fills unspecified alien stats with ground-melee defaults', () => {
    expect(ALIENS.grunt).toMatchObject({ range: 0, alt: 0, heavy: false, boss: false, shielded: false, group: 1, scale: 1 });
  });

  it('keeps explicit alien stats over the defaults', () => {
    expect(ALIENS.spitter.range).toBe(150);
    expect(ALIENS.flyer.alt).toBeGreaterThan(0);
    expect(ALIENS.bug.group).toBe(4);
    expect(ALIENS.brute).toMatchObject({ heavy: true, scale: 2 });
    expect(ALIENS.overlord.scale).toBe(3);
  });

  it('shields only the crab and the iron crab', () => {
    expect(ALIEN_ORDER.filter((t) => ALIENS[t].shielded)).toEqual(['crab', 'ironcrab']);
  });

  it('gives the kamikaze blob no ranged attack and makes it hit hard', () => {
    expect(ALIENS.blob.attackRate).toBe(0);
    expect(ALIENS.blob.damage).toBeGreaterThan(ALIENS.grunt.damage);
  });

  it('defines one wave per total wave, each ending with a boss', () => {
    expect(WAVES).toHaveLength(TOTAL_WAVES);
    for (const w of WAVES) expect(BOSS_ORDER).toContain(w.boss);
    expect(WAVES[TOTAL_WAVES - 1]).toMatchObject({ boss: 'overlord', elite: false });
  });

  it('brings back earlier bosses as elites in the middle waves', () => {
    expect(WAVES.map((w) => w.elite)).toEqual([false, false, false, false, false, true, true, true, true, false]);
    for (let i = 5; i < 9; i++) expect(WAVES[i].boss).toBe(WAVES[i - 5].boss);
  });

  it('fills wave hordes only with regular enemies, never minis (they come from splitters)', () => {
    for (const w of WAVES) {
      const types = Object.keys(w.horde) as EnemyType[];
      for (const t of types) {
        expect(ENEMY_ORDER).toContain(t);
        expect(w.horde[t]).toBeGreaterThan(0);
      }
      expect(types).not.toContain('mini');
    }
  });

  it('gives base levels increasing hp and armor', () => {
    for (let i = 1; i < BASE_LEVELS.length; i++) {
      expect(BASE_LEVELS[i].hp).toBeGreaterThan(BASE_LEVELS[i - 1].hp);
      expect(BASE_LEVELS[i].armor).toBeGreaterThan(BASE_LEVELS[i - 1].armor);
    }
  });

  it('places every turret slot on the base roof', () => {
    for (const s of TURRET_SLOTS) expect(Math.abs(s)).toBeLessThan(BASE_HALF_W);
  });
});
