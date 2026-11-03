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

    // тень и лужа силы
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 14, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();
    const pool = ctx.createRadialGradient(0, -1, 1, 0, -1, 15);
    pool.addColorStop(0, 'rgba(125,249,255,0.16)');
    pool.addColorStop(1, 'rgba(125,249,255,0)');
    ctx.fillStyle = pool;
    ctx.beginPath();
    ctx.ellipse(0, -1, 15, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // павший воин
    ctx.save();
    ctx.rotate(-0.08);
    ctx.fillStyle = 'rgba(44,38,64,0.92)';
    ctx.beginPath();
    ctx.ellipse(-2, -4, 11.5, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(70,60,98,0.8)';
    ctx.beginPath();
    ctx.ellipse(-8, -5, 4.6, 4.2, -0.2, 0, Math.PI * 2);
    ctx.fill();

    // шлем/капюшон
    if (this.kind === 'archer' || this.kind === 'mage') {
      ctx.fillStyle = 'rgba(52,70,58,0.9)';
      ctx.beginPath();
      ctx.moveTo(-12, -8);
      ctx.quadraticCurveTo(-10, -13, -5, -11);
      ctx.lineTo(-3, -5);
      ctx.quadraticCurveTo(-8, -3, -12, -8);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(88,80,116,0.9)';
      ctx.beginPath();
      ctx.ellipse(-8, -6, 4.2, 3.8, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(20,16,32,0.8)';
      ctx.fillRect(-11, -7, 6, 1.6);
    }

    // сломанное оружие
    ctx.strokeStyle = 'rgba(180,172,200,0.5)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(3, -3);
    ctx.lineTo(12, -8);
    ctx.stroke();
    ctx.fillStyle = 'rgba(107,90,143,0.6)';
    ctx.fillRect(2, -4.5, 3, 1.6);

    // вытекшая эктоплазма
    ctx.fillStyle = 'rgba(125,249,255,0.14)';
    ctx.beginPath();
    ctx.ellipse(4, -1.5, 5.5, 1.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // душа над телом
    const fy = -20 + Math.sin(time * 2.5 + this.bobSeed) * 3;
    const pulse = 0.8 + Math.sin(time * 4 + this.bobSeed) * 0.2;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const glow = ctx.createRadialGradient(0, fy, 0.5, 0, fy, 12);
    glow.addColorStop(0, 'rgba(200,255,242,0.55)');
    glow.addColorStop(0.35, 'rgba(159,232,255,0.24)');
    glow.addColorStop(1, 'rgba(159,232,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, fy, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.ectoplasm;
    ctx.beginPath();
    ctx.moveTo(0, fy - 5.5);
    ctx.bezierCurveTo(3.5, fy - 3, 3.5, fy + 1.5, 0, fy + 3.2);
    ctx.bezierCurveTo(-3.5, fy + 1.5, -3.5, fy - 3, 0, fy - 5.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-1.1, fy - 0.4, 0.65, 0, Math.PI * 2);
    ctx.arc(1.1, fy - 0.4, 0.65, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(159,232,255,${0.28 + pulse * 0.2})`;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(0, fy + 4);
    ctx.quadraticCurveTo(2.5, fy + 8, 0, fy + 12);
    ctx.stroke();
    ctx.restore();
    ctx.restore();
  }
}
