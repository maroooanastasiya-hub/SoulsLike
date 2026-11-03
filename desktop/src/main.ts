import { Game } from './game';
import { VIEW_W, VIEW_H, RENDER_SCALE } from './core/constants';
import { preloadCustomAssets } from './art/custom';

const el = document.getElementById('game-canvas');
if (!(el instanceof HTMLCanvasElement)) throw new Error('canvas #game-canvas не найден');
const canvas: HTMLCanvasElement = el;

// Внутреннее разрешение выше логического: векторные спрайты остаются чёткими.
canvas.width = Math.round(VIEW_W * RENDER_SCALE);
canvas.height = Math.round(VIEW_H * RENDER_SCALE);

preloadCustomAssets();
const game = new Game(canvas);
const boot = document.getElementById('boot');
requestAnimationFrame(() => boot?.classList.add('hidden'));

const STEP = 1 / 60;
let last = performance.now();
let acc = 0;

function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += dt;
  let steps = 0;
  while (acc >= STEP && steps < 5) {
    game.input.pollGamepad();
    game.update(STEP);
    game.input.endFrame();
    acc -= STEP;
    steps++;
  }
  game.draw();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// Удобно для отладки в DevTools.
(window as unknown as { __game: Game }).__game = game;
(window as unknown as { game: Game }).game = game;
