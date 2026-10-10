import { describe, expect, it } from 'vitest';
import { waveGame } from '../test/helpers';
import type { Ai } from './ai';
import { advanceBoss, brood, carrier, ironcrab, kraken, overlord, spawnBoss, wormking } from './bosses';
import {
  ALIENS,
  BASE_HALF_W,
  BASE_LEVELS,
  BASE_X,
  BOMB_GRAVITY,
  DT,
  ELITE_HP,
  GROUND_Y,
  PLASMA_SPEED,
  PLAYER_STATS,
  ROOF_Y,
  UFO_Y,
  WEB_SPEED,
  WORLD_W,
  damageMultiplier,
  hpMultiplier,
  type AlienType,
  type BossType,
} from './config';
import { DIRT, GOO } from './effects';
import { createAlien } from './state';
import type { Alien, Game, PendingBoss, Point, Projectile } from './types';

const LEFT_WALL: Point = { x: BASE_X - BASE_HALF_W + 4, y: ROOF_Y + 14 };
// Iron Crab / Worm King modes
const WALK = 0;
const CHARGE = 1;
const RECOIL = 2;
const TRAVEL = 0;
const RUMBLE = 1;
const SURFACED = 2;

function spawn(g: Game, type: AlienType, x: number, y: number = GROUND_Y, over: Partial<Alien> = {}): Alien {
  return Object.assign(createAlien(g, type, x, y, 'active'), over);
}

function step(g: Game, a: Alien, ai: Ai, dt: number): void {
  ai(g, a, ALIENS[a.type], dt, ALIENS[a.type].speed);
}

function playerAt(g: Game, x: number, y: number = GROUND_Y): void {
  g.player.x = x;
  g.player.y = y;
}

function noPlayer(): Game {
  const g = waveGame();
  g.player.alive = false;
  return g;
}

/** Feed the rng a fixed script of rolls, then 0.5 forever. */
function scriptRng(g: Game, rolls: number[]): void {
  let i = 0;
  g.rng = () => (i < rolls.length ? rolls[i++] : 0.5);
}

const angleOf = (p: Projectile): number => Math.atan2(p.vy, p.vx);
const speedOf = (p: Projectile): number => Math.hypot(p.vx, p.vy);
const landingX = (p: Projectile): number => p.x + p.vx * (p.life - 2);
const newAliens = (g: Game, boss: Alien): Alien[] => g.aliens.filter((a) => a !== boss);

describe('advanceBoss', () => {
  const pending = (over: Partial<PendingBoss> = {}): PendingBoss => ({ type: 'kraken', elite: false, timer: 2, announced: false, ...over });

  it('announces the incoming boss once, then counts down', () => {
    const g = waveGame();
    const p = pending();
    g.pendingBoss = p;
    advanceBoss(g, p, 0.5);
    expect(g.banner).toEqual({ text: 'BOSS INCOMING!', sub: 'ACID KRAKEN', color: '#ff4040', life: 2.6 });
    expect(g.sfx).toEqual(['boss']);
    expect(p).toMatchObject({ announced: true, timer: 1.5 });
    expect(g.pendingBoss).toBe(p);
    expect(g.aliens).toHaveLength(0);

    g.banner = null;
    advanceBoss(g, p, 0.5);
    expect(g.banner).toBeNull();
    expect(g.sfx).toEqual(['boss']);
    expect(p.timer).toBe(1);
  });

  it('flags an elite boss in the announcement', () => {
    const g = waveGame();
    advanceBoss(g, pending({ elite: true }), 0.1);
    expect(g.banner?.sub).toBe('ELITE ACID KRAKEN');
  });

  it('drops the boss in when the countdown ends', () => {
    const g = waveGame();
    const p = pending({ type: 'ironcrab', elite: true, timer: 0.05, announced: true });
    g.pendingBoss = p;
    advanceBoss(g, p, 0.1);
    expect(g.pendingBoss).toBeNull();
    expect(g.aliens).toHaveLength(1);
    expect(g.aliens[0]).toMatchObject({ type: 'ironcrab', elite: true });
    expect(g.banner?.text).toBe('ELITE IRON CRAB');
  });
});

describe('spawnBoss', () => {
  it.each(['brood', 'kraken', 'ironcrab', 'overlord'] as const)('lowers the %s from a UFO on a random side', (type) => {
    const g = waveGame();
    scriptRng(g, [0.2]);
    const left = spawnBoss(g, type, false);
    scriptRng(g, [0.7]);
    const right = spawnBoss(g, type, false);
    expect(left).toMatchObject({ type, x: BASE_X - 300, y: UFO_Y + 10, state: 'descend' });
    expect(right).toMatchObject({ x: BASE_X + 300 });
    expect(g.aliens).toEqual([left, right]);
  });

  it('flies the carrier in from offscreen at cruising altitude', () => {
    const g = waveGame();
    scriptRng(g, [0.2]);
    const left = spawnBoss(g, 'carrier', false);
    scriptRng(g, [0.7]);
    const right = spawnBoss(g, 'carrier', false);
    expect(left).toMatchObject({ x: -40, y: ALIENS.carrier.alt, state: 'active' });
    expect(right).toMatchObject({ x: WORLD_W + 40, y: ALIENS.carrier.alt, state: 'active' });
  });

  it('starts the worm king burrowed, heading for an eruption point', () => {
    const g = noPlayer();
    scriptRng(g, [0.2, 0.5, 0.5, 0.5, 0.2, 0.5]);
    const boss = spawnBoss(g, 'wormking', false);
    expect(boss).toMatchObject({ x: BASE_X - 380, y: GROUND_Y, state: 'active', burrowed: true, mode: TRAVEL });
    expect(boss.tx).toBe(BASE_X - (BASE_HALF_W + 16 + 45));
  });

  it('spawns on the right side too', () => {
    const g = noPlayer();
    scriptRng(g, [0.7]);
    expect(spawnBoss(g, 'wormking', false).x).toBe(BASE_X + 380);
  });

  describe('eruption point', () => {
    const erupt = (g: Game, rolls: number[]): number => {
      scriptRng(g, [0.7, 0.5, 0.5, 0.5, ...rolls]);
      return spawnBoss(g, 'wormking', false).tx;
    };

    it.each([
      [400, 400],
      [5, 30],
      [WORLD_W - 1, WORLD_W - 30],
    ])('half the time erupts under a grounded player at x=%d (-> %d)', (px, tx) => {
      const g = waveGame();
      playerAt(g, px, GROUND_Y - 4);
      expect(erupt(g, [0.3])).toBe(tx);
    });

    it('otherwise erupts beside the base', () => {
      const g = waveGame();
      playerAt(g, 400);
      expect(erupt(g, [0.6, 0.7, 0.5])).toBe(BASE_X + BASE_HALF_W + 16 + 45);
    });

    it.each([
      ['airborne', (g: Game) => (g.player.y = GROUND_Y - 5)],
      ['dead', (g: Game) => (g.player.alive = false)],
    ])('always flanks the base when the player is %s', (_label, tweak) => {
      const g = waveGame();
      playerAt(g, 400);
      tweak(g);
      expect(erupt(g, [0.1, 0])).toBe(BASE_X - BASE_HALF_W - 16);
    });
  });

  it('toughens elite bosses by 40%', () => {
    const g = waveGame();
    g.wave = 6;
    const normal = spawnBoss(g, 'carrier', false);
    const elite = spawnBoss(g, 'carrier', true);
    const hp = ALIENS.carrier.hp * hpMultiplier(6);
    expect(normal).toMatchObject({ elite: false, hp, maxHp: hp });
    expect(elite.elite).toBe(true);
    expect(elite.hp).toBeCloseTo(hp * ELITE_HP);
    expect(elite.maxHp).toBe(elite.hp);
  });

  it.each([
    ['carrier', 'SKY CARRIER', 'IT BOMBS FROM ABOVE - SHOOT IT DOWN'],
    ['brood', 'BROOD MOTHER', 'SHE SPAWNS SWARMS AND SPITS WEBS'],
    ['kraken', 'ACID KRAKEN', 'ACID RAIN INCOMING'],
    ['ironcrab', 'IRON CRAB', 'SHIELDED FRONT - HIT IT FROM ABOVE OR BEHIND'],
    ['wormking', 'WORM KING', 'WATCH THE GROUND...'],
    ['overlord', 'OVERLORD', 'THE FINAL BATTLE'],
  ] as const)('introduces the %s with a taunt', (type: BossType, name, taunt) => {
    const g = waveGame();
    spawnBoss(g, type, false);
    expect(g.banner).toEqual({ text: name, sub: taunt, color: '#ff4040', life: 3 });
    spawnBoss(g, type, true);
    expect(g.banner?.text).toBe(`ELITE ${name}`);
  });
});

describe('carrier', () => {
  const d = ALIENS.carrier;

  it('picks a new patrol point once it reaches the current one', () => {
    const g = waveGame();
    const a = spawn(g, 'carrier', 300, d.alt, { tx: 302, anim: 0, special: 10, summon: 10 });
    g.rng = () => 0.75;
    step(g, a, carrier, 0.1);
    expect(a.tx).toBe(BASE_X + 190);
    expect(a.x).toBeCloseTo(300 + d.speed * 0.1);
    expect(a.y).toBe(d.alt);
    expect(g.projectiles).toHaveLength(0);
    expect(g.aliens).toEqual([a]);
  });

  it('keeps patrolling toward its current point, bobbing in the sky', () => {
    const g = waveGame();
    const a = spawn(g, 'carrier', 300, d.alt, { tx: 100, anim: Math.PI / 3, special: 10, summon: 10 });
    step(g, a, carrier, 0.1);
    expect(a.tx).toBe(100);
    expect(a.x).toBeCloseTo(300 - d.speed * 0.1);
    expect(a.facing).toBe(-1);
    expect(a.y).toBeCloseTo(d.alt + 5);
    expect(a.special).toBeCloseTo(9.9);
    expect(a.summon).toBeCloseTo(9.9);
  });

  it('drops a wave-scaled bomb straight down when reloaded', () => {
    const g = waveGame();
    g.wave = 3;
    const a = spawn(g, 'carrier', 300, d.alt, { tx: 100, special: 0.05, summon: 10 });
    step(g, a, carrier, 0.1);
    expect(a.special).toBe(d.attackRate);
    expect(g.projectiles).toHaveLength(1);
    const p = g.projectiles[0];
    expect(p).toMatchObject({ kind: 'bomb', team: 'alien', x: a.x, y: a.y + 8, vx: 0, vy: 30, life: 5, gravity: BOMB_GRAVITY, pierce: 1, knock: 0, hit: [] });
    expect(p.damage).toBeCloseTo(d.damage * damageMultiplier(3));
    expect(g.sfx).toEqual(['bomb']);
  });

  it('carpet-bombs three abreast and reloads faster when elite', () => {
    const g = waveGame();
    const a = spawn(g, 'carrier', 300, d.alt, { tx: 100, special: 0, summon: 10, elite: true });
    step(g, a, carrier, 0.1);
    expect(a.special).toBeCloseTo(d.attackRate * 0.6);
    expect(g.projectiles.map((p) => [p.x - a.x, p.vx])).toEqual([
      [-10, -50],
      [0, 0],
      [10, 50],
    ]);
    expect(g.sfx).toEqual(['bomb']);
  });

  it.each([
    [false, 'grunt'],
    [true, 'blob'],
  ] as const)('deploys two troops when its summon timer runs out (elite: %s -> %s)', (elite, minion) => {
    const g = waveGame();
    const a = spawn(g, 'carrier', 300, d.alt, { tx: 100, special: 10, summon: 0.05, elite });
    step(g, a, carrier, 0.1);
    expect(a.summon).toBe(7);
    const troops = newAliens(g, a);
    expect(troops.map((t) => [t.type, t.x - a.x, t.y, t.state])).toEqual([
      [minion, -12, a.y + 10, 'descend'],
      [minion, 12, a.y + 10, 'descend'],
    ]);
  });
});

describe('brood', () => {
  const d = ALIENS.brood;

  it.each([
    [false, 4, 7],
    [true, 6, 5],
  ])('hatches a bug swarm above itself (elite: %s -> %d bugs, every %ds)', (elite, n, every) => {
    const g = noPlayer();
    const a = spawn(g, 'brood', 300, GROUND_Y, { summon: 0.05, special: 10, elite });
    step(g, a, brood, 0.1);
    expect(a.summon).toBe(every);
    const bugs = newAliens(g, a);
    expect(bugs).toHaveLength(n);
    bugs.forEach((b, i) => expect(b).toMatchObject({ type: 'bug', x: 300 + (i - n / 2) * 6, y: GROUND_Y - 18, state: 'active' }));
    expect(g.particles.filter((p) => GOO.includes(p.color))).toHaveLength(12);
    expect(g.sfx).toEqual(['split']);
  });

  it('spits a slowing web at a player in range', () => {
    const g = waveGame();
    playerAt(g, 400);
    const a = spawn(g, 'brood', 300, GROUND_Y, { summon: 10, special: 0.05 });
    step(g, a, brood, 0.1);
    expect(a.special).toBe(3);
    expect(g.projectiles).toHaveLength(1);
    const p = g.projectiles[0];
    expect(p).toMatchObject({ kind: 'web', team: 'alien', x: 300, y: GROUND_Y - 12 });
    expect(p.damage).toBeCloseTo(d.damage * 0.4);
    expect(speedOf(p)).toBeCloseTo(WEB_SPEED);
    expect(angleOf(p)).toBeCloseTo(Math.atan2(4, 100));
    expect(g.sfx).toEqual(['web']);
  });

  it('spits a three-web spread more often when elite', () => {
    const g = noPlayer();
    const a = spawn(g, 'brood', 300, GROUND_Y, { summon: 10, special: 0, elite: true });
    step(g, a, brood, 0.1);
    expect(a.special).toBe(2);
    const aim = Math.atan2(LEFT_WALL.y - (GROUND_Y - 12), LEFT_WALL.x - 300);
    expect(g.projectiles.map(angleOf)).toEqual([expect.closeTo(aim - 0.15), expect.closeTo(aim), expect.closeTo(aim + 0.15)]);
  });

  it('otherwise lumbers toward the base', () => {
    const g = noPlayer();
    const a = spawn(g, 'brood', 300, GROUND_Y, { summon: 10, special: 10 });
    step(g, a, brood, 0.1);
    expect(a.x).toBeCloseTo(300 + d.speed * 0.1);
    expect(a.summon).toBeCloseTo(9.9);
    expect(a.special).toBeCloseTo(9.9);
    expect(g.aliens).toEqual([a]);
    expect(g.projectiles).toHaveLength(0);
  });

  it('tears into the base once it gets there', () => {
    const g = noPlayer();
    const a = spawn(g, 'brood', BASE_X - BASE_HALF_W - 22, GROUND_Y, { summon: 10, special: 10, atkCd: 0 });
    step(g, a, brood, DT);
    expect(a.attacking).toBe(true);
    expect(g.base.hp).toBe(BASE_LEVELS[0].hp - d.damage);
  });
});

describe('kraken', () => {
  const d = ALIENS.kraken;

  it('hovers toward the base while out of range', () => {
    const g = noPlayer();
    const a = spawn(g, 'kraken', 100, 50, { id: 0, anim: 0, special: 10 });
    step(g, a, kraken, 0.1);
    expect(a.x).toBeCloseTo(100 + d.speed * 0.1);
    expect(a.y).toBeCloseTo(50 + (d.alt - 50) * 0.3);
    expect(g.projectiles).toHaveLength(0);
  });

  it('holds fire beyond 1.3x its range', () => {
    const g = noPlayer();
    const a = spawn(g, 'kraken', BASE_X - BASE_HALF_W - 250, d.alt, { special: 0 });
    step(g, a, kraken, 0.1);
    expect(a.special).toBeCloseTo(-0.1);
    expect(g.projectiles).toHaveLength(0);
  });

  it('rains a three-glob volley around a nearby player', () => {
    const g = waveGame();
    playerAt(g, 450);
    const x = BASE_X - BASE_HALF_W - 150;
    const a = spawn(g, 'kraken', x, d.alt, { special: 0 });
    step(g, a, kraken, 0.1);
    expect(a.x).toBe(x);
    expect(a.special).toBe(d.attackRate);
    expect(g.projectiles.map(landingX)).toEqual([expect.closeTo(434), expect.closeTo(450), expect.closeTo(466)]);
    expect(g.projectiles.every((p) => p.kind === 'acid' && p.x === x && p.y === a.y - 10 && p.damage === d.damage)).toBe(true);
    expect(g.sfx).toEqual(['acid', 'acid', 'acid']);
  });

  it('shells the base wall when the player is away', () => {
    const g = noPlayer();
    const a = spawn(g, 'kraken', BASE_X - BASE_HALF_W - 180, d.alt, { special: 0 });
    step(g, a, kraken, 0.1);
    expect(a.x).toBeCloseTo(BASE_X - BASE_HALF_W - 180 + d.speed * 0.1);
    expect(g.projectiles.map(landingX)).toEqual([expect.closeTo(LEFT_WALL.x - 16), expect.closeTo(LEFT_WALL.x), expect.closeTo(LEFT_WALL.x + 16)]);
  });

  it('fires five globs and summons squid escorts when elite', () => {
    const g = noPlayer();
    const x = BASE_X - BASE_HALF_W - 100;
    const a = spawn(g, 'kraken', x, d.alt, { special: 0, summon: 0.05, elite: true });
    step(g, a, kraken, 0.1);
    expect(g.projectiles.map(landingX)).toEqual([-32, -16, 0, 16, 32].map((o) => expect.closeTo(LEFT_WALL.x + o)));
    expect(a.summon).toBe(9);
    expect(newAliens(g, a).map((s) => [s.type, s.x, s.y, s.state])).toEqual([
      ['squid', x - 14, a.y, 'active'],
      ['squid', x + 14, a.y, 'active'],
    ]);
  });

  it('waits for the summon timer before calling escorts when elite', () => {
    const g = noPlayer();
    const a = spawn(g, 'kraken', 100, d.alt, { special: 10, summon: 1, elite: true });
    step(g, a, kraken, 0.1);
    expect(a.summon).toBeCloseTo(0.9);
    expect(g.aliens).toEqual([a]);
  });

  it('never summons when not elite', () => {
    const g = noPlayer();
    const a = spawn(g, 'kraken', 100, d.alt, { special: 10, summon: 0 });
    step(g, a, kraken, 0.1);
    expect(a.summon).toBe(0);
    expect(g.aliens).toEqual([a]);
  });
});

describe('ironcrab', () => {
  const d = ALIENS.ironcrab;

  it('walks on the base while its charge is reloading', () => {
    const g = noPlayer();
    const a = spawn(g, 'ironcrab', 100, GROUND_Y, { special: 1 });
    step(g, a, ironcrab, 0.1);
    expect(a.x).toBeCloseTo(100 + d.speed * 0.1);
    expect(a.special).toBeCloseTo(0.9);
    expect(a.mode).toBe(WALK);
  });

  it('does not charge from beyond its range', () => {
    const g = noPlayer();
    const a = spawn(g, 'ironcrab', 100, GROUND_Y, { special: 0 });
    step(g, a, ironcrab, 0.1);
    expect(a.mode).toBe(WALK);
    expect(a.x).toBeCloseTo(100 + d.speed * 0.1);
  });

  it.each([
    [false, 6, BASE_X + BASE_HALF_W + 100, 1, -1],
    [true, 4, BASE_X - BASE_HALF_W - 100, -1, 1],
  ] as const)('braces for a charge at the base once in range (elite: %s -> reload %ds)', (elite, reload, x, before, after) => {
    const g = noPlayer();
    const a = spawn(g, 'ironcrab', x, GROUND_Y, { special: 0, facing: before, elite });
    step(g, a, ironcrab, 0.1);
    expect(a).toMatchObject({ mode: CHARGE, timer: 1.6, special: reload, facing: after, x });
    expect(g.sfx).toEqual(['boss']);
  });

  it('rams forward at 3.5x speed until the charge runs out', () => {
    const g = noPlayer();
    const a = spawn(g, 'ironcrab', 300, GROUND_Y, { mode: CHARGE, timer: 0.15, facing: 1 });
    step(g, a, ironcrab, 0.1);
    expect(a.x).toBeCloseTo(300 + d.speed * 3.5 * 0.1);
    expect(a.mode).toBe(CHARGE);
    step(g, a, ironcrab, 0.1);
    expect(a.x).toBeCloseTo(300 + d.speed * 3.5 * 0.2);
    expect(a.mode).toBe(WALK);
  });

  it.each([
    [1, BASE_X - BASE_HALF_W - 22, -200],
    [-1, BASE_X + BASE_HALF_W + 22, 200],
  ] as const)('slams into the base for 1.5x damage and recoils (facing %d)', (facing, x, kx) => {
    const g = noPlayer();
    const a = spawn(g, 'ironcrab', x, GROUND_Y, { mode: CHARGE, timer: 1, facing });
    step(g, a, ironcrab, 0.1);
    expect(g.base.hp).toBe(BASE_LEVELS[0].hp - d.damage * 1.5);
    expect(a).toMatchObject({ mode: RECOIL, timer: 0.7, kx, x });
    expect(g.shake).toBe(8);
    expect(g.sfx).toEqual(['baseHit', 'explode']);
  });

  it('flattens the player in its path', () => {
    const g = waveGame();
    playerAt(g, 325);
    const a = spawn(g, 'ironcrab', 300, GROUND_Y, { mode: CHARGE, timer: 1, facing: 1 });
    step(g, a, ironcrab, 0.1);
    expect(g.player.hp).toBe(PLAYER_STATS.hp - d.damage * 1.5);
    expect(a.mode).toBe(RECOIL);
  });

  it('stays put while recoiling, then resumes walking', () => {
    const g = noPlayer();
    const a = spawn(g, 'ironcrab', 300, GROUND_Y, { mode: RECOIL, timer: 0.15 });
    step(g, a, ironcrab, 0.1);
    expect(a.mode).toBe(RECOIL);
    expect(a.x).toBe(300);
    step(g, a, ironcrab, 0.1);
    expect(a.mode).toBe(WALK);
    expect(a.x).toBe(300);
  });

  it('fires twin plasma bolts as it walks when elite', () => {
    const g = waveGame();
    playerAt(g, 400);
    const a = spawn(g, 'ironcrab', 300, GROUND_Y, { special: 10, summon: 0.05, elite: true });
    step(g, a, ironcrab, 0.1);
    expect(a.summon).toBe(2.5);
    const aim = Math.atan2(GROUND_Y - 8 - (GROUND_Y - 16), 100);
    expect(g.projectiles.map(angleOf)).toEqual([expect.closeTo(aim - 0.08), expect.closeTo(aim + 0.08)]);
    for (const p of g.projectiles) {
      expect(p).toMatchObject({ kind: 'plasma', team: 'alien', x: 300, y: GROUND_Y - 16 });
      expect(p.damage).toBeCloseTo(d.damage * 0.4);
      expect(speedOf(p)).toBeCloseTo(PLASMA_SPEED);
    }
    expect(a.x).toBeCloseTo(300 + d.speed * 0.1);
  });

  it('reloads between volleys when elite', () => {
    const g = noPlayer();
    const a = spawn(g, 'ironcrab', 300, GROUND_Y, { special: 10, summon: 1, elite: true });
    step(g, a, ironcrab, 0.1);
    expect(a.summon).toBeCloseTo(0.9);
    expect(g.projectiles).toHaveLength(0);
  });

  it('never shoots when not elite', () => {
    const g = noPlayer();
    const a = spawn(g, 'ironcrab', 300, GROUND_Y, { special: 10, summon: 0 });
    step(g, a, ironcrab, 0.1);
    expect(a.summon).toBe(0);
    expect(g.projectiles).toHaveLength(0);
  });
});

describe('wormking', () => {
  const d = ALIENS.wormking;

  it('tunnels toward its eruption point, churning dirt', () => {
    const g = noPlayer();
    const a = spawn(g, 'wormking', 300, GROUND_Y, { burrowed: true, tx: 500 });
    g.rng = () => 0;
    step(g, a, wormking, 0.1);
    expect(a.x).toBeCloseTo(300 + d.speed * 0.1);
    expect(a.mode).toBe(TRAVEL);
    expect(g.particles).toHaveLength(2);
    expect(g.particles.every((p) => DIRT.includes(p.color))).toBe(true);
  });

  it('tunnels quietly on unlucky rolls', () => {
    const g = noPlayer();
    const a = spawn(g, 'wormking', 300, GROUND_Y, { burrowed: true, tx: 500 });
    g.rng = () => 0.99;
    step(g, a, wormking, DT);
    expect(g.particles).toHaveLength(0);
  });

  it('starts rumbling once within 4px of the eruption point', () => {
    const g = noPlayer();
    const a = spawn(g, 'wormking', 496, GROUND_Y, { burrowed: true, tx: 500 });
    step(g, a, wormking, 0.1);
    expect(a).toMatchObject({ mode: RUMBLE, timer: 1, x: 496, burrowed: true });
    expect(g.sfx).toEqual(['burrow']);
  });

  it('shakes the ground while rumbling', () => {
    const g = noPlayer();
    const a = spawn(g, 'wormking', 300, GROUND_Y, { burrowed: true, mode: RUMBLE, timer: 1 });
    g.rng = () => 0;
    step(g, a, wormking, 0.1);
    expect(a.timer).toBeCloseTo(0.9);
    expect(a.burrowed).toBe(true);
    expect(g.shake).toBe(1.5);
    expect(g.particles).toHaveLength(3);

    g.particles = [];
    g.rng = () => 0.99;
    step(g, a, wormking, DT);
    expect(g.particles).toHaveLength(0);
  });

  it.each([
    [false, 4],
    [true, 5],
  ])('erupts beneath the player, blasting them (elite: %s -> surfaces %ds)', (elite, stay) => {
    const g = waveGame();
    playerAt(g, 300);
    const a = spawn(g, 'wormking', 300, GROUND_Y, { burrowed: true, mode: RUMBLE, timer: 0.05, elite });
    step(g, a, wormking, 0.1);
    expect(a).toMatchObject({ burrowed: false, mode: SURFACED, timer: stay, special: 0.6 });
    expect(g.player.hp).toBe(PLAYER_STATS.hp - d.damage);
    expect(g.sfx).toContain('explode');
    expect(g.particles.filter((p) => DIRT.includes(p.color)).length).toBeGreaterThanOrEqual(30);
  });

  it.each([
    [false, [393, 407], 1.6],
    [true, [386, 400, 414], 1],
  ])('sprays acid globs while surfaced (elite: %s)', (elite, landings, reload) => {
    const g = waveGame();
    playerAt(g, 400);
    const a = spawn(g, 'wormking', 300, GROUND_Y, { mode: SURFACED, timer: 3, special: 0.05, elite });
    step(g, a, wormking, 0.1);
    expect(a.special).toBe(reload);
    expect(a.timer).toBeCloseTo(2.9);
    expect(g.projectiles.map(landingX)).toEqual(landings.map((x) => expect.closeTo(x)));
    for (const p of g.projectiles) expect(p).toMatchObject({ kind: 'acid', x: 300, y: GROUND_Y - 40, damage: d.damage * 0.5 });
  });

  it('bites anything in reach while surfaced', () => {
    const g = waveGame();
    playerAt(g, 315);
    const a = spawn(g, 'wormking', 300, GROUND_Y, { mode: SURFACED, timer: 3, special: 10, atkCd: 0 });
    step(g, a, wormking, 0.1);
    expect(a.attacking).toBe(true);
    expect(g.player.hp).toBe(PLAYER_STATS.hp - d.damage);
    expect(g.projectiles).toHaveLength(0);
  });

  it('dives back underground and picks a new eruption point', () => {
    const g = noPlayer();
    const a = spawn(g, 'wormking', 300, GROUND_Y, { mode: SURFACED, timer: 0.05, special: 10 });
    scriptRng(g, [0.2, 0]);
    step(g, a, wormking, 0.1);
    expect(a).toMatchObject({ burrowed: true, mode: TRAVEL, tx: BASE_X - BASE_HALF_W - 16 });
    expect(g.particles).toHaveLength(16);
    expect(g.sfx).toEqual(['burrow']);
  });
});

describe('overlord', () => {
  const d = ALIENS.overlord;

  it('fires a five-shot plasma fan at a nearby player', () => {
    const g = waveGame();
    playerAt(g, 250);
    const a = spawn(g, 'overlord', 100, GROUND_Y, { special: 0.05, summon: 100 });
    step(g, a, overlord, 0.1);
    expect(a.special).toBe(3);
    expect(g.projectiles).toHaveLength(5);
    const aim = Math.atan2(GROUND_Y - 8 - (GROUND_Y - 34), 150);
    g.projectiles.forEach((p, i) => {
      expect(p).toMatchObject({ kind: 'plasma', team: 'alien', x: 100, y: GROUND_Y - 34, damage: d.damage / 3 });
      expect(angleOf(p)).toBeCloseTo(aim + (i - 2) * 0.14);
      expect(speedOf(p)).toBeCloseTo(PLASMA_SPEED);
    });
    expect(g.sfx).toEqual(['plasma', 'plasma', 'plasma', 'plasma', 'plasma']);
  });

  it.each([
    ['out of range', (g: Game) => playerAt(g, 1000)],
    ['dead', (g: Game) => {
      playerAt(g, 150);
      g.player.alive = false;
    }],
  ])('targets the base when the player is %s', (_label, setup) => {
    const g = waveGame();
    setup(g);
    spawn(g, 'overlord', 100, GROUND_Y, { special: 0, summon: 100 });
    step(g, g.aliens[0], overlord, 0.1);
    expect(angleOf(g.projectiles[2])).toBeCloseTo(Math.atan2(LEFT_WALL.y - (GROUND_Y - 34), LEFT_WALL.x - 100));
  });

  it('waits between abilities and keeps marching on the base', () => {
    const g = noPlayer();
    const a = spawn(g, 'overlord', 100, GROUND_Y, { special: 1, summon: 1 });
    step(g, a, overlord, 0.1);
    expect(a.special).toBeCloseTo(0.9);
    expect(a.summon).toBeCloseTo(0.9);
    expect(g.projectiles).toHaveLength(0);
    expect(g.aliens).toEqual([a]);
    expect(a.x).toBeCloseTo(100 + d.speed * 0.1);
  });

  it.each([
    [15, [10, 35]],
    [WORLD_W - 15, [WORLD_W - 35, WORLD_W - 10]],
  ])('summons two wave-scaled runners beside itself at x=%d, clamped to the world', (x, expected) => {
    const g = noPlayer();
    g.wave = 3;
    const a = spawn(g, 'overlord', x, GROUND_Y, { special: 100, summon: 0.05 });
    step(g, a, overlord, 0.1);
    expect(a.summon).toBe(9);
    const runners = newAliens(g, a);
    expect(runners.map((r) => [r.type, r.x, r.y, r.state])).toEqual(expected.map((rx) => ['runner', rx, GROUND_Y, 'active']));
    for (const r of runners) expect(r.hp).toBeCloseTo(ALIENS.runner.hp * hpMultiplier(3));
    expect(g.sfx).toEqual(['boss']);
    expect(g.particles.filter((p) => GOO.includes(p.color))).toHaveLength(16);
  });
});
