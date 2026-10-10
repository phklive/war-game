import { describe, expect, it } from 'vitest';
import { idleInput, waveGame } from '../test/helpers';
import { BASE_HALF_W, BASE_X, DT, GRAVITY, GROUND_Y, PLAYER_STATS, ROOF_Y, TANK_STATS, WEAPONS, WEAPON_ORDER, WORLD_W, type WeaponId } from './config';
import { DUST, SPARK } from './effects';
import { respawnPlayer, updatePlayer } from './player';
import { createAlien } from './state';
import type { Game, InputState } from './types';

function standOnGround(g: Game, x: number): void {
  const p = g.player;
  p.x = x;
  p.y = GROUND_Y;
  p.vy = 0;
  p.onGround = true;
}

describe('respawnPlayer', () => {
  it('revives the player on the roof with full health and spawn protection', () => {
    const g = waveGame();
    const p = g.player;
    Object.assign(p, { alive: false, hp: 0, x: 100, y: GROUND_Y, vy: 50, onGround: false, armorLevel: 2 });
    respawnPlayer(g);
    expect(p).toMatchObject({ alive: true, hp: PLAYER_STATS.hp + 2 * PLAYER_STATS.armorHp, x: BASE_X, y: ROOF_Y, vy: 0, onGround: true, invuln: 2 });
    expect(g.particles).toHaveLength(16);
    expect(g.particles.every((pt) => SPARK.includes(pt.color))).toBe(true);
  });

  it('respawns a tank with doubled health', () => {
    const g = waveGame();
    g.player.weapon = 'tank';
    g.player.armorLevel = 1;
    respawnPlayer(g);
    expect(g.player.hp).toBe((PLAYER_STATS.hp + PLAYER_STATS.armorHp) * TANK_STATS.hpMul);
  });
});

describe('updatePlayer', () => {
  it('counts down the respawn timer while dead, ignoring input', () => {
    const g = waveGame();
    const p = g.player;
    Object.assign(p, { alive: false, respawn: 1, x: 100, y: GROUND_Y });
    updatePlayer(g, idleInput({ right: true, fire: true }), 0.5);
    expect(p.alive).toBe(false);
    expect(p.respawn).toBe(0.5);
    expect(p.x).toBe(100);
    expect(g.sfx).toEqual([]);

    updatePlayer(g, idleInput({ right: true }), 0.5);
    expect(p.alive).toBe(true);
    expect(p.x).toBe(BASE_X);
    expect(p.y).toBe(ROOF_Y);
  });

  it('decays its timers each tick', () => {
    const g = waveGame();
    const p = g.player;
    Object.assign(p, { cooldown: 1, invuln: 0.05, hurt: 0.5, muzzle: 0.05, swing: 0.5, slow: 0.5 });
    updatePlayer(g, idleInput(), 0.1);
    expect(p.cooldown).toBeCloseTo(0.9);
    expect(p.invuln).toBe(0);
    expect(p.hurt).toBeCloseTo(0.4);
    expect(p.muzzle).toBe(0);
    expect(p.swing).toBeCloseTo(0.4);
    expect(p.slow).toBeCloseTo(0.4);
    updatePlayer(g, idleInput(), 0.5);
    expect(p.slow).toBe(0);
  });

  it('walks at half speed while slowed by a web, until it wears off', () => {
    const g = waveGame();
    const p = g.player;
    p.slow = 1;
    updatePlayer(g, idleInput({ right: true }), DT);
    expect(p.vx).toBe(PLAYER_STATS.speed / 2);
    expect(p.x).toBeCloseTo(BASE_X + (PLAYER_STATS.speed / 2) * DT);

    p.slow = DT / 2;
    updatePlayer(g, idleInput({ left: true }), DT);
    expect(p.slow).toBe(0);
    expect(p.vx).toBe(-PLAYER_STATS.speed);
  });

  it('stands still on the roof when idle', () => {
    const g = waveGame();
    updatePlayer(g, idleInput(), DT);
    expect(g.player).toMatchObject({ x: BASE_X, y: ROOF_Y, vx: 0, vy: 0, onGround: true, anim: 0 });
  });

  it('walks right and left at player speed, animating', () => {
    const g = waveGame();
    const p = g.player;
    updatePlayer(g, idleInput({ right: true }), DT);
    expect(p.vx).toBe(PLAYER_STATS.speed);
    expect(p.x).toBeCloseTo(BASE_X + PLAYER_STATS.speed * DT);
    expect(p.anim).toBeCloseTo(DT);
    expect(p.y).toBe(ROOF_Y);

    updatePlayer(g, idleInput({ left: true }), DT);
    expect(p.vx).toBe(-PLAYER_STATS.speed);
    expect(p.x).toBeCloseTo(BASE_X);
    expect(p.anim).toBeCloseTo(2 * DT);
  });

  it('does not move or animate with both directions held', () => {
    const g = waveGame();
    updatePlayer(g, idleInput({ left: true, right: true }), DT);
    expect(g.player.vx).toBe(0);
    expect(g.player.x).toBe(BASE_X);
    expect(g.player.anim).toBe(0);
  });

  it('jumps from the ground with dust and a sound', () => {
    const g = waveGame();
    const p = g.player;
    updatePlayer(g, idleInput({ jump: true }), DT);
    expect(p.vy).toBeCloseTo(-PLAYER_STATS.jump + GRAVITY * DT);
    expect(p.y).toBeLessThan(ROOF_Y);
    expect(p.onGround).toBe(false);
    expect(g.sfx).toEqual(['jump']);
    expect(g.particles).toHaveLength(4);
    expect(g.particles.every((pt) => DUST.includes(pt.color))).toBe(true);
  });

  it('cannot jump again while airborne', () => {
    const g = waveGame();
    const p = g.player;
    Object.assign(p, { y: 150, vy: 0, onGround: false });
    updatePlayer(g, idleInput({ jump: true }), DT);
    expect(p.vy).toBeCloseTo(GRAVITY * DT);
    expect(g.sfx).toEqual([]);
  });

  it('drops through the roof while holding down and lands on the ground', () => {
    const g = waveGame();
    const p = g.player;
    updatePlayer(g, idleInput({ down: true }), DT);
    expect(p.y).toBeGreaterThan(ROOF_Y);
    expect(p.onGround).toBe(false);
    for (let i = 0; i < 120 && !p.onGround; i++) updatePlayer(g, idleInput({ down: true }), DT);
    expect(p.onGround).toBe(true);
    expect(p.y).toBe(GROUND_Y);
    expect(p.vy).toBe(0);
  });

  it('falls off the edge of the roof', () => {
    const g = waveGame();
    const p = g.player;
    p.x = BASE_X + BASE_HALF_W + 1;
    updatePlayer(g, idleInput(), DT);
    expect(p.y).toBeGreaterThan(ROOF_Y);
    expect(p.onGround).toBe(false);
  });

  it('does not snap up onto the roof when already below it', () => {
    const g = waveGame();
    const p = g.player;
    Object.assign(p, { y: 210, vy: 0, onGround: false });
    updatePlayer(g, idleInput(), DT);
    expect(p.y).toBeCloseTo(210 + GRAVITY * DT * DT);
    expect(p.onGround).toBe(false);
  });

  it('stays airborne while still above the roof', () => {
    const g = waveGame();
    const p = g.player;
    Object.assign(p, { y: 150, vy: 0, onGround: false });
    updatePlayer(g, idleInput(), DT);
    expect(p.y).toBeCloseTo(150 + GRAVITY * DT * DT);
    expect(p.onGround).toBe(false);
  });

  it('lands on the roof when falling onto it', () => {
    const g = waveGame();
    const p = g.player;
    Object.assign(p, { y: ROOF_Y - 1, vy: 120, onGround: false });
    updatePlayer(g, idleInput(), DT);
    expect(p.y).toBe(ROOF_Y);
    expect(p.vy).toBe(0);
    expect(p.onGround).toBe(true);
  });

  it('stands on the ground away from the base', () => {
    const g = waveGame();
    standOnGround(g, 300);
    updatePlayer(g, idleInput(), DT);
    expect(g.player).toMatchObject({ x: 300, y: GROUND_Y, vy: 0, onGround: true });
  });

  it('is kept inside the world', () => {
    const g = waveGame();
    standOnGround(g, 3);
    updatePlayer(g, idleInput({ left: true }), DT);
    expect(g.player.x).toBe(PLAYER_STATS.w / 2);

    standOnGround(g, WORLD_W - 3);
    updatePlayer(g, idleInput({ right: true }), DT);
    expect(g.player.x).toBe(WORLD_W - PLAYER_STATS.w / 2);
  });

  it('aims at the mouse in world space and faces it', () => {
    const g = waveGame();
    const p = g.player;
    updatePlayer(g, idleInput({ mouseX: BASE_X - g.camX, mouseY: 100 }), DT);
    expect(p.aim).toBeCloseTo(Math.atan2(100 - (ROOF_Y - 9), 0));
    expect(p.facing).toBe(1);

    updatePlayer(g, idleInput({ mouseX: 100, mouseY: 100 }), DT);
    expect(p.aim).toBeCloseTo(Math.atan2(100 - (ROOF_Y - 9), g.camX + 100 - BASE_X));
    expect(p.facing).toBe(-1);
  });

  it('fires when the trigger is held and the weapon is ready', () => {
    const g = waveGame();
    const p = g.player;
    updatePlayer(g, idleInput({ fire: true }), DT);
    expect(g.sfx).toEqual(['knife']);
    expect(p.cooldown).toBe(WEAPONS.knife.cooldown);

    updatePlayer(g, idleInput({ fire: true }), DT);
    expect(g.sfx).toEqual(['knife']);
    expect(p.cooldown).toBeCloseTo(WEAPONS.knife.cooldown - DT);
  });

  it('does not fire without the trigger', () => {
    const g = waveGame();
    updatePlayer(g, idleInput(), DT);
    expect(g.sfx).toEqual([]);
    expect(g.player.swing).toBe(0);
  });

  describe('as a tank', () => {
    function tankGame(): Game {
      const g = waveGame();
      g.player.weapon = 'tank';
      return g;
    }

    it('crawls at half speed when webbed', () => {
      const g = tankGame();
      g.player.slow = 1;
      updatePlayer(g, idleInput({ left: true }), DT);
      expect(g.player.vx).toBe(-TANK_STATS.speed / 2);
    });

    it('drives slower and jumps lower', () => {
      const g = tankGame();
      const p = g.player;
      updatePlayer(g, idleInput({ right: true, jump: true }), DT);
      expect(p.vx).toBe(TANK_STATS.speed);
      expect(p.x).toBeCloseTo(BASE_X + TANK_STATS.speed * DT);
      expect(p.vy).toBeCloseTo(-TANK_STATS.jump + GRAVITY * DT);
    });

    it('aims from a higher turret', () => {
      const g = tankGame();
      updatePlayer(g, idleInput({ mouseX: BASE_X - g.camX + 50, mouseY: 100 }), DT);
      expect(g.player.aim).toBeCloseTo(Math.atan2(100 - (ROOF_Y - 10), 50));
    });

    it('is kept inside the world by its wider hull', () => {
      const g = tankGame();
      standOnGround(g, WORLD_W - 3);
      updatePlayer(g, idleInput({ right: true }), DT);
      expect(g.player.x).toBe(WORLD_W - TANK_STATS.w / 2);
    });

    it('crushes living ground aliens under its tracks, pushing them away', () => {
      const g = tankGame();
      standOnGround(g, 300);
      const right = createAlien(g, 'grunt', 310, GROUND_Y, 'active');
      const left = createAlien(g, 'grunt', 290, GROUND_Y, 'active');
      const flyer = createAlien(g, 'flyer', 300, GROUND_Y, 'active');
      const dead = createAlien(g, 'grunt', 305, GROUND_Y, 'active');
      dead.hp = 0;
      const burrowed = createAlien(g, 'worm', 300, GROUND_Y, 'active');
      burrowed.burrowed = true;
      const far = createAlien(g, 'grunt', 500, GROUND_Y, 'active');
      updatePlayer(g, idleInput(), 0.1);
      expect(right.hp).toBeCloseTo(right.maxHp - TANK_STATS.crushDps * 0.1);
      expect(right.kx).toBe(60);
      expect(left.hp).toBeCloseTo(left.maxHp - TANK_STATS.crushDps * 0.1);
      expect(left.kx).toBe(-60);
      expect(flyer.hp).toBe(flyer.maxHp);
      expect(dead.hp).toBe(0);
      expect(dead.kx).toBe(0);
      expect(burrowed.hp).toBe(burrowed.maxHp);
      expect(burrowed.kx).toBe(0);
      expect(far.hp).toBe(far.maxHp);
    });

    it('scores crush kills for the player', () => {
      const g = tankGame();
      standOnGround(g, 300);
      const a = createAlien(g, 'grunt', 305, GROUND_Y, 'active');
      a.hp = 0.1;
      updatePlayer(g, idleInput(), 0.1);
      expect(a.hp).toBe(0);
      expect(g.player.kills).toBe(1);
      expect(g.sfx).toContain('alienDie');
    });
  });

  it('does not crush aliens on foot', () => {
    const g = waveGame();
    standOnGround(g, 300);
    const a = createAlien(g, 'grunt', 302, GROUND_Y, 'active');
    updatePlayer(g, idleInput(), 0.1);
    expect(a.hp).toBe(a.maxHp);
  });

  describe('weapon switching', () => {
    /** A player who has unlocked weapons up to `unlocked`, currently holding `weapon`. */
    function armed(unlocked: number, weapon: WeaponId): Game {
      const g = waveGame();
      g.player.unlocked = unlocked;
      g.player.weapon = weapon;
      return g;
    }

    const press = (...pressed: string[]): InputState => idleInput({ pressed });

    it('picks an unlocked weapon with its number key, with a short swap delay', () => {
      const g = armed(3, 'knife');
      updatePlayer(g, idleInput({ pressed: ['Digit3'], fire: true }), DT);
      expect(g.player.weapon).toBe('water');
      expect(g.player.cooldown).toBeGreaterThan(0);
      expect(g.sfx).toEqual(['swap']);

      updatePlayer(g, press('Digit1'), DT);
      expect(g.player.weapon).toBe('knife');
      updatePlayer(g, press('Digit4'), DT);
      expect(g.player.weapon).toBe('bubble');
      expect(g.sfx).toEqual(['swap', 'swap', 'swap']);
    });

    it('maps Digit1-8 onto the weapon order', () => {
      const g = armed(WEAPON_ORDER.length - 1, 'knife');
      WEAPON_ORDER.forEach((id, i) => {
        updatePlayer(g, press(`Digit${i + 1}`), DT);
        expect(g.player.weapon).toBe(id);
      });
    });

    it('ignores number keys for weapons not yet unlocked', () => {
      const g = armed(2, 'pistol');
      updatePlayer(g, press('Digit4', 'Digit8'), DT);
      expect(g.player.weapon).toBe('pistol');
      expect(g.sfx).toEqual([]);
    });

    it('does nothing when re-selecting the weapon in hand', () => {
      const g = armed(2, 'pistol');
      updatePlayer(g, press('Digit2'), DT);
      expect(g.player.weapon).toBe('pistol');
      expect(g.sfx).toEqual([]);
    });

    it('ignores keys that are not weapon controls', () => {
      const g = armed(7, 'pistol');
      updatePlayer(g, press('KeyA', 'Digit0', 'Digit9', 'Space', 'Numpad3'), DT);
      expect(g.player.weapon).toBe('pistol');
      expect(g.sfx).toEqual([]);
    });

    it.each(['KeyE', 'WheelDown'])('cycles forward through unlocked weapons with %s, wrapping to the knife', (key) => {
      const g = armed(2, 'pistol');
      updatePlayer(g, press(key), DT);
      expect(g.player.weapon).toBe('water');
      updatePlayer(g, press(key), DT);
      expect(g.player.weapon).toBe('knife');
      expect(g.sfx).toEqual(['swap', 'swap']);
    });

    it.each(['KeyQ', 'WheelUp'])('cycles backward through unlocked weapons with %s, wrapping to the best one', (key) => {
      const g = armed(2, 'pistol');
      updatePlayer(g, press(key), DT);
      expect(g.player.weapon).toBe('knife');
      updatePlayer(g, press(key), DT);
      expect(g.player.weapon).toBe('water');
      expect(g.sfx).toEqual(['swap', 'swap']);
    });

    it('stays on the knife when cycling with nothing else unlocked', () => {
      const g = armed(0, 'knife');
      updatePlayer(g, press('KeyE', 'KeyQ', 'WheelDown', 'WheelUp'), DT);
      expect(g.player.weapon).toBe('knife');
      expect(g.sfx).toEqual([]);
    });

    it('applies several presses in one frame in order', () => {
      const g = armed(4, 'knife');
      updatePlayer(g, press('KeyE', 'KeyE', 'KeyQ', 'Digit5', 'WheelDown'), DT);
      expect(g.player.weapon).toBe('knife');
      expect(g.sfx).toEqual(['swap', 'swap', 'swap', 'swap', 'swap']);
    });

    it('switches before moving, so the tank drives on the same frame with its health doubled', () => {
      const g = armed(7, 'knife');
      const p = g.player;
      p.hp = PLAYER_STATS.hp / 2;
      updatePlayer(g, idleInput({ pressed: ['Digit8'], right: true }), DT);
      expect(p.weapon).toBe('tank');
      expect(p.hp).toBe(TANK_STATS.hpMul * PLAYER_STATS.hp / 2);
      expect(p.vx).toBe(TANK_STATS.speed);

      updatePlayer(g, press('KeyQ'), DT);
      expect(p.weapon).toBe('laser');
      expect(p.hp).toBe(PLAYER_STATS.hp / 2);
    });

    it('ignores weapon keys while dead', () => {
      const g = armed(3, 'knife');
      Object.assign(g.player, { alive: false, respawn: 5 });
      updatePlayer(g, press('Digit2', 'KeyE'), DT);
      expect(g.player.weapon).toBe('knife');
      expect(g.sfx).toEqual([]);
    });
  });
});
