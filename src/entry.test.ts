// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { VIEW_H, VIEW_W } from './game/config';
import { fitScale } from './main';
import { fakeContext } from './test/fakeCanvas';

const audioContexts: FakeAudioContext[] = [];

class FakeAudioContext {
  currentTime = 0;
  state: AudioContextState = 'running';
  sampleRate = 8;
  destination = {};
  constructor() {
    audioContexts.push(this);
  }
  createGain() {
    return { gain: { value: 0 }, connect: vi.fn() };
  }
  createBuffer(_channels: number, length: number) {
    return { getChannelData: () => new Float32Array(length) };
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('boots the game on the #game canvas with a browser AudioContext', async () => {
  document.body.innerHTML = '<canvas id="game"></canvas>';
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => fakeContext());
  const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
  vi.stubGlobal('AudioContext', FakeAudioContext);

  await import('./entry');

  const canvas = document.querySelector<HTMLCanvasElement>('#game');
  expect(canvas?.width).toBe(VIEW_W);
  expect(canvas?.height).toBe(VIEW_H);
  expect(canvas?.style.width).toBe(`${VIEW_W * fitScale(window.innerWidth, window.innerHeight)}px`);
  expect(raf).toHaveBeenCalledTimes(1);

  // the frame loop is wired to the window
  const frame = raf.mock.calls[0][0];
  frame(16);
  expect(raf).toHaveBeenCalledTimes(2);
  expect(raf).toHaveBeenLastCalledWith(frame);

  // audio is created lazily from the real AudioContext constructor on the first gesture
  expect(audioContexts).toHaveLength(0);
  window.dispatchEvent(new Event('pointerdown'));
  expect(audioContexts).toHaveLength(1);
});
