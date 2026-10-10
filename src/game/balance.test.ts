import { describe, expect, it } from 'vitest';
import { idleInput } from '../test/helpers';
import { targetable } from './combat';
import { ALIENS, BASE_HALF_W, BASE_X, DT, GROUND_Y, ROOF_Y, WEAPON_ORDER } from './config';
import { buy, shopItems, type ShopId } from './shop';
import { createGame } from './state';
import type { Alien, Game, InputState } from './types';
import { step } from './update';

const MAX_TICKS = 60 * 60 * 30;
const BUY_ORDER: ShopId[] = ['turret', 'soldier', 'turretLevel', 'base', 'repair', 'armor'];

/** A sloppy human-like player: re-picks a target every half second and aims with some error. */
function makeBot(skill: number) {
  let next = 0;
  let aim = { x: 0, y: 0 };
  let moveTo = 0;
  let firing = false;
  let onRoof = false;
  return (g: Game): InputState => {
    const p = g.player;
    if (g.time >= next) {
      next = g.time + 0.5 - skill * 0.3;
      let best: Alien | null = null;
      let bestD = Infinity;
      for (const a of g.aliens) {
        const d = Math.abs(a.x - p.x) + Math.abs(a.y - p.y) / 2;
        if (targetable(a) && d < bestD) {
          bestD = d;
          best = a;
        }
      }
      const err = (1 - skill) * 40;
      firing = best !== null && bestD < 260;
      aim = best ? { x: best.x + (g.rng() - 0.5) * err, y: best.y - ALIENS[best.type].h / 2 + (g.rng() - 0.5) * err } : { x: p.x, y: 100 };
      const coin = g.coins.find((c) => Math.abs(c.x - p.x) < 120);
      // Aliens on the base roof can only be reached from the roof.
      onRoof = best !== null && best.y < ROOF_Y + 12 && Math.abs(best.x - BASE_X) < BASE_HALF_W + 10;
      moveTo = onRoof && best ? best.x : best && (p.weapon === 'knife' || bestD > 220) ? best.x : coin ? coin.x : p.x;
    }
    const jump = onRoof && p.onGround && p.y === GROUND_Y && Math.abs(p.x - BASE_X) < BASE_HALF_W + 20;
    return idleInput({ left: moveTo < p.x - 4, right: moveTo > p.x + 4, jump, down: !onRoof, fire: firing, mouseX: aim.x - g.camX, mouseY: aim.y });
  };
}

function play(seed: number, skill: number, shop: boolean): Game {
  const g = createGame(seed);
  const bot = makeBot(skill);
  step(g, idleInput({ pressed: ['Enter'] }), DT);
  for (let t = 0; t < MAX_TICKS && g.phase !== 'gameover' && g.phase !== 'victory'; t++) {
    if (g.phase !== 'shop') {
      step(g, bot(g), DT);
      continue;
    }
    if (shop) {
      for (let round = 0; round < 20; round++) {
        for (const id of BUY_ORDER) {
          const item = shopItems(g).find((i) => i.id === id);
          if (item && item.price !== null && g.money >= item.price) buy(g, item);
        }
      }
    }
    step(g, idleInput({ pressed: ['Enter'] }), DT);
  }
  return g;
}

describe('balance', () => {
  it('loses the first wave when nobody defends the base', () => {
    const g = createGame(1);
    step(g, idleInput({ pressed: ['Enter'] }), DT);
    for (let t = 0; t < MAX_TICKS && g.phase === 'wave'; t++) step(g, idleInput(), DT);
    expect(g.phase).toBe('gameover');
    expect(g.wave).toBe(1);
  });

  const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

  it('cannot be won by shooting alone, without upgrading the base', () => {
    for (const seed of SEEDS) expect(play(seed, 0.6, false).phase).toBe('gameover');
  });

  it('is usually winnable by a sloppy player who spends their coins', () => {
    const games = SEEDS.map((seed) => play(seed, 0.3, true));
    const wins = games.filter((g) => g.phase === 'victory');
    expect(wins.length).toBeGreaterThanOrEqual(5);
    expect(wins.length).toBeLessThan(SEEDS.length);
    for (const g of wins) expect(g.player.unlocked).toBe(WEAPON_ORDER.length - 1);
    // Losses come from the mid-to-late, boss-heavy waves, never the opening ones.
    for (const g of games) expect(g.wave).toBeGreaterThanOrEqual(4);
  });
});
