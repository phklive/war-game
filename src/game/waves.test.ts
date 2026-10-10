import { describe, expect, it } from 'vitest';
import { waveGame } from '../test/helpers';
import { ALIENS, BASE_X, BOSS_DELAY, BOSS_ORDER, ENEMY_ORDER, UFO_SPEED, UFO_Y, WAVES, WORLD_W, spawnInterval, ufoCount, type AlienType, type EnemyType } from './config';
import { mulberry32 } from './rng';
import { createAlien, createGame } from './state';
import type { Ufo } from './types';
import { aliensRemaining, hordeCleared, pickDropX, startWave, updateUfos, waveQueue } from './waves';

/** An rng that replays the given values in a loop. */
function seq(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

function ufo(over: Partial<Ufo> = {}): Ufo {
  return { x: 0, y: UFO_Y, state: 'idle', timer: 0, targetX: 0, cargo: null, anim: 0, ...over };
}

const countOf = (queue: readonly AlienType[], type: AlienType): number => queue.filter((t) => t === type).length;
const hordeSize = (wave: number): number => Object.values(WAVES[wave - 1].horde).reduce((n: number, c) => n + (c ?? 0), 0);

describe('waveQueue', () => {
  it('contains exactly the horde defined for every wave, and never a boss', () => {
    WAVES.forEach((def, i) => {
      const queue = waveQueue(i + 1, mulberry32(i));
      expect(queue).toHaveLength(hordeSize(i + 1));
      for (const type of ENEMY_ORDER) expect(countOf(queue, type)).toBe(def.horde[type] ?? 0);
      for (const boss of BOSS_ORDER) expect(countOf(queue, boss)).toBe(0);
    });
  });

  it('keeps enemy order when the shuffle draws never swap', () => {
    const queue = waveQueue(2, () => 0.999);
    const fill = (type: EnemyType, n: number): EnemyType[] => Array<EnemyType>(n).fill(type);
    expect(queue).toEqual([...fill('grunt', 12), ...fill('runner', 6), ...fill('hopper', 4), ...fill('bug', 1)]);
  });

  it('shuffles the queue deterministically from the rng', () => {
    const a = waveQueue(3, mulberry32(5));
    expect(waveQueue(3, mulberry32(5))).toEqual(a);
    expect(a).not.toEqual([...a].sort((x, y) => ENEMY_ORDER.indexOf(x) - ENEMY_ORDER.indexOf(y)));
  });
});

describe('pickDropX', () => {
  it.each([
    [[0, 0], BASE_X - 110],
    [[0, 0.5], BASE_X + 110],
    [[0.5, 0.2], BASE_X - 345],
    [[0.5, 0.9], BASE_X + 345],
  ])('maps rng draws %j to x=%d', (draws, x) => {
    expect(pickDropX(seq(...draws))).toBe(x);
  });

  it('always drops away from the base and inside the world margins', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const x = pickDropX(rng);
      expect(Math.abs(x - BASE_X)).toBeGreaterThanOrEqual(110);
      expect(x).toBeGreaterThanOrEqual(20);
      expect(x).toBeLessThanOrEqual(WORLD_W - 20);
    }
  });
});

describe('startWave', () => {
  it('starts the wave with a fresh horde, a pending boss, UFOs, banner and sound', () => {
    const g = createGame(1);
    g.paused = true;
    startWave(g, 1);
    expect(g.phase).toBe('wave');
    expect(g.wave).toBe(1);
    expect(g.paused).toBe(false);
    expect(g.spawnQueue).toEqual(Array<EnemyType>(14).fill('grunt'));
    expect(g.pendingBoss).toEqual({ type: 'carrier', elite: false, timer: BOSS_DELAY, announced: false });
    expect(g.ufos).toEqual([
      { x: -30, y: UFO_Y, state: 'idle', timer: 1, targetX: 0, cargo: null, anim: 0 },
      { x: WORLD_W + 30, y: UFO_Y + 8, state: 'idle', timer: 1.6, targetX: 0, cargo: null, anim: 1 },
    ]);
    expect(g.banner).toEqual({ text: 'WAVE 1', sub: 'THEY ARE COMING FROM THE SKY!', color: '#7dff4f', life: 2.4 });
    expect(g.sfx).toEqual(['waveStart']);
  });

  it('queues the boss defined for each wave, elite in the later waves', () => {
    WAVES.forEach((def, i) => {
      const g = createGame(1);
      startWave(g, i + 1);
      expect(g.pendingBoss).toEqual({ type: def.boss, elite: def.elite, timer: BOSS_DELAY, announced: false });
    });
    const g = createGame(1);
    startWave(g, 6);
    expect(g.pendingBoss).toMatchObject({ type: 'carrier', elite: true });
  });

  it('brings more UFOs from alternating sides in later waves', () => {
    const g = createGame(1);
    startWave(g, 7);
    expect(g.ufos).toHaveLength(ufoCount(7));
    expect(g.ufos.map((u) => [u.x, u.y])).toEqual([
      [-30, UFO_Y],
      [WORLD_W + 30, UFO_Y + 8],
      [-30, UFO_Y],
      [WORLD_W + 30, UFO_Y + 8],
    ]);
    const timers = g.ufos.map((u) => u.timer);
    [1, 1.6, 2.2, 2.8].forEach((t, i) => expect(timers[i]).toBeCloseTo(t));
  });

  it('warns that the final wave is a horde to survive', () => {
    const g = createGame(1);
    startWave(g, WAVES.length);
    expect(g.banner).toMatchObject({ text: `WAVE ${WAVES.length}`, sub: 'FINAL WAVE - SURVIVE THE HORDE' });
    expect(g.pendingBoss?.type).toBe('overlord');
  });
});

describe('updateUfos', () => {
  it('advances every UFO animation', () => {
    const g = waveGame();
    g.ufos = [ufo({ timer: 5 }), ufo({ state: 'leave', anim: 2 })];
    updateUfos(g, 0.1);
    expect(g.ufos.map((u) => u.anim)).toEqual([0.1, 2.1]);
  });

  it('waits while idle', () => {
    const g = waveGame();
    g.spawnQueue = ['grunt'];
    const u = ufo({ timer: 1 });
    g.ufos = [u];
    updateUfos(g, 0.1);
    expect(u.timer).toBeCloseTo(0.9);
    expect(u.state).toBe('idle');
    expect(g.spawnQueue).toEqual(['grunt']);
  });

  it('picks up the next alien and a drop point when ready', () => {
    const g = waveGame();
    g.rng = seq(0.5, 0.9);
    g.spawnQueue = ['runner', 'grunt'];
    const u = ufo({ timer: 0.05 });
    g.ufos = [u];
    updateUfos(g, 0.1);
    expect(u).toMatchObject({ state: 'move', cargo: 'runner', targetX: BASE_X + 345 });
    expect(g.spawnQueue).toEqual(['grunt']);
  });

  it('stays idle when ready but nothing is left to drop', () => {
    const g = waveGame();
    const u = ufo({ timer: 0.05 });
    g.ufos = [u];
    updateUfos(g, 0.1);
    expect(u.state).toBe('idle');
    expect(u.cargo).toBeNull();
  });

  it('flies toward its drop point in either direction', () => {
    const g = waveGame();
    const right = ufo({ state: 'move', x: -30, targetX: 490, cargo: 'grunt' });
    const left = ufo({ state: 'move', x: WORLD_W + 30, targetX: 710, cargo: 'grunt' });
    g.ufos = [right, left];
    updateUfos(g, 0.1);
    expect(right.x).toBeCloseTo(-30 + UFO_SPEED * 0.1);
    expect(left.x).toBeCloseTo(WORLD_W + 30 - UFO_SPEED * 0.1);
    expect(right.state).toBe('move');
    expect(left.state).toBe('move');
  });

  it('starts beaming once it reaches the drop point', () => {
    const g = waveGame();
    const u = ufo({ state: 'move', x: 480, targetX: 490, cargo: 'grunt' });
    g.ufos = [u];
    updateUfos(g, 0.1);
    expect(u.x).toBe(490);
    expect(u.state).toBe('beam');
    expect(u.timer).toBe(0.5);
  });

  it('keeps beaming until the beam timer runs out', () => {
    const g = waveGame();
    const u = ufo({ state: 'beam', x: 300, timer: 0.5, cargo: 'grunt' });
    g.ufos = [u];
    updateUfos(g, 0.1);
    expect(u.timer).toBeCloseTo(0.4);
    expect(g.aliens).toHaveLength(0);
  });

  it('drops its cargo as a descending alien, then waits its turn again', () => {
    const g = waveGame();
    g.wave = 4;
    const u = ufo({ state: 'beam', x: 300, timer: 0.05, cargo: 'spitter' });
    g.ufos = [u, ufo({ timer: 100 })];
    updateUfos(g, 0.1);
    expect(g.aliens).toHaveLength(1);
    expect(g.aliens[0]).toMatchObject({ type: 'spitter', x: 300, y: UFO_Y + 6, state: 'descend' });
    expect(u).toMatchObject({ state: 'idle', cargo: null });
    expect(u.timer).toBeCloseTo(spawnInterval(4) * 2);
    expect(g.sfx).toEqual([]);
  });

  it('drops a whole swarm, spread out, from a single group entry', () => {
    const g = waveGame();
    const u = ufo({ state: 'beam', x: 300, timer: 0, cargo: 'bug' });
    g.ufos = [u];
    updateUfos(g, 0.1);
    expect(g.aliens).toHaveLength(ALIENS.bug.group);
    expect(g.aliens.map((a) => a.type)).toEqual(['bug', 'bug', 'bug', 'bug']);
    expect(g.aliens.map((a) => a.x)).toEqual([288, 296, 304, 312]);
    expect(g.aliens.map((a) => a.y)).toEqual([UFO_Y + 6, UFO_Y + 3, UFO_Y, UFO_Y - 3]);
    expect(g.aliens.every((a) => a.state === 'descend')).toBe(true);
    expect(new Set(g.aliens.map((a) => a.id)).size).toBe(4);
    expect(u).toMatchObject({ state: 'idle', cargo: null });
  });

  it('refuses to beam down without cargo', () => {
    const g = waveGame();
    g.ufos = [ufo({ state: 'beam', timer: 0, cargo: null })];
    expect(() => updateUfos(g, 0.1)).toThrow('UFO beamed down without cargo');
  });

  it('flies leaving UFOs upward and removes them once off screen', () => {
    const g = waveGame();
    const staying = ufo({ state: 'leave', y: UFO_Y });
    g.ufos = [staying, ufo({ state: 'leave', y: -39 })];
    updateUfos(g, 0.1);
    expect(g.ufos).toEqual([staying]);
    expect(staying.y).toBeCloseTo(UFO_Y - 6);
  });
});

describe('hordeCleared / aliensRemaining', () => {
  it('is cleared when nothing is queued, carried or alive', () => {
    const g = waveGame();
    g.ufos = [ufo()];
    expect(hordeCleared(g)).toBe(true);
    expect(aliensRemaining(g)).toBe(0);
  });

  it('is cleared while the boss is still pending, which counts as one alien left', () => {
    const g = waveGame();
    g.pendingBoss = { type: 'carrier', elite: false, timer: BOSS_DELAY, announced: false };
    expect(hordeCleared(g)).toBe(true);
    expect(aliensRemaining(g)).toBe(1);
  });

  it('counts queued aliens, whole groups included', () => {
    const g = waveGame();
    g.spawnQueue = ['grunt', 'bug'];
    expect(hordeCleared(g)).toBe(false);
    expect(aliensRemaining(g)).toBe(1 + ALIENS.bug.group);
  });

  it('counts aliens carried by UFOs, whole groups included', () => {
    const g = waveGame();
    g.ufos = [ufo({ cargo: 'bug' }), ufo(), ufo({ cargo: 'grunt' })];
    expect(hordeCleared(g)).toBe(false);
    expect(aliensRemaining(g)).toBe(ALIENS.bug.group + 1);
  });

  it('counts only living aliens on the field, but waits for corpses to be cleared', () => {
    const g = waveGame();
    createAlien(g, 'grunt', 100, 200, 'active');
    const dead = createAlien(g, 'grunt', 200, 200, 'active');
    dead.hp = 0;
    expect(hordeCleared(g)).toBe(false);
    expect(aliensRemaining(g)).toBe(1);
  });

  it('is not cleared while a burrowed alien is still alive underground', () => {
    const g = waveGame();
    createAlien(g, 'worm', 100, 236, 'active').burrowed = true;
    expect(hordeCleared(g)).toBe(false);
    expect(aliensRemaining(g)).toBe(1);
  });

  it('adds everything up: queue, cargo, field and boss', () => {
    const g = waveGame();
    g.spawnQueue = ['bug', 'runner'];
    g.ufos = [ufo({ cargo: 'spitter' })];
    createAlien(g, 'grunt', 100, 200, 'active');
    g.pendingBoss = { type: 'brood', elite: true, timer: 1, announced: true };
    expect(aliensRemaining(g)).toBe(ALIENS.bug.group + 1 + 1 + 1 + 1);
  });
});
