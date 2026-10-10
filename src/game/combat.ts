import {
  ALIENS,
  BASE_HALF_W,
  BASE_X,
  BLAST_RADIUS,
  GROUND_Y,
  KILLS_PER_WEAPON,
  RESPAWN_TIME,
  ROOF_Y,
  WEAPONS,
  WEAPON_ORDER,
  damageMultiplier,
  type WeaponId,
} from './config';
import { dropCoins } from './coins';
import { BLOOD, DUST, FIRE, GOO, SMOKE, SPARK, addShake, addText, burst, sfx, showBanner } from './effects';
import { baseArmor, createAlien, playerMaxHp, playerSize } from './state';
import type { Alien, Box, Game, Player, Soldier, Team } from './types';

const SWAP_DELAY = 0.15;

export const BASE_BOX: Box = { x0: BASE_X - BASE_HALF_W, y0: ROOF_Y, x1: BASE_X + BASE_HALF_W, y1: GROUND_Y };

export function alienBox(a: Alien): Box {
  const d = ALIENS[a.type];
  return { x0: a.x - d.w / 2, y0: a.y - d.h, x1: a.x + d.w / 2, y1: a.y };
}

export function playerBox(p: Player): Box {
  const s = playerSize(p);
  return { x0: p.x - s.w / 2, y0: p.y - s.h, x1: p.x + s.w / 2, y1: p.y };
}

export function soldierBox(s: Soldier): Box {
  return { x0: s.x - 4, y0: GROUND_Y - 15, x1: s.x + 4, y1: GROUND_Y };
}

/** Burrowed aliens are hidden underground: only explosions can reach them. */
export const targetable = (a: Alien): boolean => a.hp > 0 && !a.burrowed;

/** An alien's attack damage, scaled up as waves progress. */
export const alienDamage = (g: Game, a: Alien): number => ALIENS[a.type].damage * damageMultiplier(g.wave);

/**
 * Damage multiplier for a hit travelling along (dx, dy). Shielded aliens block shots that
 * hit their front at a shallow angle: small crabs take nothing, the Iron Crab a quarter.
 */
export function shieldFactor(a: Alien, dx: number, dy: number): number {
  const d = ALIENS[a.type];
  const fromFront = dx !== 0 && Math.sign(dx) === -a.facing && Math.abs(dy) < Math.abs(dx) * 0.8;
  if (!d.shielded || !fromFront) return 1;
  return d.boss ? 0.25 : 0;
}

export function pointInBox(x: number, y: number, b: Box, pad = 0): boolean {
  return x >= b.x0 - pad && x <= b.x1 + pad && y >= b.y0 - pad && y <= b.y1 + pad;
}

export function boxesOverlap(a: Box, b: Box): boolean {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

export function damageAlien(g: Game, a: Alien, dmg: number, team: Team, knockDir = 0, knock = 0): void {
  if (a.hp <= 0) return;
  const d = ALIENS[a.type];
  a.hp -= dmg;
  a.flash = 0.08;
  a.kx += knockDir * knock * (d.heavy ? 0.15 : 1);
  if (g.rng() < 0.5) burst(g, a.x, a.y - d.h * 0.6, 2, GOO, { speed: 60, life: 0.35 });
  if (a.hp <= 0) killAlien(g, a, team);
}

export function killAlien(g: Game, a: Alien, team: Team): void {
  const d = ALIENS[a.type];
  a.hp = 0;
  dropCoins(g, a.x, a.y - d.h / 2, d.coin);
  burst(g, a.x, a.y - d.h / 2, 8 + d.scale * 8, GOO, { speed: 100 * d.scale, life: 0.7 });
  sfx(g, 'alienDie');
  addShake(g, d.heavy ? 6 : 1.5);
  g.stats.kills++;
  if (team === 'player') {
    g.player.kills++;
    checkUnlock(g);
  }
  if (a.type === 'blob') explode(g, a.x, a.y - d.h / 2, BLAST_RADIUS, 8, team);
  if (a.type === 'splitter') {
    for (const dir of [-1, 1]) createAlien(g, 'mini', a.x + dir * 4, a.y, 'active').kx = dir * 120;
    sfx(g, 'split');
  }
  if (d.boss) {
    burst(g, a.x, a.y - d.h / 2, 60, FIRE, { speed: 220, life: 1.2 });
    showBanner(g, `${d.name} DOWN!`, 'FINISH THE REST!', '#ffd23f');
    addShake(g, 12);
    sfx(g, 'explode');
  }
}

/** Equip a weapon, keeping the same fraction of health (the tank has double max HP). */
export function equipWeapon(g: Game, weapon: WeaponId): void {
  const p = g.player;
  if (weapon === p.weapon) return;
  const ratio = p.hp / playerMaxHp(p);
  p.weapon = weapon;
  p.hp = ratio * playerMaxHp(p);
  p.cooldown = Math.max(p.cooldown, SWAP_DELAY);
  p.swing = 0;
  sfx(g, 'swap');
}

export function checkUnlock(g: Game): void {
  const p = g.player;
  const index = Math.min(Math.floor(p.kills / KILLS_PER_WEAPON), WEAPON_ORDER.length - 1);
  if (index <= p.unlocked) return;
  p.unlocked = index;
  const next = WEAPON_ORDER[index];
  equipWeapon(g, next);
  showBanner(g, 'NEW WEAPON!', `${WEAPONS[next].name} - PRESS ${index + 1}`, '#ffe14d');
  burst(g, p.x, p.y - 8, 24, SPARK, { speed: 140, life: 0.6, gravity: 0 });
  sfx(g, 'unlock');
}

export function hurtPlayer(g: Game, dmg: number): void {
  const p = g.player;
  if (!p.alive || p.invuln > 0) return;
  p.hp -= dmg;
  p.invuln = 0.45;
  p.hurt = 0.25;
  addShake(g, 3);
  burst(g, p.x, p.y - 8, 6, BLOOD, { speed: 70, life: 0.4 });
  if (p.hp > 0) {
    sfx(g, 'playerHit');
    return;
  }
  p.hp = 0;
  p.alive = false;
  p.respawn = RESPAWN_TIME;
  burst(g, p.x, p.y - 8, 30, [...BLOOD, ...FIRE], { speed: 150, life: 0.9 });
  addText(g, p.x, p.y - 20, 'MAN DOWN!', '#ff5050');
  sfx(g, 'playerDie');
}

export function hurtSoldier(g: Game, s: Soldier, dmg: number): void {
  if (s.hp <= 0) return;
  s.hp -= dmg;
  s.flash = 0.1;
  if (s.hp > 0) return;
  burst(g, s.x, GROUND_Y - 8, 20, BLOOD, { speed: 110, life: 0.7 });
  addText(g, s.x, GROUND_Y - 22, 'SOLDIER LOST', '#ff5050');
  sfx(g, 'playerDie');
}

export function hurtBase(g: Game, dmg: number): void {
  const b = g.base;
  b.hp = Math.max(0, b.hp - dmg * (1 - baseArmor(b.level)));
  b.flash = 0.1;
  addShake(g, 2);
  const x = BASE_X + (g.rng() - 0.5) * BASE_HALF_W * 2;
  burst(g, x, ROOF_Y + g.rng() * 30, 4, DUST, { speed: 70, life: 0.5 });
  sfx(g, 'baseHit');
}

export function explode(g: Game, x: number, y: number, radius: number, damage: number, team: Team): void {
  // Snapshot: aliens spawned by this blast (splitter minis) must not be caught in it.
  for (const a of [...g.aliens]) {
    if (a.hp <= 0) continue;
    const d = ALIENS[a.type];
    const cx = a.x;
    const cy = a.y - d.h / 2;
    const dist = Math.max(0, Math.hypot(cx - x, cy - y) - d.w / 2);
    if (dist > radius) continue;
    damageAlien(g, a, damage * (1 - (0.5 * dist) / radius), team, cx >= x ? 1 : -1, 220);
  }
  burst(g, x, y, 26, FIRE, { speed: 160, life: 0.6, gravity: 100 });
  burst(g, x, y, 10, SMOKE, { speed: 60, life: 1.2, gravity: -40, size: 2 });
  addShake(g, 6);
  sfx(g, 'explode');
}

/** An alien-side blast (bombs, kamikaze blobs, eruptions) that hurts the player, soldiers and base. */
export function explodeFriendly(g: Game, x: number, y: number, radius: number, damage: number): void {
  const p = g.player;
  if (p.alive && Math.hypot(p.x - x, p.y - 7 - y) <= radius + 4) hurtPlayer(g, damage);
  for (const s of g.soldiers) if (s.hp > 0 && Math.hypot(s.x - x, GROUND_Y - 8 - y) <= radius + 4) hurtSoldier(g, s, damage);
  const bx = Math.max(BASE_BOX.x0, Math.min(BASE_BOX.x1, x));
  const by = Math.max(BASE_BOX.y0, Math.min(BASE_BOX.y1, y));
  if (Math.hypot(bx - x, by - y) <= radius) hurtBase(g, damage);
  burst(g, x, y, 22, FIRE, { speed: 150, life: 0.55, gravity: 100 });
  burst(g, x, y, 8, GOO, { speed: 90, life: 0.5 });
  addShake(g, 5);
  sfx(g, 'explode');
}
