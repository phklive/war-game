export const VIEW_W = 480;
export const VIEW_H = 270;
export const WORLD_W = 1200;
export const GROUND_Y = 236;
export const GRAVITY = 1050;
export const DT = 1 / 60;

export const BASE_X = WORLD_W / 2;
export const BASE_HALF_W = 40;
export const BASE_H = 40;
export const ROOF_Y = GROUND_Y - BASE_H;

export const TOTAL_WAVES = 10;
export const KILLS_PER_WEAPON = 10;
export const START_MONEY = 60;
export const RESPAWN_TIME = 2.5;
export const COIN_LIFE = 20;
export const DESCEND_SPEED = 95;
export const UFO_Y = 36;
export const UFO_SPEED = 230;
export const FLY_Y = 120;
export const CLEAR_TIME = 2;
export const BOSS_DELAY = 2;
export const BUBBLE_TRAP_TIME = 2;
export const BUBBLE_POP_DAMAGE = 6;
export const SHELL_RADIUS = 36;
export const PLASMA_SPEED = 210;
export const ZAP_SPEED = 330;
export const WEB_SPEED = 190;
export const ACID_GRAVITY = 320;
export const BOMB_GRAVITY = 420;
export const BLAST_RADIUS = 30;
export const ELITE_HP = 1.4;
export const WEB_SLOW = 2;

export const PLAYER_STATS = { w: 8, h: 15, speed: 150, jump: 340, hp: 100, armorHp: 25 };
export const TANK_STATS = { w: 26, h: 14, speed: 110, jump: 250, hpMul: 2, crushDps: 20 };

export type WeaponId = 'knife' | 'pistol' | 'water' | 'bubble' | 'ar' | 'sniper' | 'laser' | 'tank';
export type WeaponKind = 'melee' | 'bullet' | 'water' | 'bubble' | 'hitscan' | 'shell';

export interface WeaponDef {
  name: string;
  kind: WeaponKind;
  damage: number;
  cooldown: number;
  speed: number;
  spread: number;
  range: number;
  pierce: number;
  knock: number;
  shake: number;
  barrel: number;
  color: string;
}

export const WEAPON_ORDER: readonly WeaponId[] = ['knife', 'pistol', 'water', 'bubble', 'ar', 'sniper', 'laser', 'tank'];

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  knife: { name: 'COMBAT KNIFE', kind: 'melee', damage: 3, cooldown: 0.22, speed: 0, spread: 0, range: 24, pierce: 99, knock: 140, shake: 1, barrel: 6, color: '#e8e8f0' },
  pistol: { name: 'PISTOL', kind: 'bullet', damage: 2, cooldown: 0.21, speed: 550, spread: 0.03, range: 500, pierce: 1, knock: 40, shake: 1, barrel: 8, color: '#ffe680' },
  water: { name: 'WATER GUN', kind: 'water', damage: 0.55, cooldown: 0.03, speed: 380, spread: 0.09, range: 300, pierce: 1, knock: 35, shake: 0, barrel: 11, color: '#5ad1ff' },
  bubble: { name: 'BUBBLE GUN', kind: 'bubble', damage: 1, cooldown: 0.3, speed: 180, spread: 0.12, range: 400, pierce: 1, knock: 0, shake: 0, barrel: 11, color: '#ff9ce8' },
  ar: { name: 'ASSAULT RIFLE', kind: 'bullet', damage: 1.7, cooldown: 0.072, speed: 670, spread: 0.07, range: 570, pierce: 1, knock: 30, shake: 1, barrel: 13, color: '#ffd04a' },
  sniper: { name: 'SNIPER RIFLE', kind: 'hitscan', damage: 22, cooldown: 0.64, speed: 0, spread: 0, range: 700, pierce: 6, knock: 160, shake: 4, barrel: 17, color: '#ffffff' },
  laser: { name: 'LASER GUN', kind: 'hitscan', damage: 0.95, cooldown: 0.043, speed: 0, spread: 0, range: 330, pierce: 99, knock: 0, shake: 0, barrel: 13, color: '#ff3df0' },
  tank: { name: 'BATTLE TANK', kind: 'shell', damage: 14, cooldown: 0.51, speed: 500, spread: 0.02, range: 840, pierce: 1, knock: 220, shake: 6, barrel: 16, color: '#ffb347' },
};

export type EnemyType = 'grunt' | 'runner' | 'spitter' | 'flyer' | 'brute' | 'squid' | 'drone' | 'hopper' | 'worm' | 'bug' | 'blob' | 'splitter' | 'mini' | 'crab';
export type BossType = 'carrier' | 'brood' | 'kraken' | 'ironcrab' | 'wormking' | 'overlord';
export type AlienType = EnemyType | BossType;

export interface AlienDef {
  name: string;
  w: number;
  h: number;
  hp: number;
  speed: number;
  damage: number;
  attackRate: number;
  coin: number;
  /** Attack range for shooters (0 = melee only). */
  range: number;
  /** Cruising altitude for flying aliens; 0 for ground aliens. */
  alt: number;
  heavy: boolean;
  boss: boolean;
  shielded: boolean;
  /** How many aliens one spawn-queue entry drops. */
  group: number;
  scale: number;
}

const enemy = (d: Partial<AlienDef> & Pick<AlienDef, 'name' | 'w' | 'h' | 'hp' | 'speed' | 'damage' | 'attackRate' | 'coin'>): AlienDef => ({
  range: 0,
  alt: 0,
  heavy: false,
  boss: false,
  shielded: false,
  group: 1,
  scale: 1,
  ...d,
});

export const ENEMY_ORDER: readonly EnemyType[] = ['grunt', 'runner', 'spitter', 'flyer', 'squid', 'drone', 'hopper', 'worm', 'bug', 'blob', 'splitter', 'mini', 'crab', 'brute'];
export const BOSS_ORDER: readonly BossType[] = ['carrier', 'brood', 'kraken', 'ironcrab', 'wormking', 'overlord'];
export const ALIEN_ORDER: readonly AlienType[] = [...ENEMY_ORDER, ...BOSS_ORDER];

export const ALIENS: Record<AlienType, AlienDef> = {
  grunt: enemy({ name: 'GRUNT', w: 10, h: 15, hp: 4, speed: 44, damage: 5, attackRate: 1, coin: 6 }),
  runner: enemy({ name: 'RUNNER', w: 10, h: 15, hp: 2.5, speed: 90, damage: 4, attackRate: 0.6, coin: 5 }),
  spitter: enemy({ name: 'SPITTER', w: 10, h: 15, hp: 5, speed: 31, damage: 7, attackRate: 2, coin: 10, range: 150 }),
  flyer: enemy({ name: 'FLYER', w: 10, h: 15, hp: 3.5, speed: 62, damage: 5, attackRate: 1.1, coin: 10, alt: FLY_Y }),
  squid: enemy({ name: 'SQUID', w: 12, h: 14, hp: 6, speed: 40, damage: 8, attackRate: 2.6, coin: 12, range: 170, alt: 105 }),
  drone: enemy({ name: 'DRONE', w: 14, h: 8, hp: 4, speed: 70, damage: 4, attackRate: 2.2, coin: 12, range: 220, alt: 78 }),
  hopper: enemy({ name: 'HOPPER', w: 11, h: 10, hp: 4, speed: 100, damage: 7, attackRate: 0.8, coin: 8 }),
  worm: enemy({ name: 'WORM', w: 8, h: 14, hp: 7, speed: 60, damage: 8, attackRate: 1, coin: 12 }),
  bug: enemy({ name: 'BUG SWARM', w: 7, h: 5, hp: 1, speed: 80, damage: 1, attackRate: 0.8, coin: 2, alt: 140, group: 4 }),
  blob: enemy({ name: 'BLOB', w: 10, h: 9, hp: 2, speed: 70, damage: 25, attackRate: 0, coin: 6 }),
  splitter: enemy({ name: 'SPLITTER', w: 14, h: 13, hp: 8, speed: 30, damage: 6, attackRate: 1, coin: 10 }),
  mini: enemy({ name: 'MINI', w: 7, h: 7, hp: 2, speed: 80, damage: 3, attackRate: 0.6, coin: 2 }),
  crab: enemy({ name: 'CRAB', w: 16, h: 11, hp: 8, speed: 30, damage: 8, attackRate: 1.2, coin: 14, shielded: true }),
  brute: enemy({ name: 'BRUTE', w: 20, h: 30, hp: 30, speed: 22, damage: 18, attackRate: 1.4, coin: 30, heavy: true, scale: 2 }),
  carrier: enemy({ name: 'SKY CARRIER', w: 46, h: 16, hp: 130, speed: 55, damage: 16, attackRate: 2.2, coin: 120, alt: 62, heavy: true, boss: true, scale: 2 }),
  brood: enemy({ name: 'BROOD MOTHER', w: 40, h: 22, hp: 170, speed: 18, damage: 20, attackRate: 1.4, coin: 150, range: 220, heavy: true, boss: true, scale: 2 }),
  kraken: enemy({ name: 'ACID KRAKEN', w: 28, h: 34, hp: 190, speed: 28, damage: 10, attackRate: 2.8, coin: 170, range: 160, alt: 100, heavy: true, boss: true, scale: 2 }),
  ironcrab: enemy({ name: 'IRON CRAB', w: 40, h: 22, hp: 230, speed: 20, damage: 30, attackRate: 1.5, coin: 190, range: 220, heavy: true, boss: true, shielded: true, scale: 2 }),
  wormking: enemy({ name: 'WORM KING', w: 20, h: 46, hp: 250, speed: 85, damage: 25, attackRate: 2, coin: 210, heavy: true, boss: true, scale: 2 }),
  overlord: enemy({ name: 'OVERLORD', w: 30, h: 46, hp: 300, speed: 14, damage: 30, attackRate: 1.6, coin: 300, range: 240, heavy: true, boss: true, scale: 3 }),
};

export interface WaveDef {
  horde: Partial<Record<EnemyType, number>>;
  boss: BossType;
  elite: boolean;
}

export const WAVES: readonly WaveDef[] = [
  { horde: { grunt: 14 }, boss: 'carrier', elite: false },
  { horde: { grunt: 12, runner: 6, hopper: 4, bug: 1 }, boss: 'brood', elite: false },
  { horde: { grunt: 12, runner: 6, spitter: 4, squid: 3, hopper: 3, bug: 2 }, boss: 'kraken', elite: false },
  { horde: { grunt: 14, runner: 8, spitter: 4, flyer: 4, crab: 3, blob: 4, bug: 2 }, boss: 'ironcrab', elite: false },
  { horde: { grunt: 14, runner: 8, squid: 4, drone: 3, worm: 3, splitter: 3, crab: 2, brute: 1, bug: 2 }, boss: 'wormking', elite: false },
  { horde: { grunt: 16, runner: 10, spitter: 5, flyer: 5, hopper: 6, blob: 5, drone: 4, brute: 2, bug: 3 }, boss: 'carrier', elite: true },
  { horde: { grunt: 18, runner: 10, squid: 5, crab: 4, worm: 4, splitter: 4, drone: 4, brute: 2, bug: 3 }, boss: 'brood', elite: true },
  { horde: { grunt: 20, runner: 12, spitter: 6, flyer: 6, hopper: 6, blob: 6, crab: 4, worm: 4, brute: 3, bug: 3 }, boss: 'kraken', elite: true },
  { horde: { grunt: 22, runner: 14, squid: 6, drone: 6, crab: 5, splitter: 5, worm: 5, blob: 6, brute: 4, bug: 4 }, boss: 'ironcrab', elite: true },
  {
    horde: { grunt: 24, runner: 14, spitter: 6, squid: 6, flyer: 6, drone: 6, hopper: 6, crab: 5, worm: 5, blob: 6, splitter: 5, brute: 5, bug: 4 },
    boss: 'overlord',
    elite: false,
  },
];

export const hpMultiplier = (wave: number): number => 1 + 0.27 * (wave - 1);
export const speedMultiplier = (wave: number): number => 1 + 0.04 * (wave - 1);
export const damageMultiplier = (wave: number): number => 1 + 0.06 * (wave - 1);
export const spawnInterval = (wave: number): number => 0.95 - 0.06 * (wave - 1);
export const ufoCount = (wave: number): number => 2 + Math.floor((wave - 1) / 3);
export const waveBonus = (wave: number): number => 15 + 10 * wave;

export const BASE_LEVELS: readonly { hp: number; armor: number }[] = [
  { hp: 300, armor: 0 },
  { hp: 450, armor: 0.1 },
  { hp: 650, armor: 0.2 },
  { hp: 900, armor: 0.3 },
  { hp: 1200, armor: 0.4 },
];

export const TURRET = { damage: 1.2, damagePerLevel: 0.7, cooldown: 0.5, cooldownMul: 0.88, range: 190, rangePerLevel: 20, maxLevel: 4 };
export const TURRET_SLOTS: readonly number[] = [-30, 30, -18, 18, -6, 6];
export const SOLDIER = { damage: 1.2, cooldown: 0.6, range: 210, hp: 40 };

export const PRICES = {
  repair: 25,
  repairFraction: 0.3,
  base: [150, 300, 500, 800],
  turret: (count: number): number => 110 + 60 * count,
  turretLevel: [150, 300, 500],
  soldier: (count: number): number => 60 + 25 * count,
  armor: [70, 140, 220],
  magnet: [50, 100, 160],
};
