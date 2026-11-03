import type { Game } from '../game';
import { C } from '../art/palette';
import { text, rect } from '../core/draw';
import { GROUND_ROW, TILE } from '../world/room';

export interface TutorialStepDef {
  key: string;
  short: string;
  title: string;
  hint: string;
}

/** Шаги обучения. Порядок важен: game.tutorialSteps хранит отметки по индексу. */
export const TUTORIAL_STEPS: TutorialStepDef[] = [
  { key: 'move', short: 'A/D', title: 'ДВИЖЕНИЕ', hint: 'A / D — иди вправо' },
  { key: 'jump', short: 'SPACE', title: 'ПРЫЖОК', hint: 'SPACE — прыжок, в воздухе ещё раз — двойной' },
  { key: 'dash', short: 'SHIFT', title: 'РЫВОК', hint: 'SHIFT — рывок сквозь опасность и инерция после него' },
  { key: 'attack', short: 'J', title: 'УДАР', hint: 'J — удар призрачным клинком' },
  { key: 'fire', short: 'K', title: 'ОГОНЬ', hint: 'K — адский огонь (тратит эктоплазму)' },
  { key: 'heal', short: 'L', title: 'ЛЕЧЕНИЕ', hint: 'L — восстанови оболочку' },
  { key: 'soul', short: 'E', title: 'ДУША', hint: 'E — поглоти душу павшего' },
  { key: 'loot', short: 'F', title: 'ОБЫСК', hint: 'F — обыщи павшего' },
  { key: 'summon', short: 'Q', title: 'ПРИЗЫВ', hint: 'Q — призови легион' },
  { key: 'menu', short: 'TAB', title: 'ГЕРОЙ', hint: 'TAB / I — открой меню героя и инвентарь' },
];

export const TUTORIAL_SKIP_BUTTON = { x: 230, y: 56, w: 108, h: 15 };

export function drawTutorial(ctx: CanvasRenderingContext2D, game: Game): void {
  const completed = game.tutorialSteps.filter(Boolean).length;
  const total = TUTORIAL_STEPS.length;
  const current = game.tutorialSteps.findIndex((v) => !v);
  const done = current === -1;
  const step = done ? null : TUTORIAL_STEPS[current];

  // компактная панель сверху, не перекрывает HUD по краям
  const x = 126;
  const y = 6;
  const w = 220;
  const h = 72;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 12;
  rect(ctx, x, y, w, h, 'rgba(7,6,13,0.9)');
  ctx.restore();
  rect(ctx, x, y, w, 1, 'rgba(255,207,107,0.55)');
  rect(ctx, x, y, 2, h, 'rgba(255,207,107,0.35)');
  rect(ctx, x + w - 2, y, 2, h, 'rgba(255,207,107,0.18)');
  rect(ctx, x, y + h - 1, w, 1, 'rgba(255,255,255,0.08)');

  text(ctx, `ОБУЧЕНИЕ · ${completed}/${total}`, x + 8, y + 14, { size: 7.2, color: C.gold });
  text(ctx, done ? 'ВСЁ ГОТОВО' : step!.title, x + 8, y + 27, { size: 9.2, color: done ? C.green : C.white });
  text(ctx, done ? 'ДВЕРЬ СПРАВА ОТКРЫТА' : step!.hint, x + 8, y + 38, {
    size: 5.8, color: done ? 'rgba(150,235,180,0.8)' : 'rgba(185,176,215,0.82)',
  });

  // прогресс
  for (let i = 0; i < total; i++) {
    const dx = x + 8 + i * 8;
    const dy = y + 47;
    const filled = game.tutorialSteps[i];
    const isCurrent = i === current;
    rect(ctx, dx, dy, 5, 4, filled ? C.green : isCurrent ? C.gold : 'rgba(120,112,150,0.25)');
  }

  // кнопка пропуска: кликабельна, координаты совпадают с TUTORIAL_SKIP_BUTTON
  const b = TUTORIAL_SKIP_BUTTON;
  rect(ctx, b.x, b.y, b.w, b.h, 'rgba(255,207,107,0.1)');
  rect(ctx, b.x, b.y, b.w, 1, 'rgba(255,207,107,0.55)');
  rect(ctx, b.x, b.y + b.h - 1, b.w, 1, 'rgba(255,207,107,0.25)');
  text(ctx, 'S / КЛИК — ПРОПУСТИТЬ', b.x + b.w / 2, b.y + 11, {
    size: 5.5, color: C.gold, align: 'center',
  });

  // подсказка про дверь после завершения
  if (done) {
    const pulse = 0.55 + Math.sin(game.time * 3) * 0.25;
    ctx.globalAlpha = pulse;
    text(ctx, '→', x + w - 12, y + 18, { size: 12, color: C.gold, align: 'center' });
    ctx.globalAlpha = 1;
  }
}

/** Таблички-руны прямо в комнате, чтобы обучение читалось в мире. */
export function drawTutorialSigns(ctx: CanvasRenderingContext2D, game: Game): void {
  const current = game.tutorialSteps.findIndex((v) => !v);
  TUTORIAL_STEPS.forEach((step, i) => {
    const x = 96 + i * 58;
    const y = GROUND_ROW * TILE - 48;
    const done = game.tutorialSteps[i];
    const active = i === current;
    const color = done ? C.green : active ? C.gold : 'rgba(150,142,180,0.42)';

    ctx.save();
    ctx.globalAlpha = active ? 0.85 + Math.sin(game.time * 4) * 0.12 : 0.7;
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 12, game.time * 0.4, game.time * 0.4 + Math.PI * 1.4);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();

    text(ctx, done ? '✓' : step.short, x, y + 3, {
      size: step.short.length > 3 ? 4.8 : 6.2, color, align: 'center',
    });
    text(ctx, step.title, x, y + 20, { size: 4.8, color, align: 'center' });
  });

  // баннер зала
  text(ctx, 'ТРЕНИРОВОЧНЫЙ ЗАЛ', game.room.widthPx / 2, 90, {
    size: 10, color: 'rgba(200,190,230,0.16)', align: 'center',
  });
}
