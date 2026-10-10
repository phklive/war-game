import { createAudio, type Audio, type TrackId } from './audio';
import { ALIENS, DT, VIEW_H, VIEW_W } from './game/config';
import { createGame } from './game/state';
import type { Game } from './game/types';
import { step } from './game/update';
import { Input } from './input';
import { render } from './render/render';
import { buildSprites } from './render/sprites';

export interface BootOptions {
  doc: Document;
  win: Window;
  makeAudioContext: () => AudioContext;
  seed: number;
}

export interface Running {
  game: Game;
  input: Input;
  audio: Audio;
  frame: (now: number) => void;
}

const MAX_FRAME = 0.1;

const BATTLE_TRACKS: readonly TrackId[] = ['battle1', 'battle2', 'battle3'];

/** Which music fits the moment: menus, a battle track that speeds up each wave, or the boss theme. */
export function musicFor(g: Game): { track: TrackId | null; tempo: number } {
  switch (g.phase) {
    case 'title':
      return { track: 'title', tempo: 1 };
    case 'shop':
      return { track: 'shop', tempo: 1 };
    case 'wave':
    case 'clear': {
      const bossFight = g.pendingBoss?.announced || g.aliens.some((a) => a.hp > 0 && ALIENS[a.type].boss);
      if (bossFight) return { track: 'boss', tempo: 1 };
      return { track: BATTLE_TRACKS[(g.wave - 1) % BATTLE_TRACKS.length], tempo: 1 + 0.03 * (g.wave - 1) };
    }
    default:
      return { track: null, tempo: 1 };
  }
}

export function fitScale(width: number, height: number): number {
  return Math.min(width / VIEW_W, height / VIEW_H);
}

export function boot({ doc, win, makeAudioContext, seed }: BootOptions): Running {
  const canvas = doc.querySelector<HTMLCanvasElement>('#game');
  if (!canvas) throw new Error('Missing <canvas id="game"> element');
  canvas.width = VIEW_W;
  canvas.height = VIEW_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D rendering is not supported in this browser');

  const sprites = buildSprites((w, h) => {
    const c = doc.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  });
  const input = new Input(canvas, win);
  const audio = createAudio(makeAudioContext);
  const game = createGame(seed);

  const fit = (): void => {
    const s = fitScale(win.innerWidth, win.innerHeight);
    canvas.style.width = `${VIEW_W * s}px`;
    canvas.style.height = `${VIEW_H * s}px`;
  };
  fit();
  win.addEventListener('resize', fit);
  win.addEventListener('pointerdown', () => audio.unlock());
  win.addEventListener('keydown', () => audio.unlock());

  let last: number | null = null;
  let acc = 0;
  const frame = (now: number): void => {
    acc += last === null ? DT : Math.min(MAX_FRAME, (now - last) / 1000);
    last = now;
    if (acc >= DT) {
      let snap = input.snapshot();
      if (snap.pressed.includes('KeyM')) audio.toggleMute();
      while (acc >= DT) {
        step(game, snap, DT);
        snap = { ...snap, pressed: [], clicks: [] };
        acc -= DT;
      }
    }
    for (const name of game.sfx) audio.play(name);
    game.sfx.length = 0;
    const music = musicFor(game);
    audio.setMusic(music.track, music.tempo);
    audio.tick();
    render(ctx, game, sprites, { mouseX: input.mouseX, mouseY: input.mouseY, muted: audio.isMuted() });
    win.requestAnimationFrame(frame);
  };
  win.requestAnimationFrame(frame);
  return { game, input, audio, frame };
}
