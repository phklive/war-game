import { ALIENS, BASE_HALF_W, BASE_X, GRAVITY, GROUND_Y, PLAYER_STATS, ROOF_Y, TANK_STATS, WEAPON_ORDER, WORLD_W } from './config';
import { alienBox, boxesOverlap, damageAlien, equipWeapon, playerBox, targetable } from './combat';
import { DUST, SPARK, burst, sfx } from './effects';
import { clamp } from './rng';
import { playerMaxHp } from './state';
import type { Game, InputState } from './types';
import { fireWeapon, shoulder } from './weapons';

export function respawnPlayer(g: Game): void {
  const p = g.player;
  p.alive = true;
  p.hp = playerMaxHp(p);
  p.x = BASE_X;
  p.y = ROOF_Y;
  p.vy = 0;
  p.onGround = true;
  p.invuln = 2;
  burst(g, p.x, p.y - 8, 16, SPARK, { speed: 90, life: 0.5, gravity: 0 });
}

export function updatePlayer(g: Game, input: InputState, dt: number): void {
  const p = g.player;
  if (!p.alive) {
    p.respawn -= dt;
    if (p.respawn <= 0) respawnPlayer(g);
    return;
  }
  p.cooldown -= dt;
  p.invuln = Math.max(0, p.invuln - dt);
  p.hurt = Math.max(0, p.hurt - dt);
  p.muzzle = Math.max(0, p.muzzle - dt);
  p.swing = Math.max(0, p.swing - dt);
  p.slow = Math.max(0, p.slow - dt);

  handleWeaponKeys(g, input.pressed);
  const tank = p.weapon === 'tank';
  const stats = tank ? TANK_STATS : PLAYER_STATS;
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  p.vx = dir * stats.speed * (p.slow > 0 ? 0.5 : 1);
  if (dir !== 0) p.anim += dt;
  if (input.jump && p.onGround) {
    p.vy = -stats.jump;
    burst(g, p.x, p.y, 4, DUST, { speed: 40, life: 0.3, up: 10 });
    sfx(g, 'jump');
  }
  const prevY = p.y;
  p.vy += GRAVITY * dt;
  p.x = clamp(p.x + p.vx * dt, stats.w / 2, WORLD_W - stats.w / 2);
  p.y += p.vy * dt;
  p.onGround = false;
  const overRoof = Math.abs(p.x - BASE_X) <= BASE_HALF_W;
  if (p.vy >= 0 && !input.down && overRoof && prevY <= ROOF_Y && p.y >= ROOF_Y) {
    p.y = ROOF_Y;
    p.vy = 0;
    p.onGround = true;
  } else if (p.y >= GROUND_Y) {
    p.y = GROUND_Y;
    p.vy = 0;
    p.onGround = true;
  }

  const s = shoulder(p);
  const ax = g.camX + input.mouseX;
  p.aim = Math.atan2(input.mouseY - s.y, ax - s.x);
  p.facing = ax >= p.x ? 1 : -1;
  if (input.fire && p.cooldown <= 0) fireWeapon(g);
  if (tank) crush(g, dt);
}

/** 1-8 pick an unlocked weapon; Q / E (or the mouse wheel) cycle through them. */
function handleWeaponKeys(g: Game, pressed: readonly string[]): void {
  const p = g.player;
  for (const key of pressed) {
    const slot = /^Digit([1-8])$/.exec(key);
    const current = WEAPON_ORDER.indexOf(p.weapon);
    const count = p.unlocked + 1;
    let index = -1;
    if (slot) index = Number(slot[1]) - 1;
    else if (key === 'KeyE' || key === 'WheelDown') index = (current + 1) % count;
    else if (key === 'KeyQ' || key === 'WheelUp') index = (current - 1 + count) % count;
    if (index >= 0 && index <= p.unlocked) equipWeapon(g, WEAPON_ORDER[index]);
  }
}

function crush(g: Game, dt: number): void {
  const p = g.player;
  const box = playerBox(p);
  for (const a of g.aliens) {
    if (!targetable(a) || ALIENS[a.type].alt > 0 || !boxesOverlap(box, alienBox(a))) continue;
    damageAlien(g, a, TANK_STATS.crushDps * dt, 'player', a.x >= p.x ? 1 : -1, 60);
  }
}
