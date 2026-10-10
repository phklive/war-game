import { ALIENS, BASE_HALF_W, BASE_X, GROUND_Y, ROOF_Y, SOLDIER, TURRET, TURRET_SLOTS } from './config';
import { targetable } from './combat';
import { SMOKE, burst, sfx } from './effects';
import { baseMaxHp } from './state';
import type { Alien, Game } from './types';

const ALLY_BULLET_SPEED = 500;

export function turretStats(level: number): { damage: number; cooldown: number; range: number } {
  return {
    damage: TURRET.damage + (level - 1) * TURRET.damagePerLevel,
    cooldown: TURRET.cooldown * TURRET.cooldownMul ** (level - 1),
    range: TURRET.range + (level - 1) * TURRET.rangePerLevel,
  };
}

export function turretPos(slot: number): { x: number; y: number } {
  return { x: BASE_X + TURRET_SLOTS[slot], y: ROOF_Y - 5 };
}

export function nearestAlien(g: Game, x: number, y: number, range: number): Alien | null {
  let best: Alien | null = null;
  let bestD = range * range;
  for (const a of g.aliens) {
    if (!targetable(a)) continue;
    const dx = a.x - x;
    const dy = a.y - ALIENS[a.type].h / 2 - y;
    const dd = dx * dx + dy * dy;
    if (dd < bestD) {
      bestD = dd;
      best = a;
    }
  }
  return best;
}

function aimAt(x: number, y: number, a: Alien): number {
  return Math.atan2(a.y - ALIENS[a.type].h / 2 - y, a.x - x);
}

function allyShot(g: Game, x: number, y: number, angle: number, damage: number, range: number): void {
  const spread = (g.rng() - 0.5) * 0.08;
  g.projectiles.push({
    kind: 'bullet',
    team: 'ally',
    x: x + Math.cos(angle) * 8,
    y: y + Math.sin(angle) * 8,
    vx: Math.cos(angle + spread) * ALLY_BULLET_SPEED,
    vy: Math.sin(angle + spread) * ALLY_BULLET_SPEED,
    damage,
    life: (range * 1.2) / ALLY_BULLET_SPEED,
    gravity: 0,
    pierce: 1,
    knock: 20,
    hit: [],
  });
}

export function updateAllies(g: Game, dt: number): void {
  const ts = turretStats(g.base.turretLevel);
  for (const t of g.turrets) {
    t.cd -= dt;
    t.recoil = Math.max(0, t.recoil - dt);
    const { x, y } = turretPos(t.slot);
    const target = nearestAlien(g, x, y, ts.range);
    if (!target) continue;
    t.aim = aimAt(x, y, target);
    if (t.cd > 0) continue;
    t.cd = ts.cooldown;
    t.recoil = 0.08;
    allyShot(g, x, y, t.aim, ts.damage, ts.range);
    sfx(g, 'turret');
  }
  for (const s of g.soldiers) {
    s.cd -= dt;
    s.flash = Math.max(0, s.flash - dt);
    s.recoil = Math.max(0, s.recoil - dt);
    const y = GROUND_Y - 9;
    const target = nearestAlien(g, s.x, y, SOLDIER.range);
    if (!target) continue;
    s.aim = aimAt(s.x, y, target);
    if (s.cd > 0) continue;
    s.cd = SOLDIER.cooldown;
    s.recoil = 0.08;
    allyShot(g, s.x, y, s.aim, SOLDIER.damage, SOLDIER.range);
    sfx(g, 'turret');
  }
  g.soldiers = g.soldiers.filter((s) => s.hp > 0);
  updateBase(g, dt);
}

function updateBase(g: Game, dt: number): void {
  const b = g.base;
  b.flash = Math.max(0, b.flash - dt);
  const damage = 1 - b.hp / baseMaxHp(b.level);
  if (damage > 0.5 && g.rng() < dt * 12 * damage) {
    burst(g, BASE_X + (g.rng() - 0.5) * BASE_HALF_W * 1.6, ROOF_Y, 1, SMOKE, { speed: 15, life: 1.6, gravity: -30, size: 2 });
  }
}
