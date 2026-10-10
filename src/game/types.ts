import type { AlienType, BossType, EnemyType, WeaponId } from './config';

export type Phase = 'title' | 'wave' | 'clear' | 'shop' | 'gameover' | 'victory';
export type Team = 'player' | 'ally' | 'alien';
export type ProjectileKind = 'bullet' | 'water' | 'bubble' | 'shell' | 'plasma' | 'acid' | 'bomb' | 'zap' | 'web';

export type Sfx =
  | WeaponId
  | 'turret'
  | 'hit'
  | 'alienDie'
  | 'coin'
  | 'explode'
  | 'unlock'
  | 'waveStart'
  | 'waveClear'
  | 'baseHit'
  | 'playerHit'
  | 'playerDie'
  | 'buy'
  | 'deny'
  | 'plasma'
  | 'pop'
  | 'jump'
  | 'boss'
  | 'swap'
  | 'tink'
  | 'bomb'
  | 'burrow'
  | 'acid'
  | 'zap'
  | 'split'
  | 'web'
  | 'win'
  | 'lose';

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface InputState {
  left: boolean;
  right: boolean;
  jump: boolean;
  down: boolean;
  fire: boolean;
  mouseX: number;
  mouseY: number;
  pressed: string[];
  clicks: Point[];
}

export interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  onGround: boolean;
  hp: number;
  alive: boolean;
  respawn: number;
  invuln: number;
  hurt: number;
  weapon: WeaponId;
  /** Index into WEAPON_ORDER of the best weapon unlocked so far. */
  unlocked: number;
  cooldown: number;
  aim: number;
  kills: number;
  anim: number;
  swing: number;
  muzzle: number;
  slow: number;
  armorLevel: number;
  magnetLevel: number;
}

export interface Alien {
  id: number;
  type: AlienType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  kx: number;
  hp: number;
  maxHp: number;
  state: 'descend' | 'active';
  elite: boolean;
  /** Underground: invisible and immune to everything except explosions. */
  burrowed: boolean;
  /** Per-type AI sub-state and timer (e.g. charging, rumbling, burst shots left). */
  mode: number;
  timer: number;
  /** Per-type AI target x (patrol point, strafe point, eruption point). */
  tx: number;
  trap: number;
  slow: number;
  atkCd: number;
  special: number;
  summon: number;
  flash: number;
  anim: number;
  facing: 1 | -1;
  attacking: boolean;
  pace: number;
}

export interface Projectile {
  kind: ProjectileKind;
  team: Team;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  life: number;
  gravity: number;
  pierce: number;
  knock: number;
  hit: number[];
}

export interface Coin {
  x: number;
  y: number;
  vx: number;
  vy: number;
  value: number;
  life: number;
  grounded: boolean;
  magnet: boolean;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  gravity: number;
  color: string;
}

export interface Tracer {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  life: number;
  max: number;
  width: number;
  color: string;
}

export interface FloatText {
  x: number;
  y: number;
  life: number;
  text: string;
  color: string;
}

export interface Turret {
  slot: number;
  cd: number;
  aim: number;
  recoil: number;
}

export interface Soldier {
  id: number;
  slot: number;
  x: number;
  hp: number;
  cd: number;
  aim: number;
  flash: number;
  recoil: number;
}

export interface Ufo {
  x: number;
  y: number;
  state: 'idle' | 'move' | 'beam' | 'leave';
  timer: number;
  targetX: number;
  cargo: EnemyType | null;
  anim: number;
}

export interface Base {
  level: number;
  hp: number;
  turretLevel: number;
  flash: number;
}

export interface PendingBoss {
  type: BossType;
  elite: boolean;
  timer: number;
  announced: boolean;
}

export interface Banner {
  text: string;
  sub: string;
  color: string;
  life: number;
}

export interface Game {
  phase: Phase;
  paused: boolean;
  wave: number;
  money: number;
  time: number;
  phaseTimer: number;
  rng: () => number;
  nextId: number;
  player: Player;
  base: Base;
  aliens: Alien[];
  projectiles: Projectile[];
  coins: Coin[];
  particles: Particle[];
  tracers: Tracer[];
  texts: FloatText[];
  turrets: Turret[];
  soldiers: Soldier[];
  ufos: Ufo[];
  spawnQueue: EnemyType[];
  pendingBoss: PendingBoss | null;
  camX: number;
  shake: number;
  banner: Banner | null;
  sfx: Sfx[];
  stats: { kills: number; earned: number };
}
