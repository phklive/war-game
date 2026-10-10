import type { Sfx } from './game/types';

type Wave = OscillatorType | 'noise';

interface Note {
  wave: Wave;
  f0: number;
  f1: number;
  dur: number;
  vol: number;
  at: number;
}

const n = (wave: Wave, f0: number, f1: number, dur: number, vol: number, at = 0): Note => ({ wave, f0, f1, dur, vol, at });

export const SOUNDS: Record<Sfx, readonly Note[]> = {
  knife: [n('noise', 3000, 900, 0.08, 0.25)],
  pistol: [n('square', 620, 120, 0.08, 0.18), n('noise', 2200, 500, 0.06, 0.2)],
  water: [n('noise', 1600, 1200, 0.05, 0.05)],
  bubble: [n('sine', 300, 900, 0.12, 0.2)],
  ar: [n('square', 420, 90, 0.06, 0.13), n('noise', 2600, 600, 0.05, 0.16)],
  sniper: [n('sawtooth', 900, 60, 0.3, 0.22), n('noise', 4000, 300, 0.35, 0.3)],
  laser: [n('sawtooth', 1400, 1250, 0.06, 0.05)],
  tank: [n('noise', 700, 80, 0.45, 0.45), n('square', 120, 40, 0.3, 0.25)],
  turret: [n('square', 800, 200, 0.04, 0.05)],
  hit: [n('square', 220, 110, 0.05, 0.12)],
  alienDie: [n('sawtooth', 520, 60, 0.22, 0.16), n('noise', 900, 200, 0.15, 0.12)],
  coin: [n('square', 988, 988, 0.06, 0.1), n('square', 1319, 1319, 0.12, 0.1, 0.06)],
  explode: [n('noise', 800, 50, 0.6, 0.5)],
  unlock: [n('square', 523, 523, 0.1, 0.15), n('square', 659, 659, 0.1, 0.15, 0.1), n('square', 784, 784, 0.1, 0.15, 0.2), n('square', 1047, 1047, 0.3, 0.15, 0.3)],
  waveStart: [n('sawtooth', 220, 220, 0.25, 0.15), n('sawtooth', 330, 330, 0.45, 0.15, 0.25)],
  waveClear: [n('triangle', 523, 523, 0.12, 0.25), n('triangle', 784, 784, 0.12, 0.25, 0.12), n('triangle', 1047, 1047, 0.3, 0.25, 0.24)],
  baseHit: [n('square', 150, 60, 0.12, 0.12)],
  playerHit: [n('square', 300, 100, 0.12, 0.18)],
  playerDie: [n('sawtooth', 400, 40, 0.6, 0.25)],
  buy: [n('square', 660, 660, 0.06, 0.12), n('square', 990, 990, 0.1, 0.12, 0.06)],
  deny: [n('square', 110, 100, 0.15, 0.15)],
  plasma: [n('sine', 200, 700, 0.15, 0.1)],
  pop: [n('sine', 900, 200, 0.08, 0.15)],
  jump: [n('square', 300, 600, 0.08, 0.06)],
  boss: [n('sawtooth', 80, 40, 0.8, 0.3), n('noise', 300, 60, 0.8, 0.2)],
  swap: [n('square', 500, 800, 0.05, 0.08), n('noise', 3000, 2000, 0.04, 0.06, 0.03)],
  tink: [n('square', 1800, 1500, 0.05, 0.08), n('triangle', 2600, 2400, 0.08, 0.06)],
  bomb: [n('sine', 1200, 300, 0.5, 0.08)],
  burrow: [n('noise', 200, 80, 0.5, 0.25)],
  acid: [n('sine', 400, 150, 0.15, 0.1), n('noise', 1200, 600, 0.1, 0.06)],
  zap: [n('square', 1600, 400, 0.06, 0.06)],
  split: [n('sine', 300, 120, 0.15, 0.15), n('sine', 500, 200, 0.12, 0.1, 0.05)],
  web: [n('noise', 3000, 2000, 0.12, 0.08)],
  win: [
    n('square', 523, 523, 0.12, 0.18),
    n('square', 659, 659, 0.12, 0.18, 0.12),
    n('square', 784, 784, 0.12, 0.18, 0.24),
    n('square', 1047, 1047, 0.16, 0.18, 0.36),
    n('square', 784, 784, 0.12, 0.18, 0.52),
    n('square', 1047, 1047, 0.12, 0.18, 0.64),
    n('square', 1319, 1319, 0.7, 0.18, 0.76),
    n('triangle', 131, 131, 1.4, 0.25, 0.04),
  ],
  lose: [
    n('sawtooth', 392, 392, 0.25, 0.18),
    n('sawtooth', 370, 370, 0.25, 0.18, 0.28),
    n('sawtooth', 349, 349, 0.25, 0.18, 0.56),
    n('sawtooth', 330, 330, 0.35, 0.18, 0.84),
    n('sawtooth', 262, 110, 1, 0.2, 1.2),
    n('noise', 300, 60, 1.2, 0.2, 1.2),
  ],
};

export type TrackId = 'title' | 'battle1' | 'battle2' | 'battle3' | 'boss' | 'shop';

interface Track {
  bpm: number;
  /** 16 eighth-note steps in MIDI note numbers (0 = rest). */
  bass: readonly number[];
  lead: readonly number[];
  leadWave: OscillatorType;
  leadVol: number;
  /** 16 steps: k = kick, s = snare, h = hi-hat, . = rest. */
  drums: string;
}

export const TRACKS: Record<TrackId, Track> = {
  title: {
    bpm: 100,
    bass: [45, 0, 45, 0, 41, 0, 41, 0, 43, 0, 43, 0, 40, 0, 40, 0],
    lead: [76, 0, 72, 0, 69, 0, 72, 0, 74, 0, 71, 0, 68, 0, 71, 0],
    leadWave: 'triangle',
    leadVol: 0.06,
    drums: 'k.......s.......',
  },
  battle1: {
    bpm: 150,
    bass: [45, 45, 57, 45, 48, 48, 60, 48, 43, 43, 55, 43, 40, 40, 52, 47],
    lead: [69, 0, 72, 0, 76, 0, 72, 74, 67, 0, 71, 0, 64, 67, 0, 0],
    leadWave: 'square',
    leadVol: 0.03,
    drums: 'k.h.s.h.k.h.s.hh',
  },
  battle2: {
    bpm: 156,
    bass: [40, 40, 52, 40, 43, 43, 55, 43, 45, 45, 57, 45, 47, 47, 59, 47],
    lead: [64, 67, 71, 67, 74, 0, 71, 0, 69, 72, 76, 72, 71, 0, 67, 0],
    leadWave: 'square',
    leadVol: 0.03,
    drums: 'k.h.s.h.k.k.s.hh',
  },
  battle3: {
    bpm: 160,
    bass: [38, 50, 38, 50, 41, 53, 41, 53, 36, 48, 36, 48, 43, 55, 45, 57],
    lead: [62, 0, 65, 69, 0, 67, 65, 0, 60, 0, 64, 67, 0, 69, 72, 0],
    leadWave: 'sawtooth',
    leadVol: 0.025,
    drums: 'k.hhs.hhk.hhs.hs',
  },
  boss: {
    bpm: 172,
    bass: [33, 33, 45, 33, 34, 34, 46, 34, 33, 33, 45, 33, 36, 35, 34, 33],
    lead: [69, 68, 69, 0, 70, 69, 70, 0, 72, 71, 72, 0, 75, 74, 73, 72],
    leadWave: 'sawtooth',
    leadVol: 0.025,
    drums: 'k.k.s.k.k.k.s.ss',
  },
  shop: {
    bpm: 118,
    bass: [48, 0, 55, 0, 53, 0, 55, 0, 45, 0, 52, 0, 50, 0, 55, 0],
    lead: [72, 76, 79, 76, 77, 0, 76, 74, 72, 0, 76, 79, 81, 79, 76, 0],
    leadWave: 'triangle',
    leadVol: 0.06,
    drums: 'k...h...k...h.h.',
  },
};

export const DRUMS: Record<string, readonly Note[]> = {
  k: [n('sine', 150, 40, 0.12, 0.35)],
  s: [n('noise', 2000, 1200, 0.1, 0.18)],
  h: [n('noise', 8000, 7000, 0.03, 0.06)],
};

const MIN_GAP = 0.035;
const LOOKAHEAD = 0.15;

const midi = (note: number): number => 440 * 2 ** ((note - 69) / 12);

export interface Audio {
  unlock(): void;
  play(name: Sfx): void;
  /** Switch the looping track (null = silence); tempo scales the track's bpm. */
  setMusic(track: TrackId | null, tempo: number): void;
  tick(): void;
  toggleMute(): boolean;
  isMuted(): boolean;
}

export function createAudio(makeContext: () => AudioContext): Audio {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let muted = false;
  let track: TrackId | null = null;
  let tempo = 1;
  let nextBeat = 0;
  let beat = 0;
  const last = new Map<Sfx, number>();

  function voice(c: AudioContext, out: GainNode, note: Note, t: number): void {
    const gain = c.createGain();
    gain.gain.setValueAtTime(note.vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + note.dur);
    gain.connect(out);
    if (note.wave === 'noise') {
      const src = c.createBufferSource();
      src.buffer = noise;
      const filter = c.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(note.f0, t);
      filter.frequency.exponentialRampToValueAtTime(note.f1, t + note.dur);
      src.connect(filter);
      filter.connect(gain);
      src.start(t);
      src.stop(t + note.dur);
      return;
    }
    const osc = c.createOscillator();
    osc.type = note.wave;
    osc.frequency.setValueAtTime(note.f0, t);
    osc.frequency.exponentialRampToValueAtTime(note.f1, t + note.dur);
    osc.connect(gain);
    osc.start(t);
    osc.stop(t + note.dur);
  }

  return {
    unlock() {
      if (ctx) {
        if (ctx.state === 'suspended') void ctx.resume();
        return;
      }
      const c = makeContext();
      const out = c.createGain();
      out.gain.value = 0.45;
      out.connect(c.destination);
      const buffer = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      ctx = c;
      master = out;
      noise = buffer;
    },
    play(name) {
      if (!ctx || !master || muted) return;
      const now = ctx.currentTime;
      const prev = last.get(name);
      if (prev !== undefined && now - prev < MIN_GAP) return;
      last.set(name, now);
      for (const note of SOUNDS[name]) voice(ctx, master, note, now + note.at);
    },
    setMusic(next, speed) {
      tempo = speed;
      if (next === track) return;
      track = next;
      beat = 0;
      nextBeat = 0;
    },
    tick() {
      if (!ctx || !master || muted || !track) return;
      const t = TRACKS[track];
      const step = 60 / (t.bpm * tempo) / 2;
      nextBeat = Math.max(nextBeat, ctx.currentTime);
      while (nextBeat < ctx.currentTime + LOOKAHEAD) {
        const i = beat % t.bass.length;
        if (t.bass[i]) voice(ctx, master, n('triangle', midi(t.bass[i]), midi(t.bass[i]), step * 0.9, 0.12), nextBeat);
        if (t.lead[i]) voice(ctx, master, n(t.leadWave, midi(t.lead[i]), midi(t.lead[i]), step * 0.6, t.leadVol), nextBeat);
        const drum = t.drums[i];
        if (drum !== '.') for (const note of DRUMS[drum]) voice(ctx, master, note, nextBeat);
        nextBeat += step;
        beat++;
      }
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.45;
      return muted;
    },
    isMuted() {
      return muted;
    },
  };
}
