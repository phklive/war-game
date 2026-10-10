<img src="assets/icon.svg" width="64" height="64" alt="">

# Gray Invasion

A fast, pixel-art side-view war game. Big-headed gray aliens beam down from UFOs; your camo soldier defends the base for 10 waves.

## Play

Play online at **https://phklive.github.io/war-game/**. Every push to `main` is deployed there automatically by `.github/workflows/deploy.yml`.

To run it locally:

```sh
npm install
npm run dev
```

Then open the URL Vite prints (default http://localhost:5173).

## Controls

| Action | Keys |
| --- | --- |
| Move | A / D or ← / → |
| Jump | W / Space / ↑ |
| Drop off the base roof | S / ↓ |
| Aim / shoot | Mouse / hold left click |
| Switch weapon | 1–8, Q / E, or mouse wheel |
| Shop: buy item | 1–7 or click |
| Shop: next wave | Enter or click the button |
| Pause / mute | P (or Esc) / M |

## How it works

- **Waves**: there are 10 waves, and every wave ends with a boss. Aliens drop from UFOs, arriving faster and in bigger numbers each wave, and they get tougher, quicker and hit harder as the waves go on. Clear wave 10 to win. You lose when the base's HP reaches 0. If your soldier dies, they respawn on the base roof after 2.5 seconds.
- **Enemies**:
  - **Grays**: grunts, runners, spitters, jetpack flyers and brutes.
  - **Squids**: float overhead and lob acid.
  - **Drones**: strafe and fire laser bursts.
  - **Hoppers**: cross the field in big leaps.
  - **Worms**: tunnel underground, where only explosions can hit them, and pop up next to the base.
  - **Bug swarms**: zig-zag through the air.
  - **Kamikaze blobs**: explode on contact. Shoot one and it blows up the aliens around it.
  - **Splitters**: burst into minis when they die.
  - **Crabs**: have a front shield, so hit them from above or behind, or use explosives.
- **Bosses**: Sky Carrier, Brood Mother, Acid Kraken, Iron Crab and Worm King appear in waves 1–5. Elite versions of the first four return in waves 6–9, and the Overlord is the wave 10 finale.
- **Weapons**: every 10 kills (yours, not your turrets' or soldiers') unlock the next weapon and equip it automatically. Earlier weapons stay available:
  knife, pistol, water gun (slows aliens), bubble gun (traps aliens and floats them up), assault rifle, sniper (pierces), laser (continuous beam), and the battle tank (explosive shells, crushes aliens, double HP).
  Your shots only reach as far as the edge of the screen.
- **Money**: killed aliens drop coins where they die. Run over them to collect them. Coins disappear after 20 seconds, and any coins left when a wave ends fly to you.
- **Armory** (between waves): repair or fortify the base (5 levels: more HP, armor, and more turret/soldier slots), build and upgrade roof turrets, hire soldiers, buy body armor, or buy a coin magnet. It also shows the next wave's enemies and boss.
- **Music**: separate chiptune tracks for the title, battle (3 tracks that get faster each wave), boss fights and the shop, plus victory and game-over jingles.

## Development

```sh
npm test           # unit tests
npm run coverage   # tests + 100% coverage gate
npm run typecheck
npm run build
```

- `src/game/` holds the pure, deterministic simulation (seeded RNG, fixed 60 Hz step). Tuning values and wave lineups are in `src/game/config.ts`. Enemy behavior lives in `enemies.ts`, boss behavior in `bosses.ts`, and shared AI helpers in `ai.ts`.
- `src/render/` draws everything to a 480×270 canvas, upscaled with nearest-neighbour. Sprites are ASCII pixel art in `sprites.ts`, and text uses a 5×7 bitmap font.
- `src/audio.ts` generates sound effects and the music loop with WebAudio. There are no asset files.
- `src/game/balance.test.ts` plays full games with a bot to check that the game is winnable when you upgrade the base and lost when nobody defends it.
