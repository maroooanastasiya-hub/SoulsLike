import type { Game } from '../game';
import { EnemyKind, TILE, moveBody, Body } from '../world/room';
import { C } from '../art/palette';

export interface EnemyStats {
  w: number;
  h: number;
  hp: number;
  soul: number;
  contact: number;
  coins: [number, number];
}

export const ENEMY_STATS: Record<EnemyKind, EnemyStats> = {
  guard: { w: 14, h: 24, hp: 3, soul: 10, contact: 1, coins: [2, 5] },
  archer: { w: 13, h: 22, hp: 2, soul: 8, contact: 1, coins: [2, 5] },
  crawler: { w: 16, h: 12, hp: 2, soul: 5, contact: 1, coins: [1, 3] },
  mage: { w: 14, h: 24, hp: 3, soul: 15, contact: 1, coins: [3, 6] },
  bomber: { w: 14, h: 18, hp: 2, soul: 12, contact: 1, coins: [2, 5] },
  elite: { w: 22, h: 34, hp: 8, soul: 30, contact: 2, coins: [6, 12] },
};

const GRAVITY = 1350;

export class Enemy implements Body {
  kind: EnemyKind;
  x: number;
  y: number;
  w: number;
  h: number;
  vx = 0;
  vy = 0;
  onGround = false;
  facing = -1;
  hp: number;
  maxHp: number;
  soulValue: number;
  coinRange: [number, number];
  contact = 1;
  dead = false;
  hurtTimer = 0;
  attackCd = 0;
  state: 'idle' | 'chase' | 'windup' | 'attack' | 'fuse' | 'teleport' = 'idle';
  timer = 0;
  aggro = false;
  blink = 0;
  animTime = 0;
  homeX: number;
  tier: number;

  get cx(): number { return this.x + this.w / 2; }
  get cy(): number { return this.y + this.h / 2; }
  get bottom(): number { return this.y + this.h; }

  constructor(kind: EnemyKind, cx: number, bottom: number, tier = 0) {
    const s = ENEMY_STATS[kind];
    this.kind = kind;
    this.w = s.w;
    this.h = s.h;
    this.x = cx - s.w / 2;
    this.y = bottom - s.h;
    this.hp = s.hp + Math.floor(tier / 2);
    this.maxHp = this.hp;
    this.soulValue = s.soul;
    this.coinRange = s.coins;
    this.contact = s.contact;
    this.tier = tier;
    this.homeX = this.x;
    this.facing = Math.random() < 0.5 ? -1 : 1;
    this.timer = Math.random() * 1.5;
  }

  update(dt: number, game: Game): void {
    if (this.dead) return;
    this.animTime += dt;
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.blink = Math.max(0, this.blink - dt);
    this.timer -= dt;

    const p = game.player;
    const dx = p.cx - this.cx;
    const dy = p.cy - this.cy;
    const dist = Math.hypot(dx, dy);
    const los = game.room.lineOfSight(this.cx, this.cy, p.cx, p.cy);

    if (dist < 190 && los) this.aggro = true;
    if (dist > 320) this.aggro = false;

    this.vy += GRAVITY * dt;

    switch (this.kind) {
      case 'guard': this.updateGuard(dt, game, dx, dist, los); break;
      case 'elite': this.updateElite(dt, game, dx, dist, los); break;
      case 'archer': this.updateArcher(dt, game, dx, dy, dist, los); break;
      case 'crawler': this.updateCrawler(dt, game, dx, dist, los); break;
      case 'mage': this.updateMage(dt, game, dx, dist, los); break;
      case 'bomber': this.updateBomber(dt, game, dx, dist, los); break;
    }

    if (this.state === 'windup' && this.timer <= 0) {
      this.state = 'attack';
      this.timer = 0.22;
      if (this.kind === 'guard' || this.kind === 'elite') {
        this.vx = this.facing * (this.kind === 'elite' ? 230 : 165);
        game.sound.dash();
        if (this.kind === 'elite') game.camera.shake(2, 0.1);
      }
    }
    if (this.state === 'attack' && this.timer <= 0) {
      this.state = 'chase';
      this.vx *= 0.3;
      this.attackCd = this.kind === 'elite' ? 1.6 : 1.2;
    }

    if (this.onGround && this.state === 'idle') {
      // turn at ledges while patrolling
      const aheadX = this.facing > 0 ? this.x + this.w + 2 : this.x - 2;
      const tx = Math.floor(aheadX / TILE);
      const ty = Math.floor((this.y + this.h + 2) / TILE);
      if (!game.room.isSolid(tx, ty) && !game.room.isPlatform(tx, ty)) this.facing *= -1;
    }

    moveBody(game.room, this, this.vx * dt, this.vy * dt);
    if (this.state !== 'attack') this.vx *= 1 - Math.min(1, dt * 8);
  }

  updateGuard(dt: number, game: Game, dx: number, dist: number, los: boolean): void {
    if (this.aggro && los) {
      this.facing = dx > 0 ? 1 : -1;
      if (this.state === 'idle' || this.state === 'chase') {
        if (dist < 26 && this.attackCd <= 0) {
          this.state = 'windup';
          this.timer = 0.28;
          this.vx = 0;
        } else if (dist > 24) {
          this.vx = this.facing * 62;
        }
      }
    } else {
      if (this.state === 'idle') this.vx = this.facing * 24;
      if (Math.abs(this.x - this.homeX) > 70) this.facing = this.homeX > this.x ? 1 : -1;
    }
  }

  updateElite(dt: number, game: Game, dx: number, dist: number, los: boolean): void {
    if (this.aggro && los) {
      this.facing = dx > 0 ? 1 : -1;
      if (this.state === 'idle' || this.state === 'chase') {
        if (dist < 40 && this.attackCd <= 0) {
          this.state = 'windup';
          this.timer = 0.45;
          this.vx = 0;
        } else if (dist > 34) {
          this.vx = this.facing * 46;
        }
      }
    }
  }

  updateArcher(dt: number, game: Game, dx: number, dy: number, dist: number, los: boolean): void {
    if (!this.aggro || !los) return;
    this.facing = dx > 0 ? 1 : -1;
    if (dist < 70) {
      this.vx = -this.facing * 40;
    } else {
      this.vx = 0;
    }
    if (this.attackCd <= 0 && dist < 250 && Math.abs(dy) < 80) {
      this.attackCd = 1.9;
      const ax = this.cx + this.facing * 8;
      const ay = this.cy - 2;
      const ang = Math.atan2(game.player.cy - ay, game.player.cx - ax);
      game.spawnProjectile('arrow', ax, ay, Math.cos(ang) * 165, Math.sin(ang) * 165, 'enemy', 1);
      game.sound.select();
    }
  }

  updateCrawler(dt: number, game: Game, dx: number, dist: number, los: boolean): void {
    if (this.aggro && los) this.facing = dx > 0 ? 1 : -1;
    if (this.onGround && this.timer <= 0) {
      this.timer = 0.65 + Math.random() * 0.4;
      this.vy = -215;
      this.vx = this.aggro ? this.facing * 105 : this.facing * 30;
      if (this.aggro) game.fx.dust(this.cx, this.bottom, 2);
    }
  }

  updateMage(dt: number, game: Game, dx: number, dist: number, los: boolean): void {
    if (!this.aggro || !los) return;
    this.facing = dx > 0 ? 1 : -1;
    if (this.timer <= 0 && dist > 30) {
      this.timer = 2.4 + Math.random();
      // blink to a new spot near the player
      for (let i = 0; i < 8; i++) {
        const nx = game.player.cx + (Math.random() < 0.5 ? -1 : 1) * (55 + Math.random() * 70);
        const ny = game.room.findGroundY(nx, 2);
        const boxX = nx - this.w / 2;
        const boxY = ny - this.h;
        if (boxX < 2 * TILE || boxX > game.room.widthPx - 3 * TILE) continue;
        if (game.room.solidInRect(boxX, boxY, this.w, this.h)) continue;
        game.fx.ring(this.cx, this.cy, C.purple);
        this.x = boxX;
        this.y = boxY;
        this.vx = 0;
        this.vy = 0;
        game.fx.ring(this.cx, this.cy, C.purple);
        break;
      }
    }
    if (this.attackCd <= 0 && dist < 220) {
      this.attackCd = 1.6;
      const ax = this.cx;
      const ay = this.cy - 4;
      const ang = Math.atan2(game.player.cy - ay, game.player.cx - ax);
      game.spawnProjectile('orb', ax, ay, Math.cos(ang) * 95, Math.sin(ang) * 95, 'enemy', 1);
      game.sound.spell();
    }
  }

  updateBomber(dt: number, game: Game, dx: number, dist: number, los: boolean): void {
    if (this.state === 'fuse') {
      this.vx = 0;
      if (this.timer <= 0) this.explode(game);
      return;
    }
    if (!this.aggro || !los) return;
    this.facing = dx > 0 ? 1 : -1;
    if (dist < 30) {
      this.state = 'fuse';
      this.timer = 0.65;
      this.vx = 0;
      game.sound.select();
    } else {
      this.vx = this.facing * 82;
    }
  }

  explode(game: Game): void {
    this.dead = true;
    game.fx.explosion(this.cx, this.cy, 44);
    game.sound.boss();
    game.camera.shake(6, 0.25);
    const p = game.player;
    if (Math.abs(p.cx - this.cx) < 52 && Math.abs(p.cy - this.cy) < 44) p.hurt(2, this.cx, game);
    game.damageEnemiesInRect(this.cx - 44, this.cy - 44, 88, 88, 4, 1, false, this);
    game.onEnemyKilled(this, false);
  }

  hurt(dmg: number, dirX: number, game: Game): void {
    if (this.dead) return;
    this.hp -= dmg;
    this.hurtTimer = 0.14;
    this.vx = dirX * 110;
    this.vy = -70;
    game.fx.blood(this.cx, this.cy, dirX);
    if (this.hp <= 0) {
      this.dead = true;
      game.fx.burst(this.cx, this.cy, this.kind === 'elite' ? C.purple : C.red, this.kind === 'elite' ? 18 : 10);
      game.onEnemyKilled(this, true);
    }
  }

  draw(ctx: CanvasRenderingContext2D, time: number, accent: string): void {
    const flash = this.hurtTimer > 0;
    ctx.save();
    ctx.translate(Math.round(this.cx), Math.round(this.bottom));
    ctx.scale(this.facing, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 0, this.w * 0.5, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();

    if (this.kind === 'bomber' && this.state === 'fuse') {
      const f = Math.floor(time * 20) % 2 === 0;
      if (f) ctx.globalAlpha = 0.7;
    }
    drawCreature(ctx, this.kind, time, accent, flash, this.w, this.h, this.state === 'windup');
    ctx.restore();

    if (this.hp < this.maxHp && this.hp > 0) {
      const bw = Math.max(12, this.w);
      const bx = this.cx - bw / 2;
      const by = this.y - 6;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(bx - 1, by - 1, bw + 2, 4);
      ctx.fillStyle = '#3a2430';
      ctx.fillRect(bx, by, bw, 2);
      ctx.fillStyle = C.red;
      ctx.fillRect(bx, by, Math.round(bw * (this.hp / this.maxHp)), 2);
    }
  }
}

/** Shared silhouette drawing for enemies and ghost allies. */
export function drawCreature(
  ctx: CanvasRenderingContext2D,
  kind: EnemyKind,
  time: number,
  accent: string,
  flash: boolean,
  w: number,
  h: number,
  windup = false,
): void {
  const white = flash ? '#ffffff' : null;
  const bob = Math.sin(time * 3 + w) * 0.6;
  if (kind === 'guard' || kind === 'elite') {
    const big = kind === 'elite';
    const s = big ? 1.25 : 1;
    ctx.fillStyle = white ?? '#2f2a45';
    ctx.beginPath();
    ctx.moveTo(-8 * s, 0);
    ctx.lineTo(-7 * s, -18 * s + bob);
    ctx.lineTo(0, -22 * s + bob);
    ctx.lineTo(7 * s, -18 * s + bob);
    ctx.lineTo(8 * s, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = white ?? '#3d3657';
    ctx.fillRect(-7 * s, -20 * s + bob, 14 * s, 5 * s);
    // helmet
    ctx.fillStyle = white ?? '#565078';
    ctx.beginPath();
    ctx.ellipse(0, -23 * s + bob, 5.5 * s, 5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = white ?? '#1a1728';
    ctx.fillRect(-4 * s, -24 * s + bob, 8 * s, 2.4 * s);
    ctx.fillStyle = white ?? (windup ? '#ff4055' : accent);
    ctx.fillRect(-2.5 * s, -23.6 * s + bob, 5 * s, 1.4 * s);
    // shield
    ctx.fillStyle = white ?? '#4a3f66';
    ctx.beginPath();
    ctx.moveTo(-9 * s, -18 * s + bob);
    ctx.lineTo(-14 * s, -14 * s + bob);
    ctx.lineTo(-9 * s, -6 * s + bob);
    ctx.closePath();
    ctx.fill();
    // legs
    ctx.fillStyle = white ?? '#211d33';
    const sw = Math.sin(time * 8) * 2;
    ctx.fillRect(-5 * s, -4, 3 * s, 4 + sw);
    ctx.fillRect(2 * s, -4, 3 * s, 4 - sw);
    if (big) {
      ctx.fillStyle = white ?? '#6b2a58';
      ctx.beginPath();
      ctx.moveTo(-5, -28 * s + bob);
      ctx.lineTo(-8, -36 * s + bob);
      ctx.lineTo(-2, -30 * s + bob);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(5, -28 * s + bob);
      ctx.lineTo(8, -36 * s + bob);
      ctx.lineTo(2, -30 * s + bob);
      ctx.closePath();
      ctx.fill();
    }
  } else if (kind === 'archer') {
    ctx.fillStyle = white ?? '#243a30';
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.lineTo(-5, -16 + bob);
    ctx.lineTo(0, -19 + bob);
    ctx.lineTo(5, -16 + bob);
    ctx.lineTo(6, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = white ?? '#31503f';
    ctx.beginPath();
    ctx.ellipse(0, -20 + bob, 5, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = white ?? '#0c1410';
    ctx.fillRect(-3.5, -21 + bob, 7, 3);
    ctx.fillStyle = white ?? accent;
    ctx.fillRect(-2, -20.2 + bob, 1.5, 1.5);
    ctx.fillRect(0.8, -20.2 + bob, 1.5, 1.5);
    // bow
    ctx.strokeStyle = white ?? '#8a7a54';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(7, -13 + bob, 6, -1.1, 1.1);
    ctx.stroke();
    ctx.strokeStyle = white ?? 'rgba(220,220,200,0.5)';
    ctx.beginPath();
    ctx.moveTo(9.5, -18 + bob);
    ctx.lineTo(9.5, -8 + bob);
    ctx.stroke();
    ctx.fillStyle = white ?? '#1a2b22';
    ctx.fillRect(-4, -3, 3, 3);
    ctx.fillRect(1, -3, 3, 3);
  } else if (kind === 'crawler') {
    ctx.fillStyle = white ?? '#3a2b3f';
    ctx.beginPath();
    ctx.ellipse(0, -6 + bob, 8, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = white ?? '#4d3a55';
    ctx.beginPath();
    ctx.ellipse(2, -8 + bob, 4.5, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = white ?? '#2a1f30';
    ctx.lineWidth = 1.5;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 4, -4);
      ctx.lineTo(i * 4 - 4, 0);
      ctx.moveTo(i * 4, -4);
      ctx.lineTo(i * 4 + 4, 0);
      ctx.stroke();
    }
    ctx.fillStyle = white ?? accent;
    ctx.fillRect(2, -9 + bob, 1.5, 1.5);
    ctx.fillRect(4.5, -9 + bob, 1.5, 1.5);
  } else if (kind === 'mage') {
    ctx.fillStyle = white ?? '#2b2440';
    ctx.beginPath();
    ctx.moveTo(-7, 0);
    ctx.lineTo(-6, -17 + bob);
    ctx.lineTo(0, -21 + bob);
    ctx.lineTo(6, -17 + bob);
    ctx.lineTo(7, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = white ?? '#413463';
    ctx.beginPath();
    ctx.ellipse(0, -21 + bob, 5, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = white ?? '#0d0a16';
    ctx.beginPath();
    ctx.ellipse(0, -22 + bob, 4, 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = white ?? accent;
    ctx.fillRect(-2.5, -22.5 + bob, 1.8, 1.8);
    ctx.fillRect(0.7, -22.5 + bob, 1.8, 1.8);
    // floating orb
    const oy = -30 + Math.sin(time * 2.5) * 2;
    ctx.fillStyle = `rgba(185,166,255,0.18)`;
    ctx.beginPath();
    ctx.arc(7, oy, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = white ?? C.purple;
    ctx.beginPath();
    ctx.arc(7, oy, 2.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'bomber') {
    ctx.fillStyle = white ?? '#4a2c22';
    ctx.beginPath();
    ctx.ellipse(0, -9 + bob, 7.5, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = white ?? '#5e392b';
    ctx.beginPath();
    ctx.ellipse(0, -10 + bob, 5, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = white ?? accent;
    ctx.fillRect(-3, -11 + bob, 2, 2);
    ctx.fillRect(1, -11 + bob, 2, 2);
    // fuse
    ctx.strokeStyle = white ?? '#8a7a54';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -18 + bob);
    ctx.quadraticCurveTo(4, -24, 2, -27);
    ctx.stroke();
    ctx.fillStyle = white ?? '#ffb347';
    ctx.beginPath();
    ctx.arc(2, -28, 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = white ?? '#2b1a14';
    ctx.fillRect(-5, -2, 3, 2);
    ctx.fillRect(2, -2, 3, 2);
  }
}
