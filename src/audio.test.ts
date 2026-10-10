import { afterEach, describe, expect, it, vi } from 'vitest';
import { DRUMS, SOUNDS, TRACKS, createAudio, type TrackId } from './audio';
import type { Sfx } from './game/types';

interface ParamCall {
  method: 'set' | 'ramp';
  value: number;
  time: number;
}

class FakeParam {
  value = 0;
  calls: ParamCall[] = [];
  setValueAtTime(value: number, time: number): this {
    this.calls.push({ method: 'set', value, time });
    return this;
  }
  exponentialRampToValueAtTime(value: number, time: number): this {
    this.calls.push({ method: 'ramp', value, time });
    return this;
  }
}

class FakeNode {
  outputs: unknown[] = [];
  connect<T>(target: T): T {
    this.outputs.push(target);
    return target;
  }
}

class FakeGain extends FakeNode {
  gain = new FakeParam();
}

class FakeScheduled extends FakeNode {
  startAt: number | null = null;
  stopAt: number | null = null;
  start(t: number): void {
    this.startAt = t;
  }
  stop(t: number): void {
    this.stopAt = t;
  }
}

class FakeOscillator extends FakeScheduled {
  type = 'sine';
  frequency = new FakeParam();
}

class FakeBufferSource extends FakeScheduled {
  buffer: FakeBuffer | null = null;
}

class FakeFilter extends FakeNode {
  type = 'lowpass';
  frequency = new FakeParam();
}

class FakeBuffer {
  readonly data: Float32Array;
  constructor(
    readonly channels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.data = new Float32Array(length);
  }
  getChannelData(channel: number): Float32Array {
    if (channel !== 0) throw new Error(`unexpected channel ${channel}`);
    return this.data;
  }
}

class FakeAudioContext {
  currentTime = 0;
  state: AudioContextState = 'running';
  sampleRate = 64;
  destination = new FakeNode();
  resume = vi.fn(() => Promise.resolve());
  gains: FakeGain[] = [];
  oscillators: FakeOscillator[] = [];
  sources: FakeBufferSource[] = [];
  filters: FakeFilter[] = [];
  buffers: FakeBuffer[] = [];
  createGain(): FakeGain {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  }
  createOscillator(): FakeOscillator {
    const o = new FakeOscillator();
    this.oscillators.push(o);
    return o;
  }
  createBufferSource(): FakeBufferSource {
    const s = new FakeBufferSource();
    this.sources.push(s);
    return s;
  }
  createBiquadFilter(): FakeFilter {
    const f = new FakeFilter();
    this.filters.push(f);
    return f;
  }
  createBuffer(channels: number, length: number, sampleRate: number): FakeBuffer {
    const b = new FakeBuffer(channels, length, sampleRate);
    this.buffers.push(b);
    return b;
  }
}

function setup(): { fake: FakeAudioContext; make: ReturnType<typeof vi.fn<() => AudioContext>>; audio: ReturnType<typeof createAudio> } {
  const fake = new FakeAudioContext();
  const make = vi.fn(() => fake as unknown as AudioContext);
  return { fake, make, audio: createAudio(make) };
}

function unlocked(): { fake: FakeAudioContext; audio: ReturnType<typeof createAudio>; master: FakeGain } {
  const { fake, audio } = setup();
  audio.unlock();
  return { fake, audio, master: fake.gains[0] };
}

const voiceCount = (fake: FakeAudioContext): number => fake.oscillators.length + fake.sources.length;
const envelope = (o: FakeOscillator): FakeGain => {
  const out = o.outputs[0];
  if (!(out instanceof FakeGain)) throw new Error('oscillator is not wired to a gain envelope');
  return out;
};
const midi = (note: number): number => 440 * 2 ** ((note - 69) / 12);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SOUNDS', () => {
  it('defines at least one audible note for every effect', () => {
    for (const notes of Object.values(SOUNDS)) {
      expect(notes.length).toBeGreaterThan(0);
      for (const note of notes) {
        expect(note.dur).toBeGreaterThan(0);
        expect(note.vol).toBeGreaterThan(0);
        expect(note.f0).toBeGreaterThan(0);
        expect(note.f1).toBeGreaterThan(0); // exponential ramps cannot target 0
      }
    }
  });

  it('has a short sound for each new enemy and weapon-swap event', () => {
    for (const name of ['swap', 'tink', 'bomb', 'burrow', 'acid', 'zap', 'split', 'web'] as const) {
      const end = Math.max(...SOUNDS[name].map((note) => note.at + note.dur));
      expect(end).toBeLessThanOrEqual(0.5);
    }
  });

  it('ends the game with jingles that last over a second', () => {
    const length = (name: Sfx): number => Math.max(...SOUNDS[name].map((note) => note.at + note.dur));
    expect(length('win')).toBeGreaterThan(1);
    expect(length('lose')).toBeGreaterThan(1);
  });
});

describe('createAudio', () => {
  it('does not touch the audio API until unlocked', () => {
    const { fake, make, audio } = setup();
    audio.play('hit');
    audio.setMusic('battle1', 1);
    audio.tick();
    expect(make).not.toHaveBeenCalled();
    expect(voiceCount(fake)).toBe(0);
    expect(audio.isMuted()).toBe(false);
  });

  it('unlock builds a master gain into the destination and a one-second white noise buffer', () => {
    const { fake, make, audio } = setup();
    audio.unlock();
    expect(make).toHaveBeenCalledTimes(1);
    const master = fake.gains[0];
    expect(master.gain.value).toBe(0.45);
    expect(master.outputs).toEqual([fake.destination]);
    expect(fake.buffers).toHaveLength(1);
    const noise = fake.buffers[0];
    expect(noise).toMatchObject({ channels: 1, length: fake.sampleRate, sampleRate: fake.sampleRate });
    expect(noise.data.every((v) => v >= -1 && v < 1)).toBe(true);
    expect(noise.data.some((v) => v !== 0)).toBe(true);
  });

  it('later unlocks reuse the context and resume it only when suspended', () => {
    const { fake, make, audio } = setup();
    audio.unlock();
    audio.unlock();
    expect(fake.resume).not.toHaveBeenCalled();
    fake.state = 'suspended';
    audio.unlock();
    expect(fake.resume).toHaveBeenCalledTimes(1);
    expect(make).toHaveBeenCalledTimes(1);
    expect(fake.gains).toHaveLength(1);
  });

  it('plays oscillator notes as a pitch sweep with a decaying gain envelope', () => {
    const { fake, audio, master } = unlocked();
    fake.currentTime = 2;
    audio.play('hit'); // square 220 -> 110 over 0.05s at vol 0.12
    expect(fake.oscillators).toHaveLength(1);
    const osc = fake.oscillators[0];
    expect(osc.type).toBe('square');
    expect(osc.frequency.calls).toEqual([
      { method: 'set', value: 220, time: 2 },
      { method: 'ramp', value: 110, time: 2.05 },
    ]);
    expect(osc.startAt).toBe(2);
    expect(osc.stopAt).toBe(2.05);
    const env = fake.gains[1];
    expect(osc.outputs).toEqual([env]);
    expect(env.outputs).toEqual([master]);
    expect(env.gain.calls).toEqual([
      { method: 'set', value: 0.12, time: 2 },
      { method: 'ramp', value: 0.001, time: 2.05 },
    ]);
  });

  it('plays noise notes through a sweeping band-pass filter fed by the noise buffer', () => {
    const { fake, audio } = unlocked();
    fake.currentTime = 1;
    audio.play('knife'); // noise 3000 -> 900 over 0.08s
    expect(fake.oscillators).toHaveLength(0);
    expect(fake.sources).toHaveLength(1);
    const src = fake.sources[0];
    const filter = fake.filters[0];
    expect(src.buffer).toBe(fake.buffers[0]);
    expect(filter.type).toBe('bandpass');
    expect(filter.frequency.calls).toEqual([
      { method: 'set', value: 3000, time: 1 },
      { method: 'ramp', value: 900, time: 1.08 },
    ]);
    expect(src.outputs).toEqual([filter]);
    expect(filter.outputs).toEqual([fake.gains[1]]);
    expect(src.startAt).toBe(1);
    expect(src.stopAt).toBe(1.08);
  });

  it('surfaces a failed unlock and retries setup on the next unlock', () => {
    const { fake, make, audio } = setup();
    const createGain = fake.createGain.bind(fake);
    fake.createGain = () => {
      throw new Error('gain unavailable');
    };
    expect(() => audio.unlock()).toThrow('gain unavailable');
    audio.play('hit');
    expect(voiceCount(fake)).toBe(0);
    fake.createGain = createGain;
    audio.unlock();
    expect(make).toHaveBeenCalledTimes(2);
    audio.play('hit');
    expect(voiceCount(fake)).toBe(1);
  });

  it('schedules multi-note sounds at their offsets', () => {
    const { fake, audio } = unlocked();
    fake.currentTime = 3;
    audio.play('unlock');
    expect(fake.oscillators.map((o) => o.startAt)).toEqual([3, 3.1, 3.2, 3.3]);
  });

  it('rate-limits each effect to one trigger per 35ms but lets different effects overlap', () => {
    const { fake, audio } = unlocked();
    fake.currentTime = 1;
    audio.play('hit');
    fake.currentTime = 1.02;
    audio.play('hit');
    expect(fake.oscillators).toHaveLength(1);
    audio.play('jump');
    expect(fake.oscillators).toHaveLength(2);
    fake.currentTime = 1.04;
    audio.play('hit');
    expect(fake.oscillators).toHaveLength(3);
  });

  it('every effect can be played', () => {
    const { fake, audio } = unlocked();
    const names = Object.keys(SOUNDS) as Sfx[];
    for (const name of names) audio.play(name);
    const expected = names.reduce((sum, name) => sum + SOUNDS[name].length, 0);
    expect(voiceCount(fake)).toBe(expected);
  });

  it('mute silences the master gain and stops new sounds; unmute restores both', () => {
    const { fake, audio, master } = unlocked();
    expect(audio.toggleMute()).toBe(true);
    expect(audio.isMuted()).toBe(true);
    expect(master.gain.value).toBe(0);
    audio.play('hit');
    audio.setMusic('battle1', 1);
    audio.tick();
    expect(voiceCount(fake)).toBe(0);
    expect(audio.toggleMute()).toBe(false);
    expect(master.gain.value).toBe(0.45);
    audio.play('hit');
    expect(voiceCount(fake)).toBe(1);
  });

  it('can be muted before the context exists', () => {
    const { fake, audio } = setup();
    expect(audio.toggleMute()).toBe(true);
    audio.unlock();
    audio.play('hit');
    expect(voiceCount(fake)).toBe(0);
    expect(audio.toggleMute()).toBe(false);
    expect(fake.gains[0].gain.value).toBe(0.45);
  });

  describe('music', () => {
    it('stays silent while music is off', () => {
      const { fake, audio } = unlocked();
      audio.tick();
      audio.setMusic('battle1', 1);
      audio.setMusic(null, 1);
      audio.tick();
      expect(voiceCount(fake)).toBe(0);
    });

    it('schedules bass, lead and drums a short look-ahead in advance, one step at a time', () => {
      const { fake, audio } = unlocked();
      audio.setMusic('battle1', 1); // 150 bpm: 0.2s per eighth-note step
      audio.tick();
      // beat 0: bass A2 (triangle) + lead A4 (square) + kick (sine sweep) at t=0
      expect(fake.oscillators.map((o) => o.type)).toEqual(['triangle', 'square', 'sine']);
      expect(fake.oscillators[0].frequency.calls[0]).toEqual({ method: 'set', value: midi(45), time: 0 });
      expect(fake.oscillators[1].frequency.calls[0]).toEqual({ method: 'set', value: midi(69), time: 0 });
      expect(fake.oscillators[2].frequency.calls).toEqual([
        { method: 'set', value: 150, time: 0 },
        { method: 'ramp', value: 40, time: 0.12 },
      ]);
      expect(fake.oscillators[0].stopAt).toBeCloseTo(0.2 * 0.9);
      expect(fake.oscillators[1].stopAt).toBeCloseTo(0.2 * 0.6);
      expect(fake.gains[2].gain.calls[0]).toEqual({ method: 'set', value: TRACKS.battle1.leadVol, time: 0 });

      audio.tick(); // next beat (t=0.2) is beyond the 0.15s look-ahead
      expect(fake.oscillators).toHaveLength(3);

      fake.currentTime = 0.1;
      audio.tick(); // beat 1 rests in the lead and the drums: bass only
      expect(fake.oscillators).toHaveLength(4);
      expect(fake.oscillators[3]).toMatchObject({ type: 'triangle', startAt: 0.2 });
      expect(fake.sources).toHaveLength(0);

      fake.currentTime = 0.3;
      audio.tick(); // beat 2: hi-hat is band-passed noise
      expect(fake.sources).toHaveLength(1);
      expect(fake.sources[0].startAt).toBeCloseTo(0.4);
      expect(fake.filters[0].frequency.calls[0]).toMatchObject({ method: 'set', value: 8000 });
    });

    it('skips bass rests', () => {
      const { fake, audio } = unlocked();
      audio.setMusic('title', 1); // 100 bpm: 0.3s per step; beat 1 is a full rest
      audio.tick();
      const first = voiceCount(fake);
      expect(first).toBe(3);
      fake.currentTime = 0.2;
      audio.tick(); // schedules beat 1 at t=0.3
      expect(voiceCount(fake)).toBe(first);
      fake.currentTime = 0.5;
      audio.tick(); // beat 2 at t=0.6 plays again
      expect(fake.oscillators[first]).toMatchObject({ type: 'triangle', startAt: 0.6 });
    });

    it('scales the step length by the tempo', () => {
      const { fake, audio } = unlocked();
      audio.setMusic('battle1', 2); // twice as fast: 0.1s per step, so two steps fit the look-ahead
      audio.tick();
      const bass = fake.oscillators.filter((o) => o.type === 'triangle');
      expect(bass.map((o) => o.startAt)).toEqual([0, 0.1]);
      expect(bass[0].stopAt).toBeCloseTo(0.1 * 0.9);
    });

    it('keeps its place when only the tempo changes, and restarts from the top on a new track', () => {
      const { fake, audio } = unlocked();
      const bassNotes = (): number[] => fake.oscillators.filter((o) => o.type === 'triangle').map((o) => o.frequency.calls[0].value);
      audio.setMusic('battle1', 1);
      audio.tick(); // beat 0
      fake.currentTime = 0.1;
      audio.tick(); // beat 1
      audio.setMusic('battle1', 2);
      fake.currentTime = 0.3;
      audio.tick(); // beat 2 at the new tempo
      expect(bassNotes()).toEqual([45, 45, 57].map(midi));

      audio.setMusic('boss', 1);
      fake.currentTime = 1;
      audio.tick(); // boss beat 0
      expect(bassNotes().slice(3)).toEqual([midi(33)]);
      expect(fake.oscillators.filter((o) => o.type === 'triangle')[3].startAt).toBe(1);

      audio.setMusic(null, 1);
      audio.setMusic('boss', 1);
      fake.currentTime = 2;
      audio.tick(); // back to boss beat 0 after silence
      expect(bassNotes().slice(4)).toEqual([midi(33)]);
    });

    it('resyncs to the current time instead of replaying missed beats', () => {
      const { fake, audio } = unlocked();
      audio.setMusic('battle1', 1);
      audio.tick();
      const before = fake.oscillators.length;
      fake.currentTime = 10;
      audio.tick();
      const added = fake.oscillators.slice(before);
      expect(added.length).toBeGreaterThan(0);
      expect(added.every((o) => o.startAt === 10)).toBe(true);
    });

    it.each(Object.keys(TRACKS) as TrackId[])('plays one full bar of %s note for note', (id) => {
      const track = TRACKS[id];
      expect(track.bass).toHaveLength(16);
      expect(track.lead).toHaveLength(16);
      expect(track.drums).toHaveLength(16);
      expect([...track.drums].every((d) => d === '.' || d in DRUMS)).toBe(true);

      const { fake, audio } = unlocked();
      audio.setMusic(id, 1);
      const step = 60 / track.bpm / 2;
      expect(step).toBeGreaterThan(0.15); // one step per tick below
      for (let i = 0; i < 16; i++) {
        fake.currentTime = i * step;
        audio.tick();
      }
      const notes = (part: readonly number[]): number[] => part.filter((m) => m > 0).map(midi);
      // voices are told apart by waveform and envelope volume
      const played = (type: string, vol: number): number[] =>
        fake.oscillators.filter((o) => o.type === type && envelope(o).gain.calls[0].value === vol).map((o) => o.frequency.calls[0].value);
      expect(played('triangle', 0.12)).toEqual(notes(track.bass));
      expect(played(track.leadWave, track.leadVol)).toEqual(notes(track.lead));
      const kicks = [...track.drums].filter((d) => d === 'k').length;
      const noisy = [...track.drums].filter((d) => d === 's' || d === 'h').length;
      expect(played('sine', DRUMS.k[0].vol)).toHaveLength(kicks);
      expect(fake.oscillators).toHaveLength(notes(track.bass).length + notes(track.lead).length + kicks);
      expect(fake.sources).toHaveLength(noisy);
    });
  });
});

describe('DRUMS', () => {
  it('has a low kick, a noise snare and a short, bright noise hi-hat', () => {
    expect(DRUMS.k[0]).toMatchObject({ wave: 'sine' });
    expect(DRUMS.k[0].f1).toBeLessThan(DRUMS.k[0].f0);
    expect(DRUMS.s[0]).toMatchObject({ wave: 'noise' });
    expect(DRUMS.h[0]).toMatchObject({ wave: 'noise' });
    expect(DRUMS.h[0].f0).toBeGreaterThan(DRUMS.s[0].f0);
    expect(DRUMS.h[0].dur).toBeLessThan(DRUMS.s[0].dur);
  });
});
