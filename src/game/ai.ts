import { ACID_GRAVITY, BASE_HALF_W, BASE_X, ROOF_Y, type AlienDef } from './config';
import { BASE_BOX, alienBox, alienDamage, boxesOverlap, hurtBase, hurtPlayer, hurtSoldier, playerBox, soldierBox } from './combat';
import { sfx } from './effects';
import { clamp } from './rng';
import type { Alien, Game, Point, ProjectileKind, Soldier } from './types';

export type Ai = (g: Game, a: Alien, d: AlienDef, dt: number, speed: number) => void;
export type Target = { kind: 'player' } | { kind: 'soldier'; s: Soldier } | { kind: 'base' };

/** Horizontal gap between an alien and the nearest base wall (negative when overlapping). */
export const baseEdge = (a: Alien): number => Math.abs(a.x - BASE_X) - BASE_HALF_W;

export function meleeTarget(g: Game, a: Alien): Target | null {
  const b = alienBox(a);
  const reach = { x0: b.x0 - 3, y0: b.y0, x1: b.x1 + 3, y1: b.y1 };
  if (g.player.alive && boxesOverlap(reach, playerBox(g.player))) return { kind: 'player' };
  const s = g.soldiers.find((s) => s.hp > 0 && boxesOverlap(reach, soldierBox(s)));
  if (s) return { kind: 'soldier', s };
  if (boxesOverlap(reach, BASE_BOX)) return { kind: 'base' };
  return null;
}

export function strike(g: Game, t: Target, dmg: number): void {
  if (t.kind === 'player') hurtPlayer(g, dmg);
  else if (t.kind === 'soldier') hurtSoldier(g, t.s, dmg);
  else hurtBase(g, dmg);
}

/** Returns true when the alien is busy attacking something in reach. */
export function tryMelee(g: Game, a: Alien, d: AlienDef, dt: number): boolean {
  const target = meleeTarget(g, a);
  if (!target) {
    a.atkCd = Math.min(a.atkCd, 0.35);
    return false;
  }
  a.attacking = true;
  a.atkCd -= dt;
  if (a.atkCd <= 0) {
    a.atkCd = d.attackRate;
    strike(g, target, alienDamage(g, a));
  }
  return true;
}

export function walkTo(a: Alien, tx: number, speed: number, dt: number): void {
  a.facing = tx >= a.x ? 1 : -1;
  a.x += a.facing * Math.min(speed * dt, Math.abs(tx - a.x));
}

/** Bob around a cruising altitude. */
export function hoverAt(a: Alien, alt: number, dt: number): void {
  a.y += (alt + Math.sin(a.anim * 2 + a.id) * 6 - a.y) * Math.min(1, dt * 3);
}

/** Where a ranged alien aims: the player when close enough, otherwise the nearest base wall. */
export function aimPoint(g: Game, a: Alien, range: number): Point {
  const p = g.player;
  if (p.alive && Math.hypot(p.x - a.x, p.y - a.y) < range) return { x: p.x, y: p.y - 8 };
  return { x: BASE_X + (a.x < BASE_X ? -1 : 1) * (BASE_HALF_W - 4), y: ROOF_Y + 14 };
}

export function alienShot(g: Game, kind: ProjectileKind, x: number, y: number, angle: number, speed: number, damage: number): void {
  g.projectiles.push({
    kind,
    team: 'alien',
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    damage,
    life: 4,
    gravity: 0,
    pierce: 1,
    knock: 0,
    hit: [],
  });
  sfx(g, kind === 'zap' ? 'zap' : kind === 'web' ? 'web' : 'plasma');
}

/** Lob an acid glob on a ballistic arc that lands on (tx, ty). */
export function lob(g: Game, x: number, y: number, tx: number, ty: number, damage: number): void {
  const t = clamp(Math.abs(tx - x) / 160, 0.6, 1.5);
  g.projectiles.push({
    kind: 'acid',
    team: 'alien',
    x,
    y,
    vx: (tx - x) / t,
    vy: (ty - y - 0.5 * ACID_GRAVITY * t * t) / t,
    damage,
    life: t + 2,
    gravity: ACID_GRAVITY,
    pierce: 1,
    knock: 0,
    hit: [],
  });
  sfx(g, 'acid');
}
