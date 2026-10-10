// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { VIEW_H, VIEW_W } from './game/config';
import { Input } from './input';

let win: EventTarget;
let canvas: HTMLCanvasElement;
let input: Input;

const key = (type: 'keydown' | 'keyup', code: string, init: KeyboardEventInit = {}): KeyboardEvent => {
  const e = new KeyboardEvent(type, { code, cancelable: true, ...init });
  win.dispatchEvent(e);
  return e;
};
const pointer = (target: EventTarget, type: string, clientX: number, clientY: number, button = 0): void => {
  target.dispatchEvent(new PointerEvent(type, { clientX, clientY, button }));
};

beforeEach(() => {
  win = new EventTarget();
  canvas = document.createElement('canvas');
  // Canvas displayed at 2x, offset by (100, 50) in the page.
  canvas.getBoundingClientRect = () => new DOMRect(100, 50, VIEW_W * 2, VIEW_H * 2);
  input = new Input(canvas, win as unknown as Window);
});

describe('Input', () => {
  it('starts idle with the cursor centered', () => {
    expect(input.snapshot()).toEqual({
      left: false,
      right: false,
      jump: false,
      down: false,
      fire: false,
      mouseX: VIEW_W / 2,
      mouseY: VIEW_H / 2,
      pressed: [],
      clicks: [],
    });
  });

  it.each([
    ['KeyA', 'left'],
    ['ArrowLeft', 'left'],
    ['KeyD', 'right'],
    ['ArrowRight', 'right'],
    ['KeyW', 'jump'],
    ['ArrowUp', 'jump'],
    ['Space', 'jump'],
    ['KeyS', 'down'],
    ['ArrowDown', 'down'],
  ] as const)('holding %s sets %s until released', (code, field) => {
    key('keydown', code);
    expect(input.snapshot()[field]).toBe(true);
    expect(input.snapshot()[field]).toBe(true);
    key('keyup', code);
    expect(input.snapshot()[field]).toBe(false);
  });

  it('prevents page scrolling for space and arrow keys only', () => {
    for (const code of ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
      expect(key('keydown', code).defaultPrevented).toBe(true);
    }
    expect(key('keydown', 'KeyA').defaultPrevented).toBe(false);
    expect(key('keydown', 'F5').defaultPrevented).toBe(false);
  });

  it('reports each key press once, ignoring auto-repeat', () => {
    key('keydown', 'KeyP');
    key('keydown', 'KeyP', { repeat: true });
    key('keydown', 'Digit1');
    expect(input.snapshot().pressed).toEqual(['KeyP', 'Digit1']);
    expect(input.snapshot().pressed).toEqual([]);
  });

  it('auto-repeat still counts as held', () => {
    key('keydown', 'KeyD', { repeat: true });
    const snap = input.snapshot();
    expect(snap.right).toBe(true);
    expect(snap.pressed).toEqual([]);
  });

  it('maps pointer movement from page pixels to view pixels', () => {
    pointer(win, 'pointermove', 100 + 200, 50 + 100);
    expect(input.mouseX).toBe(100);
    expect(input.mouseY).toBe(50);
    expect(input.snapshot()).toMatchObject({ mouseX: 100, mouseY: 50 });
  });

  it('left click on the canvas fires, records a one-shot click, and aims there', () => {
    pointer(canvas, 'pointerdown', 100 + 40, 50 + 60);
    const snap = input.snapshot();
    expect(snap.fire).toBe(true);
    expect(snap.clicks).toEqual([{ x: 20, y: 30 }]);
    expect(snap).toMatchObject({ mouseX: 20, mouseY: 30 });
    const next = input.snapshot();
    expect(next.clicks).toEqual([]);
    expect(next.fire).toBe(true);
  });

  it('ignores non-primary buttons on the canvas', () => {
    pointer(canvas, 'pointerdown', 300, 300, 2);
    const snap = input.snapshot();
    expect(snap.fire).toBe(false);
    expect(snap.clicks).toEqual([]);
    expect(snap.mouseX).toBe(VIEW_W / 2);
  });

  it('stops firing when the primary button is released anywhere, not on other buttons', () => {
    pointer(canvas, 'pointerdown', 100, 50);
    pointer(win, 'pointerup', 0, 0, 2);
    expect(input.snapshot().fire).toBe(true);
    pointer(win, 'pointerup', 0, 0, 0);
    expect(input.snapshot().fire).toBe(false);
  });

  it('releases all keys and the mouse when the window loses focus', () => {
    key('keydown', 'KeyA');
    key('keydown', 'Space');
    pointer(canvas, 'pointerdown', 100, 50);
    win.dispatchEvent(new Event('blur'));
    expect(input.snapshot()).toMatchObject({ left: false, jump: false, fire: false });
  });

  it('turns wheel scrolls over the canvas into one-shot WheelDown/WheelUp presses without scrolling the page', () => {
    const wheel = (target: EventTarget, deltaY: number): WheelEvent => {
      const e = new WheelEvent('wheel', { deltaY, cancelable: true });
      target.dispatchEvent(e);
      return e;
    };
    expect(wheel(canvas, 120).defaultPrevented).toBe(true);
    expect(wheel(canvas, -3).defaultPrevented).toBe(true);
    expect(wheel(canvas, 0).defaultPrevented).toBe(true); // horizontal-only scroll: no weapon change
    wheel(win, 120); // scrolling elsewhere on the page is ignored
    key('keydown', 'KeyQ');
    expect(input.snapshot().pressed).toEqual(['WheelDown', 'WheelUp', 'KeyQ']);
    expect(input.snapshot().pressed).toEqual([]);
  });

  it('suppresses the context menu on the canvas', () => {
    const e = new MouseEvent('contextmenu', { cancelable: true });
    canvas.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });
});
