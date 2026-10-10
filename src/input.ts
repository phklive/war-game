import { VIEW_H, VIEW_W } from './game/config';
import type { InputState, Point } from './game/types';

const BLOCKED = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export class Input {
  mouseX = VIEW_W / 2;
  mouseY = VIEW_H / 2;
  private keys = new Set<string>();
  private pressed: string[] = [];
  private clicks: Point[] = [];
  private mouseDown = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    win: Window,
  ) {
    win.addEventListener('keydown', (e) => {
      if (BLOCKED.has(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.push(e.code);
      this.keys.add(e.code);
    });
    win.addEventListener('keyup', (e) => this.keys.delete(e.code));
    win.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
    });
    win.addEventListener('pointermove', (e) => this.track(e));
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.track(e);
      this.mouseDown = true;
      this.clicks.push({ x: this.mouseX, y: this.mouseY });
    });
    win.addEventListener('pointerup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.deltaY !== 0) this.pressed.push(e.deltaY > 0 ? 'WheelDown' : 'WheelUp');
    });
  }

  private track(e: MouseEvent): void {
    const r = this.canvas.getBoundingClientRect();
    this.mouseX = ((e.clientX - r.left) * VIEW_W) / r.width;
    this.mouseY = ((e.clientY - r.top) * VIEW_H) / r.height;
  }

  private held(...codes: string[]): boolean {
    return codes.some((c) => this.keys.has(c));
  }

  /** Current input; one-shot key presses and clicks are handed out once, then cleared. */
  snapshot(): InputState {
    const state: InputState = {
      left: this.held('KeyA', 'ArrowLeft'),
      right: this.held('KeyD', 'ArrowRight'),
      jump: this.held('KeyW', 'ArrowUp', 'Space'),
      down: this.held('KeyS', 'ArrowDown'),
      fire: this.mouseDown,
      mouseX: this.mouseX,
      mouseY: this.mouseY,
      pressed: this.pressed,
      clicks: this.clicks,
    };
    this.pressed = [];
    this.clicks = [];
    return state;
  }
}
