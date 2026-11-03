import type { Game } from '../game';
import { C } from '../art/palette';
import { text, rect, bar } from '../core/draw';
import { drawGhostHero, drawSoulFlame, drawRabbit } from '../art/sprites';
import { drawCustomAsset } from '../art/custom';
import { AMULETS } from '../entities/pickup';
import { VIEW_W, VIEW_H, ENEMY_NAMES, GAME_TITLE, GAME_SUBTITLE } from '../core/constants';

export function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, accent: string): void {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 18;
  rect(ctx, x, y, w, h, 'rgba(8,7,14,0.94)');
  ctx.restore();
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, `${accent}12`);
  g.addColorStop(0.25, 'rgba(255,255,255,0.012)');
  g.addColorStop(1, 'rgba(0,0,0,0.08)');
  ctx.fillStyle = g;
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  rect(ctx, x, y, w, 1, accent);
  rect(ctx, x, y + h - 1, w, 1, 'rgba(255,255,255,0.08)');
  rect(ctx, x, y, 1, h, 'rgba(255,255,255,0.08)');
  rect(ctx, x + w - 1, y, 1, h, 'rgba(255,255,255,0.08)');
  // corners
  rect(ctx, x, y, 10, 2, accent);
  rect(ctx, x, y, 2, 10, accent);
  rect(ctx, x + w - 10, y, 10, 2, accent);
  rect(ctx, x + w - 2, y, 2, 10, accent);
  rect(ctx, x, y + h - 2, 10, 2, accent);
  rect(ctx, x, y + h - 10, 2, 10, accent);
  rect(ctx, x + w - 10, y + h - 2, 10, 2, accent);
  rect(ctx, x + w - 2, y + h - 10, 2, 10, accent);
}

function glowText(
  ctx: CanvasRenderingContext2D,
  str: string,
  x: number,
  y: number,
  size: number,
  color: string,
  glow: string,
  align: CanvasTextAlign = 'center',
): void {
  ctx.save();
  ctx.shadowColor = glow;
  ctx.shadowBlur = 14;
  text(ctx, str, x, y, { size, color, align, shadow: false });
  ctx.shadowBlur = 0;
  text(ctx, str, x, y, { size, color, align, shadow: true });
  ctx.restore();
}

export function drawTitle(ctx: CanvasRenderingContext2D, game: Game): void {
  const t = game.time;

  // фон
  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, '#05040a');
  g.addColorStop(0.42, '#151026');
  g.addColorStop(0.78, '#0b0814');
  g.addColorStop(1, '#040308');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // туман
  const fog = ctx.createRadialGradient(VIEW_W / 2, 92, 10, VIEW_W / 2, 92, 190);
  fog.addColorStop(0, 'rgba(125,249,255,0.085)');
  fog.addColorStop(0.5, 'rgba(143,123,255,0.045)');
  fog.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = fog;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // звёздная пыль и угли
  for (let i = 0; i < 54; i++) {
    const x = ((t * (5 + (i % 5) * 2) + i * 71) % (VIEW_W + 40)) - 20;
    const y = VIEW_H - ((t * (9 + (i % 7) * 3) + i * 43) % (VIEW_H + 40));
    ctx.globalAlpha = 0.08 + ((i * 7) % 12) / 60;
    ctx.fillStyle = i % 6 === 0 ? C.gold : i % 3 === 0 ? C.spectral : C.purple;
    ctx.fillRect(Math.floor(x), Math.floor(y), 1 + (i % 2), 1 + (i % 2));
  }
  ctx.globalAlpha = 1;

  // гигантский сигил души
  ctx.save();
  ctx.translate(VIEW_W / 2, 98);
  const pulse = 0.5 + Math.sin(t * 1.2) * 0.14;
  const rg = ctx.createRadialGradient(0, 0, 4, 0, 0, 118);
  rg.addColorStop(0, `rgba(159,232,255,${0.08 * pulse})`);
  rg.addColorStop(1, 'rgba(159,232,255,0)');
  ctx.fillStyle = rg;
  ctx.fillRect(-130, -130, 260, 260);

  ctx.strokeStyle = `rgba(159,232,255,${0.14 + pulse * 0.1})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, 70, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([3, 9]);
  ctx.strokeStyle = `rgba(185,166,255,${0.16 + pulse * 0.08})`;
  ctx.beginPath();
  ctx.arc(0, 0, 82, t * 0.08, t * 0.08 + Math.PI * 1.7);
  ctx.stroke();
  ctx.setLineDash([]);
  // рунические насечки
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + t * 0.03;
    const r1 = 74;
    const r2 = 79;
    ctx.strokeStyle = `rgba(159,232,255,${0.1 + (i % 3) * 0.05})`;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
    ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
    ctx.stroke();
  }
  ctx.restore();

  // сам призрак
  ctx.save();
  ctx.translate(VIEW_W / 2, 190);
  ctx.scale(2.45, 2.45);
  drawGhostHero(ctx, 0, 0, {
    time: t,
    facing: 1,
    vx: 0,
    alpha: 0.96,
    castGlow: 0.4,
    castColor: C.spectral,
  });
  ctx.restore();

  // пепельная дымка у ног
  const mist = ctx.createRadialGradient(VIEW_W / 2, 193, 2, VIEW_W / 2, 193, 80);
  mist.addColorStop(0, 'rgba(159,232,255,0.08)');
  mist.addColorStop(1, 'rgba(159,232,255,0)');
  ctx.fillStyle = mist;
  ctx.fillRect(VIEW_W / 2 - 90, 160, 180, 70);

  // заголовок
  glowText(ctx, GAME_TITLE, VIEW_W / 2, 218, 24, C.white, C.spectral);
  glowText(ctx, GAME_SUBTITLE, VIEW_W / 2, 237, 11, C.gold, 'rgba(255,207,107,0.65)');
  text(ctx, 'ТЫ — ДУША ПАВШЕГО ЗЛОДЕЯ. СОБЕРИ ЛЕГИОН И ВЕРНИ СВОЙ ТРОН.', VIEW_W / 2, 249, {
    size: 6.5, color: 'rgba(195,188,220,0.8)', align: 'center',
  });

  // меню
  const blink = Math.sin(t * 3) > -0.4;
  if (blink) {
    glowText(ctx, 'ENTER — ПРОБУДИТЬСЯ', VIEW_W / 2, 257, 9, C.gold, 'rgba(255,207,107,0.55)');
  }

  // рекорд
  const rec = game.record;
  text(
    ctx,
    `РЕКОРД: ${rec.bestSouls} ДУШ · ${rec.bestKills} УБИЙСТВ · ${rec.runs} ${plural(rec.runs, 'ЗАБЕГ', 'ЗАБЕГА', 'ЗАБЕГОВ')}`,
    10,
    12,
    { size: 6, color: 'rgba(160,150,190,0.55)' },
  );
  text(ctx, 'ДЕСКТОП-ИЗДАНИЕ · F11 ПОЛНЫЙ ЭКРАН · ГЕЙМПАД', VIEW_W - 10, 12, {
    size: 6, color: 'rgba(160,150,190,0.45)', align: 'right',
  });

  // управление
  text(ctx, 'A/D — ДВИЖЕНИЕ  SPACE — ПРЫЖОК ×2  SHIFT — РЫВОК  J — КЛИНОК  TAB — ГЕРОЙ', VIEW_W / 2, 264, {
    size: 5.5, color: 'rgba(120,110,150,0.55)', align: 'center',
  });
}

export function drawShop(ctx: CanvasRenderingContext2D, game: Game): void {
  rect(ctx, 0, 0, VIEW_W, VIEW_H, 'rgba(4,3,8,0.76)');
  const w = 338;
  const h = 222;
  const x = (VIEW_W - w) / 2;
  const y = (VIEW_H - h) / 2;
  panel(ctx, x, y, w, h, C.purple);
  const merchant = Boolean(game.room.merchant);

  // тёплый фонарь торговца
  ctx.save();
  const fy = y + 8;
  const flame = ctx.createRadialGradient(VIEW_W / 2, fy, 1, VIEW_W / 2, fy, 34);
  if (merchant) {
    flame.addColorStop(0, `rgba(255,207,107,${0.18 + Math.sin(game.time * 4) * 0.05})`);
    flame.addColorStop(0.45, 'rgba(255,207,107,0.07)');
    flame.addColorStop(1, 'rgba(255,207,107,0)');
  } else {
    flame.addColorStop(0, `rgba(159,232,255,${0.16 + Math.sin(game.time * 4) * 0.04})`);
    flame.addColorStop(0.45, 'rgba(159,232,255,0.06)');
    flame.addColorStop(1, 'rgba(159,232,255,0)');
  }
  ctx.fillStyle = flame;
  ctx.fillRect(VIEW_W / 2 - 36, fy - 34, 72, 68);
  ctx.restore();

  glowText(
    ctx,
    merchant ? 'СТРАНСТВУЮЩИЙ ТОРГОВЕЦ' : 'АЛТАРЬ ЗАБЫТЫХ ДУШ',
    VIEW_W / 2, y + 21, merchant ? 11 : 13,
    merchant ? C.gold : C.purple,
    merchant ? 'rgba(255,207,107,0.55)' : 'rgba(185,166,255,0.55)',
  );
  text(ctx, `МОНЕТЫ: ${game.money}`, VIEW_W / 2, y + 34, { size: 8, color: C.gold, align: 'center' });

  const startY = y + 51;
  game.shopItems.forEach((item, i) => {
    const iy = startY + i * 25;
    const selected = i === game.shopIndex;
    if (selected) {
      const sel = ctx.createLinearGradient(x + 12, iy, x + w - 12, iy);
      sel.addColorStop(0, 'rgba(185,166,255,0.16)');
      sel.addColorStop(1, 'rgba(185,166,255,0.03)');
      ctx.fillStyle = sel;
      ctx.fillRect(x + 12, iy - 10, w - 24, 23);
      rect(ctx, x + 12, iy - 10, 2, 23, C.purple);
    }
    const affordable = game.money >= item.cost;
    text(ctx, item.name, x + 22, iy, { size: 9, color: selected ? C.white : affordable ? '#c9c3dd' : '#6a6480' });
    text(ctx, `${item.cost}`, x + w - 22, iy, { size: 9, color: affordable ? C.gold : C.redDark, align: 'right' });
    text(ctx, item.desc, x + 22, iy + 8, { size: 6.5, color: 'rgba(150,142,180,0.75)' });
  });

  const sel = game.shopItems[game.shopIndex];
  if (sel) {
    text(ctx, sel.detail, VIEW_W / 2, y + h - 33, { size: 7, color: 'rgba(200,190,230,0.9)', align: 'center' });
  }
  if (game.shopMessage) {
    text(ctx, game.shopMessage, VIEW_W / 2, y + h - 45, { size: 7, color: C.gold, align: 'center' });
  }
  text(ctx, 'ENTER — КУПИТЬ     ESC — УЙТИ', VIEW_W / 2, y + h - 12, { size: 7, color: C.dim, align: 'center' });
}

export function drawDeath(ctx: CanvasRenderingContext2D, game: Game): void {
  const a = game.deathFade;
  rect(ctx, 0, 0, VIEW_W, VIEW_H, `rgba(4,3,8,${0.55 + a * 0.35})`);

  // маленькие прозрачные белые призрачки, улетающие вверх
  ctx.save();
  for (let i = 0; i < 11; i++) {
    const seed = i * 1.7;
    const t = game.time * (0.5 + (i % 4) * 0.12) + seed * 3;
    // призрачки держатся в узких полях по краям и не мешают читать итоги
    const margin = i % 2 === 0;
    const gx = margin
      ? 8 + ((i * 29 + seed * 7) % 64) + Math.sin(t * 0.9) * 5
      : VIEW_W - 72 + ((i * 29 + seed * 7) % 64) + Math.sin(t * 0.9) * 5;
    const gy = VIEW_H - ((i * 37 + game.time * (14 + (i % 3) * 6)) % (VIEW_H - 30));
    const s = 3 + (i % 4) * 0.8;
    const alpha = 0.26 + (i % 3) * 0.08;

    // мягкое свечение
    ctx.globalCompositeOperation = 'lighter';
    const glow = ctx.createRadialGradient(gx, gy, 1, gx, gy, s * 3.2);
    glow.addColorStop(0, `rgba(220,240,255,${alpha * 0.35})`);
    glow.addColorStop(1, 'rgba(220,240,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(gx, gy, s * 3.2, 0, Math.PI * 2);
    ctx.fill();

    // тело призрачка: круглая голова и волнистый подол
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(gx, gy, s, Math.PI, 0);
    ctx.lineTo(gx + s, gy + s * 1.15);
    ctx.quadraticCurveTo(gx + s * 0.78, gy + s * 0.75, gx + s * 0.5, gy + s * 1.15);
    ctx.quadraticCurveTo(gx + s * 0.24, gy + s * 1.55, gx, gy + s * 1.1);
    ctx.quadraticCurveTo(gx - s * 0.24, gy + s * 0.7, gx - s * 0.5, gy + s * 1.15);
    ctx.quadraticCurveTo(gx - s * 0.78, gy + s * 1.55, gx - s, gy + s * 1.15);
    ctx.closePath();
    ctx.fill();

    // глаза
    ctx.globalAlpha = Math.min(1, alpha * 2.1);
    ctx.fillStyle = '#0a0812';
    ctx.beginPath();
    ctx.ellipse(gx - s * 0.33, gy - s * 0.18, s * 0.17, s * 0.24, 0, 0, Math.PI * 2);
    ctx.ellipse(gx + s * 0.33, gy - s * 0.18, s * 0.17, s * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // растворяющийся призрак — в углу, чтобы не спорить с текстом
  ctx.save();
  ctx.globalAlpha = 0.14 + Math.max(0, 1 - a * 1.2) * 0.5;
  ctx.translate(VIEW_W - 52, 236);
  ctx.scale(1.5, 1.5);
  drawGhostHero(ctx, 0, 0, { time: game.time, alpha: 1 });
  ctx.restore();

  ctx.globalAlpha = Math.min(1, a * 1.5);
  glowText(ctx, 'ДУША РАССЕЯЛАСЬ', VIEW_W / 2, 82, 26, C.red, 'rgba(224,72,92,0.6)');
  text(ctx, 'ЛЕГИОН ОБРАТИЛСЯ В ПЕПЕЛ', VIEW_W / 2, 98, { size: 8, color: C.dim, align: 'center' });

  const st = game.stats;
  text(ctx, `ДУШ СОБРАНО: ${st.souls} / 1000`, VIEW_W / 2, 128, { size: 9, color: C.soul, align: 'center' });
  text(ctx, `УБИТО: ${st.kills}     ГЛУБИНА: ${st.depth} / 6`, VIEW_W / 2, 142, { size: 9, color: C.white, align: 'center' });
  text(ctx, `МОНЕТ: ${st.money}     ВРЕМЯ: ${formatTime(st.time)}`, VIEW_W / 2, 156, { size: 9, color: C.gold, align: 'center' });
  if (st.newRecord) {
    text(ctx, 'НОВЫЙ РЕКОРД ПО ДУШАМ', VIEW_W / 2, 174, { size: 8, color: C.purple, align: 'center' });
  }
  glowText(ctx, 'ENTER — ВЕРНУТЬСЯ ИЗ ПУСТОТЫ', VIEW_W / 2, 206, 10, C.gold, 'rgba(255,207,107,0.5)');
  ctx.globalAlpha = 1;
}

export function drawVictory(ctx: CanvasRenderingContext2D, game: Game): void {
  const t = game.time;
  const pulse = 0.7 + Math.sin(t * 2) * 0.3;
  const isTrue = game.ending === 'true';
  rect(ctx, 0, 0, VIEW_W, VIEW_H, isTrue ? 'rgba(4,3,8,0.8)' : 'rgba(12,5,8,0.84)');

  // призрак у трона — в правом нижнем углу, не мешает тексту
  ctx.save();
  ctx.globalAlpha = isTrue ? 0.36 : 0.26;
  ctx.translate(VIEW_W - 72, 232);
  ctx.scale(1.8, 1.8);
  drawGhostHero(ctx, 0, 0, { time: t, alpha: 1 });
  ctx.restore();

  if (isTrue) {
    glowText(ctx, 'ГЕРОЙ ПАЛ', VIEW_W / 2, 74, 30, C.gold, 'rgba(255,207,107,0.7)');
    text(ctx, 'ТЫСЯЧА ПАВШИХ ИДЁТ ЗА ТОБОЙ', VIEW_W / 2, 92, { size: 9, color: C.soul, align: 'center' });
    ctx.globalAlpha = pulse;
    text(ctx, 'МЕСТЬ СВЕРШИЛАСЬ. ТРОН ПРИНАДЛЕЖИТ ПРИЗРАКУ.', VIEW_W / 2, 108, { size: 8, color: C.purple, align: 'center' });
    ctx.globalAlpha = 1;
  } else {
    glowText(ctx, 'ТРОН ПУСТ', VIEW_W / 2, 74, 30, C.red, 'rgba(224,72,92,0.55)');
    text(ctx, 'ТЫ УБИЛ ГЕРОЯ, НО ЛЕГИОН НЕ ПРИШЁЛ.', VIEW_W / 2, 92, { size: 8, color: C.dim, align: 'center' });
    ctx.globalAlpha = pulse;
    text(ctx, 'ТЫ СТАЛ НОВЫМ ГЕРОЕМ', VIEW_W / 2, 108, { size: 8, color: C.red, align: 'center' });
    ctx.globalAlpha = 1;
    text(ctx, 'СОБЕРИ 1000 ДУШ, ЧТОБЫ СВЕРШИТЬ НАСТОЯЩУЮ МЕСТЬ', VIEW_W / 2, 122, { size: 7, color: 'rgba(200,180,190,0.65)', align: 'center' });
  }

  // панель итогов
  rect(ctx, 126, 178, 228, 46, 'rgba(6,5,12,0.72)');
  rect(ctx, 126, 178, 228, 1, isTrue ? 'rgba(159,232,255,0.35)' : 'rgba(224,72,92,0.3)');

  const st = game.stats;
  text(ctx, `ЛЕГИОН: ${st.souls} / 1000`, VIEW_W / 2, 191, { size: 10, color: isTrue ? C.soul : C.dim, align: 'center' });
  text(ctx, `УБИТО: ${st.kills}     ВРЕМЯ: ${formatTime(st.time)}`, VIEW_W / 2, 203, { size: 9, color: C.white, align: 'center' });
  text(ctx, `МОНЕТ: ${st.money}`, VIEW_W / 2, 215, { size: 9, color: C.gold, align: 'center' });

  glowText(ctx, 'ENTER — НОВЫЙ ЗАБЕГ', VIEW_W / 2, 239, 10, C.gold, 'rgba(255,207,107,0.5)');
}

export function drawPause(ctx: CanvasRenderingContext2D, game: Game): void {
  rect(ctx, 0, 0, VIEW_W, VIEW_H, 'rgba(4,3,8,0.74)');
  panel(ctx, VIEW_W / 2 - 122, 70, 244, 132, C.purple);
  glowText(ctx, 'ПАУЗА', VIEW_W / 2, 98, 20, C.white, 'rgba(159,232,255,0.5)');
  text(ctx, 'ДУША ЗАМЕРЛА. МИР ЖДЁТ.', VIEW_W / 2, 114, { size: 7, color: 'rgba(160,150,190,0.7)', align: 'center' });
  text(ctx, 'ESC — ПРОДОЛЖИТЬ', VIEW_W / 2, 132, { size: 8, color: C.gold, align: 'center' });
  text(ctx, `СЕМЯ ЗАБЕГА: ${game.seed.toString(16).toUpperCase()}`, VIEW_W / 2, 150, { size: 7, color: 'rgba(150,142,180,0.6)', align: 'center' });
  text(ctx, `ГЛУБИНА: ${game.locationIndex + 1} / 6   ·   ДУШ: ${game.souls}`, VIEW_W / 2, 162, { size: 7, color: 'rgba(150,142,180,0.6)', align: 'center' });
  text(ctx, 'TAB / I — ГЕРОЙ   ·   M — ЗВУК   ·   F11 — ЭКРАН', VIEW_W / 2, 180, { size: 7, color: C.dim, align: 'center' });
}

function drawGem(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, scale = 1): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  const glow = ctx.createRadialGradient(0, 0, 1, 0, 0, 10);
  glow.addColorStop(0, color);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = 0.24;
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  const gem = ctx.createLinearGradient(-5, -6, 5, 6);
  gem.addColorStop(0, '#ffffff');
  gem.addColorStop(0.3, color);
  gem.addColorStop(1, '#1a1430');
  ctx.fillStyle = gem;
  ctx.beginPath();
  ctx.moveTo(0, -6);
  ctx.lineTo(5, -1);
  ctx.lineTo(0, 6);
  ctx.lineTo(-5, -1);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 0.5;
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.beginPath();
  ctx.moveTo(0, -6);
  ctx.lineTo(0, 6);
  ctx.moveTo(-5, -1);
  ctx.lineTo(5, -1);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillRect(-1, -3.5, 1.5, 1.5);
  ctx.restore();
}

/** Меню героя: портрет, характеристики и инвентарь с амулетами. */
export function drawHeroMenu(ctx: CanvasRenderingContext2D, game: Game): void {
  const p = game.player;
  const t = game.time;

  rect(ctx, 0, 0, VIEW_W, VIEW_H, 'rgba(4,3,8,0.8)');
  panel(ctx, 14, 12, 452, 246, C.purple);

  // заголовок
  glowText(ctx, 'ГЕРОЙ', 28, 37, 17, C.white, 'rgba(185,166,255,0.6)', 'left');
  text(ctx, 'ДУША ПАВШЕГО ЗЛОДЕЯ', 28, 49, { size: 5.8, color: 'rgba(170,160,205,0.7)' });
  rect(ctx, 26, 56, 428, 1, 'rgba(255,255,255,0.07)');
  rect(ctx, 182, 66, 1, 176, 'rgba(255,255,255,0.07)');

  // портрет
  rect(ctx, 26, 62, 146, 84, 'rgba(0,0,0,0.34)');
  rect(ctx, 26, 62, 146, 1, 'rgba(185,166,255,0.22)');
  ctx.save();
  ctx.beginPath();
  ctx.rect(26, 62, 146, 84);
  ctx.clip();
  const halo = ctx.createRadialGradient(99, 110, 4, 99, 110, 58);
  halo.addColorStop(0, 'rgba(159,232,255,0.15)');
  halo.addColorStop(0.55, 'rgba(143,123,255,0.07)');
  halo.addColorStop(1, 'rgba(143,123,255,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(26, 62, 146, 84);
  const customPortrait = drawCustomAsset(ctx, 'ui/hero/portrait', {
    x: 99, y: 140, height: 112, anchor: 'bottom-center',
  });
  if (!customPortrait) {
    ctx.translate(99, 140);
    ctx.scale(1.45, 1.45);
    drawGhostHero(ctx, 0, 0, { time: t, facing: 1, alpha: 1, castGlow: 0.22, castColor: C.spectral });
  }
  ctx.restore();

  // оболочка — красная, чтобы жизни читались сразу
  text(ctx, 'ОБОЛОЧКА', 26, 160, { size: 5.5, color: C.red });
  text(ctx, `${p.hp} / ${p.maxHp}`, 172, 160, { size: 7, color: C.red, align: 'right' });
  ctx.save();
  ctx.shadowColor = 'rgba(224,72,92,0.7)';
  ctx.shadowBlur = 5;
  bar(ctx, 26, 164, 146, 5, p.hp / p.maxHp, C.red, 'rgba(34,7,14,0.85)', 'rgba(224,72,92,0.4)');
  ctx.restore();

  text(ctx, 'ЭКТОПЛАЗМА', 26, 179, { size: 5.5, color: C.dim });
  text(ctx, `${Math.round(p.mana)} / ${p.maxMana}`, 172, 179, { size: 6.5, color: C.mana, align: 'right' });
  bar(ctx, 26, 183, 146, 4, p.mana / p.maxMana, C.mana);

  // характеристики
  const stat = (label: string, value: string, x: number, y: number, color = C.white): void => {
    text(ctx, label, x, y, { size: 5.4, color: 'rgba(150,142,180,0.8)' });
    text(ctx, value, x + 64, y, { size: 7, color, align: 'right' });
  };
  stat('УРОН', `${1 + p.damageBonus}`, 26, 199, C.ember);
  stat('МОНЕТЫ', `${game.money}`, 100, 199, C.gold);
  stat('ДУШИ', `${game.souls}/1000`, 26, 212, C.soul);
  stat('УБИЙСТВА', `${game.kills}`, 100, 212, C.white);
  stat('ГЛУБИНА', `${game.locationIndex + 1}/6`, 26, 225, C.purple);
  stat('ВРЕМЯ', formatTime(game.runTime), 100, 225, C.white);

  text(ctx, 'TAB / I / ESC — ЗАКРЫТЬ', 26, 247, { size: 5.6, color: 'rgba(140,132,165,0.65)' });

  // инвентарь
  text(ctx, 'ИНВЕНТАРЬ', 196, 36, { size: 11, color: C.purple });
  const ownedKinds = AMULETS.filter((a) => game.amulets.includes(a.id)).length;
  text(ctx, `АМУЛЕТЫ: ${ownedKinds} / ${AMULETS.length}`, 452, 35, { size: 6.5, color: C.gold, align: 'right' });

  const cellW = 126;
  const cellH = 28;
  AMULETS.forEach((amulet, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 196 + col * 130;
    const y = 44 + row * 32;
    const count = game.amulets.filter((id) => id === amulet.id).length;
    const owned = count > 0;

    rect(ctx, x, y, cellW, cellH, owned ? 'rgba(30,22,54,0.66)' : 'rgba(8,7,16,0.5)');
    rect(ctx, x, y, cellW, 1, owned ? `${amulet.color}66` : 'rgba(255,255,255,0.04)');
    rect(ctx, x, y, 2, cellH, owned ? amulet.color : 'rgba(255,255,255,0.05)');

    drawGem(ctx, x + 14, y + 14, owned ? amulet.color : 'rgba(96,88,120,0.55)', owned ? 1 : 0.78);
    text(ctx, amulet.name, x + 27, y + 12, {
      size: 6, color: owned ? '#f2eefc' : 'rgba(135,127,160,0.5)',
    });
    text(ctx, amulet.desc, x + 27, y + 21, {
      size: 4.4, color: owned ? 'rgba(190,182,220,0.72)' : 'rgba(120,112,145,0.32)',
    });
    text(ctx, owned ? `×${count}` : '—', x + cellW - 6, y + 21, {
      size: 6, color: owned ? C.gold : 'rgba(110,102,135,0.4)', align: 'right',
    });
  });

  text(ctx, 'АМУЛЕТЫ ДЕЙСТВУЮТ ПОСТОЯННО', 196, 178, { size: 4.8, color: 'rgba(140,132,165,0.55)' });

  // легион
  rect(ctx, 196, 186, 256, 1, 'rgba(255,255,255,0.07)');
  text(ctx, 'ЛЕГИОН', 196, 198, { size: 9, color: C.ghost });
  text(ctx, `СОЮЗНИКИ: ${game.allies.length} / 12`, 452, 198, { size: 5.8, color: 'rgba(150,142,180,0.75)', align: 'right' });

  const roster = Object.entries(game.raised)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  if (roster.length === 0) {
    text(ctx, 'НИ ОДНА ДУША НЕ ПОДНЯТА', 196, 212, { size: 6, color: 'rgba(135,127,160,0.55)' });
  } else {
    roster.forEach(([kind, n], i) => {
      const x = 196 + (i % 2) * 130;
      const y = 212 + Math.floor(i / 2) * 14;
      drawSoulFlame(ctx, x + 3, y - 2, 6, t + i, C.ghost, true);
      text(ctx, `${ENEMY_NAMES[kind] ?? kind} ×${n}`, x + 11, y, { size: 6.2, color: C.ghost });
    });
  }

  const totalRaised = Object.values(game.raised).reduce((sum, n) => sum + n, 0);
  text(ctx, `ПОДНЯТО ДУШ: ${totalRaised}`, 26, 236, { size: 5.4, color: 'rgba(150,142,180,0.7)' });
  text(ctx, 'F11 — ЭКРАН   ·   M — ЗВУК', 452, 247, { size: 5.4, color: 'rgba(140,132,165,0.6)', align: 'right' });
}

/** Диалог с редким белым кроликом: погладить или съесть. */
export function drawRabbitDialog(ctx: CanvasRenderingContext2D, game: Game): void {
  const rabbit = game.rabbit;
  if (!rabbit) return;
  const result = game.rabbitResult;

  rect(ctx, 0, 0, VIEW_W, VIEW_H, 'rgba(4,3,8,0.78)');
  const accent = result === 'eat' ? C.red : C.soul;
  panel(ctx, 58, 30, 364, 208, accent);
  rect(ctx, 190, 48, 1, 174, 'rgba(255,255,255,0.08)');

  // портрет в рамке
  rect(ctx, 76, 52, 106, 136, 'rgba(5,4,10,0.7)');
  rect(ctx, 76, 52, 106, 1, `${accent}66`);
  rect(ctx, 76, 52, 1, 136, 'rgba(255,255,255,0.06)');
  const halo = ctx.createRadialGradient(129, 118, 4, 129, 118, 52);
  halo.addColorStop(0, result === 'eat' ? 'rgba(224,72,92,0.2)' : 'rgba(220,238,255,0.2)');
  halo.addColorStop(0.6, 'rgba(143,123,255,0.08)');
  halo.addColorStop(1, 'rgba(143,123,255,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(76, 52, 106, 136);

  drawRabbit(ctx, 129, 174, {
    time: game.time,
    facing: 1,
    scale: 2.65,
    alpha: result === 'pet' ? 0.8 : 1,
    angry: result === 'eat',
    vanish: result === 'pet' ? 0.42 : 0,
  });

  const spark = (x: number, y: number, phase: number): void => {
    const a = 0.3 + Math.max(0, Math.sin(game.time * 2.4 + phase)) * 0.55;
    ctx.globalAlpha = a;
    ctx.fillStyle = result === 'eat' ? C.red : C.white;
    ctx.fillRect(x, y, 1.2, 1.2);
    ctx.fillRect(x - 1.2, y + 1.2, 3.4, 0.8);
    ctx.fillRect(x + 0.2, y - 1.2, 0.8, 3.4);
    ctx.globalAlpha = 1;
  };
  spark(95, 90, 0.5);
  spark(158, 78, 2.3);
  spark(146, 160, 4.4);

  // заголовок
  text(ctx, 'БЕЛЫЙ КРОЛИК', 204, 58, { size: 12, color: C.white });
  text(ctx, 'РЕДКАЯ ДУША · НЕ ВРАГ', 204, 69, { size: 5.4, color: 'rgba(165,156,200,0.72)' });
  rect(ctx, 196, 74, 210, 1, 'rgba(255,255,255,0.07)');

  if (!result) {
    text(ctx, 'КРОЛИК СМОТРИТ НА ТЕБЯ', 196, 92, { size: 8, color: C.white });
    text(ctx, 'БЕЗ СТРАХА.', 196, 104, { size: 8, color: C.white });
    text(ctx, 'ЧТО ТЫ СДЕЛАЕШЬ?', 196, 120, { size: 6.4, color: 'rgba(160,151,195,0.8)' });

    const rows = [
      { label: 'ПОГЛАДИТЬ', note: '500 ДУШ', color: C.white, noteColor: C.gold },
      { label: 'СЪЕСТЬ', note: 'ПОЛОВИНА HP', color: C.red, noteColor: 'rgba(255,120,136,0.8)' },
    ];
    rows.forEach((row, i) => {
      const selected = game.rabbitChoice === i;
      const y = 137 + i * 23;
      if (selected) {
        rect(ctx, 196, y - 13, 208, 20, 'rgba(110,90,190,0.3)');
        rect(ctx, 196, y - 13, 2, 20, accent);
        text(ctx, '›', 202, y + 1, { size: 13, color: accent });
      }
      text(ctx, row.label, 212, y, { size: 9.5, color: selected ? row.color : 'rgba(200,192,225,0.6)' });
      text(ctx, row.note, 397, y, { size: 5.2, color: selected ? row.noteColor : 'rgba(130,122,155,0.45)', align: 'right' });
    });

    text(ctx, 'W / S — ВЫБОР   ·   ENTER — ПОДТВЕРДИТЬ', 196, 200, { size: 5.4, color: 'rgba(160,151,195,0.78)' });
    text(ctx, 'ESC — ОТОЙТИ', 196, 210, { size: 5.4, color: 'rgba(130,122,160,0.6)' });
    return;
  }

  if (result === 'pet') {
    text(ctx, 'ЧАРЫ РАЗВЕЯНЫ', 196, 91, { size: 9.5, color: C.gold });
    text(ctx, 'ТЫ ПОГЛАДИЛ БЕЛОГО КРОЛИКА.', 196, 106, { size: 6.2, color: C.white });
    text(ctx, 'ЭТО БЫЛ БЛУЖДАЮЩИЙ ПУТНИК,', 196, 117, { size: 6.2, color: C.white });
    text(ctx, 'ЗАКЛЮЧЁННЫЙ В ШКУРУ ЗВЕРЯ.', 196, 128, { size: 6.2, color: C.white });
    text(ctx, 'ЕГО ДУША СТОИТ 500 ДУШ.', 196, 146, { size: 7.6, color: C.soul });
    text(
      ctx,
      game.rabbitSoulGain > 0 ? `ЛЕГИОН: +${game.rabbitSoulGain} ДУШ` : 'ЛЕГИОН УЖЕ ПОЛОН',
      196, 162,
      { size: 7.2, color: game.rabbitSoulGain > 0 ? C.gold : C.dim },
    );
    text(ctx, 'ТЕПЕРЬ ОН СВОБОДЕН.', 196, 178, { size: 5.6, color: 'rgba(160,151,195,0.7)' });
  } else {
    text(ctx, 'КРОЛИК УКУСИЛ!', 196, 91, { size: 9.5, color: C.red });
    text(ctx, 'ТЫ ПОПЫТАЛСЯ СЪЕСТЬ БЕЛОГО КРОЛИКА.', 196, 106, { size: 6.2, color: C.white });
    text(ctx, 'ОН ВЦЕПИЛСЯ В ТЕБЯ И ЗАКРИЧАЛ:', 196, 117, { size: 6.2, color: C.white });
    glowText(ctx, '«НЕ МАТЕРИСЬ!»', 196, 139, 14, '#ff6b7e', 'rgba(224,72,92,0.65)', 'left');
    text(ctx, 'И УСКАКАЛ ПРОЧЬ.', 196, 154, { size: 6.4, color: C.white });
    text(
      ctx,
      game.rabbitBiteDamage > 0 ? `-${game.rabbitBiteDamage} ОБОЛОЧКИ` : 'ОБОЛОЧКА ВЫДЕРЖАЛА',
      196, 170,
      { size: 7.2, color: C.red },
    );
    text(ctx, 'НЕ СТОИЛО ЕГО ЗЛИТЬ.', 196, 184, { size: 5.6, color: 'rgba(160,151,195,0.7)' });
  }

  text(ctx, 'ENTER / A — ПРОДОЛЖИТЬ', 196, 208, { size: 5.6, color: 'rgba(160,151,195,0.78)' });
}
