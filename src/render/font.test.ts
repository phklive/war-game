import { describe, expect, it } from 'vitest';
import { CHAR_H, CHAR_W, drawLabel, drawText, textWidth, wrapText } from './font';

interface Op {
  op: string;
  args: readonly unknown[];
  fill: unknown;
}

/** A 2D context stand-in that records every call with its arguments and the fillStyle in effect. */
function recorder(): { ctx: CanvasRenderingContext2D; ops: Op[] } {
  const state: Record<string | symbol, unknown> = {};
  const ops: Op[] = [];
  const ctx = new Proxy(state, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return (...args: unknown[]) => {
        ops.push({ op: String(prop), args, fill: target.fillStyle });
      };
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, ops };
}

const rects = (ops: Op[]): readonly unknown[][] => ops.filter((o) => o.op === 'rect').map((o) => [...o.args]);

describe('textWidth', () => {
  it('is zero for empty text and drops the trailing gap otherwise', () => {
    expect(textWidth('')).toBe(0);
    expect(textWidth('A')).toBe(CHAR_W - 1);
    expect(textWidth('AB')).toBe(2 * CHAR_W - 1);
    expect(textWidth('AB', 3)).toBe((2 * CHAR_W - 1) * 3);
  });
});

describe('drawText', () => {
  it('draws each lit glyph pixel as one rect in a single filled path', () => {
    const { ctx, ops } = recorder();
    drawText(ctx, '-', 10, 20, '#abcdef');
    expect(ops[0].op).toBe('beginPath');
    expect(ops[ops.length - 1]).toEqual({ op: 'fill', args: [], fill: '#abcdef' });
    // '-' is a single row of five pixels on row 3
    expect(rects(ops)).toEqual([
      [10, 23, 1, 1],
      [11, 23, 1, 1],
      [12, 23, 1, 1],
      [13, 23, 1, 1],
      [14, 23, 1, 1],
    ]);
  });

  it('scales pixels and advances by CHAR_W per character', () => {
    const { ctx, ops } = recorder();
    drawText(ctx, '--', 0, 0, '#fff', 2);
    const r = rects(ops);
    expect(r).toHaveLength(10);
    expect(r[0]).toEqual([0, 6, 2, 2]);
    expect(r[5]).toEqual([CHAR_W * 2, 6, 2, 2]);
  });

  it('aligns center and right around x, rounding to whole pixels', () => {
    const center = recorder();
    drawText(center.ctx, '-', 10, 0.4, '#fff', 1, 'center');
    expect(rects(center.ops)[0]).toEqual([8, 3, 1, 1]); // 10 - 5/2 = 7.5 -> 8
    const right = recorder();
    drawText(right.ctx, '-', 10, 0, '#fff', 1, 'right');
    expect(rects(right.ops)[0]).toEqual([5, 3, 1, 1]);
    const left = recorder();
    drawText(left.ctx, '-', 10, 0, '#fff', 1, 'left');
    expect(rects(left.ops)[0]).toEqual([10, 3, 1, 1]);
  });

  it('upper-cases text so lowercase input uses the capital glyphs', () => {
    const lower = recorder();
    const upper = recorder();
    drawText(lower.ctx, 'abc', 0, 0, '#fff');
    drawText(upper.ctx, 'ABC', 0, 0, '#fff');
    expect(rects(lower.ops)).toEqual(rects(upper.ops));
  });

  it('has a glyph for every character the game prints and keeps them inside the cell', () => {
    const { ctx, ops } = recorder();
    const all = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,!?:-+=/$%'()[]<>*";
    drawText(ctx, all, 0, 0, '#fff');
    for (const [x, y] of rects(ops) as [number, number][]) {
      expect(x % CHAR_W).toBeLessThan(CHAR_W - 1);
      expect(y).toBeLessThan(CHAR_H);
    }
    // the space glyph is blank
    const space = recorder();
    drawText(space.ctx, ' ', 0, 0, '#fff');
    expect(rects(space.ops)).toEqual([]);
  });

  it('throws on characters without a glyph', () => {
    const { ctx } = recorder();
    expect(() => drawText(ctx, 'A@B', 0, 0, '#fff')).toThrow('No glyph for character "@"');
  });
});

describe('drawLabel', () => {
  it('draws a dark drop shadow offset by the scale, then the text', () => {
    const { ctx, ops } = recorder();
    drawLabel(ctx, '-', 10, 20, '#ff0000');
    const fills = ops.filter((o) => o.op === 'fill').map((o) => o.fill);
    expect(fills).toEqual(['#0b0812', '#ff0000']);
    const r = rects(ops);
    expect(r[0]).toEqual([11, 24, 1, 1]);
    expect(r[5]).toEqual([10, 23, 1, 1]);
  });

  it('passes scale and alignment through to both passes', () => {
    const { ctx, ops } = recorder();
    drawLabel(ctx, '-', 20, 0, '#fff', 2, 'right');
    const r = rects(ops);
    // width of '-' at scale 2 is 10; right-aligned at 20 -> 10, shadow at 22 - 10 = 12
    expect(r[0]).toEqual([12, 8, 2, 2]);
    expect(r[5]).toEqual([10, 6, 2, 2]);
  });
});

describe('wrapText', () => {
  it('returns no lines for empty text', () => {
    expect(wrapText('', 100)).toEqual([]);
  });

  it('keeps text that fits on one line', () => {
    expect(wrapText('HELLO WORLD', 1000)).toEqual(['HELLO WORLD']);
  });

  it('breaks between words when a line would overflow', () => {
    expect(wrapText('HELLO WORLD FOO', 40)).toEqual(['HELLO', 'WORLD', 'FOO']);
    expect(wrapText('AB CD EF', textWidth('AB CD'))).toEqual(['AB CD', 'EF']);
  });

  it('never splits a single word even if it is too wide', () => {
    expect(wrapText('ABCDEFGHIJ', 10)).toEqual(['ABCDEFGHIJ']);
  });
});
