import { GROUND_Y } from './config';
import type { Game, Sfx } from './types';

const MAX_PARTICLES = 700;

export const GOO = ['#7dff4f', '#3fbf2a', '#b6ff8a'];
export const FIRE = ['#fff3a0', '#ffb347', '#ff6b2b', '#c2361b'];
export const SMOKE = ['#4a4552', '#6b6575', '#2f2b36'];
export const SPARK = ['#ffffff', '#ffe680', '#ffb347'];
export const BLOOD = ['#d62b2b', '#8f1b1b'];
export const WATER = ['#5ad1ff', '#bff3ff', '#2c8fd6'];
export const BUBBLE = ['#bff6ff', '#ff9ce8', '#ffffff'];
export const DUST = ['#8a7a5a', '#6b5d43', '#a8987a'];
export const GOLD = ['#ffd23f', '#fff6c0', '#c98a00'];
export const ACID = ['#d8ff4a', '#9be22d', '#f4ff9a'];
export const ZAP = ['#ff4040', '#ffb0b0', '#ffffff'];
export const WEB = ['#ffffff', '#d8d8e8'];
export const DIRT = ['#5a3d26', '#6e4c30', '#8a7a5a'];

export interface BurstOpts {
  speed?: number;
  life?: number;
  gravity?: number;
  size?: number;
  up?: number;
}

export function burst(g: Game, x: number, y: number, n: number, colors: readonly string[], opts: BurstOpts = {}): void {
  const { speed = 80, life = 0.5, gravity = 300, size = 1, up = 0 } = opts;
  for (let i = 0; i < n; i++) {
    const angle = g.rng() * Math.PI * 2;
    const s = speed * (0.3 + g.rng() * 0.7);
    g.particles.push({
      x,
      y,
      vx: Math.cos(angle) * s,
      vy: Math.sin(angle) * s - up,
      life: life * (0.5 + g.rng() * 0.5),
      max: life,
      size,
      gravity,
      color: colors[i % colors.length],
    });
  }
  if (g.particles.length > MAX_PARTICLES) g.particles.splice(0, g.particles.length - MAX_PARTICLES);
}

export function addText(g: Game, x: number, y: number, text: string, color: string): void {
  g.texts.push({ x, y, text, color, life: 0.9 });
}

export function addTracer(g: Game, x1: number, y1: number, x2: number, y2: number, color: string, width: number, life: number): void {
  g.tracers.push({ x1, y1, x2, y2, color, width, life, max: life });
}

export function addShake(g: Game, amount: number): void {
  g.shake = Math.max(g.shake, amount);
}

export function sfx(g: Game, name: Sfx): void {
  g.sfx.push(name);
}

export function showBanner(g: Game, text: string, sub: string, color: string, life = 2.4): void {
  g.banner = { text, sub, color, life };
}

export function updateEffects(g: Game, dt: number): void {
  for (const p of g.particles) {
    p.vy += p.gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.y > GROUND_Y) {
      p.y = GROUND_Y;
      p.vy *= -0.3;
      p.vx *= 0.6;
    }
    p.life -= dt;
  }
  g.particles = g.particles.filter((p) => p.life > 0);
  for (const t of g.tracers) t.life -= dt;
  g.tracers = g.tracers.filter((t) => t.life > 0);
  for (const t of g.texts) {
    t.y -= 22 * dt;
    t.life -= dt;
  }
  g.texts = g.texts.filter((t) => t.life > 0);
  if (g.banner) {
    g.banner.life -= dt;
    if (g.banner.life <= 0) g.banner = null;
  }
  g.shake = Math.max(0, g.shake - dt * 30);
}
