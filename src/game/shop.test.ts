import { describe, expect, it } from 'vitest';
import { idleInput } from '../test/helpers';
import { BASE_LEVELS, PLAYER_STATS, PRICES, TANK_STATS, TURRET, WAVES } from './config';
import {
  SHOP_PANEL,
  START_BUTTON,
  buy,
  handleShopInput,
  inRect,
  maxSoldiers,
  maxTurrets,
  shopItems,
  shopRow,
  type Rect,
  type ShopId,
  type ShopItem,
} from './shop';
import { baseMaxHp, createGame } from './state';
import type { Game, Point } from './types';

function shopGame(money = 1000): Game {
  const g = createGame(1);
  g.phase = 'shop';
  g.wave = 1;
  g.money = money;
  return g;
}

function item(g: Game, id: ShopId): ShopItem {
  const found = shopItems(g).find((i) => i.id === id);
  if (!found) throw new Error(`no shop item ${id}`);
  return found;
}

const center = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

describe('layout', () => {
  it('stacks rows inside the panel, above the start button', () => {
    expect(shopRow(0)).toEqual({ x: 60, y: 62, w: 360, h: 16 });
    expect(shopRow(1).y).toBe(80);
    const last = shopRow(shopItems(shopGame()).length - 1);
    expect(last.y + last.h).toBeLessThanOrEqual(START_BUTTON.y);
    expect(START_BUTTON.y + START_BUTTON.h).toBeLessThanOrEqual(SHOP_PANEL.y + SHOP_PANEL.h);
  });

  it('centers the start button at the bottom of the panel', () => {
    expect(START_BUTTON).toEqual({ x: 150, y: 232, w: 180, h: 18 });
    expect(center(START_BUTTON).x).toBe(center(SHOP_PANEL).x);
  });

  it('treats rects as inclusive at the top-left and exclusive at the bottom-right', () => {
    const r: Rect = { x: 10, y: 20, w: 5, h: 5 };
    expect(inRect({ x: 10, y: 20 }, r)).toBe(true);
    expect(inRect({ x: 14.9, y: 24.9 }, r)).toBe(true);
    expect(inRect({ x: 9.9, y: 22 }, r)).toBe(false);
    expect(inRect({ x: 15, y: 22 }, r)).toBe(false);
    expect(inRect({ x: 12, y: 19.9 }, r)).toBe(false);
    expect(inRect({ x: 12, y: 25 }, r)).toBe(false);
  });
});

describe('capacity', () => {
  it('grows turret and soldier capacity with the base level', () => {
    const g = shopGame();
    expect([maxTurrets(g), maxSoldiers(g)]).toEqual([2, 2]);
    g.base.level = 3;
    expect([maxTurrets(g), maxSoldiers(g)]).toEqual([4, 6]);
  });
});

describe('shopItems', () => {
  it('lists every upgrade with prices for a fresh game', () => {
    expect(shopItems(shopGame())).toEqual([
      { id: 'repair', label: 'REPAIR BASE', desc: '+30% BASE HP', price: null, note: 'FULL' },
      { id: 'base', label: 'FORTIFY BASE', desc: 'LV2: 450 HP 10% ARMOR', price: 150, note: 'MAX' },
      { id: 'turret', label: 'BUILD TURRET', desc: '0/2 SLOTS (FORTIFY=MORE)', price: 110, note: 'FULL' },
      { id: 'turretLevel', label: 'UPGRADE TURRETS', desc: 'LV1 OF 4 - MORE DMG/RANGE', price: null, note: 'NO TURRET' },
      { id: 'soldier', label: 'HIRE SOLDIER', desc: '0/2 SQUAD (FORTIFY=MORE)', price: 60, note: 'FULL' },
      { id: 'armor', label: 'BODY ARMOR', desc: '+25 MAX HP (0/3)', price: 70, note: 'MAX' },
      { id: 'magnet', label: 'COIN MAGNET', desc: 'GRAB COINS FROM AFAR (0/3)', price: 50, note: 'MAX' },
    ]);
  });

  it('offers repairs once the base is damaged', () => {
    const g = shopGame();
    g.base.hp -= 1;
    expect(item(g, 'repair').price).toBe(PRICES.repair);
  });

  it('describes the next fortification level and stops at the last one', () => {
    const g = shopGame();
    g.base.level = 3;
    expect(item(g, 'base')).toMatchObject({ desc: 'LV4: 900 HP 30% ARMOR', price: PRICES.base[2] });
    g.base.level = BASE_LEVELS.length;
    expect(item(g, 'base')).toMatchObject({ desc: 'FORTRESS COMPLETE', price: null, note: 'MAX' });
  });

  it('prices turrets by count and stops when the slots are full', () => {
    const g = shopGame();
    g.turrets.push({ slot: 0, cd: 0, aim: 0, recoil: 0 });
    expect(item(g, 'turret')).toMatchObject({ desc: '1/2 SLOTS (FORTIFY=MORE)', price: PRICES.turret(1) });
    g.turrets.push({ slot: 1, cd: 0, aim: 0, recoil: 0 });
    expect(item(g, 'turret').price).toBeNull();
  });

  it('offers turret upgrades once a turret exists, up to the max level', () => {
    const g = shopGame();
    g.turrets.push({ slot: 0, cd: 0, aim: 0, recoil: 0 });
    g.base.turretLevel = 2;
    expect(item(g, 'turretLevel')).toMatchObject({ price: PRICES.turretLevel[1], desc: 'LV2 OF 4 - MORE DMG/RANGE' });
    g.base.turretLevel = TURRET.maxLevel;
    expect(item(g, 'turretLevel')).toMatchObject({ price: null, note: 'MAX' });
  });

  it('stops hiring when the squad is full', () => {
    const g = shopGame();
    buy(g, item(g, 'soldier'));
    expect(item(g, 'soldier')).toMatchObject({ desc: '1/2 SQUAD (FORTIFY=MORE)', price: PRICES.soldier(1) });
    buy(g, item(g, 'soldier'));
    expect(item(g, 'soldier').price).toBeNull();
  });

  it('prices armor and magnet by level and caps them', () => {
    const g = shopGame();
    g.player.armorLevel = 1;
    g.player.magnetLevel = 2;
    expect(item(g, 'armor').price).toBe(PRICES.armor[1]);
    expect(item(g, 'magnet').price).toBe(PRICES.magnet[2]);
    g.player.armorLevel = 3;
    g.player.magnetLevel = 3;
    expect(item(g, 'armor')).toMatchObject({ price: null, desc: '+25 MAX HP (3/3)' });
    expect(item(g, 'magnet')).toMatchObject({ price: null, desc: 'GRAB COINS FROM AFAR (3/3)' });
  });
});

describe('buy', () => {
  it('denies items that are unavailable', () => {
    const g = shopGame();
    expect(buy(g, item(g, 'repair'))).toBe(false);
    expect(g.money).toBe(1000);
    expect(g.sfx).toEqual(['deny']);
  });

  it('denies items the player cannot afford', () => {
    const g = shopGame(PRICES.armor[0] - 1);
    expect(buy(g, item(g, 'armor'))).toBe(false);
    expect(g.money).toBe(PRICES.armor[0] - 1);
    expect(g.player.armorLevel).toBe(0);
    expect(g.sfx).toEqual(['deny']);
  });

  it('repairs a share of the base, capped at max hp', () => {
    const g = shopGame();
    const max = baseMaxHp(1);
    g.base.hp = 100;
    expect(buy(g, item(g, 'repair'))).toBe(true);
    expect(g.base.hp).toBeCloseTo(100 + max * PRICES.repairFraction);
    expect(g.money).toBe(1000 - PRICES.repair);
    expect(g.sfx).toEqual(['buy']);
    g.base.hp = max - 10;
    buy(g, item(g, 'repair'));
    expect(g.base.hp).toBe(max);
  });

  it('fortifies the base, keeping its damage', () => {
    const g = shopGame();
    g.base.hp = 200;
    buy(g, item(g, 'base'));
    expect(g.base.level).toBe(2);
    expect(g.base.hp).toBe(200 + BASE_LEVELS[1].hp - BASE_LEVELS[0].hp);
    expect(g.money).toBe(1000 - PRICES.base[0]);
  });

  it('builds turrets in successive slots, facing outward', () => {
    const g = shopGame();
    buy(g, item(g, 'turret'));
    buy(g, item(g, 'turret'));
    expect(g.turrets).toEqual([
      { slot: 0, cd: 0, aim: Math.PI, recoil: 0 },
      { slot: 1, cd: 0, aim: 0, recoil: 0 },
    ]);
    expect(g.money).toBe(1000 - PRICES.turret(0) - PRICES.turret(1));
  });

  it('upgrades turrets', () => {
    const g = shopGame();
    buy(g, item(g, 'turret'));
    buy(g, item(g, 'turretLevel'));
    expect(g.base.turretLevel).toBe(2);
  });

  it('hires a soldier', () => {
    const g = shopGame();
    buy(g, item(g, 'soldier'));
    expect(g.soldiers).toHaveLength(1);
    expect(g.money).toBe(1000 - PRICES.soldier(0));
  });

  it('adds armor and its hp to the player', () => {
    const g = shopGame();
    buy(g, item(g, 'armor'));
    expect(g.player.armorLevel).toBe(1);
    expect(g.player.hp).toBe(PLAYER_STATS.hp + PLAYER_STATS.armorHp);
  });

  it('adds double armor hp to a tank', () => {
    const g = shopGame();
    g.player.weapon = 'tank';
    g.player.hp = 200;
    buy(g, item(g, 'armor'));
    expect(g.player.hp).toBe(200 + PLAYER_STATS.armorHp * TANK_STATS.hpMul);
  });

  it('upgrades the coin magnet', () => {
    const g = shopGame();
    buy(g, item(g, 'magnet'));
    expect(g.player.magnetLevel).toBe(1);
    expect(g.money).toBe(1000 - PRICES.magnet[0]);
  });
});

describe('handleShopInput', () => {
  it('buys items with the number keys and ignores other keys', () => {
    const g = shopGame();
    handleShopInput(g, idleInput({ pressed: ['Digit6', 'KeyA', 'Digit8', 'Digit7'] }));
    expect(g.player.armorLevel).toBe(1);
    expect(g.player.magnetLevel).toBe(1);
    expect(g.money).toBe(1000 - PRICES.armor[0] - PRICES.magnet[0]);
    expect(g.phase).toBe('shop');
  });

  it('starts the next wave on Enter and ignores the rest of the input', () => {
    const g = shopGame();
    handleShopInput(g, idleInput({ pressed: ['Enter', 'Digit6'], clicks: [center(shopRow(6))] }));
    expect(g.phase).toBe('wave');
    expect(g.wave).toBe(2);
    expect(g.spawnQueue).toHaveLength(Object.values(WAVES[1].horde).reduce((n: number, c) => n + (c ?? 0), 0));
    expect(g.pendingBoss).toMatchObject({ type: WAVES[1].boss, announced: false });
    expect(g.player.armorLevel).toBe(0);
    expect(g.player.magnetLevel).toBe(0);
  });

  it('buys the clicked row and ignores clicks elsewhere', () => {
    const g = shopGame();
    const last = shopRow(shopItems(g).length - 1);
    const gap: Point = { x: center(START_BUTTON).x, y: (last.y + last.h + START_BUTTON.y) / 2 };
    handleShopInput(g, idleInput({ clicks: [{ x: 5, y: 5 }, gap, center(shopRow(4))] }));
    expect(g.soldiers).toHaveLength(1);
    expect(g.money).toBe(1000 - PRICES.soldier(0));
    expect(g.phase).toBe('shop');
  });

  it('starts the next wave from the start button and ignores later clicks', () => {
    const g = shopGame();
    handleShopInput(g, idleInput({ clicks: [center(START_BUTTON), center(shopRow(4))] }));
    expect(g.phase).toBe('wave');
    expect(g.wave).toBe(2);
    expect(g.soldiers).toHaveLength(0);
  });
});
