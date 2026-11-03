import { Room } from '../world/room';
import { VIEW_W, VIEW_H } from '../core/constants';
import { drawCustomBackground } from './custom';

function seeded(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function drawBackground(
  ctx: CanvasRenderingContext2D,
  room: Room,
  camX: number,
  camY: number,
  time: number,
): void {
  const b = room.biome;

  // Кастомный фон: если есть back.svg, процедурный пейзаж не рисуется.
  const hasCustomBack = drawCustomBackground(ctx, room.biomeKey, 'back', camX, camY);
  if (hasCustomBack) {
    drawCustomBackground(ctx, room.biomeKey, 'mid', camX, camY);
    drawCustomBackground(ctx, room.biomeKey, 'front', camX, camY);
    return;
  }

  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, b.sky0);
  g.addColorStop(0.6, b.sky1);
  g.addColorStop(1, b.sky0);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // далёкая луна-душа
  const moonX = VIEW_W * 0.7 - camX * 0.03;
  const moonY = 54 - camY * 0.02;
  const moonGlow = ctx.createRadialGradient(moonX, moonY, 2, moonX, moonY, 58);
  moonGlow.addColorStop(0, `${b.accent}22`);
  moonGlow.addColorStop(0.45, `${b.accent}0b`);
  moonGlow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = moonGlow;
  ctx.fillRect(moonX - 70, moonY - 70, 140, 140);
  const moon = ctx.createRadialGradient(moonX - 5, moonY - 5, 2, moonX, moonY, 18);
  moon.addColorStop(0, 'rgba(255,255,255,0.2)');
  moon.addColorStop(0.5, `${b.accent}30`);
  moon.addColorStop(1, `${b.accent}08`);
  ctx.fillStyle = moon;
  ctx.beginPath();
  ctx.arc(moonX, moonY, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `${b.accent}22`;
  ctx.lineWidth = 0.7;
  ctx.stroke();

  // звёздная пыль
  for (let i = 0; i < 44; i++) {
    const sx = seeded(i, 1) * VIEW_W;
    const sy = seeded(i, 2) * VIEW_H * 0.6;
    const tw = 0.35 + Math.sin(time * (0.7 + seeded(i, 3)) + i) * 0.35;
    ctx.globalAlpha = 0.08 + tw * 0.16;
    ctx.fillStyle = i % 7 === 0 ? b.accent : '#dfe8ff';
    ctx.fillRect(sx, sy, 1, 1);
  }
  ctx.globalAlpha = 1;

  // дальние руины
  const off1 = ((camX * 0.14) % 190 + 190) % 190;
  ctx.fillStyle = b.far;
  for (let i = -1; i < 5; i++) {
    const x = i * 190 - off1;
    const h = 100 + ((i * 37) % 60);
    ctx.fillRect(x, VIEW_H - h - 20, 54, h + 20);
    ctx.beginPath();
    ctx.arc(x + 27, VIEW_H - h - 20, 27, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x + 18, VIEW_H - h - 62, 18, 42);
    // шпиль
    ctx.beginPath();
    ctx.moveTo(x + 18, VIEW_H - h - 62);
    ctx.lineTo(x + 27, VIEW_H - h - 86);
    ctx.lineTo(x + 36, VIEW_H - h - 62);
    ctx.closePath();
    ctx.fill();
    // окна
    ctx.fillStyle = `${b.accent}12`;
    for (let k = 0; k < 2; k++) {
      ctx.fillRect(x + 12 + k * 17, VIEW_H - h - 44 + (k % 2) * 9, 7, 11);
    }
    ctx.fillStyle = b.far;
  }

  // средние арки
  const off2 = ((camX * 0.3) % 240 + 240) % 240;
  ctx.fillStyle = b.mid;
  for (let i = -1; i < 4; i++) {
    const x = i * 240 - off2;
    ctx.fillRect(x, 86, 22, VIEW_H - 86);
    ctx.fillRect(x + 150, 86, 22, VIEW_H - 86);
    ctx.strokeStyle = b.mid;
    ctx.lineWidth = 22;
    ctx.beginPath();
    ctx.arc(x + 86, 94, 75, Math.PI, Math.PI * 2);
    ctx.stroke();
    // витраж
    ctx.strokeStyle = `${b.accent}13`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(x + 86, 94, 63, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 86, 32);
    ctx.lineTo(x + 86, 94);
    ctx.moveTo(x + 60, 72);
    ctx.lineTo(x + 112, 72);
    ctx.stroke();
  }

  // полосы тумана
  for (let i = 0; i < 5; i++) {
    const y = 52 + i * 38 + Math.sin(time * 0.28 + i) * 5 - (camY % 20);
    const fog = ctx.createLinearGradient(0, y, 0, y + 14);
    fog.addColorStop(0, 'rgba(0,0,0,0)');
    fog.addColorStop(0.5, b.fog);
    fog.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = fog;
    ctx.fillRect(0, y, VIEW_W, 14);
  }

  // блуждающие искры
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 22; i++) {
    const speed = 4 + (i % 6) * 2.2;
    const px = ((time * speed + i * 71 + Math.sin(time * 0.7 + i) * 12) % (VIEW_W + 40)) - 20;
    const py = VIEW_H - ((time * (7 + (i % 5) * 2) + i * 47) % (VIEW_H + 30));
    const a = 0.08 + (i % 4) * 0.045;
    ctx.fillStyle = i % 6 === 0 ? `${b.accent}${Math.round(a * 255).toString(16).padStart(2, '0')}` : `rgba(185,190,255,${a})`;
    ctx.beginPath();
    ctx.arc(px, py, i % 7 === 0 ? 1.4 : 0.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Кастомные средний и передний слои можно добавить даже без back.svg.
  drawCustomBackground(ctx, room.biomeKey, 'mid', camX, camY);
  drawCustomBackground(ctx, room.biomeKey, 'front', camX, camY);

  // виньетка
  const v = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.32, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.78);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.58)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}
