import { afterEach, describe, expect, it, vi } from 'vitest';
import { ALIENS, BASE_X, GROUND_Y, ROOF_Y, UFO_Y, VIEW_H, VIEW_W, WAVES, WEAPON_ORDER, type AlienType, type WeaponId } from '../game/config';
import { turretPos } from '../game/allies';
import { SHOP_PANEL, START_BUTTON, shopRow } from '../game/shop';
import { baseMaxHp, createAlien, createGame, createSoldier } from '../game/state';
import type { Alien, Game, Projectile, ProjectileKind, Team } from '../game/types';
import { muzzle } from '../game/weapons';
import { makeFakeCanvas } from '../test/fakeCanvas';
import { waveGame } from '../test/helpers';
import { drawLabel, drawText } from './font';
import { render, waveSummary, type View } from './render';
import { GROUND_TOP, buildSprites, type Sprites } from './sprites';

vi.mock('./font', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./font')>();
  return { ...actual, drawLabel: vi.fn(actual.drawLabel), drawText: vi.fn(actual.drawText) };
});

// ---------------------------------------------------------------- harness

interface Op {
  op: string;
  args: readonly unknown[];
  fill: unknown;
  alpha: unknown;
}

interface Image {
  name: string;
  args: readonly unknown[];
}

interface Label {
  text: string;
  x: number;
  y: number;
  color: string;
  scale: number | undefined;
  align: string | undefined;
}

interface Frame {
  ctx: CanvasRenderingContext2D;
  ops: Op[];
  images: Image[];
  labels: Label[];
}

/** A 2D context stand-in that records every call with its arguments, fillStyle and globalAlpha. */
function recorder(): { ctx: CanvasRenderingContext2D; ops: Op[] } {
  const state: Record<string | symbol, unknown> = {};
  const ops: Op[] = [];
  const ctx = new Proxy(state, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return (...args: unknown[]) => {
        ops.push({ op: String(prop), args, fill: target.fillStyle, alpha: target.globalAlpha });
      };
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, ops };
}

const SPRITES = buildSprites(makeFakeCanvas);

function draw(g: Game, view: Partial<View> = {}): Frame {
  const names = new Map<unknown, string>();
  const sp: Sprites = {
    get(name) {
      const s = SPRITES.get(name);
      names.set(s.canvas, name);
      return s;
    },
  };
  const { ctx, ops } = recorder();
  vi.mocked(drawLabel).mockClear();
  vi.mocked(drawText).mockClear();
  render(ctx, g, sp, { mouseX: VIEW_W / 2, mouseY: VIEW_H / 2, muted: false, ...view });
  const images = ops
    .filter((o) => o.op === 'drawImage')
    .map((o) => {
      const name = names.get(o.args[0]);
      if (!name) throw new Error('drawImage called with a canvas that did not come from the sprite set');
      return { name, args: o.args.slice(1) };
    });
  const labels = vi.mocked(drawLabel).mock.calls.map(([, text, x, y, color, scale, align]) => ({ text, x, y, color, scale, align }));
  return { ctx, ops, images, labels };
}

const fillRects = (f: Frame, color: string): readonly unknown[][] => f.ops.filter((o) => o.op === 'fillRect' && o.fill === color).map((o) => [...o.args]);
const fillOps = (f: Frame, color: string): Op[] => f.ops.filter((o) => o.op === 'fillRect' && o.fill === color);
const imageNames = (f: Frame): string[] => f.images.map((i) => i.name);
const texts = (f: Frame): string[] => f.labels.map((l) => l.text);
const label = (f: Frame, text: string): Label | undefined => f.labels.find((l) => l.text === text);
const calls = (f: Frame, op: string): (readonly unknown[])[] => f.ops.filter((o) => o.op === op).map((o) => o.args);

function alien(g: Game, type: AlienType, overrides: Partial<Alien> = {}): Alien {
  return Object.assign(createAlien(g, type, 300, GROUND_Y, 'active'), { anim: 0, ...overrides });
}

function proj(kind: ProjectileKind, team: Team, x: number, y: number, vx: number, vy = 0): Projectile {
  return { kind, team, x, y, vx, vy, damage: 1, life: 1, gravity: 0, pierce: 1, knock: 0, hit: [] };
}

function armed(weapon: WeaponId): Game {
  const g = waveGame();
  g.player.weapon = weapon;
  return g;
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------- tests

describe('render frame', () => {
  it('draws parallax backgrounds, then the world translated by the camera', () => {
    const g = waveGame();
    g.camX = 100;
    const f = draw(g);
    expect(f.ctx.imageSmoothingEnabled).toBe(false);
    expect(f.images.slice(0, 4)).toEqual([
      { name: 'bg_sky', args: [0, 0] },
      { name: 'bg_far', args: [-25, 0] },
      { name: 'bg_near', args: [-50, 0] },
      { name: 'bg_ground', args: [0, GROUND_TOP] },
    ]);
    expect(calls(f, 'translate')[0]).toEqual([-100, 0]);
    expect(calls(f, 'save')).toHaveLength(calls(f, 'restore').length);
  });

  it('shakes the world by up to g.shake pixels', () => {
    const g = waveGame();
    g.camX = 100;
    g.shake = 5;
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    expect(calls(draw(g), 'translate')[0]).toEqual([-96, 4]);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(calls(draw(g), 'translate')[0]).toEqual([-105, -5]);
  });

  it('draws a crosshair with a red center at the mouse', () => {
    const f = draw(waveGame(), { mouseX: 100.4, mouseY: 50.6 });
    const last = f.ops[f.ops.length - 1];
    expect(last).toMatchObject({ op: 'fillRect', args: [100, 51, 1, 1], fill: '#ff4040' });
    expect(fillRects(f, '#ffffff')).toEqual([
      [94, 51, 4, 1],
      [103, 51, 4, 1],
      [100, 45, 1, 4],
      [100, 54, 1, 4],
    ]);
  });

  it('shows a MUTED tag only when muted', () => {
    expect(label(draw(waveGame(), { muted: true }), 'MUTED')).toMatchObject({ x: VIEW_W - 4, color: '#ff5050', align: 'right' });
    expect(label(draw(waveGame()), 'MUTED')).toBeUndefined();
  });
});

describe('title screen', () => {
  it('shows the title, controls and a blinking start prompt without the HUD', () => {
    const g = createGame(1);
    const on = draw(g);
    expect(vi.mocked(drawText).mock.calls.map((c) => [c[1], c[5], c[6]])).toEqual([
      ['GRAY INVASION', 4, 'center'],
      ['GRAY INVASION', 4, 'center'],
    ]);
    expect(texts(on)).toContain('P PAUSE    M MUTE');
    expect(texts(on)).toContain('1-8, Q/E OR WHEEL TO SWITCH WEAPONS');
    expect(texts(on)).toContain('CLICK OR PRESS ENTER TO START');
    expect(imageNames(on)).toEqual(expect.arrayContaining(['grunt_0', 'soldier_idle_L']));
    expect(imageNames(on)).not.toContain('icon_castle');

    g.time = 0.4;
    const off = draw(g);
    expect(texts(off)).not.toContain('CLICK OR PRESS ENTER TO START');
    expect(imageNames(off)).toContain('grunt_1');
  });
});

describe('base', () => {
  const ROOFS = ['#8a6239', '#9a6e41', '#9a9ca3', '#6a7280', '#53607a'];

  it.each([1, 2, 3, 4, 5])('draws a distinct building for level %i', (level) => {
    const g = waveGame();
    g.base.level = level;
    g.base.hp = baseMaxHp(level);
    const f = draw(g);
    ROOFS.forEach((color, i) => {
      const roofs = fillRects(f, color).filter((r) => r[1] === ROOF_Y && r[3] === 2);
      expect(roofs).toHaveLength(i === level - 1 ? 1 : 0);
    });
    // full health: green HUD bar, full width
    expect(fillRects(f, '#7dff4f')).toContainEqual([15, 5, 80, 5]);
    expect(label(f, `${baseMaxHp(level)}`)).toBeDefined();
  });

  it('blinks the level 5 lights over time', () => {
    const g = waveGame();
    g.base.level = 5;
    const a = draw(g);
    expect(fillRects(a, '#53f5ff').length).toBeGreaterThan(0);
    expect(fillRects(a, '#ff2a2a')).toHaveLength(1);
    expect(fillRects(a, '#2fb8c8')).toHaveLength(0);
    g.time = 0.5;
    const b = draw(g);
    expect(fillRects(b, '#53f5ff')).toHaveLength(0);
    expect(fillRects(b, '#2fb8c8').length).toBeGreaterThan(0);
    expect(fillRects(b, '#5a1010')).toHaveLength(1);
  });

  it('cracks more as base health drops', () => {
    const g = waveGame();
    const cracks = (ratio: number): number => {
      g.base.hp = baseMaxHp(1) * ratio;
      return fillRects(draw(g), '#14141c').length;
    };
    const healthy = cracks(1);
    const damaged = cracks(0.5);
    const wrecked = cracks(0.1);
    expect(healthy).toBe(0);
    expect(damaged).toBeGreaterThan(0);
    expect(wrecked).toBeGreaterThan(damaged);
  });

  it('flashes white when hit', () => {
    const g = waveGame();
    const flashRect = [BASE_X - 40, ROOF_Y, 80, GROUND_Y - ROOF_Y];
    expect(fillRects(draw(g), '#ffffff')).not.toContainEqual(flashRect);
    g.base.flash = 0.1;
    const f = draw(g);
    expect(fillOps(f, '#ffffff').find((o) => o.args[1] === ROOF_Y)).toMatchObject({ args: flashRect, alpha: 0.45 });
  });

  it('draws turrets rotated to their aim, colored by turret level, recoiling backwards', () => {
    const g = waveGame();
    g.base.turretLevel = 4;
    g.turrets = [
      { slot: 0, cd: 0, aim: 1, recoil: 0.1 },
      { slot: 1, cd: 0, aim: 2, recoil: 0.05 },
    ];
    const f = draw(g);
    expect(calls(f, 'rotate').slice(0, 2)).toEqual([[1], [2]]);
    expect(fillRects(f, '#ff5a5a')).toEqual([
      [-2, -1, 11, 2],
      [-1, -1, 11, 2],
    ]);
    const mounts = f.images.filter((i) => i.name === 'turret').map((i) => i.args);
    expect(mounts).toEqual([0, 1].map((slot) => [turretPos(slot).x - 5, turretPos(slot).y - 2]));
  });
});

describe('coins', () => {
  it('spin through frames and blink out when about to expire unless magnetized', () => {
    const g = waveGame();
    const coin = (x: number, life: number, magnet: boolean) => ({ x, y: 200, vx: 0, vy: 0, value: 1, life, grounded: true, magnet });
    g.coins = [coin(400, 1, true), coin(410, 10, false), coin(420, 0.1, false), coin(430, 0.2, false)];
    const f = draw(g);
    const world = f.images.filter((i) => i.name.startsWith('coin_') && i.args[1] === 197);
    expect(world).toEqual([
      { name: 'coin_0', args: [397, 197] },
      { name: 'coin_1', args: [407, 197] },
      { name: 'coin_1', args: [427, 197] },
    ]);
    // every coin, visible or not, shows on the minimap
    expect(fillRects(f, '#ffd23f').filter((r) => r[2] === 1 && r[3] === 1)).toHaveLength(4);
  });
});

describe('soldiers', () => {
  it('face their aim, hold a rifle, and show a health bar only when hurt', () => {
    const g = waveGame();
    createSoldier(g); // slot 0 aims left
    createSoldier(g); // slot 1 aims right
    const healthy = draw(g);
    expect(imageNames(healthy)).toEqual(expect.arrayContaining(['ally_idle_L', 'ally_idle']));
    expect(imageNames(healthy).filter((n) => n === 'w_ar')).toHaveLength(2);
    expect(calls(healthy, 'scale')).toEqual([[1, -1]]);
    expect(fillRects(healthy, '#d2c08c')).toHaveLength(2);

    g.soldiers[1].hp = 20;
    const hurt = draw(g);
    expect(fillRects(hurt, '#2a2438').length).toBe(fillRects(healthy, '#2a2438').length + 1);
    expect(fillRects(hurt, '#7dff4f')).toContainEqual([g.soldiers[1].x - 5, GROUND_Y - 20, 5, 1]);
  });
});

describe('aliens', () => {
  it('skips dead aliens entirely', () => {
    const g = waveGame();
    alien(g, 'grunt', { hp: 0 });
    alien(g, 'grunt', { hp: 0, state: 'descend', y: 100 });
    const f = draw(g);
    expect(imageNames(f).filter((n) => n.startsWith('grunt'))).toEqual([]);
    expect(fillRects(f, '#ff6b6b')).toEqual([]);
    expect(fillRects(f, '#7dffb0')).toEqual([]);
  });

  it('animates the walk cycle only for active, untrapped aliens', () => {
    const g = waveGame();
    alien(g, 'grunt', { anim: 0.2 });
    alien(g, 'runner', { anim: 0.2, trap: 1 });
    alien(g, 'spitter', { anim: 0.2, state: 'descend', y: 100 });
    alien(g, 'flyer', { anim: 0 });
    const f = draw(g);
    expect(imageNames(f)).toEqual(expect.arrayContaining(['grunt_1', 'runner_0', 'spitter_0', 'flyer_0', 'trap']));
  });

  it('shows a white silhouette while flashing', () => {
    const g = waveGame();
    alien(g, 'brute', { flash: 0.1 });
    expect(imageNames(draw(g))).toContain('brute_flash');
  });

  it('lunges toward its target at the end of an attack wind-up, scaled by size', () => {
    const at = (type: AlienType, overrides: Partial<Alien>): readonly unknown[] => {
      const g = waveGame();
      alien(g, type, overrides);
      const img = draw(g).images.find((i) => i.name === `${type}_0` || i.name === `${type}_0_L`);
      if (!img) throw new Error(`${type} not drawn`);
      return img.args;
    };
    expect(at('grunt', { attacking: false, atkCd: 0.1 })).toEqual([294, GROUND_Y - 16, 12, 16]);
    expect(at('grunt', { attacking: true, atkCd: 0.3 })).toEqual([294, GROUND_Y - 16, 12, 16]);
    expect(at('grunt', { attacking: true, atkCd: 0.1, facing: 1 })).toEqual([296, GROUND_Y - 16, 12, 16]);
    expect(at('brute', { attacking: true, atkCd: 0.1, facing: -1 })).toEqual([284, GROUND_Y - 32, 24, 32]);
  });

  it('gives flyers thruster flames', () => {
    const g = waveGame();
    alien(g, 'grunt');
    expect(fillRects(draw(g), '#fff3a0')).toEqual([]);
    alien(g, 'flyer', { x: 400, y: 120 });
    const f = draw(g);
    expect(fillRects(f, '#fff3a0')).toEqual([
      [396, 120, 2, 1],
      [402, 120, 2, 1],
    ]);
    expect(fillRects(f, '#ffb347')).toHaveLength(2);
  });

  it('makes spitters glow just before they spit', () => {
    const g = waveGame();
    const s = alien(g, 'spitter', { special: 1 });
    expect(fillRects(draw(g), '#d8ff9a')).toEqual([]);
    s.special = 0.1;
    expect(fillRects(draw(g), '#d8ff9a')).toEqual([[299, GROUND_Y - 7, 2, 2]]);
  });

  it('drips water from slowed aliens', () => {
    const g = waveGame();
    const a = alien(g, 'grunt');
    expect(fillRects(draw(g), '#5ad1ff')).toEqual([]);
    a.slow = 1;
    expect(fillRects(draw(g), '#5ad1ff')).toHaveLength(2);
  });

  it('shows a health bar over damaged aliens but not the boss, who gets a HUD bar instead', () => {
    const g = waveGame();
    const grunt = alien(g, 'grunt');
    const full = draw(g);
    expect(fillRects(full, '#ff5050')).toEqual([]);
    expect(fillRects(full, '#ff6b6b')).toHaveLength(1);
    expect(label(full, 'OVERLORD')).toBeUndefined();

    grunt.hp = grunt.maxHp / 2;
    const boss = alien(g, 'overlord', { x: 800 });
    boss.hp = boss.maxHp / 4;
    const f = draw(g);
    expect(fillRects(f, '#ff5050')).toEqual([[295, GROUND_Y - 16 - 4, 5, 1]]);
    expect(label(f, 'OVERLORD')).toMatchObject({ x: VIEW_W / 2, color: '#ff4040', align: 'center' });
    expect(fillRects(f, '#ff4040')).toContainEqual([VIEW_W / 2 - 80, 31, 40, 4]);
    // minimap: boss is a wider, darker red blip
    expect(fillRects(f, '#ff2a2a').map((r) => r[2])).toEqual([3]);

    boss.hp = 0;
    expect(label(draw(g), 'OVERLORD')).toBeUndefined();
  });

  it.each([
    ['kraken', false, 'ACID KRAKEN'],
    ['kraken', true, 'ELITE ACID KRAKEN'],
    ['ironcrab', true, 'ELITE IRON CRAB'],
  ] as const)('names any boss in the HUD (%s, elite %s)', (type, elite, name) => {
    const g = waveGame();
    alien(g, type, { elite, x: 700, y: 150 });
    const f = draw(g);
    expect(label(f, name)).toMatchObject({ x: VIEW_W / 2, y: 22, color: '#ff4040', align: 'center' });
    expect(fillRects(f, '#ff4040')).toContainEqual([VIEW_W / 2 - 80, 31, 160, 4]);
    expect(fillRects(f, '#ff5050')).toEqual([]);
  });

  it('draws a tractor beam above descending aliens', () => {
    const g = waveGame();
    alien(g, 'brute', { state: 'descend', x: 400, y: 150 });
    const beam = fillOps(draw(g), '#7dffb0');
    const w = ALIENS.brute.w * ALIENS.brute.scale + 6;
    expect(beam).toHaveLength(1);
    expect(beam[0]).toMatchObject({ args: [400 - w / 2, UFO_Y + 6, w, 150 - UFO_Y - 6], alpha: 0.22 });
  });

  it('mirrors aliens that face left, including their hit flash', () => {
    const g = waveGame();
    alien(g, 'crab', { facing: 1 });
    alien(g, 'squid', { facing: -1 });
    alien(g, 'drone', { facing: -1, flash: 0.1 });
    expect(imageNames(draw(g))).toEqual(expect.arrayContaining(['crab_0', 'squid_0_L', 'drone_flash_L']));
  });

  it('cycles through as many frames as the alien type has', () => {
    const frameOf = (type: AlienType, anim: number): string => {
      const g = waveGame();
      alien(g, type, { anim });
      const img = imageNames(draw(g)).find((n) => n.startsWith(`${type}_`));
      if (!img) throw new Error(`${type} not drawn`);
      return img;
    };
    expect([0, 0.2, 0.34].map((anim) => frameOf('worm', anim))).toEqual(['worm_0', 'worm_1', 'worm_0']);
    expect([0, 0.2, 0.34].map((anim) => frameOf('splitter', anim))).toEqual(['splitter_0', 'splitter_0', 'splitter_0']);
  });

  it('shows hoppers crouched on the ground and stretched mid-jump, whatever their walk cycle', () => {
    const g = waveGame();
    alien(g, 'hopper', { anim: 0.2, vy: 0 });
    alien(g, 'hopper', { anim: 0, vy: -200 });
    alien(g, 'hopper', { anim: 0, vy: 50, trap: 1 });
    expect(imageNames(draw(g)).filter((n) => n.startsWith('hopper_'))).toEqual(['hopper_0', 'hopper_1', 'hopper_0']);
  });

  it('draws elite bosses with their red-tinted frames, but flashes them like any alien', () => {
    const g = waveGame();
    const boss = alien(g, 'carrier', { elite: true, anim: 0.2, y: 62 });
    expect(imageNames(draw(g))).toContain('carrier_e1');
    boss.facing = -1;
    expect(imageNames(draw(g))).toContain('carrier_e1_L');
    boss.flash = 0.1;
    expect(imageNames(draw(g))).toContain('carrier_flash_L');
  });

  it('draws a deploy beam under the carrier while it drops reinforcements', () => {
    const g = waveGame();
    const carrier = alien(g, 'carrier', { y: 62 });
    alien(g, 'brood', { x: 700, summon: 0.1 });
    expect(fillRects(draw(g), '#7dffb0')).toEqual([]);
    carrier.summon = 0.5;
    const f = draw(g);
    expect(fillOps(f, '#7dffb0')).toEqual([{ op: 'fillRect', args: [289, 66, 22, GROUND_Y - 66], fill: '#7dffb0', alpha: 0.22 }]);
    // the beam goes behind the carrier sprite
    const beamAt = f.ops.findIndex((o) => o.op === 'fillRect' && o.fill === '#7dffb0');
    const spriteAt = f.ops.findIndex((o) => o.op === 'drawImage' && o.args[0] === SPRITES.get('carrier_0').canvas);
    expect(beamAt).toBeGreaterThan(-1);
    expect(spriteAt).toBeGreaterThan(beamAt);
  });

  describe('burrowed', () => {
    const mound = (f: Frame): readonly unknown[][] => fillRects(f, '#6e4c30');

    it('shows a dirt mound instead of the alien, with no health bar or minimap blip', () => {
      const g = waveGame();
      alien(g, 'worm', { burrowed: true, hp: 1, mode: 1 });
      const f = draw(g);
      expect(imageNames(f).filter((n) => n.startsWith('worm'))).toEqual([]);
      expect(mound(f)).toEqual([[293, GROUND_Y - 3, 14, 3]]);
      expect(fillRects(f, '#8a7a5a')).toEqual([[295, GROUND_Y - 4, 10, 1]]);
      expect(fillRects(f, '#ff5050')).toEqual([]);
      expect(fillRects(f, '#ff6b6b')).toEqual([]);
      expect(label(f, '!')).toBeUndefined(); // only a rumbling boss warns
    });

    it('shakes the Worm King mound and blinks a warning while it is about to erupt', () => {
      const g = waveGame();
      const king = alien(g, 'wormking', { burrowed: true, mode: 0 });
      g.time = 0.03; // sin(1.8) * 1.5 rounds to 1, blink on
      const travelling = draw(g);
      expect(mound(travelling)).toEqual([[287, GROUND_Y - 3, 26, 3]]);
      expect(label(travelling, '!')).toBeUndefined();

      king.mode = 1;
      const rumbling = draw(g);
      expect(mound(rumbling)).toEqual([[288, GROUND_Y - 3, 26, 3]]);
      expect(label(rumbling, '!')).toMatchObject({ x: 300, y: GROUND_Y - 26, color: '#ff4040', scale: 2, align: 'center' });

      g.time = 0.5; // sin(30) * 1.5 rounds to -1, blink off
      const blinkOff = draw(g);
      expect(mound(blinkOff)).toEqual([[286, GROUND_Y - 3, 26, 3]]);
      expect(label(blinkOff, '!')).toBeUndefined();
    });

    it('keeps the boss bar in the HUD but hides the boss from the minimap while underground', () => {
      const g = waveGame();
      alien(g, 'wormking', { burrowed: true });
      const f = draw(g);
      expect(label(f, 'WORM KING')).toBeDefined();
      expect(fillRects(f, '#ff2a2a')).toEqual([]);
    });
  });
});

describe('player', () => {
  const soldierImages = (f: Frame): string[] => imageNames(f).filter((n) => n.startsWith('soldier_'));

  it('is hidden while dead, with a respawn countdown and no minimap blip', () => {
    const g = waveGame();
    const blip = (f: Frame) => fillRects(f, '#7dff4f').filter((r) => r[2] === 1 && r[3] === 3);
    expect(blip(draw(g))).toHaveLength(1);
    g.player.alive = false;
    g.player.respawn = 2.2;
    const f = draw(g);
    expect(soldierImages(f)).toEqual([]);
    expect(label(f, 'RESPAWN IN 3')).toMatchObject({ scale: 2, align: 'center' });
    expect(blip(f)).toEqual([]);
  });

  it('blinks while invulnerable', () => {
    const g = waveGame();
    g.player.invuln = 1;
    expect(soldierImages(draw(g))).toEqual([]);
    g.time = 1 / 16;
    expect(soldierImages(draw(g))).toEqual(['soldier_idle']);
  });

  it.each([
    [{ onGround: false }, 'soldier_jump'],
    [{ vx: 50, anim: 0 }, 'soldier_run1'],
    [{ vx: -50, anim: 0.15 }, 'soldier_run2'],
    [{}, 'soldier_idle'],
    [{ facing: -1 as const }, 'soldier_idle_L'],
  ])('picks the body frame for %o', (overrides, sprite) => {
    const g = waveGame();
    Object.assign(g.player, overrides);
    expect(soldierImages(draw(g))).toEqual([sprite]);
  });

  it('holds its weapon at the shoulder, rotated to aim and flipped when aiming left', () => {
    const g = armed('pistol');
    const right = draw(g);
    expect(imageNames(right)).toContain('w_pistol');
    expect(calls(right, 'translate')).toContainEqual([BASE_X, ROOF_Y - 9]);
    expect(calls(right, 'rotate')).toEqual([[0]]);
    expect(calls(right, 'scale')).toEqual([]);
    g.player.aim = Math.PI;
    expect(calls(draw(g), 'scale')).toEqual([[1, -1]]);
  });

  it('sweeps the knife through its swing arc and leaves a slash trail', () => {
    const g = armed('knife');
    const slash = (f: Frame) => f.ops.filter((o) => o.op === 'fillRect' && o.fill === '#ffffff' && o.alpha === 0.7);
    const idle = draw(g);
    expect(calls(idle, 'rotate')).toEqual([[0]]);
    expect(slash(idle)).toEqual([]);

    g.player.swing = 0.15; // swing just started
    const start = draw(g);
    expect(calls(start, 'rotate')[0][0]).toBeCloseTo(-1.3);
    expect(slash(start)).toHaveLength(6);

    g.player.swing = 0.075; // halfway
    expect(calls(draw(g), 'rotate')[0][0]).toBeCloseTo(0);
  });

  it('does not slash with other weapons', () => {
    const g = armed('ar');
    g.player.swing = 0.1;
    const f = draw(g);
    expect(f.ops.filter((o) => o.alpha === 0.7)).toEqual([]);
    expect(calls(f, 'rotate')).toEqual([[0]]);
  });

  it('shows a muzzle flash at the barrel tip right after firing', () => {
    const g = armed('pistol');
    const m = muzzle(g.player);
    expect(fillRects(draw(g), '#ffb347')).toEqual([]);
    g.player.muzzle = 0.05;
    const f = draw(g);
    expect(fillRects(f, '#ffb347')).toEqual([[Math.round(m.x - 2), Math.round(m.y - 2), 5, 5]]);
    expect(fillRects(f, '#ffffff')).toContainEqual([Math.round(m.x - 1), Math.round(m.y - 1), 3, 3]);
  });

  it('drives a tank with a rotating cannon pivoting on the turret', () => {
    const g = armed('tank');
    g.player.aim = 0.5;
    const f = draw(g);
    expect(imageNames(f)).toContain('tank_0');
    expect(soldierImages(f)).toEqual([]);
    const top = ROOF_Y - 14;
    expect(calls(f, 'translate')).toContainEqual([BASE_X - 13 + 12, top + 2]);
    expect(calls(f, 'rotate')).toEqual([[0.5]]);
    expect(fillRects(f, '#4a5e2b')).toEqual([[0, -1, 15, 2]]);

    g.player.facing = -1;
    g.player.anim = 0.15;
    const left = draw(g);
    expect(imageNames(left)).toContain('tank_1_L');
    expect(calls(left, 'translate')).toContainEqual([BASE_X - 13 + 13, top + 2]);
  });
});

describe('projectiles, tracers, particles, texts, ufos', () => {
  it('draws every projectile kind in its own style', () => {
    const g = waveGame();
    g.projectiles = [
      proj('bullet', 'player', 300, 100, 400),
      proj('bullet', 'alien', 320, 100, -400),
      proj('water', 'player', 340, 100, 100),
      proj('bubble', 'player', 360, 100, 100),
      proj('shell', 'player', 380, 100, -100),
      proj('plasma', 'alien', 400, 100, 50),
    ];
    const f = draw(g);
    expect(fillRects(f, '#fff3a0')).toEqual([
      [300, 100, 1, 1],
      [299, 100, 1, 1],
      [298, 100, 1, 1],
      [297, 100, 1, 1],
    ]);
    expect(fillRects(f, '#ffd0a0')[3]).toEqual([323, 100, 1, 1]);
    expect(fillRects(f, '#2c8fd6')).toEqual([[339, 99, 2, 2]]);
    expect(f.images.filter((i) => i.name === 'bubble')).toEqual([{ name: 'bubble', args: [357, Math.round(97 + Math.sin(360) * 1.5)] }]);
    expect(fillRects(f, '#2b2b2b')).toEqual([[378, 98, 4, 4]]);
    expect(fillRects(f, '#ffb347')).toEqual([[379, 99, 2, 2]]); // exhaust trails behind a left-moving shell
    expect(fillRects(f, '#3fbf2a')).toEqual([[398, 98, 5, 5]]);
  });

  it('draws enemy acid, bombs, zaps and webs', () => {
    const g = waveGame();
    g.projectiles = [
      proj('acid', 'alien', 420, 100, 50, 50),
      proj('bomb', 'alien', 440, 100, 0, 100),
      proj('zap', 'alien', 460, 100, 330),
      proj('web', 'alien', 480, 100, -190),
    ];
    const f = draw(g);
    expect(fillRects(f, '#9be22d')).toEqual([[418, 98, 4, 4]]);
    expect(fillRects(f, '#f4ff9a')).toEqual([[419, 98, 2, 2]]);
    expect(fillRects(f, '#2b2b2b')).toEqual([[438, 97, 4, 6]]);
    expect(fillRects(f, '#ff2a2a')).toEqual([[439, 97, 2, 1]]); // fuse light on
    // zap: a 2px red streak with a 1px white core, trailing behind its direction of travel
    expect(fillRects(f, '#ff4040').filter((r) => r[1] === 99)).toEqual([454, 455, 456, 457, 458, 459].reverse().map((x) => [x, 99, 2, 2]));
    expect(fillRects(f, '#ffffff').filter((r) => r[1] === 100 && r[2] === 1)).toEqual([460, 459, 458, 457].map((x) => [x, 100, 1, 1]));
    expect(fillRects(f, '#ffffff').filter((r) => Number(r[0]) >= 478)).toEqual([
      [478, 100, 5, 1],
      [480, 98, 1, 5],
    ]);
    expect(fillRects(f, '#d8d8e8')).toEqual([[479, 99, 3, 3]]);

    g.time = 0.1; // fuse light off
    const blink = draw(g);
    expect(fillRects(blink, '#ff2a2a')).toEqual([]);
    expect(fillRects(blink, '#5a1010')).toEqual([[439, 97, 2, 1]]);
  });

  it('draws fading tracers, with a white core for wide laser beams', () => {
    const g = waveGame();
    g.tracers = [{ x1: 300, y1: 100, x2: 310, y2: 100, life: 0.05, max: 0.1, width: 2, color: '#ff3df0' }];
    const laser = draw(g);
    expect(fillOps(laser, '#ff3df0').every((o) => o.alpha === 0.5 && o.args[2] === 3)).toBe(true);
    expect(fillRects(laser, '#ffffff').filter((r) => r[2] === 1 && r[3] === 1)).toHaveLength(11);

    g.tracers = [{ x1: 300, y1: 100, x2: 310, y2: 100, life: 0.2, max: 0.1, width: 1, color: '#eeeeee' }];
    const sniper = draw(g);
    expect(fillOps(sniper, '#eeeeee').every((o) => o.alpha === 1 && o.args[2] === 2)).toBe(true);
    expect(fillRects(sniper, '#ffffff').filter((r) => r[2] === 1 && r[3] === 1)).toEqual([]);
  });

  it('draws fading particles', () => {
    const g = waveGame();
    g.particles = [{ x: 300.4, y: 99.6, vx: 0, vy: 0, life: 0.25, max: 0.5, size: 2, gravity: 0, color: '#123456' }];
    expect(fillOps(draw(g), '#123456')).toEqual([{ op: 'fillRect', args: [300, 100, 2, 2], fill: '#123456', alpha: 0.5 }]);
  });

  it('draws floating texts fading out over their last 0.3s', () => {
    const g = waveGame();
    g.texts = [{ x: 500, y: 150, life: 0.15, text: '+$5', color: '#abcdef' }];
    const f = draw(g);
    expect(label(f, '+$5')).toMatchObject({ x: 500, y: 150, color: '#abcdef', align: 'center' });
    expect(f.ops.find((o) => o.op === 'fill' && o.fill === '#abcdef')).toMatchObject({ alpha: 0.5 });
  });

  it('draws UFOs bobbing with blinking lights and a beam while dropping', () => {
    const g = waveGame();
    g.ufos = [
      { x: 500, y: UFO_Y, state: 'beam', timer: 0, targetX: 500, cargo: 'grunt', anim: 0 },
      { x: 700, y: UFO_Y, state: 'move', timer: 0, targetX: 800, cargo: null, anim: 0.25 },
    ];
    const f = draw(g);
    expect(f.images.filter((i) => i.name.startsWith('ufo_'))).toEqual([
      { name: 'ufo_0', args: [488, UFO_Y - 5] },
      { name: 'ufo_1', args: [688, Math.round(UFO_Y - 5 + Math.sin(0.75) * 2)] },
    ]);
    expect(fillOps(f, '#7dffb0')).toEqual([{ op: 'fillRect', args: [493, UFO_Y + 6, 14, GROUND_Y - UFO_Y - 6], fill: '#7dffb0', alpha: 0.22 }]);
  });
});

describe('HUD', () => {
  it('shows base and player health, money, wave and aliens remaining', () => {
    const g = waveGame();
    g.money = 123;
    g.spawnQueue = ['grunt', 'grunt'];
    g.player.hp = 49.2;
    const f = draw(g);
    expect(imageNames(f)).toEqual(expect.arrayContaining(['icon_castle', 'icon_heart', 'coin_0', 'icon_skull']));
    expect(texts(f)).toEqual(expect.arrayContaining(['300', '50', '$123', 'WAVE 1/10', '2']));
    expect(fillRects(f, '#e43b44')).toContainEqual([15, 16, 39, 5]);
  });

  it.each([
    [0.4, '#ffd23f', 32],
    [0.2, '#ff5050', 16],
  ])('turns the base bar from green to yellow to red (ratio %f)', (ratio, color, width) => {
    const g = waveGame();
    g.base.hp = baseMaxHp(1) * ratio;
    const f = draw(g);
    expect(fillRects(f, color)).toContainEqual([15, 5, width, 5]);
    expect(fillRects(f, '#7dff4f')).not.toContainEqual([15, 5, width, 5]);
  });

  it('shows the weapon, its name and progress toward the next one', () => {
    const g = armed('knife');
    g.player.kills = 13;
    const f = draw(g);
    expect(f.images.find((i) => i.name === 'w_knife' && i.args.length === 4)?.args).toEqual([9, 252, 18, 6]); // small sprites drawn at 2x
    expect(texts(f)).toEqual(expect.arrayContaining(['COMBAT KNIFE', '3/10']));
    expect(fillRects(f, '#ff9ce8')).toEqual([[38, VIEW_H - 12, 21, 4]]);

    const sniper = draw(armed('sniper'));
    expect(sniper.images.find((i) => i.name === 'w_sniper' && i.args.length === 4)?.args).toEqual([8, 253, 20, 5]);
  });

  it('shows the tank icon, and ALL WEAPONS! instead of progress once every weapon is unlocked', () => {
    const g = armed('tank');
    g.player.kills = 75;
    g.player.unlocked = WEAPON_ORDER.length - 2;
    const almost = draw(g);
    expect(almost.images.find((i) => i.name === 'tank_0' && i.args.length === 4)?.args).toEqual([5, 248, 26, 14]);
    expect(texts(almost)).toContain('5/10');
    expect(texts(almost)).not.toContain('ALL WEAPONS!');

    g.player.unlocked = WEAPON_ORDER.length - 1;
    const f = draw(g);
    expect(label(f, 'ALL WEAPONS!')).toMatchObject({ x: 38, y: VIEW_H - 13, color: '#ff9ce8' });
    expect(texts(f).filter((t) => t.endsWith('/10'))).toEqual(['WAVE 1/10']);
    expect(fillRects(f, '#ff9ce8')).toEqual([]);
  });

  it('shows a numbered slot per weapon, framing the current one and greying out locked ones', () => {
    const g = armed('pistol');
    g.player.unlocked = 2;
    const f = draw(g);
    const y = VIEW_H - 41;
    const fillAt = (args: number[]): unknown => f.ops.find((o) => o.op === 'fillRect' && args.every((v, i) => o.args[i] === v))?.fill;
    const slots = WEAPON_ORDER.map((_, i) => 4 + i * 13);
    expect(slots.map((x) => fillAt([x, y, 12, 11]))).toEqual(['#0b0812', '#ffe14d', '#0b0812', '#0b0812', '#0b0812', '#0b0812', '#0b0812', '#0b0812']);
    expect(slots.map((x) => fillAt([x + 1, y + 1, 10, 9]))).toEqual(['#2a2140', '#2a2140', '#2a2140', '#14101c', '#14101c', '#14101c', '#14101c', '#14101c']);
    const digits = vi
      .mocked(drawText)
      .mock.calls.filter((c) => c[3] === y + 2)
      .map(([, text, x, , color, scale, align]) => [text, x, color, scale, align]);
    expect(digits).toEqual(
      slots.map((x, i) => [`${i + 1}`, x + 6, i <= 2 ? '#e9f1ff' : '#4a4552', 1, 'center']),
    );
  });

  it('flashes a red vignette when the player is hurt', () => {
    const g = waveGame();
    expect(fillRects(draw(g), '#ff2020')).toEqual([]);
    g.player.hurt = 0.6;
    const edges = fillOps(draw(g), '#ff2020');
    expect(edges.map((o) => o.args)).toEqual([
      [0, 0, VIEW_W, 3],
      [0, VIEW_H - 3, VIEW_W, 3],
      [0, 0, 3, VIEW_H],
      [VIEW_W - 3, 0, 3, VIEW_H],
    ]);
    expect(edges.every((o) => o.alpha === 0.6)).toBe(true);
  });

  it('shows banners large, shrinking long titles, fading out at the end', () => {
    const g = waveGame();
    g.banner = { text: 'WAVE 1', sub: 'GET READY', color: '#a1b2c3', life: 0.2 };
    const short = draw(g);
    expect(label(short, 'WAVE 1')).toMatchObject({ scale: 3, color: '#a1b2c3', align: 'center' });
    expect(label(short, 'GET READY')).toMatchObject({ scale: 1 });
    expect(short.ops.find((o) => o.op === 'fill' && o.fill === '#a1b2c3')).toMatchObject({ alpha: 0.5 });

    g.banner = { text: 'WAVE 1 CLEARED!', sub: 'BONUS +$25', color: '#ffd23f', life: 2 };
    expect(label(draw(g), 'WAVE 1 CLEARED!')).toMatchObject({ scale: 2 });
  });
});

describe('overlays', () => {
  it('dims the screen and shows PAUSED only while paused', () => {
    const g = waveGame();
    expect(texts(draw(g))).not.toContain('PAUSED');
    g.paused = true;
    const f = draw(g);
    expect(texts(f)).toEqual(expect.arrayContaining(['PAUSED', 'PRESS P TO RESUME']));
    expect(fillOps(f, '#0b0812').find((o) => o.args[2] === VIEW_W && o.args[3] === VIEW_H)).toMatchObject({ args: [0, 0, VIEW_W, VIEW_H], alpha: 0.5 });
  });

  it('draws the HUD but no overlay during the clear phase', () => {
    const g = waveGame();
    g.phase = 'clear';
    const f = draw(g);
    expect(imageNames(f)).toContain('icon_castle');
    expect(fillRects(f, '#0b0812').filter((r) => r[2] === VIEW_W && r[3] === VIEW_H)).toEqual([]);
  });

  it.each([
    ['gameover', 'BASE DESTROYED', 'THE GRAYS HAVE TAKEN THE PLANET.', 'CLICK OR PRESS ENTER TO TRY AGAIN', '#2a0508'],
    ['victory', 'VICTORY!', 'EARTH IS SAFE... FOR NOW.', 'CLICK OR PRESS ENTER TO PLAY AGAIN', '#0b0812'],
  ] as const)('%s screen shows stats and a blinking restart prompt after a delay', (phase, title, line, prompt, dimColor) => {
    const g = waveGame();
    g.phase = phase;
    g.wave = 7;
    g.stats = { kills: 42, earned: 999 };
    g.player.weapon = 'laser';
    g.phaseTimer = 1;
    const waiting = draw(g);
    expect(texts(waiting)).toEqual(expect.arrayContaining([title, line, 'WAVE REACHED: 7/10', 'ALIENS KILLED: 42', 'MONEY EARNED: $999', 'FINAL WEAPON: LASER GUN']));
    expect(texts(waiting)).not.toContain(prompt);
    expect(fillOps(waiting, dimColor).some((o) => o.args[2] === VIEW_W && o.args[3] === VIEW_H)).toBe(true);

    g.phaseTimer = 0;
    expect(texts(draw(g))).toContain(prompt);
    g.time = 0.4;
    expect(texts(draw(g))).not.toContain(prompt);
  });

  describe('shop', () => {
    const shop = (wave = 1): Game => {
      const g = waveGame();
      g.phase = 'shop';
      g.wave = wave;
      return g;
    };

    it('lists numbered items, the money, the next wave and a start button', () => {
      const f = draw(shop());
      expect(texts(f)).toEqual(
        expect.arrayContaining(['ARMORY', 'WAVE 1 CLEARED - SPEND YOUR LOOT', '[1]', '[7]', 'REPAIR BASE', 'COIN MAGNET', 'NEXT: WAVE 2 - BOSS: BROOD MOTHER', 'START WAVE 2 [ENTER]']),
      );
      expect(f.labels.find((l) => l.text === '$60' && l.scale === 2)).toMatchObject({ x: SHOP_PANEL.x + SHOP_PANEL.w - 10, align: 'right' });
      expect(fillRects(f, '#7dff4f')).toContainEqual([START_BUTTON.x, START_BUTTON.y, START_BUTTON.w, START_BUTTON.h]);
      expect(calls(f, 'strokeRect')).toEqual([[SHOP_PANEL.x + 0.5, SHOP_PANEL.y + 0.5, SHOP_PANEL.w - 1, SHOP_PANEL.h - 1]]);
    });

    it('colors prices by availability and affordability', () => {
      const f = draw(shop()); // $60, full base, no turrets
      expect(label(f, 'REPAIR BASE')?.color).toBe('#6b6575');
      expect(label(f, 'FULL')?.color).toBe('#6b6575');
      expect(label(f, 'NO TURRET')?.color).toBe('#6b6575');
      expect(label(f, 'FORTIFY BASE')?.color).toBe('#ffffff');
      expect(label(f, '$150')?.color).toBe('#ff5050');
      expect(label(f, '$50')?.color).toBe('#ffd23f');
    });

    it('highlights the hovered row and start button', () => {
      const rowBg = (f: Frame) => [0, 1, 2, 3].map((i) => f.ops.find((o) => o.op === 'fillRect' && o.args[1] === shopRow(i).y && o.args[2] === shopRow(i).w)?.fill);
      const btn = START_BUTTON;
      const inner = [btn.x + 1, btn.y + 1, btn.w - 2, btn.h - 2];

      const row = draw(shop(), { mouseX: shopRow(2).x + 10, mouseY: shopRow(2).y + 2 });
      expect(rowBg(row)).toEqual(['#1a1428', '#160f22', '#2a2140', '#160f22']);
      expect(fillRects(row, '#2f6b2a')).toEqual([inner]);

      const start = draw(shop(), { mouseX: btn.x + 5, mouseY: btn.y + 5 });
      expect(rowBg(start)).toEqual(['#1a1428', '#160f22', '#1a1428', '#160f22']);
      expect(fillRects(start, '#3f8f38')).toEqual([inner]);
    });

    it('names the next boss, flagging elite bosses and the final wave', () => {
      expect(texts(draw(shop(5)))).toContain('NEXT: WAVE 6 - BOSS: ELITE SKY CARRIER');
      expect(texts(draw(shop(9)))).toContain('NEXT: WAVE 10 (FINAL) - BOSS: OVERLORD');
      const next = label(draw(shop(1)), 'NEXT: WAVE 2 - BOSS: BROOD MOTHER');
      expect(next).toMatchObject({ x: VIEW_W / 2, y: shopRow(7).y + 3, color: '#ff9ce8', align: 'center' });
    });

    it('previews the next horde as a centered row of enemy icons with their counts', () => {
      const listBottom = shopRow(7).y;
      const f = draw(shop(1)); // wave 2: 12 grunts, 6 runners, 4 hoppers, 1 bug swarm
      const icons = f.images.filter((i) => i.args[1] !== undefined && Number(i.args[1]) >= listBottom && Number(i.args[1]) < listBottom + 28);
      expect(icons.map((i) => i.name)).toEqual(['grunt_0', 'runner_0', 'hopper_0', 'bug_0']);
      const centers = [201, 227, 253, 279]; // 26px slots centered on the screen
      // icons sit on a common baseline, centered in their slot
      expect(icons[0].args).toEqual([centers[0] - 6, listBottom + 28 - 16]);
      expect(icons[2].args).toEqual([centers[2] - 6, listBottom + 28 - 10]);
      expect(icons[3].args).toEqual([Math.round(centers[3] - 3.5), listBottom + 28 - 5]);
      const counts = f.labels.filter((l) => l.y === listBottom + 30);
      expect(counts.map((l) => [l.text, l.x, l.color, l.align])).toEqual([
        ['12', centers[0], '#c4c6cf', 'center'],
        ['6', centers[1], '#c4c6cf', 'center'],
        ['4', centers[2], '#c4c6cf', 'center'],
        ['1', centers[3], '#c4c6cf', 'center'],
      ]);

      const final = draw(shop(9));
      const finalCounts = final.labels.filter((l) => l.y === listBottom + 30);
      expect(finalCounts.map((l) => l.text)).toEqual(waveSummary(10).map((e) => `${e.count}`));
      // the widest roster still fits inside the panel
      expect(Math.min(...finalCounts.map((l) => l.x)) - 13).toBeGreaterThanOrEqual(SHOP_PANEL.x);
      expect(Math.max(...finalCounts.map((l) => l.x)) + 13).toBeLessThanOrEqual(SHOP_PANEL.x + SHOP_PANEL.w);
    });
  });
});

describe('waveSummary', () => {
  it('lists the wave horde in enemy order, skipping absent types', () => {
    expect(waveSummary(1)).toEqual([{ type: 'grunt', count: 14 }]);
    expect(waveSummary(2)).toEqual([
      { type: 'grunt', count: 12 },
      { type: 'runner', count: 6 },
      { type: 'hopper', count: 4 },
      { type: 'bug', count: 1 },
    ]);
    // wave 5 lists bug before splitter in its config, but the summary follows ENEMY_ORDER
    expect(waveSummary(5).map((e) => e.type)).toEqual(['grunt', 'runner', 'squid', 'drone', 'worm', 'bug', 'splitter', 'crab', 'brute']);
  });

  it('accounts for every enemy of every wave and never includes bosses', () => {
    WAVES.forEach((def, i) => {
      const summary = waveSummary(i + 1);
      expect(Object.fromEntries(summary.map((e) => [e.type, e.count]))).toEqual(def.horde);
      expect(summary.every((e) => e.count > 0 && !ALIENS[e.type].boss)).toBe(true);
    });
  });
});
