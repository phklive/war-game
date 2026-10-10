import type { MakeCanvas } from '../render/sprites';

export type FakeContext = CanvasRenderingContext2D & { calls: string[] };

/** A 2D context stand-in that accepts every method call and records its name. */
export function fakeContext(): FakeContext {
  const state: Record<string | symbol, unknown> = {};
  const calls: string[] = [];
  return new Proxy(state, {
    get(target, prop) {
      if (prop === 'calls') return calls;
      if (prop in target) return target[prop];
      return (..._args: unknown[]) => {
        calls.push(String(prop));
      };
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  }) as unknown as FakeContext;
}

export const makeFakeCanvas: MakeCanvas = (w, h) =>
  ({ width: w, height: h, getContext: () => fakeContext() }) as unknown as HTMLCanvasElement;
