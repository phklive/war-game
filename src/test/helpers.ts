import { ALIENS, DT, VIEW_W } from '../game/config';
import { createGame } from '../game/state';
import type { Alien, Game, InputState } from '../game/types';

export function idleInput(overrides: Partial<InputState> = {}): InputState {
  return { left: false, right: false, jump: false, down: false, fire: false, mouseX: VIEW_W / 2, mouseY: 100, pressed: [], clicks: [], ...overrides };
}

/** A fresh game already in the 'wave' phase with no spawns pending. */
export function waveGame(seed = 1): Game {
  const g = createGame(seed);
  g.phase = 'wave';
  g.wave = 1;
  return g;
}

/** Aim the mouse (screen coordinates) at an alien's center. */
export function aimAt(g: Game, a: Alien): Pick<InputState, 'mouseX' | 'mouseY'> {
  return { mouseX: a.x - g.camX, mouseY: a.y - ALIENS[a.type].h / 2 };
}

export const ticks = (seconds: number): number => Math.round(seconds / DT);
