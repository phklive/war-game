// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DT, VIEW_H, VIEW_W, type AlienType } from './game/config';
import { createAlien, createGame } from './game/state';
import type { Game, Phase } from './game/types';
import { boot, fitScale, musicFor, type Running } from './main';
import { fakeContext, type FakeContext } from './test/fakeCanvas';
import { waveGame } from './test/helpers';

class FakeWindow extends EventTarget {
  innerWidth = 960;
  innerHeight = 540;
  requestAnimationFrame = vi.fn((_cb: FrameRequestCallback): number => 1);
}

function fakeAudioContext(state: AudioContextState = 'running') {
  const param = () => ({ value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
  const node = () => ({ connect: vi.fn(), start: vi.fn(), stop: vi.fn() });
  return {
    currentTime: 0,
    state,
    sampleRate: 8,
    destination: {},
    resume: vi.fn(() => Promise.resolve()),
    createGain: () => ({ ...node(), gain: param() }),
    createOscillator: vi.fn(() => ({ ...node(), type: 'sine', frequency: param() })),
    createBufferSource: vi.fn(() => ({ ...node(), buffer: null })),
    createBiquadFilter: () => ({ ...node(), type: 'lowpass', frequency: param() }),
    createBuffer: (_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) }),
  };
}

let win: FakeWindow;
let audioCtx: ReturnType<typeof fakeAudioContext>;
let makeAudioContext: ReturnType<typeof vi.fn<() => AudioContext>>;
let getContext: ReturnType<typeof stubGetContext>;

function stubGetContext() {
  return vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => fakeContext());
}

function start(): { running: Running; canvas: HTMLCanvasElement; ctx: FakeContext } {
  const running = boot({ doc: document, win: win as unknown as Window, makeAudioContext, seed: 1 });
  const canvas = document.querySelector<HTMLCanvasElement>('#game');
  if (!canvas) throw new Error('test setup: no canvas');
  return { running, canvas, ctx: getContext.mock.results[0].value as FakeContext };
}

const steps = (r: Running): number => Math.round(r.game.time / DT);
const press = (code: string): boolean => win.dispatchEvent(new KeyboardEvent('keydown', { code }));

beforeEach(() => {
  document.body.innerHTML = '<canvas id="game"></canvas>';
  win = new FakeWindow();
  audioCtx = fakeAudioContext();
  makeAudioContext = vi.fn(() => audioCtx as unknown as AudioContext);
  getContext = stubGetContext();
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('fitScale', () => {
  it('fits the view inside the window, preserving aspect ratio', () => {
    expect(fitScale(VIEW_W * 2, VIEW_H * 2)).toBe(2);
    expect(fitScale(VIEW_W, 1000)).toBe(1);
    expect(fitScale(1000, VIEW_H)).toBe(1);
    expect(fitScale(VIEW_W * 4, VIEW_H * 5)).toBe(4);
  });
});

describe('boot', () => {
  it('fails loudly without a game canvas', () => {
    document.body.innerHTML = '';
    expect(() => start()).toThrow('Missing <canvas id="game"> element');
  });

  it('fails loudly when 2D canvas is unsupported', () => {
    getContext.mockReturnValue(null);
    expect(() => start()).toThrow('Canvas 2D rendering is not supported in this browser');
  });

  it('sizes the canvas to the view, scales it to the window and requests the first frame', () => {
    const { running, canvas } = start();
    expect(canvas.width).toBe(VIEW_W);
    expect(canvas.height).toBe(VIEW_H);
    expect(canvas.style.width).toBe(`${VIEW_W * 2}px`);
    expect(canvas.style.height).toBe(`${VIEW_H * 2}px`);
    expect(running.game.phase).toBe('title');
    expect(win.requestAnimationFrame).toHaveBeenCalledExactlyOnceWith(running.frame);
  });

  it('builds sprites on offscreen canvases from the same document', () => {
    const create = vi.spyOn(document, 'createElement');
    start();
    const made = create.mock.results.map((r) => r.value as HTMLCanvasElement);
    expect(made.length).toBeGreaterThan(10);
    expect(made.every((c) => c.tagName === 'CANVAS' && c.width > 0 && c.height > 0)).toBe(true);
    expect(getContext).toHaveBeenCalledTimes(made.length + 1);
  });

  it('refits the canvas when the window is resized', () => {
    const { canvas } = start();
    win.innerWidth = 1000;
    win.innerHeight = VIEW_H;
    win.dispatchEvent(new Event('resize'));
    expect(canvas.style.width).toBe(`${VIEW_W}px`);
    expect(canvas.style.height).toBe(`${VIEW_H}px`);
  });

  it('creates the audio context on the first user gesture and resumes it on later ones', () => {
    start();
    expect(makeAudioContext).not.toHaveBeenCalled();
    win.dispatchEvent(new PointerEvent('pointerdown'));
    expect(makeAudioContext).toHaveBeenCalledTimes(1);
    audioCtx.state = 'suspended';
    press('KeyA');
    expect(makeAudioContext).toHaveBeenCalledTimes(1);
    expect(audioCtx.resume).toHaveBeenCalledTimes(1);
  });
});

describe('frame loop', () => {
  it('advances the simulation in fixed steps, clamping long stalls, and renders every frame', () => {
    const { running, ctx } = start();
    let now = 1000;
    running.frame(now);
    expect(steps(running)).toBe(1); // the very first frame runs one step
    expect(ctx.calls).toContain('drawImage');
    expect(win.requestAnimationFrame).toHaveBeenLastCalledWith(running.frame);

    now += 3.5 * DT * 1000;
    running.frame(now);
    expect(steps(running)).toBe(4); // 3.5 steps elapsed: 3 run, half a step carried over

    ctx.calls.length = 0;
    now += 1;
    running.frame(now);
    expect(steps(running)).toBe(4); // not enough time for a step, but still draws
    expect(ctx.calls).toContain('drawImage');

    now += 5000;
    running.frame(now);
    expect(steps(running)).toBe(10); // stall clamped to 0.1s = 6 steps (+ carried time)
    expect(win.requestAnimationFrame).toHaveBeenCalledTimes(5);
  });

  it('hands one-shot clicks and key presses to the first step of a frame only', () => {
    const { running, canvas } = start();
    canvas.getBoundingClientRect = () => new DOMRect(0, 0, VIEW_W, VIEW_H);
    canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: 10, clientY: 10 }));
    running.frame(0);
    expect(running.game.phase).toBe('wave'); // the click started the game

    running.game.spawnQueue = ['grunt', 'grunt']; // keep the wave from ending
    press('KeyP');
    running.frame(2.5 * DT * 1000); // two steps
    expect(running.game.paused).toBe(true); // toggled once, not twice
  });

  it('toggles mute once per M press', () => {
    const { running } = start();
    running.frame(0);
    press('KeyM');
    running.frame(3.5 * DT * 1000);
    expect(running.audio.isMuted()).toBe(true);
    running.frame(5 * DT * 1000);
    expect(running.audio.isMuted()).toBe(true);
    press('KeyM');
    running.frame(7 * DT * 1000);
    expect(running.audio.isMuted()).toBe(false);
  });

  it('plays and clears queued sound effects every frame', () => {
    const { running } = start();
    const play = vi.spyOn(running.audio, 'play');
    running.game.sfx.push('coin', 'hit');
    running.frame(0);
    expect(play.mock.calls).toEqual([['coin'], ['hit']]);
    expect(running.game.sfx).toEqual([]);
  });

  it('picks the music for the current moment every frame', () => {
    const { running } = start();
    const setMusic = vi.spyOn(running.audio, 'setMusic');
    const tick = vi.spyOn(running.audio, 'tick');
    running.frame(0);
    expect(setMusic).toHaveBeenLastCalledWith('title', 1);
    const music = (phase: Phase, wave: number, now: number): unknown[] => {
      running.game.phase = phase;
      running.game.wave = wave;
      running.frame(now); // < 1 step of elapsed time: the phase is not advanced
      return setMusic.mock.lastCall ?? fail();
    };
    expect(music('wave', 3, 1)).toEqual(['battle3', musicFor(running.game).tempo]);
    expect(music('shop', 3, 2)).toEqual(['shop', 1]);
    expect(music('gameover', 3, 3)).toEqual([null, 1]);
    expect(setMusic).toHaveBeenCalledTimes(4);
    expect(tick).toHaveBeenCalledTimes(4);
    expect(tick.mock.invocationCallOrder[3]).toBeGreaterThan(setMusic.mock.invocationCallOrder[3]);
  });

  it('schedules music through the audio context once unlocked, and goes quiet when the track is off', () => {
    const { running } = start();
    running.frame(0);
    expect(audioCtx.createOscillator).not.toHaveBeenCalled(); // no context yet
    win.dispatchEvent(new PointerEvent('pointerdown'));
    running.frame(1);
    expect(audioCtx.createOscillator).toHaveBeenCalled(); // title theme

    audioCtx.createOscillator.mockClear();
    running.game.phase = 'victory';
    audioCtx.currentTime = 10;
    running.frame(2);
    expect(audioCtx.createOscillator).not.toHaveBeenCalled();
  });
});

describe('musicFor', () => {
  const at = (phase: Phase, wave = 1): Game => {
    const g = createGame(1);
    g.phase = phase;
    g.wave = wave;
    return g;
  };
  const withAlien = (g: Game, type: AlienType, hp?: number): Game => {
    const a = createAlien(g, type, 300, 200, 'active');
    if (hp !== undefined) a.hp = hp;
    return g;
  };

  it('plays the title and shop themes at normal speed', () => {
    expect(musicFor(at('title', 0))).toEqual({ track: 'title', tempo: 1 });
    expect(musicFor(at('shop', 4))).toEqual({ track: 'shop', tempo: 1 });
  });

  it('is silent on the game over and victory screens', () => {
    expect(musicFor(at('gameover', 4))).toEqual({ track: null, tempo: 1 });
    expect(musicFor(at('victory', 10))).toEqual({ track: null, tempo: 1 });
  });

  it('cycles through the battle tracks wave by wave, a little faster each wave', () => {
    const tracks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((wave) => musicFor(at('wave', wave)));
    expect(tracks.map((m) => m.track)).toEqual(['battle1', 'battle2', 'battle3', 'battle1', 'battle2', 'battle3', 'battle1', 'battle2', 'battle3', 'battle1']);
    tracks.forEach((m, i) => expect(m.tempo).toBeCloseTo(1 + 0.03 * i));
    expect(musicFor(at('clear', 2))).toEqual(musicFor(at('wave', 2)));
  });

  it('keeps the battle track while ordinary aliens fight or a dead boss lies around', () => {
    const g = withAlien(withAlien(waveGame(), 'brute'), 'carrier', 0);
    expect(musicFor(g).track).toBe('battle1');
  });

  it('switches to the boss theme once the boss is announced, and keeps it while the boss lives', () => {
    const g = waveGame();
    g.wave = 5;
    g.pendingBoss = { type: 'wormking', elite: false, timer: 2, announced: false };
    expect(musicFor(g).track).toBe('battle2'); // horde cleared, boss not announced yet
    g.pendingBoss.announced = true;
    expect(musicFor(g)).toEqual({ track: 'boss', tempo: 1 });
    g.pendingBoss = null;
    withAlien(g, 'wormking');
    expect(musicFor(g)).toEqual({ track: 'boss', tempo: 1 });
    g.phase = 'clear';
    expect(musicFor(g).track).toBe('boss');
  });
});

function fail(): never {
  throw new Error('expected setMusic to have been called');
}
