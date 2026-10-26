import type { Game } from '../game';
import { C } from '../art/palette';
import { text, bar, rect } from '../core/draw';
import { VIEW_W, VIEW_H, ENEMY_NAMES } from '../core/constants';
function maskIcon(ctx: CanvasRenderingContext2D, x: number, y: number, full: boolean): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = full ? '#e9e3d2' : 'rgba(90,84,112,0.45)';
  ctx.beginPath();
  ctx.ellipse(4, 4.5, 3.8, 4.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(1, 2); ctx.lineTo(-1, -2); ctx.lineTo(3, 0); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(7, 2); ctx.lineTo(9, -2); ctx.lineTo(5, 0); ctx.closePath(); ctx.fill();
  if (full) {
    ctx.fillStyle = '#0b0a12';
    ctx.fillRect(1.6, 4, 1.4, 2.2);
    ctx.fillRect(5, 4, 1.4, 2.2);
  }
  ctx.restore();
}

export function drawHUD(ctx: CanvasRenderingContext2D, game: Game): void {
  const p = game.player;

  // HUD backplates
  rect(ctx, 5, 4, 104, 36, 'rgba(6,5,12,0.5)');
  rect(ctx, VIEW_W - 136, 4, 131, 54, 'rgba(6,5,12,0.5)');

  // masks
  const maxShow = Math.min(p.maxHp, 12);
  for (let i = 0; i < maxShow; i++) {
    maskIcon(ctx, 10 + i * 11, 8, i < p.hp);
  }
  // mana
  bar(ctx, 10, 23, 72, 4, p.mana / p.maxMana, C.mana);
  text(ctx, 'МАНА', 10, 36, { size: 6, color: C.dim });

  // souls
  text(ctx, 'ДУШИ', VIEW_W - 12, 12, { size: 7, color: C.dim, align: 'right' });
  text(ctx, `${game.souls}/1000`, VIEW_W - 12, 27, { size: 12, color: C.soul, align: 'right' });
  bar(ctx, VIEW_W - 106, 31, 94, 3, game.souls / 1000, C.soul, 'rgba(0,0,0,0.5)', 'rgba(159,232,255,0.25)');

  // coins + amulets
  text(ctx, `МОНЕТЫ ${game.money}`, VIEW_W - 12, 45, { size: 8, color: C.gold, align: 'right' });
  if (game.amulets.length > 0) {
    text(ctx, `АМУЛЕТЫ ${game.amulets.length}`, VIEW_W - 12, 56, { size: 7, color: C.purple, align: 'right' });
  }

  // squad composition
  if (game.souls > 0) {
    const entries = Object.entries(game.raised)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
    if (entries.length > 0) {
      const blockH = 12 + entries.length * 9;
      rect(ctx, 5, 44, 104, blockH, 'rgba(6,5,12,0.42)');
      text(ctx, 'ЛЕГИОН', 10, 51, { size: 6, color: C.dim });
      entries.forEach(([kind, n], i) => {
        text(ctx, `${ENEMY_NAMES[kind] ?? kind} ×${n}`, 10, 61 + i * 9, {
          size: 7, color: C.ghost, shadow: true,
        });
      });
    }
  }

  // spell hints
  const spells: [string, number][] = [
    ['K ОГОНЬ', p.spellCost(22)],
    ['L ЛЕЧЕНИЕ', p.spellCost(33)],
    ['Q ПРИЗЫВ', p.spellCost(40)],
  ];
  spells.forEach(([name, cost], i) => {
    const ok = p.mana >= cost;
    text(ctx, `${name} ${cost}`, VIEW_W - 10, VIEW_H - 12 - (spells.length - 1 - i) * 9, {
      size: 7, color: ok ? C.dim : 'rgba(120,110,140,0.45)', align: 'right',
    });
  });
  if (game.souls >= 1000) {
    text(ctx, 'R ЛЕГИОН', VIEW_W - 10, VIEW_H - 39, { size: 7, color: C.purple, align: 'right' });
  }

  // boss bar
  if (game.boss && !game.boss.dead) {
    const b = game.boss;
    const bw = 200;
    const bx = VIEW_W / 2 - bw / 2;
    const by = VIEW_H - 20;
    text(ctx, b.name, VIEW_W / 2, by - 5, { size: 8, color: b.def.accent, align: 'center' });
    bar(ctx, bx, by, bw, 5, b.hp / b.maxHp, b.def.accent, 'rgba(0,0,0,0.7)', 'rgba(255,255,255,0.25)');
    // phase pips
    for (let i = 0; i < b.phaseCount; i++) {
      const active = i <= b.phase;
      rect(ctx, bx + bw - (b.phaseCount - i) * 7, by - 8, 4, 2, active ? b.def.accent : 'rgba(255,255,255,0.15)');
    }
  }

  // boss intro
  if (game.bossIntroTimer > 0 && game.boss) {
    const a = Math.min(1, game.bossIntroTimer / 0.6);
    ctx.save();
    ctx.globalAlpha = a;
    text(ctx, game.boss.name, VIEW_W / 2, 82, { size: 20, color: game.boss.def.accent, align: 'center', shadow: true });
    if (game.boss.kind === 'hero') {
      text(ctx, 'ТОТ, КТО ПРЕДАЛ ЛЕГИОН', VIEW_W / 2, 96, { size: 7, color: C.dim, align: 'center' });
      if (game.heroBonus > 0) {
        text(ctx, `ТВОЁ ОДИНОЧЕСТВО ДЕЛАЕТ ЕГО СИЛЬНЕЕ: +${game.heroBonus} HP`, VIEW_W / 2, 108, {
          size: 7, color: C.red, align: 'center',
        });
      }
    } else {
      text(ctx, 'ХРАНИТЕЛЬ ЭТИХ ЗЕМЕЛЬ', VIEW_W / 2, 96, { size: 7, color: C.dim, align: 'center' });
    }
    ctx.restore();
  }

  // prompt
  if (game.nearCorpse) {
    const c = game.nearCorpse;
    const label = `E — ПОДНЯТЬ (+${c.soulValue} ДУШ)     F — ОБЫСКАТЬ`;
    const w = label.length * 5.6 + 20;
    rect(ctx, VIEW_W / 2 - w / 2, VIEW_H - 46, w, 16, 'rgba(8,6,14,0.78)');
    rect(ctx, VIEW_W / 2 - w / 2, VIEW_H - 46, w, 1, 'rgba(159,232,255,0.35)');
    text(ctx, label, VIEW_W / 2, VIEW_H - 35, { size: 8, color: C.soul, align: 'center' });
  } else if (game.nearAltar) {
    const label = 'E — АЛТАРЬ ПЕПЛА';
    const w = label.length * 5.6 + 20;
    rect(ctx, VIEW_W / 2 - w / 2, VIEW_H - 46, w, 16, 'rgba(8,6,14,0.78)');
    rect(ctx, VIEW_W / 2 - w / 2, VIEW_H - 46, w, 1, 'rgba(185,166,255,0.4)');
    text(ctx, label, VIEW_W / 2, VIEW_H - 35, { size: 8, color: C.purple, align: 'center' });
  }

  // notifications
  if (game.bossIntroTimer <= 0) {
    const notifY = game.souls > 0 ? 100 : 34;
    game.notifications.forEach((n, i) => {
      const a = Math.min(1, n.life / 0.4);
      ctx.globalAlpha = a;
      text(ctx, n.text, VIEW_W / 2, notifY + i * 11, { size: 8, color: n.color, align: 'center', shadow: true });
      ctx.globalAlpha = 1;
    });
  }

  // starting controls hint
  if (
    game.locationIndex === 0 && game.roomInLocation === 0 && game.time < 11 &&
    !game.shopOpen && !game.nearCorpse && !game.nearAltar
  ) {
    const a = Math.min(1, (11 - game.time) / 2);
    ctx.globalAlpha = a * 0.9;
    const hint = 'A/D ИДТИ · SPACE ПРЫЖОК ×2 · SHIFT РЫВОК · J УДАР · K ОГОНЬ · L ЛЕЧЕНИЕ';
    const w = hint.length * 4.4 + 18;
    rect(ctx, VIEW_W / 2 - w / 2, 56, w, 14, 'rgba(6,5,12,0.5)');
    text(ctx, hint, VIEW_W / 2, 66, { size: 6, color: C.dim, align: 'center' });
    ctx.globalAlpha = 1;
  }

  // damage vignette
  if (game.damageFlash > 0) {
    const g = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.3, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.7);
    g.addColorStop(0, 'rgba(224,72,92,0)');
    g.addColorStop(1, `rgba(224,72,92,${game.damageFlash * 0.45})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
}
