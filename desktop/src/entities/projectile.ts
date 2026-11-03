import type { Game } from '../game';
import { TILE } from '../world/room';
import { C } from '../art/palette';

export type ProjectileKind = 'fireball' | 'arrow' | 'orb' | 'shock' | 'spear' | 'heroorb';
export type ProjectileOwner = 'player' | 'enemy';

export class Projectile {
  kind: ProjectileKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  damage: number;
  owner: ProjectileOwner;
  life: number;
  gravity: number;
  dead = false;
  animTime = 0;
  trailTimer = 0;

  constructor(
    kind: ProjectileKind,
    x: number,
    y: number,
    vx: number,
    vy: number,
    owner: ProjectileOwner,
    damage: number,
    life = 3,
    gravity = 0,
  ) {
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.owner = owner;
    this.damage = damage;
    this.life = life;
    this.gravity = gravity;
    if (kind === 'fireball') { this.w = 9; this.h = 9; }
    else if (kind === 'arrow') { this.w = 9; this.h = 3; }
    else if (kind === 'orb' || kind === 'heroorb') { this.w = 8; this.h = 8; }
    else if (kind === 'shock') { this.w = 18; this.h = 16; }
    else { this.w = 5; this.h = 20; }
  }

  update(dt: number, game: Game): void {
    if (this.dead) return;
    this.animTime += dt;
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }

    this.vy += this.gravity * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    if (this.kind === 'fireball') {
      this.trailTimer -= dt;
      if (this.trailTimer <= 0) {
        this.trailTimer = 0.03;
        game.fx.ember(this.x, this.y, C.gold);
      }
    }

    // world collision
    const tx = Math.floor(this.x / TILE);
    const ty = Math.floor(this.y / TILE);
    if (game.room.isSolid(tx, ty)) {
      if (this.kind === 'fireball') this.explode(game);
      else if (this.kind === 'shock') this.dead = true;
      else this.dead = true;
      return;
    }

    if (this.owner === 'player') {
      const hits = game.damageEnemiesInRect(this.x - this.w / 2, this.y - this.h / 2, this.w, this.h, this.damage, Math.sign(this.vx) || 1, true);
      if (hits > 0) {
        if (this.kind === 'fireball') this.explode(game);
        else {
          this.dead = true;
          game.fx.spark(this.x, this.y, C.white);
        }
      }
    } else {
      const p = game.player;
      if (
        this.x + this.w / 2 > p.x && this.x - this.w / 2 < p.x + p.w &&
        this.y + this.h / 2 > p.y && this.y - this.h / 2 < p.y + p.h
      ) {
        p.hurt(this.damage, this.x, game);
        if (this.kind === 'fireball' || this.kind === 'heroorb') this.explode(game);
        else this.dead = true;
      }
    }
  }

  explode(game: Game): void {
    this.dead = true;
    game.explode(this.x, this.y, 24, 2, this.owner === 'player');
  }

  draw(ctx: CanvasRenderingContext2D, time: number): void {
    ctx.save();
    ctx.translate(Math.round(this.x), Math.round(this.y));
    if (this.kind === 'fireball') {
      const r = 4 + Math.sin(time * 20) * 0.7;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(0, 0, 0.5, 0, 0, r + 6);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.28, '#ffe6a8');
      g.addColorStop(0.6, '#ff9a3c');
      g.addColorStop(1, 'rgba(224,72,92,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r + 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff4d0';
      ctx.beginPath();
      ctx.arc(-0.5, -0.5, r * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (this.kind === 'arrow') {
      const ang = Math.atan2(this.vy, this.vx);
      ctx.rotate(ang);
      ctx.strokeStyle = '#d8d0b8';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(-6, 0);
      ctx.lineTo(5, 0);
      ctx.stroke();
      ctx.fillStyle = '#8a7a54';
      ctx.beginPath();
      ctx.moveTo(4, -2.3);
      ctx.lineTo(8, 0);
      ctx.lineTo(4, 2.3);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#6d5a3a';
      ctx.beginPath();
      ctx.moveTo(-6, 0);
      ctx.lineTo(-9, -2);
      ctx.lineTo(-7.5, 0);
      ctx.lineTo(-9, 2);
      ctx.closePath();
      ctx.fill();
    } else if (this.kind === 'orb' || this.kind === 'heroorb') {
      const hero = this.kind === 'heroorb';
      const col = hero ? C.red : C.purple;
      const r = 3.5 + Math.sin(time * 12) * 0.6;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(0, 0, 0.4, 0, 0, r + 6);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.3, hero ? '#ffb3bd' : '#e8e0ff');
      g.addColorStop(0.65, col);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r + 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = hero ? 'rgba(255,138,212,0.6)' : 'rgba(159,232,255,0.55)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.arc(0, 0, r + 2.5, time * 4, time * 4 + Math.PI * 1.4);
      ctx.stroke();
      ctx.restore();
    } else if (this.kind === 'shock') {
      const f = 0.6 + Math.sin(time * 20) * 0.3;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.shadowColor = C.purple;
      ctx.shadowBlur = 8;
      ctx.fillStyle = `rgba(185,166,255,${0.7 * f})`;
      ctx.beginPath();
      ctx.moveTo(-9, 6);
      ctx.lineTo(-5, -2);
      ctx.lineTo(-3, 3);
      ctx.lineTo(0, -9);
      ctx.lineTo(3, 3);
      ctx.lineTo(5, -2);
      ctx.lineTo(9, 6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#f2eefc';
      ctx.fillRect(-2, -1, 4, 1.5);
      ctx.restore();
    } else {
      ctx.rotate(Math.atan2(this.vy, this.vx) + Math.PI / 2);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.shadowColor = C.soul;
      ctx.shadowBlur = 6;
      const g = ctx.createLinearGradient(0, -10, 0, 10);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.5, '#e8dfc4');
      g.addColorStop(1, '#8a7a54');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, -11);
      ctx.lineTo(2.5, 0);
      ctx.lineTo(0, 10);
      ctx.lineTo(-2.5, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }
}
