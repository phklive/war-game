import { BASE_X, CLEAR_TIME, GROUND_Y, ROOF_Y, TOTAL_WAVES, VIEW_W, WORLD_W, waveBonus } from './config';
import { updateAliens } from './aliens';
import { advanceBoss } from './bosses';
import { updateAllies } from './allies';
import { collectAllCoins, updateCoins } from './coins';
import { FIRE, GOLD, SMOKE, BUBBLE, addShake, burst, sfx, showBanner, updateEffects } from './effects';
import { respawnPlayer, updatePlayer } from './player';
import { updateProjectiles } from './projectiles';
import { clamp } from './rng';
import { handleShopInput } from './shop';
import { resetGame } from './state';
import type { Game, InputState } from './types';
import { hordeCleared, startWave, updateUfos } from './waves';

const confirmed = (input: InputState): boolean => input.pressed.includes('Enter') || input.clicks.length > 0;

export function step(g: Game, input: InputState, dt: number): void {
  g.time += dt;
  switch (g.phase) {
    case 'title':
      if (confirmed(input)) startWave(g, 1);
      break;
    case 'wave':
      if (input.pressed.includes('KeyP') || input.pressed.includes('Escape')) g.paused = !g.paused;
      if (g.paused) return;
      simulate(g, input, dt);
      if (g.base.hp <= 0) loseGame(g);
      else if (hordeCleared(g)) {
        if (g.pendingBoss) advanceBoss(g, g.pendingBoss, dt);
        else clearWave(g);
      }
      break;
    case 'clear':
      simulate(g, input, dt);
      g.phaseTimer -= dt;
      if (g.phaseTimer <= 0) finishClear(g);
      break;
    case 'shop':
      handleShopInput(g, input);
      updateEffects(g, dt);
      break;
    case 'gameover':
    case 'victory':
      if (g.phase === 'victory' && g.rng() < dt * 4) fireworks(g);
      updateEffects(g, dt);
      g.phaseTimer -= dt;
      if (g.phaseTimer <= 0 && confirmed(input)) resetGame(g, Math.floor(g.rng() * 2 ** 31));
      break;
  }
}

function simulate(g: Game, input: InputState, dt: number): void {
  updatePlayer(g, input, dt);
  updateUfos(g, dt);
  updateAliens(g, dt);
  updateAllies(g, dt);
  updateProjectiles(g, dt);
  updateCoins(g, dt);
  updateEffects(g, dt);
  const focus = g.player.alive ? g.player.x : BASE_X;
  const target = clamp(focus - VIEW_W / 2 + (input.mouseX - VIEW_W / 2) * 0.3, 0, WORLD_W - VIEW_W);
  g.camX += (target - g.camX) * Math.min(1, dt * 6);
}

function clearWave(g: Game): void {
  g.phase = 'clear';
  g.phaseTimer = CLEAR_TIME;
  const bonus = waveBonus(g.wave);
  g.money += bonus;
  g.stats.earned += bonus;
  if (!g.player.alive) respawnPlayer(g);
  for (const c of g.coins) c.magnet = true;
  for (const u of g.ufos) u.state = 'leave';
  g.projectiles = g.projectiles.filter((pr) => pr.team !== 'alien');
  showBanner(g, `WAVE ${g.wave} CLEARED!`, `BONUS +$${bonus}`, '#ffd23f');
  sfx(g, 'waveClear');
}

function finishClear(g: Game): void {
  collectAllCoins(g);
  g.projectiles = [];
  if (g.wave < TOTAL_WAVES) {
    g.phase = 'shop';
    return;
  }
  g.phase = 'victory';
  g.phaseTimer = 1.5;
  showBanner(g, 'VICTORY!', 'EARTH IS SAFE... FOR NOW', '#ffd23f', 4);
  sfx(g, 'win');
}

function loseGame(g: Game): void {
  g.phase = 'gameover';
  g.phaseTimer = 1.5;
  for (let i = 0; i < 6; i++) burst(g, BASE_X + (g.rng() - 0.5) * 70, ROOF_Y + g.rng() * 40, 14, FIRE, { speed: 180, life: 1 });
  burst(g, BASE_X, GROUND_Y - 20, 30, SMOKE, { speed: 70, life: 2, gravity: -30, size: 3 });
  addShake(g, 14);
  sfx(g, 'explode');
  sfx(g, 'lose');
}

function fireworks(g: Game): void {
  const x = g.camX + 40 + g.rng() * (VIEW_W - 80);
  const y = 40 + g.rng() * 80;
  burst(g, x, y, 30, g.rng() < 0.5 ? GOLD : BUBBLE, { speed: 120, life: 1.1, gravity: 60 });
  sfx(g, 'pop');
}
