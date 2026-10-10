// 5x7 bitmap font. Each glyph is 7 rows of 5 columns; '#' marks a lit pixel.
const RAW: Record<string, string> = {
  A: '.###. #...# #...# ##### #...# #...# #...#',
  B: '####. #...# #...# ####. #...# #...# ####.',
  C: '.###. #...# #.... #.... #.... #...# .###.',
  D: '####. #...# #...# #...# #...# #...# ####.',
  E: '##### #.... #.... ####. #.... #.... #####',
  F: '##### #.... #.... ####. #.... #.... #....',
  G: '.###. #...# #.... #.### #...# #...# .####',
  H: '#...# #...# #...# ##### #...# #...# #...#',
  I: '.###. ..#.. ..#.. ..#.. ..#.. ..#.. .###.',
  J: '..### ...#. ...#. ...#. ...#. #..#. .##..',
  K: '#...# #..#. #.#.. ##... #.#.. #..#. #...#',
  L: '#.... #.... #.... #.... #.... #.... #####',
  M: '#...# ##.## #.#.# #.#.# #...# #...# #...#',
  N: '#...# #...# ##..# #.#.# #..## #...# #...#',
  O: '.###. #...# #...# #...# #...# #...# .###.',
  P: '####. #...# #...# ####. #.... #.... #....',
  Q: '.###. #...# #...# #...# #.#.# #..#. .##.#',
  R: '####. #...# #...# ####. #.#.. #..#. #...#',
  S: '.#### #.... #.... .###. ....# ....# ####.',
  T: '##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..',
  U: '#...# #...# #...# #...# #...# #...# .###.',
  V: '#...# #...# #...# #...# #...# .#.#. ..#..',
  W: '#...# #...# #...# #.#.# #.#.# #.#.# .#.#.',
  X: '#...# #...# .#.#. ..#.. .#.#. #...# #...#',
  Y: '#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..',
  Z: '##### ....# ...#. ..#.. .#... #.... #####',
  '0': '.###. #...# #..## #.#.# ##..# #...# .###.',
  '1': '..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.',
  '2': '.###. #...# ....# ...#. ..#.. .#... #####',
  '3': '##### ...#. ..#.. ...#. ....# #...# .###.',
  '4': '...#. ..##. .#.#. #..#. ##### ...#. ...#.',
  '5': '##### #.... ####. ....# ....# #...# .###.',
  '6': '..##. .#... #.... ####. #...# #...# .###.',
  '7': '##### ....# ...#. ..#.. .#... .#... .#...',
  '8': '.###. #...# #...# .###. #...# #...# .###.',
  '9': '.###. #...# #...# .#### ....# ...#. .##..',
  ' ': '..... ..... ..... ..... ..... ..... .....',
  '.': '..... ..... ..... ..... ..... .##.. .##..',
  ',': '..... ..... ..... ..... .##.. ..#.. .#...',
  '!': '..#.. ..#.. ..#.. ..#.. ..#.. ..... ..#..',
  '?': '.###. #...# ....# ...#. ..#.. ..... ..#..',
  ':': '..... .##.. .##.. ..... .##.. .##.. .....',
  '-': '..... ..... ..... ##### ..... ..... .....',
  '+': '..... ..#.. ..#.. ##### ..#.. ..#.. .....',
  '=': '..... ..... ##### ..... ##### ..... .....',
  '/': '..... ....# ...#. ..#.. .#... #.... .....',
  '$': '..#.. .#### #.#.. .###. ..#.# ####. ..#..',
  '%': '##... ##..# ...#. ..#.. .#... #..## ...##',
  "'": '..#.. ..#.. .#... ..... ..... ..... .....',
  '(': '...#. ..#.. .#... .#... .#... ..#.. ...#.',
  ')': '.#... ..#.. ...#. ...#. ...#. ..#.. .#...',
  '[': '.###. .#... .#... .#... .#... .#... .###.',
  ']': '.###. ...#. ...#. ...#. ...#. ...#. .###.',
  '<': '...#. ..#.. .#... #.... .#... ..#.. ...#.',
  '>': '.#... ..#.. ...#. ....# ...#. ..#.. .#...',
  '*': '..... #.#.# .###. ##### .###. #.#.# .....',
};

export const CHAR_W = 6;
export const CHAR_H = 7;

const GLYPHS = new Map<string, [number, number][]>(
  Object.entries(RAW).map(([ch, art]) => {
    const pixels: [number, number][] = [];
    art.split(' ').forEach((row, y) => [...row].forEach((c, x) => c === '#' && pixels.push([x, y])));
    return [ch, pixels];
  }),
);

export type Align = 'left' | 'center' | 'right';

export function textWidth(text: string, scale = 1): number {
  return text.length === 0 ? 0 : (text.length * CHAR_W - 1) * scale;
}

export function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, scale = 1, align: Align = 'left'): void {
  const w = textWidth(text, scale);
  let cx = Math.round(align === 'center' ? x - w / 2 : align === 'right' ? x - w : x);
  const cy = Math.round(y);
  ctx.fillStyle = color;
  ctx.beginPath();
  for (const ch of text.toUpperCase()) {
    const glyph = GLYPHS.get(ch);
    if (!glyph) throw new Error(`No glyph for character "${ch}"`);
    for (const [gx, gy] of glyph) ctx.rect(cx + gx * scale, cy + gy * scale, scale, scale);
    cx += CHAR_W * scale;
  }
  ctx.fill();
}

/** Text with a 1-pixel (scaled) drop shadow so it reads on any background. */
export function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, scale = 1, align: Align = 'left'): void {
  drawText(ctx, text, x + scale, y + scale, '#0b0812', scale, align);
  drawText(ctx, text, x, y, color, scale, align);
}

export function wrapText(text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && textWidth(next) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}
