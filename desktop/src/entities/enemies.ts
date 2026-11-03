import type { Game } from '../game';
import { EnemyKind, TILE, moveBody, Body } from '../world/room';
import { C } from '../art/palette';
import { drawCustomFirst, hasAnyCustomAsset } from '../art/custom';

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
    const action = this.state === 'attack' || this.state === 'windup' ? 'attack' : flash ? 'hurt' : 'idle';

    const customKeys = [
      `characters/enemies/${this.kind}/${action}`,
      `characters/enemies/${this.kind}/idle`,
      `characters/enemies/${this.kind}`,
    ];
    if (hasAnyCustomAsset(customKeys)) {
      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.ellipse(this.cx, this.bottom - 1, this.w * 0.55, 2.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const custom = drawCustomFirst(
      ctx,
      customKeys,
      {
        x: this.cx,
        y: this.bottom,
        height: this.h * 2.2,
        flip: this.facing < 0,
        filter: flash ? 'brightness(1.8)' : undefined,
      },
    );

    if (!custom) {
      ctx.save();
      ctx.translate(Math.round(this.cx), Math.round(this.bottom));
      ctx.scale(this.facing, 1);
      if (this.kind === 'bomber' && this.state === 'fuse') {
        const f = Math.floor(time * 20) % 2 === 0;
        if (f) ctx.globalAlpha = 0.7;
      }
      drawCreature(ctx, this.kind, time, accent, flash, this.w, this.h, this.state === 'windup');
      ctx.restore();
    }

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

function glowEye(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  blur = 4,
): void {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(x - r * 0.25, y - r * 0.3, r * 0.36, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Векторные спрайты врагов. Точка (0,0) — ступни, взгляд направлен вправо. */
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
  const bob = Math.sin(time * 3 + w) * 0.6;
  const step = Math.sin(time * 8) * 2;
  const eyeColor = windup ? '#ff4055' : accent;
  const white = flash ? '#ffffff' : null;

  if (kind === 'guard' || kind === 'elite') {
    const big = kind === 'elite';
    const s = big ? 1.28 : 1;
    const leg = big ? Math.sin(time * 7) * 2.4 : step;

    // плащ
    ctx.fillStyle = white ?? (big ? '#2a1030' : '#191f36');
    ctx.beginPath();
    ctx.moveTo(-7 * s, -25 * s + bob);
    ctx.quadraticCurveTo(-13 * s, -15 * s + bob, -10 * s, 0);
    ctx.lineTo(-4 * s, -4);
    ctx.lineTo(5 * s, 0);
    ctx.quadraticCurveTo(10 * s, -15 * s + bob, 7 * s, -25 * s + bob);
    ctx.closePath();
    ctx.fill();

    // ноги
    ctx.fillStyle = white ?? '#211d33';
    ctx.fillRect(-5 * s, -5, 3.5 * s, 5 + leg * 0.35);
    ctx.fillRect(1.5 * s, -5, 3.5 * s, 5 - leg * 0.35);

    // корпус
    const armor = ctx.createLinearGradient(-8 * s, -24 * s, 8 * s, 0);
    armor.addColorStop(0, big ? '#5b3a6d' : '#433b63');
    armor.addColorStop(0.5, big ? '#3d2549' : '#2f2a45');
    armor.addColorStop(1, big ? '#211428' : '#1b182b');
    ctx.fillStyle = white ?? armor;
    ctx.beginPath();
    ctx.moveTo(-8 * s, 0);
    ctx.lineTo(-7 * s, -18 * s + bob);
    ctx.lineTo(0, -23 * s + bob);
    ctx.lineTo(7 * s, -18 * s + bob);
    ctx.lineTo(8 * s, 0);
    ctx.closePath();
    ctx.fill();

    // нагрудник и ремни
    ctx.fillStyle = white ?? (big ? '#6b2a58' : '#3d3657');
    ctx.fillRect(-7 * s, -20 * s + bob, 14 * s, 5 * s);
    ctx.fillStyle = white ?? 'rgba(232,223,196,0.2)';
    ctx.fillRect(-6 * s, -19 * s + bob, 12 * s, 0.7);
    ctx.strokeStyle = white ?? 'rgba(232,223,196,0.3)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(0, -19 * s + bob);
    ctx.lineTo(-2 * s, -11 * s + bob);
    ctx.moveTo(0, -19 * s + bob);
    ctx.lineTo(2 * s, -11 * s + bob);
    ctx.stroke();

    // шлем
    const helm = ctx.createLinearGradient(0, -28 * s, 0, -21 * s);
    helm.addColorStop(0, big ? '#7b4b8c' : '#5c5680');
    helm.addColorStop(1, big ? '#3e264c' : '#34304e');
    ctx.fillStyle = white ?? helm;
    ctx.beginPath();
    ctx.ellipse(0, -23.5 * s + bob, 5.8 * s, 5.4 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = white ?? '#141020';
    ctx.beginPath();
    ctx.ellipse(1 * s, -23.5 * s + bob, 4.3 * s, 2 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    glowEye(ctx, 0, -23.7 * s + bob, 1.1 * s, eyeColor, windup ? 8 : 4);
    glowEye(ctx, 3 * s, -23.7 * s + bob, 1.1 * s, eyeColor, windup ? 8 : 4);

    // гребень/рога
    ctx.fillStyle = white ?? (big ? '#c8b07a' : '#6d6790');
    if (big) {
      ctx.beginPath();
      ctx.moveTo(-5 * s, -27 * s + bob);
      ctx.quadraticCurveTo(-12 * s, -34 * s + bob, -9 * s, -39 * s + bob);
      ctx.quadraticCurveTo(-6 * s, -32 * s + bob, -2 * s, -29 * s + bob);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(5 * s, -27 * s + bob);
      ctx.quadraticCurveTo(12 * s, -34 * s + bob, 9 * s, -39 * s + bob);
      ctx.quadraticCurveTo(6 * s, -32 * s + bob, 2 * s, -29 * s + bob);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillRect(-0.9 * s, -29 * s + bob, 1.8 * s, 5 * s);
    }

    // щит
    const shield = ctx.createLinearGradient(-15 * s, -19 * s, -7 * s, -5 * s);
    shield.addColorStop(0, big ? '#7a4b68' : '#51466f');
    shield.addColorStop(1, big ? '#3a2038' : '#2a2440');
    ctx.fillStyle = white ?? shield;
    ctx.beginPath();
    ctx.moveTo(-8 * s, -19 * s + bob);
    ctx.lineTo(-14 * s, -15 * s + bob);
    ctx.lineTo(-11 * s, -6 * s + bob);
    ctx.lineTo(-7 * s, -11 * s + bob);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = white ?? 'rgba(232,223,196,0.35)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.fillStyle = white ?? eyeColor;
    ctx.beginPath();
    ctx.moveTo(-11 * s, -15 * s + bob);
    ctx.lineTo(-9.4 * s, -13 * s + bob);
    ctx.lineTo(-11 * s, -11 * s + bob);
    ctx.lineTo(-12.6 * s, -13 * s + bob);
    ctx.closePath();
    ctx.fill();

    // меч
    ctx.strokeStyle = white ?? '#a9a4bd';
    ctx.lineWidth = 1.4 * s;
    ctx.beginPath();
    ctx.moveTo(8 * s, -9 * s + bob);
    ctx.lineTo(12 * s, -20 * s + bob);
    ctx.stroke();
    ctx.fillStyle = white ?? '#6b5a8f';
    ctx.fillRect(7 * s, -10 * s + bob, 3 * s, 1.6 * s);

    if (big) {
      // аура элиты
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(185,166,255,${0.24 + Math.sin(time * 4) * 0.08})`;
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        const a = time * 2 + i * 2.1;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 15, -18 + Math.sin(a) * 9, 2.2, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  } else if (kind === 'archer') {
    // плащ
    const cloak = ctx.createLinearGradient(0, -20 + bob, 0, 0);
    cloak.addColorStop(0, '#31503f');
    cloak.addColorStop(1, '#14261c');
    ctx.fillStyle = white ?? cloak;
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.lineTo(-5, -16 + bob);
    ctx.lineTo(0, -20 + bob);
    ctx.lineTo(6, -16 + bob);
    ctx.lineTo(7, 0);
    ctx.lineTo(2, -3);
    ctx.closePath();
    ctx.fill();

    // колчан
    ctx.save();
    ctx.rotate(-0.35);
    ctx.fillStyle = white ?? '#3a2b1d';
    ctx.fillRect(-9, -21 + bob, 3, 13);
    ctx.fillStyle = white ?? '#8a7a54';
    ctx.fillRect(-9, -24 + bob, 1, 4);
    ctx.fillRect(-7.5, -24 + bob, 1, 4);
    ctx.restore();

    // капюшон
    const hood = ctx.createLinearGradient(0, -25 + bob, 0, -16 + bob);
    hood.addColorStop(0, '#3e604b');
    hood.addColorStop(1, '#1d3225');
    ctx.fillStyle = white ?? hood;
    ctx.beginPath();
    ctx.moveTo(-5, -17 + bob);
    ctx.quadraticCurveTo(-7, -23 + bob, 0, -26 + bob);
    ctx.quadraticCurveTo(7, -23 + bob, 5, -17 + bob);
    ctx.quadraticCurveTo(0, -14 + bob, -5, -17 + bob);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = white ?? '#08110c';
    ctx.beginPath();
    ctx.ellipse(1, -20.5 + bob, 3.7, 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
    glowEye(ctx, 0.2, -20.3 + bob, 0.85, eyeColor, 4);
    glowEye(ctx, 2.6, -20.3 + bob, 0.85, eyeColor, 4);

    // лук
    ctx.strokeStyle = white ?? '#a0895a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(7, -13 + bob, 6.5, -1.2, 1.2);
    ctx.stroke();
    ctx.strokeStyle = white ?? 'rgba(230,230,210,0.45)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(9.6, -19 + bob);
    ctx.lineTo(9.6, -7 + bob);
    ctx.stroke();
    // стрела
    ctx.strokeStyle = white ?? '#d8d0b8';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(2, -13 + bob);
    ctx.lineTo(9.5, -13 + bob);
    ctx.stroke();
    ctx.fillStyle = white ?? '#d8d0b8';
    ctx.beginPath();
    ctx.moveTo(12, -13 + bob);
    ctx.lineTo(9.5, -14 + bob);
    ctx.lineTo(9.5, -12 + bob);
    ctx.closePath();
    ctx.fill();

    // сапоги
    ctx.fillStyle = white ?? '#101c15';
    ctx.fillRect(-4.5, -4, 3, 4);
    ctx.fillRect(1.2, -4, 3, 4);
  } else if (kind === 'crawler') {
    // ноги
    ctx.strokeStyle = white ?? '#2a1f30';
    ctx.lineWidth = 1.4;
    for (let i = -2; i <= 2; i++) {
      const kick = Math.sin(time * 11 + i) * 1.5;
      ctx.beginPath();
      ctx.moveTo(i * 3.3, -5);
      ctx.lineTo(i * 4.2 - 4, 0 + kick);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(i * 3.3, -5);
      ctx.lineTo(i * 4.2 + 4, 0 - kick);
      ctx.stroke();
    }
    // панцирь
    const shell = ctx.createRadialGradient(-2, -9 + bob, 1, 0, -7 + bob, 9);
    shell.addColorStop(0, '#5a4568');
    shell.addColorStop(0.55, '#3a2b3f');
    shell.addColorStop(1, '#211828');
    ctx.fillStyle = white ?? shell;
    ctx.beginPath();
    ctx.ellipse(0, -6 + bob, 8.4, 5.8, 0, 0, Math.PI * 2);
    ctx.fill();
    // голова
    ctx.fillStyle = white ?? '#4d3a55';
    ctx.beginPath();
    ctx.ellipse(3, -8.5 + bob, 4.7, 3.8, 0.15, 0, Math.PI * 2);
    ctx.fill();
    // шипы
    ctx.fillStyle = white ?? '#6b5875';
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 4, -11 + bob);
      ctx.lineTo(i * 4 + 1.2, -15 + bob);
      ctx.lineTo(i * 4 + 2.4, -10.5 + bob);
      ctx.closePath();
      ctx.fill();
    }
    // глаза
    glowEye(ctx, 2.4, -9 + bob, 1.05, eyeColor, 5);
    glowEye(ctx, 5.1, -9 + bob, 1.05, eyeColor, 5);
    glowEye(ctx, 3.8, -10.8 + bob, 0.6, '#ffffff', 2);
    // брюшные пластины
    ctx.strokeStyle = white ?? 'rgba(232,223,196,0.16)';
    ctx.lineWidth = 0.7;
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.arc(-2, -7 + bob, 3 + i * 2, 0.2, Math.PI - 0.2);
      ctx.stroke();
    }
  } else if (kind === 'mage') {
    // парящая мантия
    const robe = ctx.createLinearGradient(0, -22 + bob, 0, 2);
    robe.addColorStop(0, '#4b3d73');
    robe.addColorStop(0.55, '#2b2440');
    robe.addColorStop(1, '#151024');
    ctx.fillStyle = white ?? robe;
    ctx.beginPath();
    ctx.moveTo(-6, -18 + bob);
    ctx.quadraticCurveTo(-9, -10 + bob, -8, -1);
    ctx.lineTo(-5, -4);
    ctx.lineTo(-2, 0);
    ctx.lineTo(1, -4);
    ctx.lineTo(4, 0);
    ctx.lineTo(7, -5);
    ctx.quadraticCurveTo(8, -12 + bob, 6, -18 + bob);
    ctx.closePath();
    ctx.fill();

    // капюшон
    ctx.fillStyle = white ?? '#413463';
    ctx.beginPath();
    ctx.moveTo(-5, -18 + bob);
    ctx.quadraticCurveTo(-6.5, -24 + bob, 0, -27 + bob);
    ctx.quadraticCurveTo(6.5, -24 + bob, 5, -18 + bob);
    ctx.quadraticCurveTo(0, -15 + bob, -5, -18 + bob);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = white ?? '#08050f';
    ctx.beginPath();
    ctx.ellipse(0, -21.5 + bob, 3.9, 3.1, 0, 0, Math.PI * 2);
    ctx.fill();
    glowEye(ctx, -1.4, -21.8 + bob, 0.8, eyeColor, 5);
    glowEye(ctx, 1.4, -21.8 + bob, 0.8, eyeColor, 5);

    // руны на мантии
    ctx.strokeStyle = white ?? `rgba(185,166,255,${0.35 + Math.sin(time * 3) * 0.15})`;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(0, -14 + bob);
    ctx.lineTo(-2, -11 + bob);
    ctx.lineTo(1, -8 + bob);
    ctx.moveTo(-2.5, -10 + bob);
    ctx.lineTo(2.5, -10 + bob);
    ctx.stroke();

    // посох
    ctx.strokeStyle = white ?? '#5a4a38';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-8, 0);
    ctx.lineTo(-10, -24 + bob);
    ctx.stroke();
    const orbY = -27 + Math.sin(time * 2.5) * 1.6 + bob;
    const orb = ctx.createRadialGradient(-10, orbY, 0.5, -10, orbY, 7);
    orb.addColorStop(0, '#ffffff');
    orb.addColorStop(0.3, C.purple);
    orb.addColorStop(1, 'rgba(185,166,255,0)');
    ctx.fillStyle = white ?? orb;
    ctx.beginPath();
    ctx.arc(-10, orbY, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = white ?? '#e8e0ff';
    ctx.beginPath();
    ctx.arc(-10, orbY, 1.6, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'bomber') {
    const fuseFlicker = 0.6 + Math.sin(time * 18 + w) * 0.35;
    // ноги
    ctx.fillStyle = white ?? '#2b1a14';
    ctx.fillRect(-5, -3, 3, 3);
    ctx.fillRect(2, -3, 3, 3);
    // бомбовое тело
    const bodyGrad = ctx.createRadialGradient(-2, -12 + bob, 1, 0, -9 + bob, 10);
    bodyGrad.addColorStop(0, '#6b4434');
    bodyGrad.addColorStop(0.5, '#4a2c22');
    bodyGrad.addColorStop(1, '#25130e');
    ctx.fillStyle = white ?? bodyGrad;
    ctx.beginPath();
    ctx.ellipse(0, -9 + bob, 7.8, 9.2, 0, 0, Math.PI * 2);
    ctx.fill();
    // металлические полосы
    ctx.strokeStyle = white ?? '#2a1a14';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(0, -9 + bob, 7.6, 9, 0, 0.2, Math.PI - 0.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, -8 + bob, 7.6, 8, 0, Math.PI + 0.2, Math.PI * 2 - 0.2);
    ctx.stroke();
    // светящийся шов
    ctx.save();
    ctx.shadowColor = C.ember;
    ctx.shadowBlur = 6;
    ctx.strokeStyle = white ?? `rgba(255,154,92,${0.5 + fuseFlicker * 0.3})`;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-5, -5 + bob);
    ctx.lineTo(-2, -7 + bob);
    ctx.lineTo(0, -5 + bob);
    ctx.lineTo(3, -7 + bob);
    ctx.lineTo(5, -5 + bob);
    ctx.stroke();
    ctx.restore();
    // глаз
    ctx.fillStyle = white ?? '#1a0e0a';
    ctx.beginPath();
    ctx.ellipse(0, -12 + bob, 3.8, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
    glowEye(ctx, 0, -12 + bob, 1.5, eyeColor, 6);
    // запал
    ctx.strokeStyle = white ?? '#8a7a54';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(0, -18 + bob);
    ctx.quadraticCurveTo(4, -23, 2, -26);
    ctx.stroke();
    if (fuseFlicker > 0.3) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const flame = ctx.createRadialGradient(2, -28, 0, 2, -28, 4);
      flame.addColorStop(0, '#fff4c8');
      flame.addColorStop(0.4, '#ffb347');
      flame.addColorStop(1, 'rgba(255,90,40,0)');
      ctx.fillStyle = white ?? flame;
      ctx.beginPath();
      ctx.arc(2, -28, 4 * fuseFlicker, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}
