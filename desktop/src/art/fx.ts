import { C } from '../art/palette';
import { text } from '../core/draw';
import { drawGhostAfterimage } from './sprites';

type PType = 'square' | 'ring' | 'spark' | 'after' | 'text' | 'ember' | 'ghost';

interface Particle {
  type: PType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  gravity: number;
  facing: number;
  label: string;
  drag: number;
}

export class FX {
  particles: Particle[] = [];

  private add(p: Partial<Particle> & { type: PType; x: number; y: number; life: number }): void {
    this.particles.push({
      vx: 0, vy: 0, maxLife: p.life, color: C.white, size: 2,
      gravity: 0, facing: 1, label: '', drag: 0,
      ...p,
    } as Particle);
    if (this.particles.length > 500) this.particles.shift();
  }

  dust(x: number, y: number, n = 4): void {
    for (let i = 0; i < n; i++) {
      this.add({
        type: 'square', x: x + (Math.random() - 0.5) * 10, y: y - 2,
        vx: (Math.random() - 0.5) * 40, vy: -Math.random() * 30,
        life: 0.3 + Math.random() * 0.3, color: 'rgba(150,140,180,0.6)',
        size: 1 + Math.random() * 1.5, gravity: 60, drag: 2,
      });
    }
  }

  blood(x: number, y: number, dir: number): void {
    for (let i = 0; i < 9; i++) {
      this.add({
        type: 'square', x, y,
        vx: dir * (30 + Math.random() * 120), vy: (Math.random() - 0.6) * 160,
        life: 0.25 + Math.random() * 0.4, color: i % 3 === 0 ? '#ff6a7a' : C.red,
        size: 1 + Math.random() * 2.5, gravity: 500, drag: 1,
      });
    }
  }

  /** Эктоплазма призрака: светящиеся брызги вместо крови. */
  ectoplasm(x: number, y: number, dir: number): void {
    for (let i = 0; i < 12; i++) {
      this.add({
        type: 'spark', x, y,
        vx: dir * (30 + Math.random() * 130) + (Math.random() - 0.5) * 70,
        vy: (Math.random() - 0.55) * 190,
        life: 0.22 + Math.random() * 0.45,
        color: i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? C.spectral : C.purple,
        size: 1.4, gravity: 210, drag: 1.4,
      });
    }
    this.ring(x, y, C.spectral);
  }

  burst(x: number, y: number, color: string, n = 12): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 40 + Math.random() * 160;
      this.add({
        type: 'square', x, y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40,
        life: 0.35 + Math.random() * 0.5, color,
        size: 1 + Math.random() * 2.5, gravity: 320, drag: 1.5,
      });
    }
  }

  spark(x: number, y: number, color: string): void {
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      this.add({
        type: 'spark', x, y,
        vx: Math.cos(a) * 120, vy: Math.sin(a) * 120,
        life: 0.12 + Math.random() * 0.12, color, size: 2, drag: 3,
      });
    }
  }

  slashSpark(x: number, y: number, facing: number): void {
    for (let i = 0; i < 7; i++) {
      this.add({
        type: 'spark', x: x + (Math.random() - 0.5) * 8, y: y + (Math.random() - 0.5) * 14,
        vx: facing * (60 + Math.random() * 120), vy: (Math.random() - 0.5) * 80,
        life: 0.15, color: C.white, size: 2, drag: 4,
      });
    }
  }

  ring(x: number, y: number, color: string): void {
    this.add({ type: 'ring', x, y, life: 0.4, color, size: 6, gravity: 0 });
  }

  ember(x: number, y: number, color: string): void {
    this.add({
      type: 'ember', x: x + (Math.random() - 0.5) * 4, y: y + (Math.random() - 0.5) * 4,
      vx: (Math.random() - 0.5) * 20, vy: -10 - Math.random() * 20,
      life: 0.25 + Math.random() * 0.2, color, size: 1.5, drag: 1,
    });
  }

  explosion(x: number, y: number, r: number): void {
    this.ring(x, y, C.gold);
    this.ring(x, y, '#fff2c0');
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 60 + Math.random() * 180;
      this.add({
        type: 'square', x, y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.3 + Math.random() * 0.4,
        color: i % 3 === 0 ? '#ffe6a8' : i % 3 === 1 ? '#ff9a3c' : '#e0485c',
        size: 1.5 + Math.random() * 3, gravity: 200, drag: 2,
      });
    }
  }

  heal(x: number, y: number): void {
    for (let i = 0; i < 12; i++) {
      this.add({
        type: 'square', x: x + (Math.random() - 0.5) * 20, y: y + (Math.random() - 0.5) * 20,
        vx: 0, vy: -20 - Math.random() * 40,
        life: 0.5 + Math.random() * 0.4, color: i % 2 ? C.green : '#c8ffd9',
        size: 1 + Math.random() * 2, gravity: -20, drag: 1,
      });
    }
    this.ring(x, y, C.green);
  }

  coinSpark(x: number, y: number): void {
    for (let i = 0; i < 4; i++) {
      this.add({
        type: 'spark', x, y,
        vx: (Math.random() - 0.5) * 90, vy: (Math.random() - 0.5) * 90,
        life: 0.15, color: C.gold, size: 1.5, drag: 4,
      });
    }
  }

  afterimage(x: number, y: number, facing: number): void {
    this.add({ type: 'after', x, y, life: 0.22, color: '#7d6ad6', facing, size: 1, gravity: 0 });
  }

  /** Маленькие полупрозрачные белые призрачки, улетающие вверх. */
  ghostMotes(x: number, y: number, n = 12, spread = 1): void {
    for (let i = 0; i < n; i++) {
      this.add({
        type: 'ghost',
        x: x + (Math.random() - 0.5) * 26 * spread,
        y: y + (Math.random() - 0.5) * 18,
        vx: (Math.random() - 0.5) * 26 * spread,
        vy: -18 - Math.random() * 34,
        life: 1.2 + Math.random() * 1.1,
        color: '#ffffff',
        size: 2.4 + Math.random() * 2.2,
        gravity: -6,
        drag: 0.35,
      });
    }
  }

  number(x: number, y: number, label: string, color: string): void {    this.add({ type: 'text', x, y, vy: -28, life: 0.6, color, label, size: 8, drag: 1 });
  }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.vy += p.gravity * dt;
      if (p.drag) {
        const d = Math.max(0, 1 - p.drag * dt);
        p.vx *= d;
        p.vy *= d;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      const a = Math.max(0, Math.min(1, p.life / p.maxLife));
      if (p.type === 'square') {
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      } else if (p.type === 'spark') {
        ctx.globalAlpha = a;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02);
        ctx.stroke();
      } else if (p.type === 'ring') {
        const t = 1 - a;
        ctx.globalAlpha = a * 0.8;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size + t * 26, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.type === 'ember') {
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      } else if (p.type === 'after') {
        drawGhostAfterimage(ctx, p.x, p.y, p.facing, a * 0.55, (p.maxLife - p.life) * 12);
      } else if (p.type === 'ghost') {
        // маленький белый призрачек: круглая голова, волнистый хвост
        const s = p.size;
        const sway = Math.sin((p.maxLife - p.life) * 5 + p.x) * s * 0.3;
        ctx.globalAlpha = a * 0.7;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, s, Math.PI, Math.PI * 2);
        ctx.lineTo(p.x + s, p.y + s * 1.2);
        ctx.quadraticCurveTo(p.x + s * 0.55, p.y + s * 2.05 + sway, p.x + s * 0.15, p.y + s * 1.25);
        ctx.quadraticCurveTo(p.x - s * 0.25, p.y + s * 0.85, p.x - s * 0.6, p.y + s * 1.5);
        ctx.quadraticCurveTo(p.x - s, p.y + s * 1.9, p.x - s, p.y + s * 1.2);
        ctx.closePath();
        ctx.fill();
        // глаза
        ctx.globalAlpha = a * 0.5;
        ctx.fillStyle = 'rgba(10,8,18,1)';
        ctx.beginPath();
        ctx.arc(p.x - s * 0.34, p.y - s * 0.28, s * 0.17, 0, Math.PI * 2);
        ctx.arc(p.x + s * 0.34, p.y - s * 0.28, s * 0.17, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === 'text') {
        ctx.globalAlpha = a;
        text(ctx, p.label, p.x, p.y, { size: p.size, color: p.color, align: 'center', shadow: true });
      }
    }
    ctx.globalAlpha = 1;
  }
}
