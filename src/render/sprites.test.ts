import { describe, expect, it } from 'vitest';
import { ALIENS, ALIEN_ORDER, VIEW_H, VIEW_W } from '../game/config';
import { makeFakeCanvas } from '../test/fakeCanvas';
import { alienFrameCount, bubbleArt, buildSprite, buildSprites, tint, type MakeCanvas } from './sprites';

type Pixel = [number, number, string];

/** Canvas factory whose contexts remember every pixel painted, keyed by canvas. */
function recordingSprites(): { get: (name: string) => Pixel[]; size: (name: string) => [number, number] } {
  const painted = new Map<HTMLCanvasElement, Pixel[]>();
  const make: MakeCanvas = (w, h) => {
    const drawn: Pixel[] = [];
    const ctx: { fillStyle: string; fillRect(x: number, y: number): void } = {
      fillStyle: '',
      fillRect: (x, y) => {
        drawn.push([x, y, ctx.fillStyle]);
      },
    };
    const canvas = { width: w, height: h, getContext: () => ctx } as unknown as HTMLCanvasElement;
    painted.set(canvas, drawn);
    return canvas;
  };
  const sprites = buildSprites(make);
  return {
    get: (name) => painted.get(sprites.get(name).canvas) ?? [],
    size: (name) => [sprites.get(name).w, sprites.get(name).h],
  };
}

const SPRITES = buildSprites(makeFakeCanvas);
const RECORDED = recordingSprites();
const key = ([x, y, c]: Pixel): string => `${x},${y},${c}`;
const positions = (px: Pixel[]): string[] => px.map(([x, y]) => `${x},${y}`).sort();

describe('sprites', () => {
  it('builds every sprite without art or palette errors', () => {
    for (const name of [
      'soldier_idle',
      'soldier_run1_L',
      'ally_jump',
      'grunt_0',
      'overlord_flash',
      'carrier_e1_L',
      'w_ar',
      'tank_1_L',
      'coin_2',
      'ufo_1',
      'turret',
      'bubble',
      'trap',
      'icon_heart',
      'bg_sky',
      'bg_far',
      'bg_near',
      'bg_ground',
    ]) {
      expect(SPRITES.get(name).w).toBeGreaterThan(0);
    }
  });

  it('throws on unknown sprite names', () => {
    expect(() => buildSprites(makeFakeCanvas).get('nope')).toThrow('Unknown sprite "nope"');
    expect(() => SPRITES.get('boss_0')).toThrow('Unknown sprite "boss_0"');
  });

  it('uses the hand pixel as grip point, mirrored when flipped', () => {
    const art = ['..s.', '....'];
    const pal = { s: '#fff' };
    expect(buildSprite(makeFakeCanvas, art, pal)).toMatchObject({ px: 2, py: 0 });
    expect(buildSprite(makeFakeCanvas, art, pal, true)).toMatchObject({ px: 1, py: 0 });
    expect(buildSprite(makeFakeCanvas, ['k.', '..'], { k: '#000' })).toMatchObject({ px: 1, py: 1 });
  });

  it('rejects ragged rows and unknown palette keys', () => {
    expect(() => buildSprite(makeFakeCanvas, ['kk', 'k'], { k: '#000' })).toThrow('Sprite row 1 is 1 wide');
    expect(() => buildSprite(makeFakeCanvas, ['kz'], { k: '#000' })).toThrow('No palette color for "z"');
  });

  it('fails loudly when a canvas has no 2D context', () => {
    const broken = () => ({ getContext: () => null }) as unknown as HTMLCanvasElement;
    expect(() => buildSprite(broken, ['k'], { k: '#000' })).toThrow('2D context unavailable for sprite canvas');
    const brokenSky = (w: number, h: number) => (w === VIEW_W && h === VIEW_H ? broken() : makeFakeCanvas(w, h));
    expect(() => buildSprites(brokenSky)).toThrow('2D context unavailable for layer canvas');
  });

  it('draws bubbles as an outlined ellipse with a highlight', () => {
    const art = bubbleArt(18, 20);
    expect(art).toHaveLength(20);
    expect(art.join('')).toContain('w');
    expect(art[0][0]).toBe('.');
    expect(art[10]).toMatch(/^c/);
  });

  it('mirrors flipped sprites pixel for pixel', () => {
    for (const name of ['soldier_run1', 'ally_idle', 'grunt_0', 'hopper_1', 'carrier_e0', 'wormking_flash', 'tank_0']) {
      const [w] = RECORDED.size(name);
      const mirrored = RECORDED.get(name).map(([x, y, c]): Pixel => [w - 1 - x, y, c]);
      expect(RECORDED.get(`${name}_L`).map(key).sort()).toEqual(mirrored.map(key).sort());
    }
  });
});

describe('alien sprites', () => {
  it('knows how many animation frames each type has', () => {
    expect(alienFrameCount('grunt')).toBe(2);
    expect(alienFrameCount('wormking')).toBe(2);
    expect(alienFrameCount('splitter')).toBe(1);
    expect(alienFrameCount('mini')).toBe(1);
  });

  it.each(ALIEN_ORDER)('builds every %s frame facing both ways plus a flash silhouette', (type) => {
    const frames = alienFrameCount(type);
    expect(frames).toBeGreaterThan(0);
    const size = RECORDED.size(`${type}_0`);
    for (let i = 0; i < frames; i++) {
      // all frames share one size so animation does not jitter
      expect(RECORDED.size(`${type}_${i}`)).toEqual(size);
      expect(RECORDED.size(`${type}_${i}_L`)).toEqual(size);
    }
    expect(() => SPRITES.get(`${type}_${frames}`)).toThrow('Unknown sprite');
    expect(RECORDED.size(`${type}_flash`)).toEqual(size);
    expect(RECORDED.size(`${type}_flash_L`)).toEqual(size);
  });

  it.each(ALIEN_ORDER)('builds elite variants only for bosses (%s)', (type) => {
    const frames = alienFrameCount(type);
    for (let i = 0; i < frames; i++) {
      for (const name of [`${type}_e${i}`, `${type}_e${i}_L`]) {
        if (ALIENS[type].boss) expect(RECORDED.size(name)).toEqual(RECORDED.size(`${type}_0`));
        else expect(() => SPRITES.get(name)).toThrow('Unknown sprite');
      }
    }
  });

  it('paints the flash variant as a pure white silhouette of the first frame', () => {
    for (const type of ['worm', 'brute', 'kraken'] as const) {
      const flash = RECORDED.get(`${type}_flash`);
      expect(positions(flash)).toEqual(positions(RECORDED.get(`${type}_0`)));
      expect(new Set(flash.map(([, , c]) => c))).toEqual(new Set(['#ffffff']));
    }
  });

  it('tints elite boss sprites 35% toward red', () => {
    const base = RECORDED.get('ironcrab_1');
    const elite = RECORDED.get('ironcrab_e1');
    expect(positions(elite)).toEqual(positions(base));
    const expected = base.map(([x, y, c]): Pixel => [x, y, tint({ c }, '#ff2020', 0.35).c]);
    expect(elite.map(key).sort()).toEqual(expected.map(key).sort());
    expect(elite.map(key).sort()).not.toEqual(base.map(key).sort());
  });
});

describe('tint', () => {
  it('blends every palette color toward the target by the given amount', () => {
    expect(tint({ a: '#000000', b: '#ff0000', c: '#FFFFFF' }, '#ffffff', 0.5)).toEqual({ a: '#808080', b: '#ff8080', c: '#ffffff' });
    expect(tint({ a: '#0a0b0c' }, '#000000', 0.5)).toEqual({ a: '#050606' }); // zero-padded channels
  });

  it('returns the palette unchanged at 0 and the target color at 1', () => {
    expect(tint({ a: '#12AB9f' }, '#ff2020', 0)).toEqual({ a: '#12ab9f' });
    expect(tint({ a: '#12ab9f', b: '#000000' }, '#ff2020', 1)).toEqual({ a: '#ff2020', b: '#ff2020' });
  });

  it('rejects colors that are not #rrggbb', () => {
    expect(() => tint({ a: '#000000' }, 'red', 0.5)).toThrow('tint() needs #rrggbb colors, got "red"');
    expect(() => tint({ a: '#fff' }, '#ffffff', 0.5)).toThrow('tint() needs #rrggbb colors, got "#fff"');
    expect(() => tint({ i: 'rgba(160,230,255,0.25)' }, '#ffffff', 0.5)).toThrow('got "rgba(160,230,255,0.25)"');
  });
});
