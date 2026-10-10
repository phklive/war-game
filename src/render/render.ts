import {
  ALIENS,
  BASE_HALF_W,
  BASE_X,
  GROUND_Y,
  KILLS_PER_WEAPON,
  ROOF_Y,
  TOTAL_WAVES,
  UFO_Y,
  VIEW_H,
  VIEW_W,
  WAVES,
  WEAPONS,
  WEAPON_ORDER,
  WORLD_W,
  ENEMY_ORDER,
  SOLDIER,
  type EnemyType,
} from '../game/config';
import { turretPos } from '../game/allies';
import { targetable } from '../game/combat';
import { clamp } from '../game/rng';
import { SHOP_PANEL, START_BUTTON, inRect, shopItems, shopRow } from '../game/shop';
import { baseMaxHp, playerMaxHp } from '../game/state';
import type { Alien, Game } from '../game/types';
import { aliensRemaining } from '../game/waves';
import { muzzle, shoulder } from '../game/weapons';
import { drawLabel, drawText } from './font';
import { GROUND_TOP, PARALLAX_FAR, PARALLAX_NEAR, TANK_PIVOT, alienFrameCount, type Sprites } from './sprites';

type Ctx = CanvasRenderingContext2D;

export interface View {
  mouseX: number;
  mouseY: number;
  muted: boolean;
}

const TURRET_COLORS = ['#5a616e', '#7a8499', '#c9a227', '#ff5a5a'];
const LASER_CORE = '#ffffff';

function rect(ctx: Ctx, color: string, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function bar(ctx: Ctx, x: number, y: number, w: number, h: number, ratio: number, color: string): void {
  rect(ctx, '#0b0812', x - 1, y - 1, w + 2, h + 2);
  rect(ctx, '#2a2438', x, y, w, h);
  rect(ctx, color, x, y, w * clamp(ratio, 0, 1), h);
}

function pixelLine(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, size: number): void {
  const len = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1)));
  for (let i = 0; i <= len; i++) {
    const t = i / len;
    ctx.fillRect(Math.round(x1 + (x2 - x1) * t - size / 2), Math.round(y1 + (y2 - y1) * t - size / 2), size, size);
  }
}

export function render(ctx: Ctx, g: Game, sp: Sprites, view: View): void {
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 1;
  ctx.drawImage(sp.get('bg_sky').canvas, 0, 0);
  ctx.drawImage(sp.get('bg_far').canvas, -Math.round(g.camX * PARALLAX_FAR), 0);
  ctx.drawImage(sp.get('bg_near').canvas, -Math.round(g.camX * PARALLAX_NEAR), 0);

  const shakeX = g.shake > 0 ? Math.round((Math.random() - 0.5) * 2 * g.shake) : 0;
  const shakeY = g.shake > 0 ? Math.round((Math.random() - 0.5) * 2 * g.shake) : 0;
  ctx.save();
  ctx.translate(-Math.round(g.camX) + shakeX, shakeY);
  ctx.drawImage(sp.get('bg_ground').canvas, 0, GROUND_TOP);
  drawBeams(ctx, g);
  drawBase(ctx, g, sp);
  drawCoins(ctx, g, sp);
  drawSoldiers(ctx, g, sp);
  for (const a of g.aliens) if (a.hp > 0) drawAlien(ctx, g, sp, a);
  drawPlayer(ctx, g, sp);
  drawProjectiles(ctx, g, sp);
  drawTracers(ctx, g);
  drawParticles(ctx, g);
  for (const t of g.texts) {
    ctx.globalAlpha = clamp(t.life / 0.3, 0, 1);
    drawLabel(ctx, t.text, t.x, t.y, t.color, 1, 'center');
  }
  ctx.globalAlpha = 1;
  drawUfos(ctx, g, sp);
  ctx.restore();

  if (g.phase !== 'title') drawHud(ctx, g, sp);
  drawOverlay(ctx, g, sp, view);
  if (view.muted) drawLabel(ctx, 'MUTED', VIEW_W - 4, VIEW_H - 10, '#ff5050', 1, 'right');
  drawCursor(ctx, view);
}

// ---------------------------------------------------------------- world

function beam(ctx: Ctx, g: Game, x: number, y0: number, y1: number, w: number): void {
  ctx.globalAlpha = 0.22 + 0.08 * Math.sin(g.time * 20);
  rect(ctx, '#7dffb0', x - w / 2, y0, w, y1 - y0);
  ctx.globalAlpha = 0.6;
  rect(ctx, '#bfffd8', x - w / 2, y0, 1, y1 - y0);
  rect(ctx, '#bfffd8', x + w / 2 - 1, y0, 1, y1 - y0);
  ctx.globalAlpha = 1;
}

function drawBeams(ctx: Ctx, g: Game): void {
  for (const u of g.ufos) if (u.state === 'beam') beam(ctx, g, u.x, u.y + 6, GROUND_Y, 14);
  for (const a of g.aliens) {
    if (a.state === 'descend' && a.hp > 0) beam(ctx, g, a.x, UFO_Y + 6, a.y, ALIENS[a.type].w * ALIENS[a.type].scale + 6);
  }
}

function drawBase(ctx: Ctx, g: Game, sp: Sprites): void {
  const b = g.base;
  const x0 = BASE_X - BASE_HALF_W;
  const w = BASE_HALF_W * 2;
  const body = ROOF_Y + 4;
  const h = GROUND_Y - body;
  // flag
  const wave = Math.floor(g.time * 4) % 2;
  rect(ctx, '#3a3a44', x0 + 3, ROOF_Y - 24, 1, 24);
  rect(ctx, '#4f6b34', x0 + 4, ROOF_Y - 24 + wave, 11, 7);
  rect(ctx, '#34482a', x0 + 11, ROOF_Y - 24 + wave * 2, 4, 7 - wave);
  rect(ctx, '#ffe14d', x0 + 7, ROOF_Y - 22 + wave, 2, 2);

  switch (b.level) {
    case 1: {
      rect(ctx, '#2a2418', x0 + 2, body, w - 4, h);
      for (const px of [x0 + 2, x0 + 25, x0 + w - 29, x0 + w - 6]) {
        rect(ctx, '#6b4a2b', px, body, 4, h);
        rect(ctx, '#4a321d', px + 3, body, 1, h);
      }
      for (let row = 0; row < 3; row++) {
        for (let bx = x0 + (row % 2) * 4; bx < x0 + w - 4; bx += 9) {
          if (Math.abs(bx + 4 - BASE_X) < 9) continue;
          rect(ctx, '#6e5d3c', bx, GROUND_Y - 5 - row * 5, 9, 5);
          rect(ctx, '#b39b6b', bx + 1, GROUND_Y - 4 - row * 5, 7, 3);
        }
      }
      rect(ctx, '#5b6b34', BASE_X - 8, body + 6, 16, h - 6);
      rect(ctx, '#1b1f16', BASE_X - 2, body + 14, 4, h - 14);
      roof(ctx, x0, w, '#8a6239', '#5e3f24');
      break;
    }
    case 2: {
      for (let lx = x0; lx < x0 + w; lx += 5) {
        rect(ctx, lx % 10 === 0 ? '#7a5230' : '#6b4527', lx, body - 3, 5, h + 3);
        rect(ctx, '#4a2f19', lx + 4, body - 3, 1, h + 3);
      }
      rect(ctx, '#4a2f19', x0, body + 8, w, 2);
      rect(ctx, '#4a2f19', x0, GROUND_Y - 8, w, 2);
      door(ctx, '#3a2414', '#5e3f24');
      for (const sx of [x0 + 10, x0 + w - 18]) rect(ctx, '#14141c', sx, body + 14, 8, 3);
      roof(ctx, x0, w, '#9a6e41', '#5e3f24');
      break;
    }
    case 3: {
      rect(ctx, '#7d7f86', x0, body, w, h);
      for (let row = 0; row * 6 < h; row++) {
        rect(ctx, '#64666d', x0, body + row * 6, w, 1);
        for (let bx = x0 + (row % 2) * 6; bx < x0 + w; bx += 12) rect(ctx, '#64666d', bx, body + row * 6, 1, 6);
      }
      for (const sx of [x0 + 8, x0 + w - 20]) rect(ctx, '#14141c', sx, body + 10, 12, 3);
      door(ctx, '#4d5566', '#3a4152');
      roof(ctx, x0, w, '#9a9ca3', '#5c5e66');
      break;
    }
    case 4: {
      rect(ctx, '#4d5566', x0, body, w, h);
      for (let px = x0; px < x0 + w; px += 16) {
        rect(ctx, '#3a4152', px, body, 1, h);
        for (let ry = body + 3; ry < GROUND_Y - 6; ry += 8) rect(ctx, '#9aa3b5', px + 3, ry, 1, 1);
      }
      for (let sx = 0; sx < w; sx += 6) {
        rect(ctx, '#ffd23f', x0 + sx, GROUND_Y - 5, 3, 5);
        rect(ctx, '#1b1d22', x0 + sx + 3, GROUND_Y - 5, 3, 5);
      }
      for (const tx of [x0 - 4, x0 + w - 6]) {
        rect(ctx, '#3a4152', tx, ROOF_Y - 12, 10, 12);
        rect(ctx, '#14141c', tx + 3, ROOF_Y - 8, 4, 2);
      }
      for (const sx of [x0 + 8, x0 + w - 20]) rect(ctx, '#ff6b2b', sx, body + 10, 12, 2);
      door(ctx, '#2f3540', '#1b1d22');
      roof(ctx, x0, w, '#6a7280', '#3a4152');
      break;
    }
    default: {
      rect(ctx, '#2f3a52', x0, body, w, h);
      const glow = Math.floor(g.time * 3) % 2 === 0 ? '#53f5ff' : '#2fb8c8';
      for (let ly = body + 6; ly < GROUND_Y - 4; ly += 9) rect(ctx, glow, x0 + 2, ly, w - 4, 1);
      for (const tx of [x0 - 6, x0 + w - 6]) {
        rect(ctx, '#232c40', tx, ROOF_Y - 18, 12, 18);
        rect(ctx, glow, tx + 4, ROOF_Y - 14, 4, 2);
      }
      rect(ctx, '#9aa3b5', BASE_X + 20, ROOF_Y - 22, 1, 22);
      rect(ctx, Math.floor(g.time * 2) % 2 === 0 ? '#ff2a2a' : '#5a1010', BASE_X + 19, ROOF_Y - 24, 3, 3);
      door(ctx, '#151b28', glow);
      roof(ctx, x0, w, '#53607a', '#232c40');
      break;
    }
  }

  const ratio = b.hp / baseMaxHp(b.level);
  ctx.fillStyle = '#14141c';
  if (ratio < 0.66) {
    pixelLine(ctx, x0 + 10, body + 2, x0 + 16, body + 14, 1);
    pixelLine(ctx, x0 + w - 12, body + 4, x0 + w - 18, body + 18, 1);
  }
  if (ratio < 0.33) {
    pixelLine(ctx, x0 + 26, body + 1, x0 + 22, body + 20, 1);
    pixelLine(ctx, x0 + w - 30, body + 6, x0 + w - 24, body + 26, 1);
  }
  if (b.flash > 0) {
    ctx.globalAlpha = 0.45;
    rect(ctx, '#ffffff', x0, ROOF_Y, w, GROUND_Y - ROOF_Y);
    ctx.globalAlpha = 1;
  }

  const turretColor = TURRET_COLORS[b.turretLevel - 1];
  const mount = sp.get('turret');
  for (const t of g.turrets) {
    const pos = turretPos(t.slot);
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(t.aim);
    rect(ctx, '#1b1d22', -t.recoil * 20, -2, 11, 4);
    rect(ctx, turretColor, -t.recoil * 20, -1, 11, 2);
    ctx.restore();
    ctx.drawImage(mount.canvas, pos.x - 5, pos.y - 2);
  }
}

function roof(ctx: Ctx, x0: number, w: number, top: string, edge: string): void {
  rect(ctx, edge, x0 - 2, ROOF_Y, w + 4, 4);
  rect(ctx, top, x0 - 2, ROOF_Y, w + 4, 2);
  for (let px = x0; px < x0 + w; px += 7) rect(ctx, edge, px, ROOF_Y, 1, 2);
}

function door(ctx: Ctx, color: string, trim: string): void {
  rect(ctx, trim, BASE_X - 8, GROUND_Y - 20, 16, 20);
  rect(ctx, color, BASE_X - 7, GROUND_Y - 19, 14, 19);
}

function drawCoins(ctx: Ctx, g: Game, sp: Sprites): void {
  const frames = [0, 1, 2, 1];
  for (const c of g.coins) {
    if (!c.magnet && c.life < 4 && Math.floor(c.life * 8) % 2 === 0) continue;
    const frame = frames[Math.floor(g.time * 8 + c.x * 0.1) % 4];
    ctx.drawImage(sp.get(`coin_${frame}`).canvas, Math.round(c.x - 3), Math.round(c.y - 3));
  }
}

function drawHeld(ctx: Ctx, sp: Sprites, name: string, x: number, y: number, angle: number): void {
  const s = sp.get(name);
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.rotate(angle);
  if (Math.cos(angle) < 0) ctx.scale(1, -1);
  ctx.drawImage(s.canvas, -s.px, -s.py);
  ctx.restore();
}

function drawSoldiers(ctx: Ctx, g: Game, sp: Sprites): void {
  for (const s of g.soldiers) {
    const flip = Math.cos(s.aim) < 0 ? '_L' : '';
    const body = sp.get(`ally_idle${flip}`);
    ctx.drawImage(body.canvas, Math.round(s.x - body.w / 2), GROUND_Y - body.h);
    drawHeld(ctx, sp, 'w_ar', s.x - Math.cos(s.aim) * s.recoil * 12, GROUND_Y - 9, s.aim);
    if (s.hp < SOLDIER.hp) bar(ctx, s.x - 5, GROUND_Y - 20, 10, 1, s.hp / SOLDIER.hp, '#7dff4f');
  }
}

function alienFrame(a: Alien): number {
  if (a.state !== 'active' || a.trap > 0) return 0;
  if (a.type === 'hopper') return a.vy === 0 ? 0 : 1;
  return Math.floor(a.anim * 6) % alienFrameCount(a.type);
}

function drawMound(ctx: Ctx, g: Game, a: Alien): void {
  const d = ALIENS[a.type];
  const w = d.w + 6;
  const rumbling = d.boss && a.mode === 1;
  const x = a.x - w / 2 + (rumbling ? Math.round(Math.sin(g.time * 60) * 1.5) : 0);
  rect(ctx, '#6e4c30', x, GROUND_Y - 3, w, 3);
  rect(ctx, '#8a7a5a', x + 2, GROUND_Y - 4, w - 4, 1);
  if (rumbling && blink(g)) drawLabel(ctx, '!', a.x, GROUND_Y - 26, '#ff4040', 2, 'center');
}

function drawAlien(ctx: Ctx, g: Game, sp: Sprites, a: Alien): void {
  if (a.burrowed) return drawMound(ctx, g, a);
  const d = ALIENS[a.type];
  const frame = alienFrame(a);
  const name = a.flash > 0 ? `${a.type}_flash` : `${a.type}_${a.elite ? 'e' : ''}${frame}`;
  const s = sp.get(`${name}${a.facing < 0 ? '_L' : ''}`);
  const sw = s.w * d.scale;
  const sh = s.h * d.scale;
  const lunge = a.attacking && a.atkCd < 0.15 ? a.facing * 2 * d.scale : 0;
  const left = Math.round(a.x - sw / 2 + lunge);
  const top = Math.round(a.y - sh);
  if (a.type === 'flyer') {
    const flick = Math.floor(g.time * 20) % 2;
    rect(ctx, '#ffb347', a.x - 4, a.y, 2, 2 + flick);
    rect(ctx, '#ffb347', a.x + 2, a.y, 2, 3 - flick);
    rect(ctx, '#fff3a0', a.x - 4, a.y, 2, 1);
    rect(ctx, '#fff3a0', a.x + 2, a.y, 2, 1);
  }
  if (a.type === 'carrier' && a.summon < 0.6) beam(ctx, g, a.x, a.y + 4, GROUND_Y, 22);
  ctx.drawImage(s.canvas, left, top, sw, sh);
  if (a.type === 'spitter' && a.special < 0.3) rect(ctx, '#d8ff9a', a.x - 1, a.y - 7, 2, 2);
  if (a.slow > 0) {
    rect(ctx, '#5ad1ff', a.x - 4, top + ((g.time * 30) % sh), 1, 2);
    rect(ctx, '#5ad1ff', a.x + 3, top + ((g.time * 30 + sh / 2) % sh), 1, 2);
  }
  if (a.trap > 0) {
    const trap = sp.get('trap');
    ctx.drawImage(trap.canvas, Math.round(a.x - trap.w / 2), Math.round(a.y - sh / 2 - trap.h / 2));
  }
  if (a.hp < a.maxHp && !d.boss) bar(ctx, a.x - d.w / 2, top - 4, d.w, 1, a.hp / a.maxHp, '#ff5050');
}

function drawPlayer(ctx: Ctx, g: Game, sp: Sprites): void {
  const p = g.player;
  if (!p.alive || (p.invuln > 0 && Math.floor(g.time * 16) % 2 === 0)) return;
  const flip = p.facing < 0 ? '_L' : '';
  if (p.weapon === 'tank') {
    const tank = sp.get(`tank_${Math.floor(p.anim * 10) % 2}${flip}`);
    const left = Math.round(p.x - tank.w / 2);
    const top = Math.round(p.y - tank.h);
    const pivotX = left + (flip ? tank.w - 1 - TANK_PIVOT.x : TANK_PIVOT.x);
    ctx.save();
    ctx.translate(pivotX, top + TANK_PIVOT.y);
    ctx.rotate(p.aim);
    rect(ctx, '#1b1f16', 0, -2, 16, 4);
    rect(ctx, '#4a5e2b', 0, -1, 15, 2);
    rect(ctx, '#1b1f16', 14, -3, 3, 6);
    ctx.restore();
    ctx.drawImage(tank.canvas, left, top);
  } else {
    const frame = !p.onGround ? 'jump' : p.vx !== 0 ? (Math.floor(p.anim * 10) % 2 === 0 ? 'run1' : 'run2') : 'idle';
    const body = sp.get(`soldier_${frame}${flip}`);
    ctx.drawImage(body.canvas, Math.round(p.x - body.w / 2), Math.round(p.y - body.h));
    const sh = shoulder(p);
    let angle = p.aim;
    if (p.weapon === 'knife' && p.swing > 0) {
      const t = 1 - p.swing / 0.15;
      angle = p.aim + p.facing * (-1.3 + 2.6 * t);
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.7;
      for (let i = 0; i < 6; i++) {
        const a = p.aim + p.facing * (-1.3 + 2.6 * t * (i / 5));
        ctx.fillRect(Math.round(sh.x + Math.cos(a) * 15), Math.round(sh.y + Math.sin(a) * 15), 2, 2);
      }
      ctx.globalAlpha = 1;
    }
    drawHeld(ctx, sp, `w_${p.weapon}`, sh.x, sh.y, angle);
  }
  if (p.muzzle > 0) {
    const m = muzzle(p);
    rect(ctx, '#ffb347', m.x - 2, m.y - 2, 5, 5);
    rect(ctx, '#ffffff', m.x - 1, m.y - 1, 3, 3);
  }
}

function drawProjectiles(ctx: Ctx, g: Game, sp: Sprites): void {
  for (const pr of g.projectiles) {
    switch (pr.kind) {
      case 'bullet': {
        const len = Math.hypot(pr.vx, pr.vy);
        ctx.fillStyle = pr.team === 'player' ? '#fff3a0' : '#ffd0a0';
        pixelLine(ctx, pr.x, pr.y, pr.x - (pr.vx / len) * 3, pr.y - (pr.vy / len) * 3, 1);
        break;
      }
      case 'water':
        rect(ctx, '#2c8fd6', pr.x - 1, pr.y - 1, 2, 2);
        rect(ctx, '#bff3ff', pr.x - 1, pr.y - 1, 1, 1);
        break;
      case 'bubble': {
        const b = sp.get('bubble');
        ctx.drawImage(b.canvas, Math.round(pr.x - 3), Math.round(pr.y - 3 + Math.sin(g.time * 12 + pr.x) * 1.5));
        break;
      }
      case 'shell':
        rect(ctx, '#ffb347', pr.x - 3 - Math.sign(pr.vx) * 2, pr.y - 1, 2, 2);
        rect(ctx, '#2b2b2b', pr.x - 2, pr.y - 2, 4, 4);
        break;
      case 'plasma':
        rect(ctx, '#3fbf2a', pr.x - 2, pr.y - 2, 5, 5);
        rect(ctx, '#d8ff9a', pr.x - 1, pr.y - 1, 3, 3);
        break;
      case 'acid':
        rect(ctx, '#9be22d', pr.x - 2, pr.y - 2, 4, 4);
        rect(ctx, '#f4ff9a', pr.x - 1, pr.y - 2, 2, 2);
        break;
      case 'bomb':
        rect(ctx, '#2b2b2b', pr.x - 2, pr.y - 3, 4, 6);
        rect(ctx, Math.floor(g.time * 10) % 2 === 0 ? '#ff2a2a' : '#5a1010', pr.x - 1, pr.y - 3, 2, 1);
        break;
      case 'zap': {
        const len = Math.hypot(pr.vx, pr.vy);
        ctx.fillStyle = '#ff4040';
        pixelLine(ctx, pr.x, pr.y, pr.x - (pr.vx / len) * 5, pr.y - (pr.vy / len) * 5, 2);
        ctx.fillStyle = '#ffffff';
        pixelLine(ctx, pr.x, pr.y, pr.x - (pr.vx / len) * 3, pr.y - (pr.vy / len) * 3, 1);
        break;
      }
      case 'web':
        rect(ctx, '#ffffff', pr.x - 2, pr.y, 5, 1);
        rect(ctx, '#ffffff', pr.x, pr.y - 2, 1, 5);
        rect(ctx, '#d8d8e8', pr.x - 1, pr.y - 1, 3, 3);
        break;
    }
  }
}

function drawTracers(ctx: Ctx, g: Game): void {
  for (const t of g.tracers) {
    ctx.globalAlpha = clamp(t.life / t.max, 0, 1);
    ctx.fillStyle = t.color;
    pixelLine(ctx, t.x1, t.y1, t.x2, t.y2, t.width + 1);
    if (t.width > 1) {
      ctx.fillStyle = LASER_CORE;
      pixelLine(ctx, t.x1, t.y1, t.x2, t.y2, 1);
    }
  }
  ctx.globalAlpha = 1;
}

function drawParticles(ctx: Ctx, g: Game): void {
  for (const p of g.particles) {
    ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
    rect(ctx, p.color, p.x, p.y, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

function drawUfos(ctx: Ctx, g: Game, sp: Sprites): void {
  for (const u of g.ufos) {
    const s = sp.get(`ufo_${Math.floor(u.anim * 4) % 2}`);
    ctx.drawImage(s.canvas, Math.round(u.x - s.w / 2), Math.round(u.y - 5 + Math.sin(u.anim * 3) * 2));
  }
}

// ---------------------------------------------------------------- HUD

function weaponIcon(ctx: Ctx, sp: Sprites, weapon: string, x: number, y: number): void {
  const s = sp.get(weapon === 'tank' ? 'tank_0' : `w_${weapon}`);
  const scale = s.w <= 14 ? 2 : 1;
  ctx.drawImage(s.canvas, Math.round(x - (s.w * scale) / 2), Math.round(y - (s.h * scale) / 2), s.w * scale, s.h * scale);
}

function drawHud(ctx: Ctx, g: Game, sp: Sprites): void {
  const p = g.player;
  const b = g.base;
  const baseMax = baseMaxHp(b.level);
  const baseRatio = b.hp / baseMax;
  ctx.drawImage(sp.get('icon_castle').canvas, 5, 4);
  bar(ctx, 15, 5, 80, 5, baseRatio, baseRatio > 0.5 ? '#7dff4f' : baseRatio > 0.25 ? '#ffd23f' : '#ff5050');
  drawLabel(ctx, `${Math.ceil(b.hp)}`, 99, 4, '#e9f1ff');
  ctx.drawImage(sp.get('icon_heart').canvas, 5, 15);
  bar(ctx, 15, 16, 80, 5, p.hp / playerMaxHp(p), '#e43b44');
  drawLabel(ctx, `${Math.ceil(p.hp)}`, 99, 15, '#e9f1ff');

  ctx.drawImage(sp.get('coin_0').canvas, VIEW_W - 58, 4);
  drawLabel(ctx, `$${g.money}`, VIEW_W - 50, 4, '#ffd23f');
  drawLabel(ctx, `WAVE ${g.wave}/${TOTAL_WAVES}`, VIEW_W - 5, 14, '#e9f1ff', 1, 'right');
  ctx.drawImage(sp.get('icon_skull').canvas, VIEW_W - 34, 24);
  drawLabel(ctx, `${aliensRemaining(g)}`, VIEW_W - 5, 24, '#c4c6cf', 1, 'right');

  drawMinimap(ctx, g);

  // weapon panel
  ctx.globalAlpha = 0.6;
  rect(ctx, '#0b0812', 3, VIEW_H - 27, 150, 24);
  ctx.globalAlpha = 1;
  weaponIcon(ctx, sp, p.weapon, 18, VIEW_H - 15);
  drawLabel(ctx, WEAPONS[p.weapon].name, 38, VIEW_H - 24, '#ffe14d');
  WEAPON_ORDER.forEach((weapon, i) => {
    const x = 4 + i * 13;
    const y = VIEW_H - 41;
    const unlocked = i <= p.unlocked;
    rect(ctx, weapon === p.weapon ? '#ffe14d' : '#0b0812', x, y, 12, 11);
    rect(ctx, unlocked ? '#2a2140' : '#14101c', x + 1, y + 1, 10, 9);
    drawText(ctx, `${i + 1}`, x + 6, y + 2, unlocked ? '#e9f1ff' : '#4a4552', 1, 'center');
  });
  if (p.unlocked === WEAPON_ORDER.length - 1) {
    drawLabel(ctx, 'ALL WEAPONS!', 38, VIEW_H - 13, '#ff9ce8');
  } else {
    const progress = p.kills % KILLS_PER_WEAPON;
    bar(ctx, 38, VIEW_H - 12, 70, 4, progress / KILLS_PER_WEAPON, '#ff9ce8');
    drawLabel(ctx, `${progress}/${KILLS_PER_WEAPON}`, 113, VIEW_H - 14, '#e9f1ff');
  }

  const boss = g.aliens.find((a) => a.hp > 0 && ALIENS[a.type].boss);
  if (boss) {
    drawLabel(ctx, `${boss.elite ? 'ELITE ' : ''}${ALIENS[boss.type].name}`, VIEW_W / 2, 22, '#ff4040', 1, 'center');
    bar(ctx, VIEW_W / 2 - 80, 31, 160, 4, boss.hp / boss.maxHp, '#ff4040');
  }

  if (p.hurt > 0) {
    ctx.globalAlpha = p.hurt;
    rect(ctx, '#ff2020', 0, 0, VIEW_W, 3);
    rect(ctx, '#ff2020', 0, VIEW_H - 3, VIEW_W, 3);
    rect(ctx, '#ff2020', 0, 0, 3, VIEW_H);
    rect(ctx, '#ff2020', VIEW_W - 3, 0, 3, VIEW_H);
    ctx.globalAlpha = 1;
  }
  if (!p.alive) drawLabel(ctx, `RESPAWN IN ${Math.ceil(p.respawn)}`, VIEW_W / 2, 120, '#ff5050', 2, 'center');

  if (g.banner) {
    const bn = g.banner;
    ctx.globalAlpha = clamp(bn.life / 0.4, 0, 1);
    drawLabel(ctx, bn.text, VIEW_W / 2, 62, bn.color, bn.text.length > 12 ? 2 : 3, 'center');
    drawLabel(ctx, bn.sub, VIEW_W / 2, 88, '#e9f1ff', 1, 'center');
    ctx.globalAlpha = 1;
  }
}

function drawMinimap(ctx: Ctx, g: Game): void {
  const w = 140;
  const x = (VIEW_W - w) / 2;
  const y = 4;
  const h = 12;
  const sx = (wx: number): number => x + (wx / WORLD_W) * w;
  const sy = (wy: number): number => y + (wy / GROUND_Y) * (h - 1);
  ctx.globalAlpha = 0.6;
  rect(ctx, '#0b0812', x - 1, y - 1, w + 2, h + 2);
  ctx.globalAlpha = 1;
  rect(ctx, '#5a3d26', x, y + h - 1, w, 1);
  rect(ctx, '#9fb3d1', sx(BASE_X - BASE_HALF_W), y + h - 4, (BASE_HALF_W * 2 * w) / WORLD_W, 3);
  ctx.globalAlpha = 0.5;
  rect(ctx, '#e9f1ff', sx(g.camX), y, 1, h);
  rect(ctx, '#e9f1ff', sx(g.camX + VIEW_W), y, 1, h);
  ctx.globalAlpha = 1;
  for (const c of g.coins) rect(ctx, '#ffd23f', sx(c.x), y + h - 2, 1, 1);
  for (const s of g.soldiers) rect(ctx, '#d2c08c', sx(s.x), y + h - 3, 1, 2);
  for (const a of g.aliens) {
    if (!targetable(a)) continue;
    const boss = ALIENS[a.type].boss;
    rect(ctx, boss ? '#ff2a2a' : '#ff6b6b', sx(a.x), sy(a.y) - 2, boss ? 3 : 1, 2);
  }
  if (g.player.alive) rect(ctx, '#7dff4f', sx(g.player.x), sy(g.player.y) - 3, 1, 3);
}

// ---------------------------------------------------------------- overlays

function dim(ctx: Ctx, alpha: number, color = '#0b0812'): void {
  ctx.globalAlpha = alpha;
  rect(ctx, color, 0, 0, VIEW_W, VIEW_H);
  ctx.globalAlpha = 1;
}

function blink(g: Game): boolean {
  return Math.floor(g.time * 2.5) % 2 === 0;
}

/** The horde of a wave as (type, count) pairs; bug counts are swarms. */
export function waveSummary(wave: number): { type: EnemyType; count: number }[] {
  const horde = WAVES[wave - 1].horde;
  return ENEMY_ORDER.flatMap((type) => {
    const count = horde[type];
    return count ? [{ type, count }] : [];
  });
}

function drawOverlay(ctx: Ctx, g: Game, sp: Sprites, view: View): void {
  switch (g.phase) {
    case 'title':
      return drawTitle(ctx, g, sp);
    case 'shop':
      return drawShop(ctx, g, sp, view);
    case 'gameover':
      dim(ctx, 0.55, '#2a0508');
      drawLabel(ctx, 'BASE DESTROYED', VIEW_W / 2, 70, '#ff4040', 3, 'center');
      drawStats(ctx, g, 'THE GRAYS HAVE TAKEN THE PLANET.');
      if (g.phaseTimer <= 0 && blink(g)) drawLabel(ctx, 'CLICK OR PRESS ENTER TO TRY AGAIN', VIEW_W / 2, 200, '#ffffff', 1, 'center');
      return;
    case 'victory':
      dim(ctx, 0.35);
      drawLabel(ctx, 'VICTORY!', VIEW_W / 2, 60, '#ffd23f', 4, 'center');
      drawStats(ctx, g, 'EARTH IS SAFE... FOR NOW.');
      if (g.phaseTimer <= 0 && blink(g)) drawLabel(ctx, 'CLICK OR PRESS ENTER TO PLAY AGAIN', VIEW_W / 2, 200, '#ffffff', 1, 'center');
      return;
    default:
      if (!g.paused) return;
      dim(ctx, 0.5);
      drawLabel(ctx, 'PAUSED', VIEW_W / 2, 110, '#e9f1ff', 3, 'center');
      drawLabel(ctx, 'PRESS P TO RESUME', VIEW_W / 2, 140, '#9fb3d1', 1, 'center');
  }
}

function drawStats(ctx: Ctx, g: Game, line: string): void {
  drawLabel(ctx, line, VIEW_W / 2, 108, '#e9f1ff', 1, 'center');
  drawLabel(ctx, `WAVE REACHED: ${g.wave}/${TOTAL_WAVES}`, VIEW_W / 2, 132, '#9fb3d1', 1, 'center');
  drawLabel(ctx, `ALIENS KILLED: ${g.stats.kills}`, VIEW_W / 2, 144, '#9fb3d1', 1, 'center');
  drawLabel(ctx, `MONEY EARNED: $${g.stats.earned}`, VIEW_W / 2, 156, '#9fb3d1', 1, 'center');
  drawLabel(ctx, `FINAL WEAPON: ${WEAPONS[g.player.weapon].name}`, VIEW_W / 2, 168, '#9fb3d1', 1, 'center');
}

function drawTitle(ctx: Ctx, g: Game, sp: Sprites): void {
  dim(ctx, 0.55);
  const alien = sp.get(`grunt_${Math.floor(g.time * 3) % 2}`);
  ctx.drawImage(alien.canvas, 36, 92 + Math.round(Math.sin(g.time * 2) * 4), alien.w * 4, alien.h * 4);
  const hero = sp.get('soldier_idle_L');
  ctx.drawImage(hero.canvas, VIEW_W - 76, 96, hero.w * 4, hero.h * 4);
  drawText(ctx, 'GRAY INVASION', VIEW_W / 2 + 2, 30, '#3fbf2a', 4, 'center');
  drawText(ctx, 'GRAY INVASION', VIEW_W / 2, 28, '#c4c6cf', 4, 'center');
  drawLabel(ctx, 'BIG-HEADED GRAYS ARE FALLING FROM THE SKY!', VIEW_W / 2, 66, '#7dff4f', 1, 'center');
  drawLabel(ctx, 'PROTECT YOUR BASE FOR 10 WAVES.', VIEW_W / 2, 76, '#7dff4f', 1, 'center');
  const lines = [
    'A/D MOVE    W/SPACE JUMP    S DROP DOWN',
    'MOUSE AIM    HOLD CLICK TO SHOOT',
    'EVERY 10 KILLS = A NEW WEAPON',
    '1-8, Q/E OR WHEEL TO SWITCH WEAPONS',
    'RUN OVER DROPPED COINS TO GRAB THEM',
    'SPEND COINS ON TURRETS, SOLDIERS, WALLS',
    'P PAUSE    M MUTE',
  ];
  lines.forEach((l, i) => drawLabel(ctx, l, VIEW_W / 2, 100 + i * 13, '#e9f1ff', 1, 'center'));
  if (blink(g)) drawLabel(ctx, 'CLICK OR PRESS ENTER TO START', VIEW_W / 2, 196, '#ffd23f', 1, 'center');
}

function drawShop(ctx: Ctx, g: Game, sp: Sprites, view: View): void {
  dim(ctx, 0.4);
  const panel = SHOP_PANEL;
  ctx.globalAlpha = 0.94;
  rect(ctx, '#120d1c', panel.x, panel.y, panel.w, panel.h);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#7dff4f';
  ctx.lineWidth = 1;
  ctx.strokeRect(panel.x + 0.5, panel.y + 0.5, panel.w - 1, panel.h - 1);
  drawLabel(ctx, 'ARMORY', VIEW_W / 2, panel.y + 7, '#7dff4f', 2, 'center');
  drawLabel(ctx, `$${g.money}`, panel.x + panel.w - 10, panel.y + 7, '#ffd23f', 2, 'right');
  drawLabel(ctx, `WAVE ${g.wave} CLEARED - SPEND YOUR LOOT`, VIEW_W / 2, panel.y + 27, '#9fb3d1', 1, 'center');

  const mouse = { x: view.mouseX, y: view.mouseY };
  shopItems(g).forEach((item, i) => {
    const r = shopRow(i);
    const affordable = item.price !== null && g.money >= item.price;
    rect(ctx, inRect(mouse, r) ? '#2a2140' : i % 2 === 0 ? '#1a1428' : '#160f22', r.x, r.y, r.w, r.h);
    const ty = r.y + 5;
    drawLabel(ctx, `[${i + 1}]`, r.x + 4, ty, '#7dff4f');
    drawLabel(ctx, item.label, r.x + 30, ty, item.price === null ? '#6b6575' : '#ffffff');
    drawLabel(ctx, item.desc, r.x + 130, ty, '#9fb3d1');
    const price = item.price === null ? item.note : `$${item.price}`;
    drawLabel(ctx, price, r.x + r.w - 6, ty, item.price === null ? '#6b6575' : affordable ? '#ffd23f' : '#ff5050', 1, 'right');
  });

  const listBottom = shopRow(7).y;
  const next = WAVES[g.wave];
  const bossName = `${next.elite ? 'ELITE ' : ''}${ALIENS[next.boss].name}`;
  drawLabel(ctx, `NEXT: WAVE ${g.wave + 1}${g.wave + 1 === TOTAL_WAVES ? ' (FINAL)' : ''} - BOSS: ${bossName}`, VIEW_W / 2, listBottom + 3, '#ff9ce8', 1, 'center');
  const horde = waveSummary(g.wave + 1);
  const slot = 26;
  const x0 = VIEW_W / 2 - (horde.length * slot) / 2;
  horde.forEach(({ type, count }, i) => {
    const icon = sp.get(`${type}_0`);
    const cx = x0 + i * slot + slot / 2;
    ctx.drawImage(icon.canvas, Math.round(cx - icon.w / 2), listBottom + 28 - icon.h);
    drawLabel(ctx, `${count}`, cx, listBottom + 30, '#c4c6cf', 1, 'center');
  });

  const btn = START_BUTTON;
  rect(ctx, '#7dff4f', btn.x, btn.y, btn.w, btn.h);
  rect(ctx, inRect(mouse, btn) ? '#3f8f38' : '#2f6b2a', btn.x + 1, btn.y + 1, btn.w - 2, btn.h - 2);
  drawLabel(ctx, `START WAVE ${g.wave + 1} [ENTER]`, btn.x + btn.w / 2, btn.y + 6, '#ffffff', 1, 'center');
}

function drawCursor(ctx: Ctx, view: View): void {
  const x = Math.round(view.mouseX);
  const y = Math.round(view.mouseY);
  for (const [color, grow] of [
    ['#0b0812', 1],
    ['#ffffff', 0],
  ] as const) {
    ctx.fillStyle = color;
    ctx.fillRect(x - 6 - grow, y - grow, 4 + grow * 2, 1 + grow * 2);
    ctx.fillRect(x + 3 - grow, y - grow, 4 + grow * 2, 1 + grow * 2);
    ctx.fillRect(x - grow, y - 6 - grow, 1 + grow * 2, 4 + grow * 2);
    ctx.fillRect(x - grow, y + 3 - grow, 1 + grow * 2, 4 + grow * 2);
  }
  ctx.fillStyle = '#ff4040';
  ctx.fillRect(x, y, 1, 1);
}
