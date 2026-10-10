import {
  ALIENS,
  BASE_HALF_W,
  BASE_X,
  BOMB_GRAVITY,
  ELITE_HP,
  GROUND_Y,
  PLASMA_SPEED,
  UFO_Y,
  WEB_SPEED,
  WORLD_W,
  type BossType,
} from './config';
import { aimPoint, alienShot, baseEdge, hoverAt, lob, meleeTarget, strike, tryMelee, walkTo, type Ai } from './ai';
import { alienDamage, explodeFriendly } from './combat';
import { DIRT, GOO, addShake, burst, sfx, showBanner } from './effects';
import { walker } from './enemies';
import { clamp } from './rng';
import { createAlien } from './state';
import type { Alien, Game, PendingBoss } from './types';

// Iron Crab modes
const WALK = 0;
const CHARGE = 1;
const RECOIL = 2;
// Worm King modes
const TRAVEL = 0;
const RUMBLE = 1;
const SURFACED = 2;

const TAUNTS: Record<BossType, string> = {
  carrier: 'IT BOMBS FROM ABOVE - SHOOT IT DOWN',
  brood: 'SHE SPAWNS SWARMS AND SPITS WEBS',
  kraken: 'ACID RAIN INCOMING',
  ironcrab: 'SHIELDED FRONT - HIT IT FROM ABOVE OR BEHIND',
  wormking: 'WATCH THE GROUND...',
  overlord: 'THE FINAL BATTLE',
};

/** Counts down the boss intro once the horde is cleared, then drops the boss in. */
export function advanceBoss(g: Game, pending: PendingBoss, dt: number): void {
  if (!pending.announced) {
    pending.announced = true;
    const name = `${pending.elite ? 'ELITE ' : ''}${ALIENS[pending.type].name}`;
    showBanner(g, 'BOSS INCOMING!', name, '#ff4040', 2.6);
    sfx(g, 'boss');
  }
  pending.timer -= dt;
  if (pending.timer > 0) return;
  g.pendingBoss = null;
  spawnBoss(g, pending.type, pending.elite);
}

function eruptionPoint(g: Game): number {
  const p = g.player;
  if (p.alive && p.y >= GROUND_Y - 4 && g.rng() < 0.5) return clamp(p.x, 30, WORLD_W - 30);
  return BASE_X + (g.rng() < 0.5 ? -1 : 1) * (BASE_HALF_W + 16 + g.rng() * 90);
}

export function spawnBoss(g: Game, type: BossType, elite: boolean): Alien {
  const side = g.rng() < 0.5 ? -1 : 1;
  let boss: Alien;
  if (type === 'carrier') {
    boss = createAlien(g, type, side < 0 ? -40 : WORLD_W + 40, ALIENS.carrier.alt, 'active');
  } else if (type === 'wormking') {
    boss = createAlien(g, type, BASE_X + side * 380, GROUND_Y, 'active');
    boss.burrowed = true;
    boss.tx = eruptionPoint(g);
  } else {
    boss = createAlien(g, type, BASE_X + side * 300, UFO_Y + 10, 'descend');
  }
  boss.elite = elite;
  if (elite) {
    boss.hp *= ELITE_HP;
    boss.maxHp = boss.hp;
  }
  showBanner(g, `${elite ? 'ELITE ' : ''}${ALIENS[type].name}`, TAUNTS[type], '#ff4040', 3);
  return boss;
}

/** Mothership that patrols the sky, carpet-bombs and deploys troops. */
export const carrier: Ai = (g, a, d, dt, speed) => {
  if (Math.abs(a.tx - a.x) < 4) a.tx = BASE_X + (g.rng() - 0.5) * 760;
  walkTo(a, a.tx, speed, dt);
  a.y = d.alt + Math.sin(a.anim * 1.5) * 5;
  a.special -= dt;
  if (a.special <= 0) {
    a.special = d.attackRate * (a.elite ? 0.6 : 1);
    for (const vx of a.elite ? [-50, 0, 50] : [0]) {
      g.projectiles.push({ kind: 'bomb', team: 'alien', x: a.x + vx / 5, y: a.y + 8, vx, vy: 30, damage: alienDamage(g, a), life: 5, gravity: BOMB_GRAVITY, pierce: 1, knock: 0, hit: [] });
    }
    sfx(g, 'bomb');
  }
  a.summon -= dt;
  if (a.summon > 0) return;
  a.summon = 7;
  for (const off of [-12, 12]) createAlien(g, a.elite ? 'blob' : 'grunt', a.x + off, a.y + 10, 'descend');
};

/** Giant spider queen: hatches bug swarms and spits slowing webs. */
export const brood: Ai = (g, a, d, dt, speed) => {
  a.summon -= dt;
  a.special -= dt;
  if (a.summon <= 0) {
    a.summon = a.elite ? 5 : 7;
    const n = a.elite ? 6 : 4;
    for (let i = 0; i < n; i++) createAlien(g, 'bug', a.x + (i - n / 2) * 6, a.y - 18, 'active');
    burst(g, a.x, a.y - 14, 12, GOO, { speed: 80, life: 0.4 });
    sfx(g, 'split');
  }
  if (a.special <= 0) {
    a.special = a.elite ? 2 : 3;
    const t = aimPoint(g, a, d.range);
    const angle = Math.atan2(t.y - (a.y - 12), t.x - a.x);
    for (const spread of a.elite ? [-0.15, 0, 0.15] : [0]) alienShot(g, 'web', a.x, a.y - 12, angle + spread, WEB_SPEED, alienDamage(g, a) * 0.4);
  }
  walker(g, a, d, dt, speed);
};

/** Giant floating squid raining volleys of acid. */
export const kraken: Ai = (g, a, d, dt, speed) => {
  hoverAt(a, d.alt, dt);
  if (baseEdge(a) > d.range) walkTo(a, BASE_X, speed, dt);
  a.special -= dt;
  if (a.special <= 0 && baseEdge(a) <= d.range * 1.3) {
    a.special = d.attackRate;
    const n = a.elite ? 5 : 3;
    const t = aimPoint(g, a, d.range + 40);
    for (let i = 0; i < n; i++) lob(g, a.x, a.y - 10, t.x + (i - (n - 1) / 2) * 16, t.y, alienDamage(g, a));
  }
  if (!a.elite) return;
  a.summon -= dt;
  if (a.summon > 0) return;
  a.summon = 9;
  for (const off of [-14, 14]) createAlien(g, 'squid', a.x + off, a.y, 'active');
};

/** Armored crab that shrugs off frontal fire and periodically charges the base. */
export const ironcrab: Ai = (g, a, d, dt, speed) => {
  if (a.mode === CHARGE) {
    a.timer -= dt;
    const target = meleeTarget(g, a);
    if (target) {
      strike(g, target, alienDamage(g, a) * 1.5);
      a.mode = RECOIL;
      a.timer = 0.7;
      a.kx = -a.facing * 200;
      addShake(g, 8);
      sfx(g, 'explode');
      return;
    }
    a.x += a.facing * speed * 3.5 * dt;
    if (a.timer <= 0) a.mode = WALK;
    return;
  }
  if (a.mode === RECOIL) {
    a.timer -= dt;
    if (a.timer <= 0) a.mode = WALK;
    return;
  }
  a.special -= dt;
  if (a.special <= 0 && baseEdge(a) < d.range) {
    a.special = a.elite ? 4 : 6;
    a.mode = CHARGE;
    a.timer = 1.6;
    a.facing = BASE_X >= a.x ? 1 : -1;
    sfx(g, 'boss');
    return;
  }
  if (a.elite) {
    a.summon -= dt;
    if (a.summon <= 0) {
      a.summon = 2.5;
      const t = aimPoint(g, a, d.range);
      const angle = Math.atan2(t.y - (a.y - 16), t.x - a.x);
      for (const spread of [-0.08, 0.08]) alienShot(g, 'plasma', a.x, a.y - 16, angle + spread, PLASMA_SPEED, alienDamage(g, a) * 0.4);
    }
  }
  walker(g, a, d, dt, speed);
};

/** Burrows under the field, erupts beneath its target, then sprays acid before diving again. */
export const wormking: Ai = (g, a, d, dt, speed) => {
  if (a.mode === TRAVEL) {
    if (Math.abs(a.tx - a.x) > 4) {
      walkTo(a, a.tx, speed, dt);
      if (g.rng() < dt * 40) burst(g, a.x, GROUND_Y - 1, 2, DIRT, { speed: 60, life: 0.4, up: 40 });
      return;
    }
    a.mode = RUMBLE;
    a.timer = 1;
    sfx(g, 'burrow');
    return;
  }
  if (a.mode === RUMBLE) {
    a.timer -= dt;
    addShake(g, 1.5);
    if (g.rng() < dt * 30) burst(g, a.x, GROUND_Y - 1, 3, DIRT, { speed: 70, life: 0.4, up: 50 });
    if (a.timer > 0) return;
    a.burrowed = false;
    a.mode = SURFACED;
    a.timer = a.elite ? 5 : 4;
    a.special = 0.6;
    explodeFriendly(g, a.x, GROUND_Y - 10, 34, alienDamage(g, a));
    burst(g, a.x, GROUND_Y - 6, 30, DIRT, { speed: 140, life: 0.7, up: 80 });
    return;
  }
  tryMelee(g, a, d, dt);
  a.special -= dt;
  if (a.special <= 0) {
    a.special = a.elite ? 1 : 1.6;
    const n = a.elite ? 3 : 2;
    const t = aimPoint(g, a, 260);
    for (let i = 0; i < n; i++) lob(g, a.x, a.y - 40, t.x + (i - (n - 1) / 2) * 14, t.y, alienDamage(g, a) * 0.5);
  }
  a.timer -= dt;
  if (a.timer > 0) return;
  a.burrowed = true;
  a.mode = TRAVEL;
  a.tx = eruptionPoint(g);
  burst(g, a.x, GROUND_Y - 4, 16, DIRT, { speed: 90, life: 0.5, up: 60 });
  sfx(g, 'burrow');
};

/** The final boss: walks on the base, fires plasma fans and summons runners. */
export const overlord: Ai = (g, a, d, dt, speed) => {
  a.special -= dt;
  a.summon -= dt;
  if (a.special <= 0) {
    a.special = 3;
    const oy = a.y - 34;
    const t = aimPoint(g, a, d.range);
    const angle = Math.atan2(t.y - oy, t.x - a.x);
    for (let i = -2; i <= 2; i++) alienShot(g, 'plasma', a.x, oy, angle + i * 0.14, PLASMA_SPEED, alienDamage(g, a) / 3);
  }
  if (a.summon <= 0) {
    a.summon = 9;
    for (const off of [-20, 20]) createAlien(g, 'runner', clamp(a.x + off, 10, WORLD_W - 10), GROUND_Y, 'active');
    burst(g, a.x, a.y - 20, 16, GOO, { speed: 120, life: 0.5 });
    sfx(g, 'boss');
  }
  walker(g, a, d, dt, speed);
};
