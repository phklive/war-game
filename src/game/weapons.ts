import { GROUND_Y, VIEW_W, WEAPONS, type WeaponDef, type WeaponKind } from './config';
import { alienBox, boxesOverlap, damageAlien, shieldFactor, targetable } from './combat';
import { SPARK, WATER, addShake, addTracer, burst, sfx } from './effects';
import type { Alien, Box, Game, Player } from './types';

const LASER_COLORS = ['#ff3df0', '#53f5ff', '#fff36b'];
const SHOT_GRAVITY: Record<Exclude<WeaponKind, 'melee' | 'hitscan'>, number> = { bullet: 0, water: 420, bubble: -18, shell: 180 };

export function shoulder(p: Player): { x: number; y: number } {
  return { x: p.x, y: p.y - (p.weapon === 'tank' ? 10 : 9) };
}

export function muzzle(p: Player): { x: number; y: number } {
  const s = shoulder(p);
  const len = WEAPONS[p.weapon].barrel;
  return { x: s.x + Math.cos(p.aim) * len, y: s.y + Math.sin(p.aim) * len };
}

export function fireWeapon(g: Game): void {
  const p = g.player;
  const w = WEAPONS[p.weapon];
  p.cooldown = w.cooldown;
  sfx(g, p.weapon);
  addShake(g, w.shake);
  if (w.kind === 'melee') {
    knifeSwing(g, w);
    return;
  }
  // Shots start at the shoulder so aliens hugging the player are still hit.
  const s = shoulder(p);
  const m = muzzle(p);
  const angle = p.aim + (g.rng() - 0.5) * 2 * w.spread;
  p.muzzle = 0.05;
  if (w.kind === 'hitscan') {
    hitscan(g, s.x, s.y, angle, w, p.weapon === 'laser');
    return;
  }
  g.projectiles.push({
    kind: w.kind,
    team: 'player',
    x: s.x,
    y: s.y,
    vx: Math.cos(angle) * w.speed,
    vy: Math.sin(angle) * w.speed,
    damage: w.damage,
    life: w.range / w.speed,
    gravity: SHOT_GRAVITY[w.kind],
    pierce: w.pierce,
    knock: w.knock,
    hit: [],
  });
  if (w.kind === 'water') burst(g, m.x, m.y, 1, WATER, { speed: 30, life: 0.2 });
}

function knifeSwing(g: Game, w: WeaponDef): void {
  const p = g.player;
  const dir = Math.cos(p.aim) >= 0 ? 1 : -1;
  const box: Box = { x0: dir > 0 ? p.x : p.x - w.range, x1: dir > 0 ? p.x + w.range : p.x, y0: p.y - 22, y1: p.y + 4 };
  p.swing = 0.15;
  let hit = false;
  // Snapshot: minis split off by this swing must not be cut by it too.
  for (const a of [...g.aliens]) {
    if (!targetable(a) || !boxesOverlap(alienBox(a), box)) continue;
    damageAlien(g, a, w.damage, 'player', dir, w.knock);
    hit = true;
  }
  if (hit) sfx(g, 'hit');
}

export function rayBox(ox: number, oy: number, dx: number, dy: number, b: Box): number | null {
  let tmin = -Infinity;
  let tmax = Infinity;
  for (const [o, d, lo, hi] of [
    [ox, dx, b.x0, b.x1],
    [oy, dy, b.y0, b.y1],
  ]) {
    if (d === 0) {
      if (o < lo || o > hi) return null;
      continue;
    }
    const t1 = (lo - o) / d;
    const t2 = (hi - o) / d;
    tmin = Math.max(tmin, Math.min(t1, t2));
    tmax = Math.min(tmax, Math.max(t1, t2));
  }
  const entry = Math.max(tmin, 0);
  return tmax < entry ? null : entry;
}

/** Distance along (dx, dy) until a ray from (x, y) leaves the visible screen or hits the ground. */
export function viewExit(g: Game, x: number, y: number, dx: number, dy: number): number {
  let t = Infinity;
  if (dx > 0) t = (g.camX + VIEW_W - x) / dx;
  else if (dx < 0) t = (g.camX - x) / dx;
  if (dy > 0) t = Math.min(t, (GROUND_Y - y) / dy);
  else if (dy < 0) t = Math.min(t, -y / dy);
  return Math.max(0, t);
}

export function hitscan(g: Game, x: number, y: number, angle: number, w: WeaponDef, laser: boolean): void {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let end = Math.min(w.range, viewExit(g, x, y, dx, dy));
  const hits: { t: number; a: Alien }[] = [];
  for (const a of g.aliens) {
    if (!targetable(a)) continue;
    const t = rayBox(x, y, dx, dy, alienBox(a));
    if (t !== null && t <= end) hits.push({ t, a });
  }
  hits.sort((h1, h2) => h1.t - h2.t);
  let struck = 0;
  let blocked = false;
  for (const h of hits) {
    struck++;
    const factor = shieldFactor(h.a, dx, dy);
    if (factor > 0) damageAlien(g, h.a, w.damage * factor, 'player', dx >= 0 ? 1 : -1, w.knock);
    if (factor === 0 || struck === w.pierce) {
      end = h.t;
      blocked = factor === 0;
      break;
    }
  }
  const ex = x + dx * end;
  const ey = y + dy * end;
  const start = Math.min(w.barrel, end);
  const color = laser ? LASER_COLORS[Math.floor(g.time * 20) % LASER_COLORS.length] : w.color;
  addTracer(g, x + dx * start, y + dy * start, ex, ey, color, laser ? 2 : 1, laser ? 0.06 : 0.22);
  burst(g, ex, ey, laser ? 1 : 5, laser ? LASER_COLORS : SPARK, { speed: 70, life: 0.25 });
  if (blocked) sfx(g, 'tink');
}
