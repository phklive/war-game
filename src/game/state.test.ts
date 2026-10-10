import { describe, expect, it } from 'vitest';
import { ALIENS, BASE_HALF_W, BASE_LEVELS, BASE_X, GROUND_Y, PLAYER_STATS, ROOF_Y, SOLDIER, START_MONEY, TANK_STATS, VIEW_W } from './config';
import {
  baseArmor,
  baseMaxHp,
  createAlien,
  createGame,
  createPlayer,
  createSoldier,
  playerMaxHp,
  playerSize,
  resetGame,
  soldierHomeX,
} from './state';

describe('createPlayer', () => {
  it('spawns a knife-wielding player on the base roof at full health', () => {
    expect(createPlayer()).toEqual({
      x: BASE_X,
      y: ROOF_Y,
      vx: 0,
      vy: 0,
      facing: 1,
      onGround: true,
      hp: PLAYER_STATS.hp,
      alive: true,
      respawn: 0,
      invuln: 0,
      hurt: 0,
      weapon: 'knife',
      unlocked: 0,
      cooldown: 0,
      aim: 0,
      kills: 0,
      anim: 0,
      swing: 0,
      muzzle: 0,
      slow: 0,
      armorLevel: 0,
      magnetLevel: 0,
    });
  });

  it('returns a fresh object on each call', () => {
    expect(createPlayer()).not.toBe(createPlayer());
  });
});

describe('createGame', () => {
  it('starts on the title screen with starting money and a level-1 base', () => {
    const g = createGame(1);
    expect(g).toMatchObject({
      phase: 'title',
      paused: false,
      wave: 0,
      money: START_MONEY,
      time: 0,
      phaseTimer: 0,
      nextId: 1,
      base: { level: 1, hp: BASE_LEVELS[0].hp, turretLevel: 1, flash: 0 },
      aliens: [],
      projectiles: [],
      coins: [],
      particles: [],
      tracers: [],
      texts: [],
      turrets: [],
      soldiers: [],
      ufos: [],
      spawnQueue: [],
      camX: BASE_X - VIEW_W / 2,
      shake: 0,
      banner: null,
      sfx: [],
      stats: { kills: 0, earned: 0 },
    });
    expect(g.player).toEqual(createPlayer());
  });

  it('seeds the rng deterministically', () => {
    const a = createGame(5);
    const b = createGame(5);
    const c = createGame(6);
    const seqA = [a.rng(), a.rng(), a.rng()];
    expect([b.rng(), b.rng(), b.rng()]).toEqual(seqA);
    expect([c.rng(), c.rng(), c.rng()]).not.toEqual(seqA);
  });
});

describe('resetGame', () => {
  it('restores a used game to a fresh state in place with the new seed', () => {
    const g = createGame(1);
    const ref = g;
    g.phase = 'wave';
    g.wave = 5;
    g.money = 999;
    g.player.hp = 1;
    g.player.weapon = 'tank';
    g.sfx.push('coin');
    createAlien(g, 'grunt', 10, GROUND_Y, 'active');
    createSoldier(g);

    resetGame(g, 7);

    expect(g).toBe(ref);
    expect(g.phase).toBe('title');
    expect(g.wave).toBe(0);
    expect(g.money).toBe(START_MONEY);
    expect(g.player).toEqual(createPlayer());
    expect(g.aliens).toEqual([]);
    expect(g.soldiers).toEqual([]);
    expect(g.sfx).toEqual([]);
    expect(g.nextId).toBe(1);
    expect(g.rng()).toBe(createGame(7).rng());
  });
});

describe('base stats', () => {
  it('looks up max hp and armor by 1-based level', () => {
    BASE_LEVELS.forEach((lvl, i) => {
      expect(baseMaxHp(i + 1)).toBe(lvl.hp);
      expect(baseArmor(i + 1)).toBe(lvl.armor);
    });
    expect(baseMaxHp(1)).toBe(300);
    expect(baseArmor(5)).toBe(0.4);
  });
});

describe('player size and hp', () => {
  it('uses the soldier hitbox normally and the tank hitbox for the tank', () => {
    const p = createPlayer();
    expect(playerSize(p)).toBe(PLAYER_STATS);
    p.weapon = 'tank';
    expect(playerSize(p)).toBe(TANK_STATS);
  });

  it('adds armor hp per level and doubles hp in the tank', () => {
    const p = createPlayer();
    expect(playerMaxHp(p)).toBe(100);
    p.armorLevel = 2;
    expect(playerMaxHp(p)).toBe(150);
    p.weapon = 'tank';
    expect(playerMaxHp(p)).toBe(300);
  });
});

describe('createAlien', () => {
  it('scales hp with the wave, assigns increasing ids, and registers the alien', () => {
    const g = createGame(1);
    g.wave = 3;
    const a = createAlien(g, 'grunt', 100, GROUND_Y, 'active');
    const b = createAlien(g, 'brute', 200, 0, 'descend');
    expect(a.hp).toBeCloseTo(ALIENS.grunt.hp * 1.54);
    expect(a.maxHp).toBe(a.hp);
    expect(b.hp).toBeCloseTo(ALIENS.brute.hp * 1.54);
    expect([a.id, b.id]).toEqual([1, 2]);
    expect(g.nextId).toBe(3);
    expect(g.aliens).toEqual([a, b]);
    expect(a).toMatchObject({ type: 'grunt', x: 100, y: GROUND_Y, state: 'active', vx: 0, vy: 0, kx: 0, trap: 0, slow: 0, atkCd: 0.3, summon: 6, flash: 0, attacking: false });
    expect(b.state).toBe('descend');
  });

  it('starts aliens as regular, above ground, with idle AI state targeting their spawn x', () => {
    const g = createGame(1);
    const a = createAlien(g, 'worm', 321, GROUND_Y, 'active');
    expect(a).toMatchObject({ elite: false, burrowed: false, mode: 0, timer: 0, tx: 321 });
  });

  it('gives wave-1 aliens, including bosses, their unscaled hp', () => {
    const g = createGame(1);
    g.wave = 1;
    expect(createAlien(g, 'overlord', 100, GROUND_Y, 'active').hp).toBe(ALIENS.overlord.hp);
  });

  it('faces the base from either side', () => {
    const g = createGame(1);
    expect(createAlien(g, 'grunt', BASE_X - 1, GROUND_Y, 'active').facing).toBe(1);
    expect(createAlien(g, 'grunt', BASE_X, GROUND_Y, 'active').facing).toBe(-1);
    expect(createAlien(g, 'grunt', BASE_X + 300, GROUND_Y, 'active').facing).toBe(-1);
  });

  it('randomizes special timer, animation phase and pace from the rng', () => {
    const g = createGame(1);
    g.rng = () => 0;
    expect(createAlien(g, 'grunt', 0, GROUND_Y, 'active')).toMatchObject({ special: 1.5, anim: 0, pace: 0.85 });
    g.rng = () => 0.5;
    const a = createAlien(g, 'grunt', 0, GROUND_Y, 'active');
    expect(a.special).toBeCloseTo(2.25);
    expect(a.anim).toBeCloseTo(5);
    expect(a.pace).toBeCloseTo(1);
  });
});

describe('soldiers', () => {
  it('alternates home positions left and right of the base, moving outward', () => {
    const inner = BASE_HALF_W + 12;
    expect(soldierHomeX(0)).toBe(BASE_X - inner);
    expect(soldierHomeX(1)).toBe(BASE_X + inner);
    expect(soldierHomeX(2)).toBe(BASE_X - inner - 14);
    expect(soldierHomeX(3)).toBe(BASE_X + inner + 14);
  });

  it('fills the lowest free slot, facing outward from the base', () => {
    const g = createGame(1);
    const a = createSoldier(g);
    const b = createSoldier(g);
    const c = createSoldier(g);
    expect([a.slot, b.slot, c.slot]).toEqual([0, 1, 2]);
    expect([a.id, b.id, c.id]).toEqual([1, 2, 3]);
    expect(a).toMatchObject({ x: soldierHomeX(0), hp: SOLDIER.hp, cd: 0, aim: Math.PI, flash: 0, recoil: 0 });
    expect(b.aim).toBe(0);
    expect(g.soldiers).toEqual([a, b, c]);

    g.soldiers = g.soldiers.filter((s) => s.slot !== 1);
    const d = createSoldier(g);
    expect(d.slot).toBe(1);
    expect(d.x).toBe(soldierHomeX(1));
    expect(createSoldier(g).slot).toBe(3);
  });
});
