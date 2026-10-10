import { BASE_X, BLAST_RADIUS, GRAVITY, GROUND_Y, ROOF_Y, WORLD_W, ZAP_SPEED } from './config';
import { aimPoint, alienShot, baseEdge, hoverAt, lob, meleeTarget, tryMelee, walkTo, type Ai } from './ai';
import { alienDamage, explodeFriendly } from './combat';
import { DIRT, DUST, burst, sfx } from './effects';
import { clamp } from './rng';
import type { Game } from './types';

const HOP_SPEED = 380;
const HOP_AIR = (2 * HOP_SPEED) / GRAVITY;
const BURST_SHOTS = 3;

const playerOnGround = (g: Game): boolean => g.player.alive && g.player.y >= GROUND_Y - 4;

/** Marches on the base and hits whatever is in the way. */
export const walker: Ai = (g, a, d, dt, speed) => {
  if (!tryMelee(g, a, d, dt)) walkTo(a, BASE_X, speed, dt);
};

/** Fast walker that peels off to chase a nearby player. */
export const runner: Ai = (g, a, d, dt, speed) => {
  if (tryMelee(g, a, d, dt)) return;
  const chase = playerOnGround(g) && Math.abs(g.player.x - a.x) < 130;
  walkTo(a, chase ? g.player.x : BASE_X, speed, dt);
};

/** Stops at range and spits plasma at the player or the base. */
export const spitter: Ai = (g, a, d, dt, speed) => {
  a.special -= dt;
  if (baseEdge(a) > d.range * 0.75) walkTo(a, BASE_X, speed, dt);
  const p = g.player;
  const nearPlayer = p.alive && Math.hypot(p.x - a.x, p.y - a.y) < d.range;
  if (!nearPlayer && baseEdge(a) >= d.range) return;
  const t = aimPoint(g, a, d.range);
  a.attacking = true;
  a.facing = t.x >= a.x ? 1 : -1;
  if (a.special > 0) return;
  a.special = d.attackRate;
  alienShot(g, 'plasma', a.x, a.y - 11, Math.atan2(t.y - (a.y - 11), t.x - a.x), 210, alienDamage(g, a));
};

/** Jetpack alien: cruises high, then drops onto the base roof. */
export const flyer: Ai = (g, a, d, dt, speed) => {
  if (tryMelee(g, a, d, dt)) return;
  const tx = BASE_X + ((a.id % 7) - 3) * 9;
  const ty = Math.abs(BASE_X - a.x) > 70 ? d.alt + Math.sin(a.anim * 3) * 6 : ROOF_Y + 3;
  const dx = tx - a.x;
  const dy = ty - a.y;
  const k = Math.min(1, (speed * dt) / Math.hypot(dx, dy));
  a.x += dx * k;
  a.y += dy * k;
  a.facing = dx >= 0 ? 1 : -1;
};

/** Floating squid that lobs arcing acid from mid-air. */
export const squid: Ai = (g, a, d, dt, speed) => {
  hoverAt(a, d.alt, dt);
  if (baseEdge(a) > d.range) walkTo(a, BASE_X, speed, dt);
  a.special -= dt;
  if (a.special > 0 || baseEdge(a) > d.range * 1.25) return;
  a.special = d.attackRate;
  a.attacking = true;
  const t = aimPoint(g, a, d.range);
  lob(g, a.x, a.y - 2, t.x, t.y, alienDamage(g, a));
};

/** Hover-drone that strafes back and forth near the base, firing 3-shot laser bursts. */
export const drone: Ai = (g, a, d, dt, speed) => {
  if (Math.abs(a.tx - a.x) < 3) a.tx = BASE_X + (a.x < BASE_X ? -1 : 1) * (70 + g.rng() * 110);
  walkTo(a, a.tx, speed, dt);
  a.y += (d.alt + Math.sin(a.anim * 3) * 5 - a.y) * Math.min(1, dt * 3);
  a.special -= dt;
  const t = aimPoint(g, a, d.range);
  if (a.mode > 0) {
    a.timer -= dt;
    if (a.timer > 0) return;
    a.mode--;
    a.timer = 0.12;
    a.attacking = true;
    alienShot(g, 'zap', a.x, a.y + 2, Math.atan2(t.y - a.y - 2, t.x - a.x), ZAP_SPEED, alienDamage(g, a));
    return;
  }
  if (a.special <= 0 && Math.hypot(t.x - a.x, t.y - a.y) <= d.range) {
    a.special = d.attackRate;
    a.mode = BURST_SHOTS;
    a.timer = 0;
  }
};

/** Frog-like alien that crosses the field in big leaps. */
export const hopper: Ai = (g, a, d, dt, speed) => {
  if (a.y < GROUND_Y || a.vy < 0) {
    a.vy += GRAVITY * dt;
    a.x = clamp(a.x + a.vx * dt, d.w / 2, WORLD_W - d.w / 2);
    a.y = Math.min(GROUND_Y, a.y + a.vy * dt);
    tryMelee(g, a, d, dt);
    if (a.y < GROUND_Y) return;
    a.vy = 0;
    a.vx = 0;
    a.timer = 0.4;
    burst(g, a.x, GROUND_Y, 3, DUST, { speed: 40, life: 0.3, up: 20 });
    return;
  }
  if (tryMelee(g, a, d, dt)) return;
  a.timer -= dt;
  if (a.timer > 0) return;
  const chase = playerOnGround(g) && Math.abs(g.player.x - a.x) < 110;
  const tx = chase ? g.player.x : BASE_X;
  const reach = chase ? Math.abs(tx - a.x) : baseEdge(a);
  a.facing = tx >= a.x ? 1 : -1;
  a.vy = -HOP_SPEED;
  a.vx = a.facing * Math.min(speed, Math.max(20, reach / HOP_AIR));
};

/** Tunnels underground (untouchable except by explosions) and surfaces next to the base. */
export const worm: Ai = (g, a, d, dt, speed) => {
  if (!a.burrowed) {
    if (!tryMelee(g, a, d, dt)) walkTo(a, BASE_X, speed * 0.4, dt);
    return;
  }
  if (baseEdge(a) <= 26) {
    a.burrowed = false;
    burst(g, a.x, GROUND_Y - 4, 14, DIRT, { speed: 90, life: 0.5, up: 60 });
    sfx(g, 'burrow');
    return;
  }
  walkTo(a, BASE_X, speed, dt);
  if (g.rng() < dt * 25) burst(g, a.x, GROUND_Y - 1, 1, DIRT, { speed: 40, life: 0.3, up: 30 });
};

/** Tiny zig-zagging swarm bug that dives onto the base. */
export const bug: Ai = (g, a, d, dt, speed) => {
  if (tryMelee(g, a, d, dt)) return;
  walkTo(a, BASE_X, speed, dt);
  const alt = Math.abs(BASE_X - a.x) < 80 ? ROOF_Y + 2 : d.alt;
  a.y += (alt + Math.sin(a.anim * 7 + a.id) * 16 - a.y) * Math.min(1, dt * 4);
};

/** Kamikaze: rushes the player or base and blows up on contact. */
export const blob: Ai = (g, a, d, dt, speed) => {
  if (meleeTarget(g, a)) {
    explodeFriendly(g, a.x, a.y - d.h / 2, BLAST_RADIUS, alienDamage(g, a));
    a.hp = 0;
    return;
  }
  const chase = playerOnGround(g) && Math.abs(g.player.x - a.x) < 120;
  walkTo(a, chase ? g.player.x : BASE_X, speed, dt);
};
