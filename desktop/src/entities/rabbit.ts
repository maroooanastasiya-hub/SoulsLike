import type { Game } from '../game';
import { GROUND_ROW, TILE } from '../world/room';
import { drawRabbit } from '../art/sprites';

/**
 * Редкий белый кролик. Мирный, не получает урона и не считается врагом.
 * Приближение открывает диалог; после выбора он либо исчезает, либо убегает.
 */
export class Rabbit {
  x: number;
  groundY: number;
  minX: number;
  maxX: number;

  facing = 1;
  hop = 0;
  time = 0;

  private idleTimer = 1.1;
  private hopTimer = 0;
  private vx = 0;

  resolved = false;
  fleeing = false;
  private fleeTimer = 0;

  vanishing = false;
  private vanishTimer = 0;

  dead = false;

  constructor(x: number, groundY: number, minX: number, maxX: number) {
    this.x = x;
    this.groundY = groundY;
    this.minX = Math.max(2 * TILE + 8, minX);
    this.maxX = Math.max(this.minX + 16, maxX);
    this.time = Math.random() * 10;
  }

  get cy(): number {
    return this.groundY - 10;
  }

  update(dt: number, game: Game): void {
    this.time += dt;
    if (this.dead) return;

    if (this.vanishing) {
      this.vanishTimer += dt;
      if (this.vanishTimer >= 0.9) this.dead = true;
      return;
    }

    if (this.fleeing) {
      this.fleeTimer -= dt;
      this.x += this.vx * dt;
      this.hop = Math.abs(Math.sin(this.time * 19)) * 5;
      if (Math.random() < 0.45) game.fx.dust(this.x, this.groundY, 1);
      if (this.fleeTimer <= 0) this.dead = true;
      return;
    }

    const p = game.player;
    const dx = p.cx - this.x;

    // рядом с игроком кролик замирает и смотрит на него
    if (Math.abs(dx) < 64) {
      this.facing = dx >= 0 ? 1 : -1;
      this.hop = Math.max(0, Math.sin(this.time * 3)) * 0.4;
      return;
    }

    if (this.hopTimer > 0) {
      this.hopTimer -= dt;
      this.x += this.vx * dt;
      const t = 1 - Math.max(0, this.hopTimer) / 0.55;
      this.hop = Math.sin(Math.max(0, Math.min(1, t)) * Math.PI) * 3.2;

      const ahead = this.x + this.facing * 5;
      const tx = Math.floor(ahead / TILE);
      if (game.room.spikeInRect(ahead - 3, this.groundY - 3, 6, 4) || game.room.isSolid(tx, GROUND_ROW - 1)) {
        this.vx *= -1;
        this.facing *= -1;
      }
      if (this.x < this.minX || this.x > this.maxX) {
        this.x = Math.max(this.minX, Math.min(this.maxX, this.x));
        this.vx *= -1;
        this.facing *= -1;
      }
      if (this.hopTimer <= 0) this.hop = 0;
      return;
    }

    this.hop = 0;
    this.idleTimer -= dt;
    if (this.idleTimer > 0) return;

    this.idleTimer = 1.4 + Math.random() * 1.8;
    if (Math.random() < 0.62) {
      this.facing = Math.random() < 0.5 ? -1 : 1;
      this.vx = this.facing * (12 + Math.random() * 10);
      this.hopTimer = 0.55;
    }
  }

  /** Кролик пугается и убегает от указанной точки. */
  scare(fromX: number): void {
    if (this.resolved) return;
    this.resolved = true;
    this.fleeing = true;
    this.facing = this.x < fromX ? -1 : 1;
    this.vx = this.facing * (145 + Math.random() * 35);
    this.fleeTimer = 1.9;
  }

  /** Расколдовывание: кролик растворяется в белом свете. */
  bless(): void {
    if (this.resolved) return;
    this.resolved = true;
    this.vanishing = true;
    this.vanishTimer = 0;
  }

  draw(ctx: CanvasRenderingContext2D, time: number): void {
    const vanish = this.vanishing ? Math.min(1, this.vanishTimer / 0.9) : 0;
    drawRabbit(ctx, this.x, this.groundY, {
      time,
      facing: this.facing,
      hop: this.hop,
      fleeing: this.fleeing,
      vanish,
    });
  }
}
