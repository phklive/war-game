import { COIN_LIFE, GRAVITY, GROUND_Y, WORLD_W } from './config';
import { GOLD, addText, burst, sfx } from './effects';
import { clamp } from './rng';
import type { Coin, Game, Player } from './types';

export function dropCoins(g: Game, x: number, y: number, value: number): void {
  const n = Math.min(8, Math.ceil(value / 8));
  const each = Math.floor(value / n);
  const extra = value - each * n;
  for (let i = 0; i < n; i++) {
    g.coins.push({
      x,
      y: Math.min(y, GROUND_Y - 3),
      vx: (g.rng() - 0.5) * 90,
      vy: -80 - g.rng() * 90,
      value: each + (i < extra ? 1 : 0),
      life: COIN_LIFE,
      grounded: false,
      magnet: false,
    });
  }
}

export const pickupRadius = (p: Player): number => 12 + p.magnetLevel * 14;
export const magnetRadius = (p: Player): number => (p.magnetLevel === 0 ? 0 : 30 + p.magnetLevel * 30);

export function collectCoin(g: Game, c: Coin): void {
  g.money += c.value;
  g.stats.earned += c.value;
  addText(g, c.x, c.y - 6, `+$${c.value}`, '#ffd23f');
  burst(g, c.x, c.y, 3, GOLD, { speed: 50, life: 0.3, gravity: 0 });
  sfx(g, 'coin');
}

export function collectAllCoins(g: Game): void {
  for (const c of g.coins) collectCoin(g, c);
  g.coins = [];
}

export function updateCoins(g: Game, dt: number): void {
  const p = g.player;
  const px = p.x;
  const py = p.y - 7;
  const keep: Coin[] = [];
  for (const c of g.coins) {
    const dx = px - c.x;
    const dy = py - c.y;
    const d = Math.hypot(dx, dy);
    if (p.alive && d < pickupRadius(p)) {
      collectCoin(g, c);
      continue;
    }
    if (c.magnet || (p.alive && d < magnetRadius(p))) {
      const k = Math.min(1, ((c.magnet ? 380 : 220) * dt) / d);
      c.x += dx * k;
      c.y += dy * k;
      keep.push(c);
      continue;
    }
    c.life -= dt;
    if (c.life <= 0) continue;
    if (!c.grounded) {
      c.vy += GRAVITY * dt;
      c.x = clamp(c.x + c.vx * dt, 3, WORLD_W - 3);
      c.y += c.vy * dt;
      if (c.y >= GROUND_Y - 3) {
        c.y = GROUND_Y - 3;
        if (c.vy > 120) {
          c.vy *= -0.35;
          c.vx *= 0.6;
        } else {
          c.grounded = true;
        }
      }
    }
    keep.push(c);
  }
  g.coins = keep;
}
