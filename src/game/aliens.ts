import { ALIENS, BUBBLE_POP_DAMAGE, DESCEND_SPEED, GRAVITY, GROUND_Y, WORLD_W, speedMultiplier, type AlienType } from './config';
import type { Ai } from './ai';
import { carrier, brood, ironcrab, kraken, overlord, wormking } from './bosses';
import { damageAlien } from './combat';
import { BUBBLE, DIRT, DUST, burst, sfx } from './effects';
import { blob, bug, drone, flyer, hopper, runner, spitter, squid, walker, worm } from './enemies';
import { clamp } from './rng';
import type { Alien, Game } from './types';

const AI: Record<AlienType, Ai> = {
  grunt: walker,
  runner,
  spitter,
  flyer,
  squid,
  drone,
  hopper,
  worm,
  bug,
  blob,
  splitter: walker,
  mini: walker,
  crab: walker,
  brute: walker,
  carrier,
  brood,
  kraken,
  ironcrab,
  wormking,
  overlord,
};

export function updateAliens(g: Game, dt: number): void {
  for (const a of g.aliens) if (a.hp > 0) updateAlien(g, a, dt);
  g.aliens = g.aliens.filter((a) => a.hp > 0);
}

function updateAlien(g: Game, a: Alien, dt: number): void {
  const d = ALIENS[a.type];
  a.anim += dt;
  a.flash = Math.max(0, a.flash - dt);
  a.slow = Math.max(0, a.slow - dt);
  if (a.kx !== 0) {
    a.x = clamp(a.x + a.kx * dt, d.w / 2, WORLD_W - d.w / 2);
    a.kx *= Math.exp(-10 * dt);
    if (Math.abs(a.kx) < 1) a.kx = 0;
  }
  if (a.state === 'descend') {
    const land = d.alt > 0 ? d.alt : GROUND_Y;
    a.y = Math.min(land, a.y + DESCEND_SPEED * dt);
    if (a.y < land) return;
    a.state = 'active';
    if (d.alt === 0) burst(g, a.x, GROUND_Y, 6 * d.scale, DUST, { speed: 50, life: 0.4, up: 20 });
    if (a.type === 'worm') {
      a.burrowed = true;
      burst(g, a.x, GROUND_Y - 2, 10, DIRT, { speed: 70, life: 0.4, up: 50 });
      sfx(g, 'burrow');
    }
    return;
  }
  if (a.trap > 0) {
    a.trap -= dt;
    a.y = Math.max(50, a.y - 24 * dt);
    if (a.trap > 0) return;
    a.trap = 0;
    burst(g, a.x, a.y - 8, 10, BUBBLE, { speed: 70, life: 0.4, gravity: 0 });
    sfx(g, 'pop');
    damageAlien(g, a, BUBBLE_POP_DAMAGE, 'player');
    return;
  }
  if (d.alt === 0 && a.type !== 'hopper' && a.y < GROUND_Y) {
    a.vy += GRAVITY * dt;
    a.y = Math.min(GROUND_Y, a.y + a.vy * dt);
    if (a.y >= GROUND_Y) a.vy = 0;
    return;
  }
  a.attacking = false;
  AI[a.type](g, a, d, dt, d.speed * a.pace * speedMultiplier(g.wave) * (a.slow > 0 ? 0.5 : 1));
}
