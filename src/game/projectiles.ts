import { ALIENS, BLAST_RADIUS, BUBBLE_POP_DAMAGE, BUBBLE_TRAP_TIME, GROUND_Y, SHELL_RADIUS, VIEW_W, WEB_SLOW, WORLD_W } from './config';
import {
  BASE_BOX,
  alienBox,
  damageAlien,
  explode,
  explodeFriendly,
  hurtBase,
  hurtPlayer,
  hurtSoldier,
  playerBox,
  pointInBox,
  shieldFactor,
  soldierBox,
  targetable,
} from './combat';
import { ACID, BUBBLE, DUST, GOO, SPARK, WATER, WEB, ZAP, burst, sfx } from './effects';
import type { Alien, Game, Projectile, ProjectileKind } from './types';

const SPLAT: Record<ProjectileKind, readonly string[]> = {
  bullet: DUST,
  water: WATER,
  bubble: BUBBLE,
  shell: DUST,
  plasma: GOO,
  acid: ACID,
  bomb: DUST,
  zap: ZAP,
  web: WEB,
};

export function updateProjectiles(g: Game, dt: number): void {
  const keep: Projectile[] = [];
  for (const pr of g.projectiles) {
    pr.life -= dt;
    pr.vy += pr.gravity * dt;
    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;
    const offscreen = pr.team === 'player' ? !inView(g, pr.x, pr.y) : pr.x < -20 || pr.x > WORLD_W + 20 || pr.y < -80;
    if (!offscreen && (pr.team === 'alien' ? hitFriendly(g, pr) : hitAliens(g, pr))) continue;
    if (!offscreen && pr.y >= GROUND_Y) {
      impact(g, pr, GROUND_Y - 1);
      continue;
    }
    if (pr.life <= 0 || offscreen) {
      if (pr.kind === 'bubble') popBubble(g, pr.x, pr.y);
      continue;
    }
    keep.push(pr);
  }
  g.projectiles = keep;
}

/** The player's shots only live inside what the player can see. */
export const inView = (g: Game, x: number, y: number): boolean => x >= g.camX && x <= g.camX + VIEW_W && y >= 0;

function popBubble(g: Game, x: number, y: number): void {
  burst(g, x, y, 6, BUBBLE, { speed: 50, life: 0.3, gravity: 0 });
  sfx(g, 'pop');
}

function impact(g: Game, pr: Projectile, y: number): void {
  if (pr.kind === 'shell') explode(g, pr.x, y, SHELL_RADIUS, pr.damage, pr.team);
  else if (pr.kind === 'bomb') explodeFriendly(g, pr.x, y, BLAST_RADIUS, pr.damage);
  else if (pr.kind === 'bubble') popBubble(g, pr.x, y);
  else burst(g, pr.x, y, pr.kind === 'bullet' ? 2 : 4, SPLAT[pr.kind], { speed: 50, life: 0.35, up: 35 });
}

function hitAliens(g: Game, pr: Projectile): boolean {
  for (const a of g.aliens) {
    if (!targetable(a) || pr.hit.includes(a.id) || !pointInBox(pr.x, pr.y, alienBox(a), 2)) continue;
    pr.hit.push(a.id);
    if (pr.kind === 'shell') {
      explode(g, pr.x, pr.y, SHELL_RADIUS, pr.damage, pr.team);
      return true;
    }
    const factor = shieldFactor(a, pr.vx, pr.vy);
    if (factor === 0) {
      burst(g, pr.x, pr.y, 4, SPARK, { speed: 80, life: 0.25 });
      sfx(g, 'tink');
      return true;
    }
    if (pr.kind === 'bubble') {
      bubbleHit(g, a, pr);
      return true;
    }
    damageAlien(g, a, pr.damage * factor, pr.team, pr.vx >= 0 ? 1 : -1, pr.knock);
    if (pr.kind === 'water') a.slow = 1.2;
    burst(g, pr.x, pr.y, 2, pr.kind === 'water' ? WATER : SPARK, { speed: 50, life: 0.2 });
    pr.pierce--;
    if (pr.pierce <= 0) return true;
  }
  return false;
}

function bubbleHit(g: Game, a: Alien, pr: Projectile): void {
  popBubble(g, pr.x, pr.y);
  if (ALIENS[a.type].heavy || a.trap > 0) {
    damageAlien(g, a, BUBBLE_POP_DAMAGE / 2, pr.team);
    return;
  }
  damageAlien(g, a, pr.damage, pr.team);
  if (a.hp <= 0) return;
  a.trap = BUBBLE_TRAP_TIME;
  a.state = 'active';
  a.vy = 0;
  a.vx = 0;
}

function hitFriendly(g: Game, pr: Projectile): boolean {
  const p = g.player;
  const onPlayer = p.alive && pointInBox(pr.x, pr.y, playerBox(p), 1);
  const soldier = onPlayer ? undefined : g.soldiers.find((s) => s.hp > 0 && pointInBox(pr.x, pr.y, soldierBox(s), 1));
  const onBase = !onPlayer && !soldier && pointInBox(pr.x, pr.y, BASE_BOX);
  if (!onPlayer && !soldier && !onBase) return false;
  if (pr.kind === 'bomb') {
    explodeFriendly(g, pr.x, pr.y, BLAST_RADIUS, pr.damage);
    return true;
  }
  if (onPlayer) {
    hurtPlayer(g, pr.damage);
    if (pr.kind === 'web') {
      p.slow = WEB_SLOW;
      sfx(g, 'web');
    }
  } else if (soldier) hurtSoldier(g, soldier, pr.damage);
  else hurtBase(g, pr.damage);
  burst(g, pr.x, pr.y, 6, SPLAT[pr.kind], { speed: 60, life: 0.35 });
  return true;
}
