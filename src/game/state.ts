import {
  ALIENS,
  BASE_HALF_W,
  BASE_LEVELS,
  BASE_X,
  PLAYER_STATS,
  ROOF_Y,
  SOLDIER,
  START_MONEY,
  TANK_STATS,
  VIEW_W,
  hpMultiplier,
  type AlienType,
} from './config';
import { mulberry32 } from './rng';
import type { Alien, Game, Player, Soldier } from './types';

export function createPlayer(): Player {
  return {
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
  };
}

export function createGame(seed: number): Game {
  return {
    phase: 'title',
    paused: false,
    wave: 0,
    money: START_MONEY,
    time: 0,
    phaseTimer: 0,
    rng: mulberry32(seed),
    nextId: 1,
    player: createPlayer(),
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
    pendingBoss: null,
    camX: BASE_X - VIEW_W / 2,
    shake: 0,
    banner: null,
    sfx: [],
    stats: { kills: 0, earned: 0 },
  };
}

export function resetGame(g: Game, seed: number): void {
  Object.assign(g, createGame(seed));
}

export const baseMaxHp = (level: number): number => BASE_LEVELS[level - 1].hp;
export const baseArmor = (level: number): number => BASE_LEVELS[level - 1].armor;

export function playerSize(p: Player): { w: number; h: number } {
  return p.weapon === 'tank' ? TANK_STATS : PLAYER_STATS;
}

export function playerMaxHp(p: Player): number {
  const hp = PLAYER_STATS.hp + p.armorLevel * PLAYER_STATS.armorHp;
  return p.weapon === 'tank' ? hp * TANK_STATS.hpMul : hp;
}

export function createAlien(g: Game, type: AlienType, x: number, y: number, state: Alien['state']): Alien {
  const hp = ALIENS[type].hp * hpMultiplier(g.wave);
  const alien: Alien = {
    id: g.nextId++,
    type,
    x,
    y,
    vx: 0,
    vy: 0,
    kx: 0,
    hp,
    maxHp: hp,
    state,
    elite: false,
    burrowed: false,
    mode: 0,
    timer: 0,
    tx: x,
    trap: 0,
    slow: 0,
    atkCd: 0.3,
    special: 1.5 + g.rng() * 1.5,
    summon: 6,
    flash: 0,
    anim: g.rng() * 10,
    facing: x < BASE_X ? 1 : -1,
    attacking: false,
    pace: 0.85 + g.rng() * 0.3,
  };
  g.aliens.push(alien);
  return alien;
}

export function soldierHomeX(slot: number): number {
  const side = slot % 2 === 0 ? -1 : 1;
  return BASE_X + side * (BASE_HALF_W + 12 + Math.floor(slot / 2) * 14);
}

export function createSoldier(g: Game): Soldier {
  let slot = 0;
  while (g.soldiers.some((s) => s.slot === slot)) slot++;
  const soldier: Soldier = { id: g.nextId++, slot, x: soldierHomeX(slot), hp: SOLDIER.hp, cd: 0, aim: slot % 2 === 0 ? Math.PI : 0, flash: 0, recoil: 0 };
  g.soldiers.push(soldier);
  return soldier;
}
