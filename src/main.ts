import { Game } from './game';
import { VIEW_W, VIEW_H } from './core/constants';

const el = document.getElementById('game-canvas');
if (!(el instanceof HTMLCanvasElement)) throw new Error('canvas #game-canvas не найден');
const canvas: HTMLCanvasElement = el;

const game = new Game(canvas);

function resize(): void {
  const availW = window.innerWidth;
  const availH = window.innerHeight - 22;
  const raw = Math.min(availW / VIEW_W, availH / VIEW_H);
  const scale = raw >= 1 ? Math.floor(raw) : raw;
  canvas.style.width = `${Math.floor(VIEW_W * scale)}px`;
  canvas.style.height = `${Math.floor(VIEW_H * scale)}px`;
}
window.addEventListener('resize', resize);
resize();

const STEP = 1 / 60;
let last = performance.now();
let acc = 0;

function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += dt;
  let steps = 0;
  while (acc >= STEP && steps < 5) {
    game.update(STEP);
    game.input.endFrame();
    acc -= STEP;
    steps++;
  }
  game.draw();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// handy for debugging in the browser console
(window as unknown as { __game: Game }).__game = game;
(window as unknown as { game: Game }).game = game;
