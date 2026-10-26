import type { Game } from '../game';
import { EnemyKind } from '../world/room';
import { C } from '../art/palette';

export class Corpse {
  kind: EnemyKind;
  x: number;
  y: number;
  soulValue: number;
  coinMin: number;
  coinMax: number;
  lootChance: number;
  life = 15;
  maxLife = 15;
  used = false;
  bobSeed: number;
  color: string;

  constructor(kind: EnemyKind, x: number, y: number, soulValue: number, coinMin: number, coinMax: number, lootChance: number, color: string) {
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.soulValue = soulValue;
    this.coinMin = coinMin;
    this.coinMax = coinMax;
    this.lootChance = lootChance;
    this.bobSeed = Math.random() * 10;
    this.color = color;
  }

  update(dt: number): void {
    this.life -= dt;
    if (this.life <= 0) this.used = true;
  }

  draw(ctx: CanvasRenderingContext2D, time: number): void {
    if (this.used) return;
    const fade = this.life < 3 ? 0.35 + Math.abs(Math.sin(time * 8)) * 0.65 : 1;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(Math.round(this.x), Math.round(this.y));

    // slumped body
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 13, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(40,35,58,0.85)';
    ctx.beginPath();
    ctx.ellipse(0, -4, 11, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(70,60,92,0.8)';
    ctx.beginPath();
    ctx.ellipse(-7, -6, 4.5, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // soul wisp
    const fy = -18 + Math.sin(time * 2.5 + this.bobSeed) * 3;
    ctx.fillStyle = 'rgba(159,232,255,0.16)';
    ctx.beginPath();
    ctx.arc(0, fy, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.soul;
    ctx.beginPath();
    ctx.arc(0, fy, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-0.7, fy - 0.7, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(159,232,255,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, fy + 4);
    ctx.quadraticCurveTo(3, fy + 9, 0, fy + 13);
    ctx.stroke();
    ctx.restore();
  }
}
