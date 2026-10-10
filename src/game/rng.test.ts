import { describe, expect, it } from 'vitest';
import { clamp, mulberry32 } from './rng';

const take = (r: () => number, n: number): number[] => Array.from({ length: n }, () => r());

describe('mulberry32', () => {
  it('matches the reference mulberry32 stream', () => {
    expect(take(mulberry32(1), 3)).toEqual([0.6270739405881613, 0.002735721180215478, 0.5274470399599522]);
  });

  it('is deterministic for a given seed', () => {
    expect(take(mulberry32(42), 50)).toEqual(take(mulberry32(42), 50));
  });

  it('produces different streams for different seeds', () => {
    expect(take(mulberry32(1), 5)).not.toEqual(take(mulberry32(2), 5));
  });

  it('treats the seed as an unsigned 32-bit integer', () => {
    expect(take(mulberry32(-1), 5)).toEqual(take(mulberry32(0xffffffff), 5));
    expect(take(mulberry32(2 ** 32 + 7), 5)).toEqual(take(mulberry32(7), 5));
  });

  it('returns values in [0, 1) with a roughly uniform mean', () => {
    const values = take(mulberry32(123), 5000);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    expect(mean).toBeGreaterThan(0.48);
    expect(mean).toBeLessThan(0.52);
  });
});

describe('clamp', () => {
  it('returns the value when inside the range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('clamps to the lower bound', () => {
    expect(clamp(-3, 0, 10)).toBe(0);
  });

  it('clamps to the upper bound', () => {
    expect(clamp(42, 0, 10)).toBe(10);
  });

  it('keeps the bounds themselves', () => {
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });
});
