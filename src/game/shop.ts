import { BASE_LEVELS, PLAYER_STATS, PRICES, TANK_STATS, TURRET, TURRET_SLOTS } from './config';
import { sfx } from './effects';
import { baseMaxHp, createSoldier } from './state';
import type { Game, InputState, Point } from './types';
import { startWave } from './waves';

export type ShopId = 'repair' | 'base' | 'turret' | 'turretLevel' | 'soldier' | 'armor' | 'magnet';

export interface ShopItem {
  id: ShopId;
  label: string;
  desc: string;
  /** null when the item cannot be bought right now; `note` explains why. */
  price: number | null;
  note: string;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const SHOP_PANEL: Rect = { x: 50, y: 18, w: 380, h: 236 };
export const START_BUTTON: Rect = { x: 150, y: 232, w: 180, h: 18 };
export const shopRow = (i: number): Rect => ({ x: 60, y: 62 + i * 18, w: 360, h: 16 });

export const inRect = (pt: Point, r: Rect): boolean => pt.x >= r.x && pt.x < r.x + r.w && pt.y >= r.y && pt.y < r.y + r.h;

const MAX_ARMOR = PRICES.armor.length;
const MAX_MAGNET = PRICES.magnet.length;

export const maxTurrets = (g: Game): number => g.base.level + 1;
export const maxSoldiers = (g: Game): number => g.base.level * 2;

export function shopItems(g: Game): ShopItem[] {
  const b = g.base;
  const p = g.player;
  const nextBase = BASE_LEVELS[b.level];
  return [
    {
      id: 'repair',
      label: 'REPAIR BASE',
      desc: `+${PRICES.repairFraction * 100}% BASE HP`,
      price: b.hp < baseMaxHp(b.level) ? PRICES.repair : null,
      note: 'FULL',
    },
    {
      id: 'base',
      label: 'FORTIFY BASE',
      desc: nextBase ? `LV${b.level + 1}: ${nextBase.hp} HP ${nextBase.armor * 100}% ARMOR` : 'FORTRESS COMPLETE',
      price: nextBase ? PRICES.base[b.level - 1] : null,
      note: 'MAX',
    },
    {
      id: 'turret',
      label: 'BUILD TURRET',
      desc: `${g.turrets.length}/${maxTurrets(g)} SLOTS (FORTIFY=MORE)`,
      price: g.turrets.length < maxTurrets(g) ? PRICES.turret(g.turrets.length) : null,
      note: 'FULL',
    },
    {
      id: 'turretLevel',
      label: 'UPGRADE TURRETS',
      desc: `LV${b.turretLevel} OF ${TURRET.maxLevel} - MORE DMG/RANGE`,
      price: g.turrets.length > 0 && b.turretLevel < TURRET.maxLevel ? PRICES.turretLevel[b.turretLevel - 1] : null,
      note: g.turrets.length === 0 ? 'NO TURRET' : 'MAX',
    },
    {
      id: 'soldier',
      label: 'HIRE SOLDIER',
      desc: `${g.soldiers.length}/${maxSoldiers(g)} SQUAD (FORTIFY=MORE)`,
      price: g.soldiers.length < maxSoldiers(g) ? PRICES.soldier(g.soldiers.length) : null,
      note: 'FULL',
    },
    {
      id: 'armor',
      label: 'BODY ARMOR',
      desc: `+${PLAYER_STATS.armorHp} MAX HP (${p.armorLevel}/${MAX_ARMOR})`,
      price: p.armorLevel < MAX_ARMOR ? PRICES.armor[p.armorLevel] : null,
      note: 'MAX',
    },
    {
      id: 'magnet',
      label: 'COIN MAGNET',
      desc: `GRAB COINS FROM AFAR (${p.magnetLevel}/${MAX_MAGNET})`,
      price: p.magnetLevel < MAX_MAGNET ? PRICES.magnet[p.magnetLevel] : null,
      note: 'MAX',
    },
  ];
}

export function buy(g: Game, item: ShopItem): boolean {
  if (item.price === null || g.money < item.price) {
    sfx(g, 'deny');
    return false;
  }
  g.money -= item.price;
  const b = g.base;
  const p = g.player;
  switch (item.id) {
    case 'repair':
      b.hp = Math.min(baseMaxHp(b.level), b.hp + baseMaxHp(b.level) * PRICES.repairFraction);
      break;
    case 'base':
      b.hp += baseMaxHp(b.level + 1) - baseMaxHp(b.level);
      b.level++;
      break;
    case 'turret':
      g.turrets.push({ slot: g.turrets.length, cd: 0, aim: TURRET_SLOTS[g.turrets.length] < 0 ? Math.PI : 0, recoil: 0 });
      break;
    case 'turretLevel':
      b.turretLevel++;
      break;
    case 'soldier':
      createSoldier(g);
      break;
    case 'armor':
      p.armorLevel++;
      p.hp += PLAYER_STATS.armorHp * (p.weapon === 'tank' ? TANK_STATS.hpMul : 1);
      break;
    case 'magnet':
      p.magnetLevel++;
      break;
  }
  sfx(g, 'buy');
  return true;
}

export function handleShopInput(g: Game, input: InputState): void {
  for (const key of input.pressed) {
    const n = /^Digit([1-7])$/.exec(key);
    if (n) buy(g, shopItems(g)[Number(n[1]) - 1]);
    else if (key === 'Enter') return startWave(g, g.wave + 1);
  }
  for (const click of input.clicks) {
    const items = shopItems(g);
    const row = items.findIndex((_, i) => inRect(click, shopRow(i)));
    if (row >= 0) buy(g, items[row]);
    else if (inRect(click, START_BUTTON)) return startWave(g, g.wave + 1);
  }
}
