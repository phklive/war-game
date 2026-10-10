import {
  ALIENS,
  BASE_X,
  BOSS_DELAY,
  ENEMY_ORDER,
  UFO_SPEED,
  UFO_Y,
  WAVES,
  WORLD_W,
  spawnInterval,
  ufoCount,
  type EnemyType,
} from './config';
import { sfx, showBanner } from './effects';
import { createAlien } from './state';
import type { Game, Ufo } from './types';

const DROP_MARGIN = 20;
const DROP_CLEARANCE = 110;
const BEAM_TIME = 0.5;

export function waveQueue(wave: number, rng: () => number): EnemyType[] {
  const horde = WAVES[wave - 1].horde;
  const queue: EnemyType[] = [];
  for (const type of ENEMY_ORDER) for (let i = 0; i < (horde[type] ?? 0); i++) queue.push(type);
  for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [queue[i], queue[j]] = [queue[j], queue[i]];
  }
  return queue;
}

export function pickDropX(rng: () => number): number {
  const span = BASE_X - DROP_CLEARANCE - DROP_MARGIN;
  const offset = DROP_CLEARANCE + rng() * span;
  return rng() < 0.5 ? BASE_X - offset : BASE_X + offset;
}

export function startWave(g: Game, wave: number): void {
  g.phase = 'wave';
  g.wave = wave;
  g.paused = false;
  g.spawnQueue = waveQueue(wave, g.rng);
  const def = WAVES[wave - 1];
  g.pendingBoss = { type: def.boss, elite: def.elite, timer: BOSS_DELAY, announced: false };
  g.ufos = Array.from({ length: ufoCount(wave) }, (_, i) => ({
    x: i % 2 === 0 ? -30 : WORLD_W + 30,
    y: UFO_Y + (i % 2) * 8,
    state: 'idle' as const,
    timer: 1 + i * 0.6,
    targetX: 0,
    cargo: null,
    anim: i,
  }));
  showBanner(g, `WAVE ${wave}`, wave === WAVES.length ? 'FINAL WAVE - SURVIVE THE HORDE' : 'THEY ARE COMING FROM THE SKY!', '#7dff4f');
  sfx(g, 'waveStart');
}

export function updateUfos(g: Game, dt: number): void {
  for (const u of g.ufos) {
    u.anim += dt;
    if (u.state === 'leave') {
      u.y -= 60 * dt;
    } else if (u.state === 'idle') {
      u.timer -= dt;
      const next = u.timer <= 0 ? g.spawnQueue.shift() : undefined;
      if (next) {
        u.cargo = next;
        u.targetX = pickDropX(g.rng);
        u.state = 'move';
      }
    } else if (u.state === 'move') {
      const dx = u.targetX - u.x;
      const step = UFO_SPEED * dt;
      u.x = Math.abs(dx) <= step ? u.targetX : u.x + Math.sign(dx) * step;
      if (u.x === u.targetX) {
        u.state = 'beam';
        u.timer = BEAM_TIME;
      }
    } else {
      u.timer -= dt;
      if (u.timer <= 0) dropCargo(g, u);
    }
  }
  g.ufos = g.ufos.filter((u) => u.y > -40);
}

function dropCargo(g: Game, u: Ufo): void {
  const type = u.cargo;
  if (!type) throw new Error('UFO beamed down without cargo');
  const group = ALIENS[type].group;
  for (let i = 0; i < group; i++) createAlien(g, type, u.x + (i - (group - 1) / 2) * 8, u.y + 6 - i * 3, 'descend');
  u.cargo = null;
  u.state = 'idle';
  u.timer = spawnInterval(g.wave) * g.ufos.length;
}

/** True once every horde alien has spawned and died (the boss may still be pending). */
export function hordeCleared(g: Game): boolean {
  return g.spawnQueue.length === 0 && g.aliens.length === 0 && g.ufos.every((u) => u.cargo === null);
}

export function aliensRemaining(g: Game): number {
  const queued = [...g.spawnQueue, ...g.ufos.flatMap((u) => (u.cargo ? [u.cargo] : []))].reduce((n, t) => n + ALIENS[t].group, 0);
  return queued + g.aliens.filter((a) => a.hp > 0).length + (g.pendingBoss ? 1 : 0);
}
