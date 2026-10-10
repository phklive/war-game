import { ALIENS, ALIEN_ORDER, GROUND_Y, VIEW_H, VIEW_W, WORLD_W, type AlienType } from '../game/config';
import { mulberry32 } from '../game/rng';

export type MakeCanvas = (w: number, h: number) => HTMLCanvasElement;
export type Art = readonly string[];
export type Palette = Readonly<Record<string, string>>;

export interface Sprite {
  canvas: HTMLCanvasElement;
  w: number;
  h: number;
  /** Grip point for held weapons (the 's' hand pixel), otherwise the sprite center. */
  px: number;
  py: number;
}

export interface Sprites {
  get(name: string): Sprite;
}

export const PARALLAX_FAR = 0.25;
export const PARALLAX_NEAR = 0.5;
export const GROUND_TOP = GROUND_Y - 3;

// ---------------------------------------------------------------- art

const SOLDIER_TOP: Art = [
  '...kkkk...',
  '..khchhk..',
  '.khhgchhk.',
  '.kHHHHHHHk',
  '..kssesk..',
  '..kSsssk..',
  '...kSSk...',
  '.kcgbcgck.',
  '.kgcbtgck.',
  '.kctgcbgk.',
  '..kllllk..',
];

const SOLDIER_LEGS: Record<string, Art> = {
  idle: ['..kgckbck.', '..kcgkgck.', '..kbckcgk.', '..kBBkBBk.', '..kkk.kkk.'],
  run1: ['..kgcbck..', '.kcgkkgck.', '.kbck.kcgk', 'kBBk..kBBk', 'kkk....kkk'],
  run2: ['..kgcbck..', '...kcgk...', '...kbck...', '..kBBBk...', '..kkkkk...'],
  jump: ['..kgcbck..', '..kcgkgck.', '..kBBkBBk.', '..kkk.kkk.', '..........'],
};

const PLAYER_PAL: Palette = {
  k: '#1b1f16',
  h: '#4f6b34',
  H: '#34482a',
  c: '#6f7d3c',
  g: '#4a5e2b',
  b: '#5e4528',
  t: '#a59a68',
  s: '#e8b48a',
  S: '#b9805d',
  e: '#1b1f16',
  B: '#2a2620',
  l: '#3b3a2c',
};

const ALLY_PAL: Palette = {
  ...PLAYER_PAL,
  h: '#9c8a5a',
  H: '#6e5f3a',
  c: '#b59a64',
  g: '#8d7444',
  b: '#6b5232',
  t: '#d2c08c',
  s: '#c98e66',
  S: '#94603f',
};

const ALIEN_HEAD: Art = [
  '...kkkkkk...',
  '.kkllllllkk.',
  'klllllllllgk',
  'kllllllllggk',
  'klEEEllEEEgk',
  'kEEwEllEwEEk',
  'kgEEEllEEEgk',
  '.kgEllllEgk.',
  '..kglddlgk..',
  '...kkggkk...',
  '..kgddddgk..',
  '.kgkddddkgk.',
  '.kl.kddk.lk.',
];

const ALIEN_LEGS: Art[] = [
  ['...kdkkdk...', '...kdk.kdk..', '..kkk...kkk.'],
  ['....kdkdk...', '....kdkdk...', '....kkkkk...'],
];

const GRAY_FRAMES: Art[] = ALIEN_LEGS.map((legs) => [...ALIEN_HEAD, ...legs]);
const GRAY_PALS = {
  grunt: { k: '#22232b', l: '#c4c6cf', g: '#9497a3', d: '#6b6e7a', E: '#0b0b14', w: '#ffffff' },
  runner: { k: '#1d2530', l: '#b9cfe0', g: '#8aa3b8', d: '#5f7488', E: '#0b0b14', w: '#ffffff' },
  spitter: { k: '#1d2a1a', l: '#b8d6a0', g: '#8aac76', d: '#5f7d52', E: '#0b140b', w: '#d8ff9a' },
  flyer: { k: '#241d2e', l: '#d4c2e6', g: '#a893bf', d: '#7a6694', E: '#0b0b14', w: '#ffffff' },
  brute: { k: '#1a1b22', l: '#9a9ca8', g: '#737580', d: '#4c4e58', E: '#c0182b', w: '#ff9a9a' },
  overlord: { k: '#1c1426', l: '#c8b8d8', g: '#9a86b0', d: '#6d5a86', E: '#ff2a2a', w: '#ffd0d0' },
};
const JELLY_PAL: Palette = { k: '#1c0f2a', v: '#8a5ad8', V: '#c8a8ff', n: '#ff5ad8', N: '#ffd0f4', d: '#5a3a9a', E: '#0b0b14' };

const SQUID_TOP: Art = [
  '....kkkk....',
  '..kkppppkk..',
  '.kpppPPpppk.',
  'kppPPPPPPppk',
  'kpppPPPPpppk',
  'kpEEppppEEpk',
  'kpEwppppEwpk',
  '.kpppddpppk.',
  '..kdpppppdk.',
];
const DRONE_TOP: Art = [
  '......kk......',
  '.......k......',
  '....kkkkkk....',
  '..kkMMMMMMkk..',
  'kkmmmmrrmmmmkk',
  'kMMMMrRRrMMMMk',
  '.kkkkkkkkkkkk.',
  '..k.k....k.k..',
];
const HOPPER_TOP: Art = [
  '......kkkk..',
  '.....kggggk.',
  '....kgggwEk.',
  '..kkgggggggk',
  '.kgggGGGgggk',
  'kggGGGGGGgdk',
  'kgdGGGGGGddk',
  'kddkkkkkkddk',
];
const CRAB_TOP: Art = [
  '..k.k......kkk..',
  '..E.E.....kSssk.',
  '..k.k.....kSssk.',
  '.kkkkkkk..kSssk.',
  'krrRRrrrk.kSssk.',
  'krRRrrrrrkkssSk.',
  'krrrrrrrrrksssk.',
  '.kddddddddkSssk.',
  '..k.k..k.k.kkk..',
];
const BROOD_TOP: Art = [
  '......kkkkk...........',
  '....kkbbbbbkk.........',
  '...kbbBpBbbbbk...kkk..',
  '..kbbpBpBpbbbbk.kbbbk.',
  '..kbBpppppBbbbbkbEbEbk',
  '..kbbpBpBpbbbbbkbbbbbk',
  '...kbbBpBbbbbbkkbEbEbk',
  '....kkbbbbbbkkl.kbbbk.',
];
const KRAKEN_TOP: Art = [
  '...c.c.cc.c.c...',
  '...ccccccccccc..',
  '..kkkkkkkkkkkkk.',
  '.kaaaAAAAAaaaaak',
  'kaaAAAAAAAAAaaak',
  'kaaaAAAAAAAaaaak',
  'kaEEEaaaaaaEEEak',
  'kaEwEEaaaaEEwEak',
  'kaEEEaaaaaaEEEak',
  'kaaaaaaddaaaaaak',
  '.kaaaadddddaaak.',
  '..kaaaaaaaaaak..',
];
const IRONCRAB_TOP: Art = [
  '...k..k.........kkkk..',
  '..kEk.kEk......kSSssk.',
  '...k...k......kSssysk.',
  '..kkkkkkkkkk..kSssssk.',
  '.krrRRRrrrrrk.kSssysk.',
  'krrRRRRrrrrrrkkSssssk.',
  'krrrRRrrrrrrrrkSssysk.',
  'krrrrrrrrrrrrrkSssssk.',
  '.kddddddddddddkSssysk.',
  '..kk.kk.kk.kk..kkkkk..',
];

/** Animation frames (all facing right) and palette for every alien type. */
const ALIEN_ART: Record<AlienType, { frames: Art[]; pal: Palette }> = {
  grunt: { frames: GRAY_FRAMES, pal: GRAY_PALS.grunt },
  runner: { frames: GRAY_FRAMES, pal: GRAY_PALS.runner },
  spitter: { frames: GRAY_FRAMES, pal: GRAY_PALS.spitter },
  flyer: { frames: GRAY_FRAMES, pal: GRAY_PALS.flyer },
  brute: { frames: GRAY_FRAMES, pal: GRAY_PALS.brute },
  overlord: { frames: GRAY_FRAMES, pal: GRAY_PALS.overlord },
  squid: {
    frames: [
      [...SQUID_TOP, ...[
        '..d.d..d.d..',
        '.d..d..d..d.',
        '.d...dd...d.',
        'd...d..d...d',
        'd..........d',
      ]],
      [...SQUID_TOP, ...[
        '..d.d..d.d..',
        '..d.d..d.d..',
        '...d.dd.d...',
        '..d..dd..d..',
        '..d......d..',
      ]],
    ],
    pal: { k: '#2a1030', p: '#c04fd0', P: '#f08cff', d: '#7a2a8a', E: '#ffe14d', w: '#ffffff' },
  },
  drone: {
    frames: [
      [...DRONE_TOP, ...[
        '..y.y....y.y..',
      ]],
      [...DRONE_TOP, ...[
        '..o.o....o.o..',
      ]],
    ],
    pal: { k: '#1b1d22', m: '#5a616e', M: '#9aa3b5', r: '#ff2a2a', R: '#ffb0b0', y: '#ffe14d', o: '#ff8a1f' },
  },
  hopper: {
    frames: [
      [...HOPPER_TOP, ...[
        '.kddk..kddk.',
        'kkkk..kkkk..',
      ]],
      [...HOPPER_TOP, ...[
        'kdk......kdk',
        'kk........kk',
      ]],
    ],
    pal: { k: '#14261c', g: '#3fbf8a', G: '#8affc8', d: '#227a55', E: '#ff3b3b', w: '#ffffff' },
  },
  worm: {
    frames: [
      [
        '..kkkk..',
        '.kwkkwk.',
        'kwrrrrwk',
        'krrrrrrk',
        '.kMmmMk.',
        '.kmmmmk.',
        'kdmmmmdk',
        'kMmmmmMk',
        '.kmmmmk.',
        '.kdmmdk.',
        'kmmmmmmk',
        'kMmmmmMk',
        'kdmmmmdk',
        'kkkkkkkk',
      ],
      [
        '..kkkk..',
        '.kMkkMk.',
        'kMmwwmMk',
        'kmrrrrmk',
        '.kMmmMk.',
        '.kmmmmk.',
        'kdmmmmdk',
        'kMmmmmMk',
        '.kmmmmk.',
        '.kdmmdk.',
        'kmmmmmmk',
        'kMmmmmMk',
        'kdmmmmdk',
        'kkkkkkkk',
      ],
    ],
    pal: { k: '#2a1418', m: '#c2706a', M: '#e8a39a', r: '#7a1018', w: '#fff6e0', d: '#8a4a46' },
  },
  bug: {
    frames: [
      [
        'ww...ww',
        '.wwkww.',
        'kbbBbEk',
        '.kbbbk.',
        '..k.k..',
      ],
      [
        '.......',
        'wwwkwww',
        'kbbBbEk',
        '.kbbbk.',
        '..k.k..',
      ],
    ],
    pal: { k: '#1a0f22', b: '#7a3ac2', B: '#b07aff', w: '#e8f6ff', E: '#ff3b3b' },
  },
  blob: {
    frames: [
      [
        '...kkkk...',
        '.kkooookk.',
        'kooyyyyook',
        'koyYyyyyok',
        'koEyyyyEok',
        'kooEyyEook',
        'kooyrryook',
        '.kooooook.',
        '..kkkkkk..',
      ],
      [
        '..........',
        '...kkkk...',
        '.kkooookk.',
        'kooyyyyook',
        'koEyyyyEok',
        'kooEyyEook',
        'kooyrryook',
        'kooooooook',
        '.kkkkkkkk.',
      ],
    ],
    pal: { k: '#3a1200', o: '#ff8a1f', y: '#ffe14d', Y: '#fff6c0', r: '#c2361b', E: '#3a1200' },
  },
  splitter: {
    frames: [
      [
        '....kkkkkk....',
        '..kkvvvvvvkk..',
        '.kvvVVvvvvvvk.',
        'kvvVVvvvvvvvvk',
        'kvvvvnnvvnnvvk',
        'kvvvnNnvvnNnvk',
        'kvvvvnnvvnnvvk',
        'kvvvvvvvvvvvvk',
        'kvvEEvvvvEEvvk',
        'kdvvvvvvvvvvdk',
        '.kdvvvvvvvvdk.',
        '..kkddddddkk..',
        '....kkkkkk....',
      ],
    ],
    pal: JELLY_PAL,
  },
  mini: {
    frames: [
      [
        '..kkk..',
        '.kvvvk.',
        'kvnvvvk',
        'kvEvEvk',
        'kvvvvvk',
        '.kdddk.',
        '..k.k..',
      ],
    ],
    pal: JELLY_PAL,
  },
  crab: {
    frames: [
      [...CRAB_TOP, ...[
        '.k..k..k..k.....',
        'k...k..k...k....',
      ]],
      [...CRAB_TOP, ...[
        '..k.k..k.k......',
        '..k..k..k..k....',
      ]],
    ],
    pal: { k: '#1b1408', r: '#c2361b', R: '#ff6b4a', s: '#9aa3b5', S: '#d8e0ee', d: '#7a1e0e', E: '#000000' },
  },
  carrier: {
    frames: [
      [
        '........gggggggg........',
        '......gGgggggggggg......',
        '....kkkkkkkkkkkkkkkk....',
        '..kkhHhHhHhHhHhHhHhHkk..',
        'kkhhhhhhhhhhhhhhhhhhhhkk',
        'kmmLmmLmmLmmLmmLmmLmmLmk',
        '.kkhhhhhhhhhhhhhhhhhhkk.',
        '...kkdddddccccdddddkk...',
        '.....kkkkkkkkkkkkkk.....',
        '........k.k..k.k........',
      ],
      [
        '........gggggggg........',
        '......gGgggggggggg......',
        '....kkkkkkkkkkkkkkkk....',
        '..kkhHhHhHhHhHhHhHhHkk..',
        'kkhhhhhhhhhhhhhhhhhhhhkk',
        'kmmlmmlmmlmmlmmlmmlmmlmk',
        '.kkhhhhhhhhhhhhhhhhhhkk.',
        '...kkdddddccccdddddkk...',
        '.....kkkkkkkkkkkkkk.....',
        '........k.k..k.k........',
      ],
    ],
    pal: { k: '#120d18', h: '#5a2a3a', H: '#8a3a4a', m: '#9aa3b5', g: '#ff4d6d', G: '#ffb0c0', L: '#ffe14d', l: '#ff8a1f', d: '#2a1a24', c: '#7dffb0' },
  },
  brood: {
    frames: [
      [...BROOD_TOP, ...[
        '...l..kkkkkkl.l..kfk..',
        '..l..l..l..l...l..f...',
        '.l..l..l..l.....l.....',
        'l..l..l..l.......l....',
      ]],
      [...BROOD_TOP, ...[
        '...l..kkkkkkl.l..kfk..',
        '...l..l..l..l..l..f...',
        '..l..l..l..l....l.....',
        '.l..l..l..l......l....',
      ]],
    ],
    pal: { k: '#120a14', b: '#4a2a5a', B: '#7a4a9a', p: '#c06ad8', E: '#ff2a2a', l: '#2a1830', f: '#ffd0f4' },
  },
  kraken: {
    frames: [
      [...KRAKEN_TOP, ...[
        '..d.d.d..d.d.d..',
        '.d..d.d..d.d..d.',
        '.d..d..dd..d..d.',
        'd..d...dd...d..d',
        'd..d...d.d...d.d',
        'd...d.......d..d',
      ]],
      [...KRAKEN_TOP, ...[
        '..d.d.d..d.d.d..',
        '..d.d.d..d.d.d..',
        '.d..d.d..d.d..d.',
        '.d..d..dd..d..d.',
        'd...d..dd..d...d',
        'd....d....d....d',
      ]],
    ],
    pal: { k: '#0f1a08', a: '#7ab82a', A: '#c8f05a', d: '#3f6a12', E: '#ff2a2a', w: '#ffffff', c: '#ffe14d' },
  },
  ironcrab: {
    frames: [
      [...IRONCRAB_TOP, ...[
        '.k..k..k..k..k........',
        'k..k..k..k..k.........',
      ]],
      [...IRONCRAB_TOP, ...[
        '..k..k..k..k..k.......',
        '..k...k..k..k..k......',
      ]],
    ],
    pal: { k: '#120d08', r: '#8a2a12', R: '#c24a2a', s: '#6a7280', S: '#c9cedb', d: '#4a160a', E: '#ffe14d', y: '#ffd23f' },
  },
  wormking: {
    frames: [
      [
        '..c.c..c.c..',
        '..cccccccc..',
        '.kkkkkkkkkk.',
        'kwkwkwwkwkwk',
        'krrrrrrrrrrk',
        'kwrrrrrrrrwk',
        'kMwkwkkwkwMk',
        '.kMmEmmEmMk.',
        '.kmmmmmmmmk.',
        'kdmmMMMMmmdk',
        'kmmmmmmmmmmk',
        '.kdmmmmmmdk.',
        'kmmMMMMMMmmk',
        'kmmmmmmmmmmk',
        '.kdmmmmmmdk.',
        'kmmMMMMMMmmk',
        'kmmmmmmmmmmk',
        '.kdmmmmmmdk.',
        'kmmMMMMMMmmk',
        'kmmmmmmmmmmk',
        '.kdmmmmmmdk.',
        'kmmmmmmmmmmk',
        'kddddddddddk',
        'kkkkkkkkkkkk',
      ],
      [
        '..c.c..c.c..',
        '..cccccccc..',
        '.kkkkkkkkkk.',
        'kMkkkkkkkkMk',
        'kmwkwkkwkwmk',
        'kmrrrrrrrrmk',
        'kMmkkkkkkmMk',
        '.kMmEmmEmMk.',
        '.kmmmmmmmmk.',
        'kdmmMMMMmmdk',
        'kmmmmmmmmmmk',
        '.kdmmmmmmdk.',
        'kmmMMMMMMmmk',
        'kmmmmmmmmmmk',
        '.kdmmmmmmdk.',
        'kmmMMMMMMmmk',
        'kmmmmmmmmmmk',
        '.kdmmmmmmdk.',
        'kmmMMMMMMmmk',
        'kmmmmmmmmmmk',
        '.kdmmmmmmdk.',
        'kmmmmmmmmmmk',
        'kddddddddddk',
        'kkkkkkkkkkkk',
      ],
    ],
    pal: { k: '#1a0a10', m: '#a0485a', M: '#d87a8a', d: '#6a2232', r: '#3a0010', w: '#fff6e0', c: '#ffd23f', E: '#ffe14d' },
  },
};

export const alienFrameCount = (type: AlienType): number => ALIEN_ART[type].frames.length;

const WEAPON_ART: Record<string, { art: Art; pal: Palette }> = {
  knife: {
    art: ['....mmmw.', 'sbbkmmmmw', '....mmm..'],
    pal: { m: '#b8c0cc', w: '#ffffff', b: '#6b4423', k: '#22232b', s: '#e8b48a' },
  },
  pistol: {
    art: ['..kkkkkk', 'sskmmmmm', '.skkkkkk', '..kk....', '..k.....'],
    pal: { k: '#1b1d22', m: '#4a515e', s: '#e8b48a' },
  },
  water: {
    art: ['....bbbb....', '...bwbbbB...', '.sooooooooyy', '.sOOoooOOO..', '..OO........', '..O.........'],
    pal: { b: '#3db5ff', B: '#1b6fb0', w: '#e6f8ff', o: '#ff8a1f', O: '#c25e0b', y: '#ffe14d', s: '#e8b48a' },
  },
  bubble: {
    art: ['...cccc.....', '..cwcccc....', '.sppppppppPw', '.sPPppppPPP.', '..PP........', '..P.........'],
    pal: { c: '#bff3ff', w: '#ffffff', p: '#ff7ad9', P: '#c2409e', s: '#e8b48a' },
  },
  ar: {
    art: ['......kk.......', 'ooommmmmmmmmMMk', 'oosmmmkomm.....', 'o...kk.oo......', '....k..o.......'],
    pal: { k: '#1b1d22', m: '#3a3f48', M: '#5a616e', o: '#55602f', s: '#e8b48a' },
  },
  sniper: {
    art: ['......kkkkk.........', 'bbb...kcckk.........', 'bbbsmmmmmmmmmmmmmmMk', 'bb..bkkbm...........', 'b.....kk............'],
    pal: { k: '#1b1d22', c: '#53f5ff', m: '#3a3f48', M: '#6a7280', b: '#7a4a24', s: '#e8b48a' },
  },
  laser: {
    art: ['...wwwwwww....', '..wWgcgcgWwww.', '.sWWWWWWWWWWcc', '.swW..WW......', '..WW..........'],
    pal: { w: '#e9f1ff', W: '#9fb3d1', g: '#ff3df0', c: '#53f5ff', s: '#e8b48a' },
  },
};

const TANK_HULL: Art = [
  '.........kkkkkkk..........',
  '........kgcgbgcgk.........',
  '.......kcgbgcggbck........',
  '.......kgggcgbgggk........',
  '...kkkkkkkkkkkkkkkkkkkk...',
  '..kgcbgcgtgcbgcgtcgbgcgk..',
  '.kcgtgcbggcgtgcbgcgtgcbgk.',
  'kggggggggggggggggggggggggk',
  'kHHHHHHHHHHHHHHHHHHHHHHHHk',
  '.kkkkkkkkkkkkkkkkkkkkkkkk.',
];
const TANK_TREADS: Art[] = [
  ['k' + 'TTmm'.repeat(6) + 'k', 'k' + 'mMm'.repeat(8) + 'k', 'k' + 'TTmm'.repeat(6) + 'k', '.' + 'k'.repeat(24) + '.'],
  ['k' + 'mmTT'.repeat(6) + 'k', 'k' + 'Mmm'.repeat(8) + 'k', 'k' + 'mmTT'.repeat(6) + 'k', '.' + 'k'.repeat(24) + '.'],
];
const TANK_PAL: Palette = { k: '#1b1f16', g: '#4a5e2b', c: '#6f7d3c', b: '#5e4528', t: '#a59a68', H: '#2e3a1c', T: '#2f2f2f', m: '#5c5c5c', M: '#8a8a8a' };
export const TANK_PIVOT = { x: 12, y: 2 };

const COIN_ART: Art[] = [
  ['.kkkk.', 'kyyywk', 'kyoyyk', 'kyoyyk', 'kyyyyk', '.kkkk.'],
  ['..kk..', '.kywk.', '.kyok.', '.kyok.', '.kyyk.', '..kk..'],
  ['..kk..', '..yk..', '..ok..', '..ok..', '..yk..', '..kk..'],
];
const COIN_PAL: Palette = { k: '#6b4a00', y: '#ffd23f', o: '#c98a00', w: '#fff6c0' };

const UFO_ART: Art = [
  '........cccccc..........',
  '.......cwcccccc.........',
  '......cccccccccc........',
  '...' + 'k'.repeat(18) + '...',
  '.k' + 'mmMm'.repeat(5) + 'k.',
  'k' + 'm'.repeat(22) + 'k',
  '.' + 'kkL'.repeat(7) + 'k.',
  '...k' + 'd'.repeat(16) + 'k...',
  '.....' + 'k'.repeat(14) + '.....',
];
const UFO_PAL: Palette = { c: '#7dffb0', w: '#ffffff', k: '#1c1c26', m: '#8d93a6', M: '#c9cedb', d: '#5a5f70', L: '#ff4d6d' };

const TURRET_ART: Art = ['...kkkk...', '..kMMMMk..', '.kMmmmmMk.', '.kmmmmmmk.', 'kkkkkkkkkk', 'kmmmmmmmmk', 'kkkkkkkkkk'];
const TURRET_PAL: Palette = { k: '#1b1d22', m: '#4d5566', M: '#7a8499' };

const ICONS: Record<string, { art: Art; pal: Palette }> = {
  heart: {
    art: ['.rr.rr.', 'rRrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'],
    pal: { r: '#e43b44', R: '#ffb0b0' },
  },
  castle: {
    art: ['g.g.g.g', 'ggggggg', 'gGgggGg', 'ggggggg', 'ggg.ggg', 'gg...gg', 'gg...gg'],
    pal: { g: '#9fb3d1', G: '#3a4466' },
  },
  skull: {
    art: ['.lllll.', 'lllllll', 'lEElEEl', 'lEElEEl', '.lllll.', '..lll..'],
    pal: { l: '#c4c6cf', E: '#0b0b14' },
  },
};

/** Pixel ellipse with a highlight: used for the bubble projectile and the bubble trap. */
export function bubbleArt(w: number, h: number): string[] {
  const rows: string[] = [];
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) {
      const nx = (x + 0.5 - w / 2) / (w / 2);
      const ny = (y + 0.5 - h / 2) / (h / 2);
      const d = nx * nx + ny * ny;
      const edge = 1 - 2.2 / Math.min(w, h);
      if (d > 1) row += '.';
      else if (d > edge) row += 'c';
      else if (nx > 0.25 && ny < -0.25 && nx - ny > 1) row += 'w';
      else row += 'i';
    }
    rows.push(row);
  }
  return rows;
}
const BUBBLE_PAL: Palette = { c: '#bff6ff', i: 'rgba(160,230,255,0.25)', w: '#ffffff' };

// ---------------------------------------------------------------- builders

export function buildSprite(make: MakeCanvas, art: Art, pal: Palette, flip = false): Sprite {
  const h = art.length;
  const w = art[0].length;
  const canvas = make(w, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable for sprite canvas');
  let px = w / 2;
  let py = h / 2;
  let grip = false;
  art.forEach((row, y) => {
    if (row.length !== w) throw new Error(`Sprite row ${y} is ${row.length} wide, expected ${w}: "${row}"`);
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      const color = pal[ch];
      if (!color) throw new Error(`No palette color for "${ch}" in row ${y}`);
      const dx = flip ? w - 1 - x : x;
      if (ch === 's' && !grip) {
        grip = true;
        px = dx;
        py = y;
      }
      ctx.fillStyle = color;
      ctx.fillRect(dx, y, 1, 1);
    });
  });
  return { canvas, w, h, px, py };
}

const silhouette = (pal: Palette, color: string): Palette => Object.fromEntries(Object.keys(pal).map((k) => [k, color]));

/** Blend every palette color toward `color` (both must be #rrggbb). */
export function tint(pal: Palette, color: string, amount: number): Palette {
  const rgb = (hex: string): number[] => {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`tint() needs #rrggbb colors, got "${hex}"`);
    return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  };
  const target = rgb(color);
  return Object.fromEntries(
    Object.entries(pal).map(([k, c]) => [k, `#${rgb(c).map((v, i) => Math.round(v + (target[i] - v) * amount).toString(16).padStart(2, '0')).join('')}`]),
  );
}

function layer(make: MakeCanvas, w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void): Sprite {
  const canvas = make(w, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable for layer canvas');
  paint(ctx);
  return { canvas, w, h, px: 0, py: 0 };
}

const DITHER = ['#...', '..#.', '#.#.', '.#.#', '###.', '.###'];
const SKY_BANDS = ['#120a24', '#1b0f33', '#2a1545', '#3d1d55', '#5a2660', '#7d3062', '#a43f5c', '#c95a4f', '#e07a45'];

function paintSky(ctx: CanvasRenderingContext2D): void {
  const band = Math.ceil(GROUND_Y / SKY_BANDS.length);
  SKY_BANDS.forEach((color, i) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, i * band, VIEW_W, band);
    const next = SKY_BANDS[i + 1];
    if (!next) return;
    ctx.fillStyle = next;
    // Ordered dither: rows closer to the next band get more of its color.
    DITHER.forEach((pattern, row) => {
      for (let x = 0; x < VIEW_W; x++) if (pattern[x % 4] === '#') ctx.fillRect(x, (i + 1) * band - DITHER.length + row, 1, 1);
    });
  });
  const rng = mulberry32(7);
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = rng() < 0.8 ? '#ffffff' : '#ffe680';
    ctx.fillRect(Math.floor(rng() * VIEW_W), Math.floor(rng() * 120), 1, 1);
  }
  // Moon
  const mx = 392;
  const my = 52;
  for (let y = -16; y <= 16; y++) {
    for (let x = -16; x <= 16; x++) {
      if (x * x + y * y > 256) continue;
      ctx.fillStyle = (x + 5) ** 2 + (y + 3) ** 2 < 14 || (x - 6) ** 2 + (y - 6) ** 2 < 8 ? '#cbbd9f' : '#f4e6c8';
      ctx.fillRect(mx + x, my + y, 1, 1);
    }
  }
}

function paintMountains(ctx: CanvasRenderingContext2D, w: number): void {
  const rng = mulberry32(11);
  const phases = [rng() * 6, rng() * 6, rng() * 6];
  for (let x = 0; x < w; x++) {
    const top = Math.round(150 - 26 * Math.sin(x / 60 + phases[0]) - 14 * Math.sin(x / 23 + phases[1]) - 5 * Math.sin(x / 7 + phases[2]));
    ctx.fillStyle = '#2a1a3d';
    ctx.fillRect(x, top, 1, GROUND_Y - top);
    ctx.fillStyle = '#4a3366';
    ctx.fillRect(x, top, 1, 1);
  }
}

function paintCity(ctx: CanvasRenderingContext2D, w: number): void {
  const rng = mulberry32(23);
  for (let x = 0; x < w; ) {
    const bw = 18 + Math.floor(rng() * 30);
    const bh = 30 + Math.floor(rng() * 60);
    const top = GROUND_Y - bh;
    ctx.fillStyle = '#1a1024';
    ctx.fillRect(x, top, bw, bh);
    // broken roofline
    for (let i = 0; i < bw; i += 3) {
      const notch = Math.floor(rng() * 6);
      ctx.fillStyle = '#1a1024';
      ctx.fillRect(x + i, top - notch, 3, notch);
    }
    for (let wy = top + 6; wy < GROUND_Y - 8; wy += 7) {
      for (let wx = x + 3; wx < x + bw - 4; wx += 6) {
        const r = rng();
        if (r < 0.7) continue;
        ctx.fillStyle = r < 0.9 ? '#ffb347' : '#ff6b2b';
        ctx.fillRect(wx, wy, 2, 3);
      }
    }
    x += bw + 6 + Math.floor(rng() * 24);
  }
}

function paintGround(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const rng = mulberry32(5);
  ctx.fillStyle = '#5a3d26';
  ctx.fillRect(0, 3, w, h - 3);
  ctx.fillStyle = '#4d7a2e';
  ctx.fillRect(0, 3, w, 3);
  for (let x = 0; x < w; x++) {
    const r = rng();
    if (r < 0.35) {
      ctx.fillStyle = r < 0.15 ? '#6ea83a' : '#4d7a2e';
      ctx.fillRect(x, 3 - Math.floor(r * 9), 1, Math.floor(r * 9));
    }
    for (let y = 7; y < h; y += 4) {
      const s = rng();
      if (s < 0.12) {
        ctx.fillStyle = s < 0.04 ? '#7a7066' : s < 0.08 ? '#47301e' : '#6e4c30';
        ctx.fillRect(x, y + Math.floor(s * 30), 1 + Math.floor(s * 20), 1);
      }
    }
  }
}

export function buildSprites(make: MakeCanvas): Sprites {
  const map = new Map<string, Sprite>();
  const add = (name: string, art: Art, pal: Palette, flips = false): void => {
    map.set(name, buildSprite(make, art, pal));
    if (flips) map.set(`${name}_L`, buildSprite(make, art, pal, true));
  };

  for (const [frame, legs] of Object.entries(SOLDIER_LEGS)) {
    add(`soldier_${frame}`, [...SOLDIER_TOP, ...legs], PLAYER_PAL, true);
    add(`ally_${frame}`, [...SOLDIER_TOP, ...legs], ALLY_PAL, true);
  }
  for (const type of ALIEN_ORDER) {
    const { frames, pal } = ALIEN_ART[type];
    const elite = ALIENS[type].boss ? tint(pal, '#ff2020', 0.35) : null;
    frames.forEach((art, i) => {
      add(`${type}_${i}`, art, pal, true);
      if (elite) add(`${type}_e${i}`, art, elite, true);
    });
    add(`${type}_flash`, frames[0], silhouette(pal, '#ffffff'), true);
  }
  for (const [name, { art, pal }] of Object.entries(WEAPON_ART)) add(`w_${name}`, art, pal);
  TANK_TREADS.forEach((treads, i) => add(`tank_${i}`, [...TANK_HULL, ...treads], TANK_PAL, true));
  COIN_ART.forEach((art, i) => add(`coin_${i}`, art, COIN_PAL));
  add('ufo_0', UFO_ART, UFO_PAL);
  add('ufo_1', UFO_ART, { ...UFO_PAL, L: '#ffe14d' });
  add('turret', TURRET_ART, TURRET_PAL);
  add('bubble', bubbleArt(7, 7), BUBBLE_PAL);
  add('trap', bubbleArt(18, 20), BUBBLE_PAL);
  for (const [name, { art, pal }] of Object.entries(ICONS)) add(`icon_${name}`, art, pal);

  const farW = Math.ceil(VIEW_W + (WORLD_W - VIEW_W) * PARALLAX_FAR);
  const nearW = Math.ceil(VIEW_W + (WORLD_W - VIEW_W) * PARALLAX_NEAR);
  map.set('bg_sky', layer(make, VIEW_W, VIEW_H, paintSky));
  map.set('bg_far', layer(make, farW, VIEW_H, (ctx) => paintMountains(ctx, farW)));
  map.set('bg_near', layer(make, nearW, VIEW_H, (ctx) => paintCity(ctx, nearW)));
  map.set('bg_ground', layer(make, WORLD_W, VIEW_H - GROUND_TOP, (ctx) => paintGround(ctx, WORLD_W, VIEW_H - GROUND_TOP)));

  return {
    get(name: string): Sprite {
      const s = map.get(name);
      if (!s) throw new Error(`Unknown sprite "${name}"`);
      return s;
    },
  };
}
