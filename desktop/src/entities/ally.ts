import type { Game } from '../game';
import { EnemyKind, TILE } from '../world/room';
import { ENEMY_STATS, drawCreature } from './enemies';
import { C } from '../art/palette';
import { drawCustomFirst } from '../art/custom';

export class Ally {
  kind: EnemyKind;
  x: number;
  y: number;
  w: number;
  h: number;
  facing = 1;
  life = 30;
  maxLife = 30;
  attackCd = 0;
  dead = false;
  animTime = 0;
  bobPhase: number;
  vx = 0;
  vy = 0;
  wanderAngle = 0;

  get cx(): number { return this.x + this.w / 2; }
  get cy(): number { return this.y + this.h / 2; }

  constructor(kind: EnemyKind, x: number, y: number) {
    this.kind = kind;
    const s = ENEMY_STATS[kind];
    this.w = s.w;
    this.h = s.h;
    this.x = x - this.w / 2;
    this.y = y - this.h;
    this.bobPhase = Math.random() * Math.PI * 2;
    this.life = 30;
    this.maxLife = 30;
  }

  update(dt: number, game: Game): void {
    if (this.dead) return;
    this.animTime += dt;
    this.life -= dt;
    this.attackCd = Math.max(0, this.attackCd - dt);
    if (this.life <= 0) { this.dead = true; game.fx.ring(this.cx, this.cy, C.ghost); return; }

    const target = game.nearestEnemy(this.cx, this.cy, 260);
    let tx: number;
    let ty: number;
    if (target) {
      tx = target.cx;
      ty = target.cy;
      this.facing = tx > this.cx ? 1 : -1;
      if (target.dist < 24) {
        if (this.attackCd <= 0) this.attack(game, target);
        tx = this.cx + (Math.random() - 0.5) * 10;
        ty = this.cy + (Math.random() - 0.5) * 10;
      }
    } else {
      const p = game.player;
      const side = this.kind === 'archer' || this.kind === 'mage' ? -1 : 1;
      tx = p.cx + side * (26 + Math.sin(this.bobPhase) * 10);
      ty = p.cy - 14 + Math.cos(this.bobPhase + this.animTime) * 6;
      this.facing = p.facing;
      if (Math.abs(p.cx - this.cx) > 160) {
        this.x = p.cx + side * 30 - this.w / 2;
        this.y = p.cy - 20;
      }
    }

    const dx = tx - this.cx;
    const dy = ty - this.cy;
    const d = Math.hypot(dx, dy) || 1;
    const speed = target && target.dist > 30 ? 150 : 110;
    this.x += (dx / d) * Math.min(speed * dt, d);
    this.y += (dy / d) * Math.min(speed * dt, d);
    this.y += Math.sin(this.animTime * 4 + this.bobPhase) * 0.25;

    // keep inside room
    this.x = Math.max(TILE, Math.min(game.room.widthPx - TILE - this.w, this.x));
    this.y = Math.max(TILE, Math.min(game.room.heightPx - TILE - this.h, this.y));
  }

  attack(game: Game, target: { cx: number; cy: number; dist: number }): void {
    this.attackCd = this.kind === 'elite' ? 1.1 : 0.85;
    if (this.kind === 'archer' || this.kind === 'mage') {
      const ax = this.cx;
      const ay = this.cy;
      const ang = Math.atan2(target.cy - ay, target.cx - ax);
      const kind = this.kind === 'mage' ? 'orb' : 'arrow';
      game.spawnProjectile(kind, ax, ay, Math.cos(ang) * 190, Math.sin(ang) * 190, 'player', this.kind === 'mage' ? 2 : 1);
      game.sound.select();
    } else {
      const dmg = this.kind === 'elite' ? 2 : 1;
      const hits = game.damageEnemiesInRect(this.cx - 16, this.cy - 16, 32, 32, dmg, this.facing, true);
      if (hits > 0) {
        game.fx.spark(this.cx + this.facing * 10, this.cy, C.ghost);
        game.sound.hit();
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, time: number): void {
    const fade = this.life < 4 ? Math.max(0, this.life / 4) : 1;

    const custom = drawCustomFirst(ctx, [`characters/allies/${this.kind}/idle`, `characters/allies/${this.kind}`], {
      x: this.cx,
      y: this.cy + this.h / 2,
      height: this.h * 2.2,
      flip: this.facing < 0,
      alpha: 0.82 * fade,
      filter: 'sepia(0.4) hue-rotate(155deg) saturate(1.9) brightness(1.3)',
    });
    if (custom) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.18 + Math.sin(this.animTime * 3 + this.bobPhase) * 0.05;
      ctx.fillStyle = C.ghost;
      ctx.beginPath();
      ctx.ellipse(this.cx, this.cy, this.w * 0.36, this.h * 0.48, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.globalAlpha = 0.9 * fade;

    // призрачная аура
    const aura = ctx.createRadialGradient(this.cx, this.cy, 2, this.cx, this.cy, 19);
    aura.addColorStop(0, 'rgba(159,232,255,0.22)');
    aura.addColorStop(0.6, 'rgba(125,249,255,0.07)');
    aura.addColorStop(1, 'rgba(125,249,255,0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, 19, 0, Math.PI * 2);
    ctx.fill();

    // хвост эктоплазмы
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(159,232,255,0.22)';
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    for (let i = -1; i <= 1; i++) {
      const sway = Math.sin(this.animTime * 4 + this.bobPhase + i) * 3;
      ctx.beginPath();
      ctx.moveTo(this.cx + i * 4, this.cy + this.h / 2 - 3);
      ctx.quadraticCurveTo(this.cx + i * 6 + sway, this.cy + this.h / 2 + 4, this.cx + i * 5 + sway * 1.4, this.cy + this.h / 2 + 9);
      ctx.stroke();
    }
    ctx.restore();

    ctx.translate(Math.round(this.cx), Math.round(this.cy + this.h / 2));
    ctx.scale(this.facing, 1);

    // призрачная тонировка спрайта
    ctx.save();
    ctx.filter = 'sepia(0.45) hue-rotate(155deg) saturate(2.1) brightness(1.28)';
    ctx.globalAlpha = 0.58;
    drawCreature(ctx, this.kind, time + this.bobPhase, C.ghost, false, this.w, this.h);
    ctx.restore();

    // бледный контур души
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.18 + Math.sin(this.animTime * 3 + this.bobPhase) * 0.05;
    ctx.fillStyle = C.ghost;
    ctx.beginPath();
    ctx.ellipse(0, -this.h * 0.45, this.w * 0.36, this.h * 0.48, 0, 0, Math.PI * 2);
    ctx.fill();

    // огонёк над головой
    const flameY = -this.h - 3 + Math.sin(this.animTime * 3 + this.bobPhase) * 1.5;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(200,255,242,0.75)';
    ctx.beginPath();
    ctx.arc(0, flameY, 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(159,232,255,0.4)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.ellipse(0, flameY + 3, 4, 1.3, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}
