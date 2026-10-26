import type { Game } from '../game';
import { C } from '../art/palette';
import { text, rect, bar } from '../core/draw';
import { VIEW_W, VIEW_H, ENEMY_NAMES } from '../core/constants';

export function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, accent: string): void {
  rect(ctx, x, y, w, h, 'rgba(8,7,14,0.92)');
  rect(ctx, x, y, w, 1, accent);
  rect(ctx, x, y + h - 1, w, 1, 'rgba(255,255,255,0.08)');
  rect(ctx, x, y, 1, h, 'rgba(255,255,255,0.08)');
  rect(ctx, x + w - 1, y, 1, h, 'rgba(255,255,255,0.08)');
  // corners
  rect(ctx, x, y, 8, 2, accent);
  rect(ctx, x, y, 2, 8, accent);
  rect(ctx, x + w - 8, y, 8, 2, accent);
  rect(ctx, x + w - 2, y, 2, 8, accent);
  rect(ctx, x, y + h - 2, 8, 2, accent);
  rect(ctx, x, y + h - 8, 2, 8, accent);
  rect(ctx, x + w - 8, y + h - 2, 8, 2, accent);
  rect(ctx, x + w - 2, y + h - 8, 2, 8, accent);
}

export function drawTitle(ctx: CanvasRenderingContext2D, game: Game): void {
  const t = game.time;
  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, '#07060b');
  g.addColorStop(0.55, '#171126');
  g.addColorStop(1, '#07060b');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // drifting embers
  for (let i = 0; i < 40; i++) {
    const x = ((t * (6 + (i % 5) * 2) + i * 71) % (VIEW_W + 40)) - 20;
    const y = VIEW_H - ((t * (10 + (i % 7) * 3) + i * 43) % (VIEW_H + 40));
    ctx.globalAlpha = 0.12 + ((i * 7) % 10) / 40;
    ctx.fillStyle = i % 5 === 0 ? C.gold : C.purple;
    ctx.fillRect(Math.floor(x), Math.floor(y), 1 + (i % 2), 1 + (i % 2));
  }
  ctx.globalAlpha = 1;

  // giant soul sigil
  ctx.save();
  ctx.translate(VIEW_W / 2, 92);
  const pulse = 0.5 + Math.sin(t * 1.3) * 0.15;
  const rg = ctx.createRadialGradient(0, 0, 4, 0, 0, 90);
  rg.addColorStop(0, `rgba(159,232,255,${0.1 * pulse})`);
  rg.addColorStop(1, 'rgba(159,232,255,0)');
  ctx.fillStyle = rg;
  ctx.fillRect(-100, -100, 200, 200);
  ctx.strokeStyle = `rgba(185,166,255,${0.18 + pulse * 0.1})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, 46, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 56, 0.3, Math.PI * 1.4);
  ctx.stroke();
  // mask
  ctx.fillStyle = 'rgba(233,227,210,0.9)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 16, 19, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-13, -8); ctx.lineTo(-22, -28); ctx.lineTo(-7, -14); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(13, -8); ctx.lineTo(22, -28); ctx.lineTo(7, -14); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#0b0a12';
  ctx.beginPath();
  ctx.ellipse(-5.5, -1, 3.2, 6, 0.1, 0, Math.PI * 2);
  ctx.ellipse(5.5, -1, 3.2, 6, -0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.soul;
  ctx.fillRect(-6.5, -2, 2, 2);
  ctx.fillRect(4.5, -2, 2, 2);
  ctx.restore();

  text(ctx, 'ПЕПЕЛЬНЫЙ', VIEW_W / 2, 142, { size: 30, color: C.white, align: 'center', shadow: true });
  text(ctx, 'ЛЕГИОН', VIEW_W / 2, 170, { size: 30, color: C.purple, align: 'center', shadow: true });
  text(ctx, 'ТЫСЯЧА ПАВШИХ ЖДЁТ ТВОЕГО СЛОВА', VIEW_W / 2, 186, { size: 8, color: C.dim, align: 'center' });

  const blink = Math.sin(t * 3) > -0.4;
  if (blink) {
    text(ctx, 'ENTER — НАЧАТЬ ЗАБЕГ', VIEW_W / 2, 212, { size: 11, color: C.gold, align: 'center' });
  }

  const rec = game.record;
  text(
    ctx,
    `РЕКОРД: ${rec.bestSouls} ДУШ · ${rec.bestKills} УБИЙСТВ · ${rec.runs} ЗАБЕГОВ`,
    VIEW_W / 2,
    230,
    { size: 7, color: 'rgba(160,150,190,0.6)', align: 'center' },
  );

  text(ctx, 'A/D — ДВИЖЕНИЕ   SPACE — ПРЫЖОК ×2   SHIFT — РЫВОК', VIEW_W / 2, 250, { size: 7, color: C.dim, align: 'center' });
  text(ctx, 'J — УДАР   K — ОГОНЬ   L — ЛЕЧЕНИЕ   Q — ПРИЗЫВ   E/F — ПАВШИЙ', VIEW_W / 2, 260, { size: 7, color: C.dim, align: 'center' });
  text(ctx, 'V — ПОЛНЫЙ ЭКРАН   M — ЗВУК', VIEW_W / 2, 265, { size: 6, color: 'rgba(120,110,150,0.5)', align: 'center' });
}

export function drawShop(ctx: CanvasRenderingContext2D, game: Game): void {
  rect(ctx, 0, 0, VIEW_W, VIEW_H, 'rgba(4,3,8,0.72)');
  const w = 330;
  const h = 214;
  const x = (VIEW_W - w) / 2;
  const y = (VIEW_H - h) / 2;
  panel(ctx, x, y, w, h, C.purple);

  text(ctx, 'АЛТАРЬ ПЕПЛА', VIEW_W / 2, y + 20, { size: 14, color: C.purple, align: 'center' });
  text(ctx, `МОНЕТЫ: ${game.money}`, VIEW_W / 2, y + 33, { size: 8, color: C.gold, align: 'center' });

  const startY = y + 50;
  game.shopItems.forEach((item, i) => {
    const iy = startY + i * 24;
    const selected = i === game.shopIndex;
    if (selected) {
      rect(ctx, x + 12, iy - 10, w - 24, 22, 'rgba(185,166,255,0.1)');
      rect(ctx, x + 12, iy - 10, 2, 22, C.purple);
    }
    const affordable = game.money >= item.cost;
    text(ctx, item.name, x + 22, iy, { size: 9, color: selected ? C.white : affordable ? '#c9c3dd' : '#6a6480' });
    text(ctx, `${item.cost}`, x + w - 22, iy, { size: 9, color: affordable ? C.gold : C.redDark, align: 'right' });
    text(ctx, item.desc, x + 22, iy + 8, { size: 6.5, color: 'rgba(150,142,180,0.75)' });
  });

  const sel = game.shopItems[game.shopIndex];
  if (sel) {
    text(ctx, sel.detail, VIEW_W / 2, y + h - 34, { size: 7, color: 'rgba(200,190,230,0.9)', align: 'center' });
  }
  text(ctx, 'ENTER — КУПИТЬ     ESC — УЙТИ', VIEW_W / 2, y + h - 14, { size: 7, color: C.dim, align: 'center' });
  if (game.shopMessage) {
    text(ctx, game.shopMessage, VIEW_W / 2, y + h - 46, { size: 7, color: C.gold, align: 'center' });
  }
}

export function drawDeath(ctx: CanvasRenderingContext2D, game: Game): void {
  const a = game.deathFade;
  rect(ctx, 0, 0, VIEW_W, VIEW_H, `rgba(4,3,8,${0.55 + a * 0.35})`);
  ctx.globalAlpha = Math.min(1, a * 1.5);
  text(ctx, 'ТЫ ПАЛ', VIEW_W / 2, 92, { size: 34, color: C.red, align: 'center', shadow: true });
  text(ctx, 'ЛЕГИОН РАССЫПАЛСЯ В ПЕПЕЛ', VIEW_W / 2, 108, { size: 8, color: C.dim, align: 'center' });

  const st = game.stats;
  text(ctx, `ДУШ СОБРАНО: ${st.souls} / 1000`, VIEW_W / 2, 138, { size: 9, color: C.soul, align: 'center' });
  text(ctx, `УБИТО: ${st.kills}     ГЛУБИНА: ${st.depth} / 6`, VIEW_W / 2, 152, { size: 9, color: C.white, align: 'center' });
  text(ctx, `МОНЕТ: ${st.money}     ВРЕМЯ: ${formatTime(st.time)}`, VIEW_W / 2, 166, { size: 9, color: C.gold, align: 'center' });
  if (st.newRecord) {
    text(ctx, 'НОВЫЙ РЕКОРД ПО ДУШАМ', VIEW_W / 2, 184, { size: 8, color: C.purple, align: 'center' });
  }
  text(ctx, 'ENTER — НОВЫЙ ЗАБЕГ', VIEW_W / 2, 212, { size: 11, color: C.gold, align: 'center' });
  ctx.globalAlpha = 1;
}

export function drawVictory(ctx: CanvasRenderingContext2D, game: Game): void {
  const t = game.time;
  const pulse = 0.7 + Math.sin(t * 2) * 0.3;
  const isTrue = game.ending === 'true';
  rect(ctx, 0, 0, VIEW_W, VIEW_H, isTrue ? 'rgba(4,3,8,0.78)' : 'rgba(12,5,8,0.82)');

  if (isTrue) {
    text(ctx, 'ГЕРОЙ ПАЛ', VIEW_W / 2, 78, { size: 34, color: C.gold, align: 'center', shadow: true });
    text(ctx, 'ТЫСЯЧА ПАВШИХ ИДЁТ ЗА ТОБОЙ', VIEW_W / 2, 96, { size: 9, color: C.soul, align: 'center' });
    ctx.globalAlpha = pulse;
    text(ctx, 'МЕСТЬ СВЕРШИЛАСЬ', VIEW_W / 2, 112, { size: 8, color: C.purple, align: 'center' });
    ctx.globalAlpha = 1;
  } else {
    text(ctx, 'ТРОН ПУСТ', VIEW_W / 2, 78, { size: 34, color: C.red, align: 'center', shadow: true });
    text(ctx, 'ТЫ УБИЛ ГЕРОЯ. НО ЛЕГИОН НЕ ПРИШЁЛ.', VIEW_W / 2, 96, { size: 8, color: C.dim, align: 'center' });
    ctx.globalAlpha = pulse;
    text(ctx, 'ТЫ СТАЛ НОВЫМ ГЕРОЕМ', VIEW_W / 2, 112, { size: 8, color: C.red, align: 'center' });
    ctx.globalAlpha = 1;
    text(ctx, 'СОБЕРИ 1000 ДУШ, ЧТОБЫ СВЕРШИТЬ НАСТОЯЩУЮ МЕСТЬ', VIEW_W / 2, 126, { size: 7, color: 'rgba(200,180,190,0.65)', align: 'center' });
  }

  const st = game.stats;
  text(ctx, `ЛЕГИОН: ${st.souls} / 1000`, VIEW_W / 2, 148, { size: 10, color: isTrue ? C.soul : C.dim, align: 'center' });
  text(ctx, `УБИТО: ${st.kills}     ВРЕМЯ: ${formatTime(st.time)}`, VIEW_W / 2, 164, { size: 9, color: C.white, align: 'center' });
  text(ctx, `МОНЕТ: ${st.money}`, VIEW_W / 2, 178, { size: 9, color: C.gold, align: 'center' });

  text(ctx, 'ENTER — НОВЫЙ ЗАБЕГ', VIEW_W / 2, 216, { size: 11, color: C.gold, align: 'center' });
}

export function drawPause(ctx: CanvasRenderingContext2D, game: Game): void {
  rect(ctx, 0, 0, VIEW_W, VIEW_H, 'rgba(4,3,8,0.7)');
  panel(ctx, VIEW_W / 2 - 110, 76, 220, 118, C.purple);
  text(ctx, 'ПАУЗА', VIEW_W / 2, 102, { size: 20, color: C.white, align: 'center' });
  text(ctx, 'ESC — ПРОДОЛЖИТЬ', VIEW_W / 2, 124, { size: 8, color: C.dim, align: 'center' });
  text(ctx, `СЕМЯ ЗАБЕГА: ${game.seed.toString(16).toUpperCase()}`, VIEW_W / 2, 142, { size: 7, color: 'rgba(150,142,180,0.6)', align: 'center' });
  text(ctx, `ГЛУБИНА: ${game.locationIndex + 1} / 6`, VIEW_W / 2, 154, { size: 7, color: 'rgba(150,142,180,0.6)', align: 'center' });
  text(ctx, 'M — ЗВУК   V — ЭКРАН', VIEW_W / 2, 174, { size: 7, color: C.dim, align: 'center' });
}
