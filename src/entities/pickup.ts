import type { Game } from '../game';
import type { Player } from './player';
import { C } from '../art/palette';

export interface AmuletDef {
  id: string;
  name: string;
  desc: string;
  color: string;
  apply: (p: Player) => void;
}

export const AMULETS: AmuletDef[] = [
  { id: 'steel', name: 'СТАЛЬНОЙ ЗУБ', desc: '+1 К УРОНУ', color: '#d8d0b8', apply: (p) => { p.damageBonus += 1; } },
  { id: 'vitality', name: 'СЕРДЦЕ ПАВШЕГО', desc: '+1 МАКС. ЗДОРОВЬЕ', color: C.red, apply: (p) => { p.maxHp += 1; p.hp = Math.min(p.maxHp, p.hp + 1); } },
  { id: 'soul', name: 'ПУСТАЯ ЛИНЗА', desc: '+20 МАКС. МАНЫ', color: C.mana, apply: (p) => { p.maxMana += 20; p.mana = Math.min(p.maxMana, p.mana + 20); } },
  { id: 'greed', name: 'ЖАДНЫЙ ГЛАЗ', desc: '+50% МОНЕТ', color: C.gold, apply: (p) => { p.coinMult += 0.5; } },
  { id: 'swift', name: 'ПЕРЬЯ ВЕТРА', desc: '+15% СКОРОСТИ', color: C.green, apply: (p) => { p.speedMult += 0.15; } },
  { id: 'focus', name: 'КОЛЬЦО ФОКУСА', desc: '-20% ЦЕНЫ МАГИИ', color: C.blue, apply: (p) => { p.spellCostMult *= 0.8; } },
  { id: 'ward', name: 'ПЕПЕЛЬНЫЙ ОБЕРЕГ', desc: '+0.25С НЕУЯЗВИМОСТИ', color: C.purple, apply: (p) => { p.iframesBonus += 0.25; } },
  { id: 'leech', name: 'КРОВАВЫЙ ШИП', desc: 'УДАРЫ ИНОГДА ЛЕЧАТ', color: '#e0485c', apply: (p) => { p.leech = true; } },
];

export type PickupType = 'coin' | 'amulet' | 'heal';

export class Pickup {
  type: PickupType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  value = 1;
  amulet: AmuletDef | null = null;
  life = 40;
  dead = false;
  bobSeed = Math.random() * 10;
  grounded = false;

  constructor(type: PickupType, x: number, y: number, vx: number, vy: number) {
    this.type = type;
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
  }

  update(dt: number, game: Game): void {
    if (this.dead) return;
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    const p = game.player;
    const dx = p.cx - this.x;
    const dy = p.cy - this.y;
    const dist = Math.hypot(dx, dy);

    if (dist < 85) {
      const sp = 240;
      this.x += (dx / (dist || 1)) * sp * dt;
      this.y += (dy / (dist || 1)) * sp * dt;
      if (dist < 10) this.collect(game);
      return;
    }

    if (!this.grounded) {
      this.vy += 760 * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if (game.room.solidInRect(this.x - 2, this.y - 2, 4, 4)) {
        this.y -= this.vy * dt;
        if (Math.abs(this.vy) > 40) {
          this.vy *= -0.35;
          this.vx *= 0.6;
          this.y -= 1;
        } else {
          this.vy = 0;
          this.vx = 0;
          this.grounded = true;
        }
      }
    } else {
      this.y += Math.sin((this.life + this.bobSeed) * 3) * 0.08;
    }
  }

  collect(game: Game): void {
    if (this.dead) return;
    this.dead = true;
    const p = game.player;
    if (this.type === 'coin') {
      game.money += Math.round(this.value * p.coinMult);
      game.sound.coin();
      game.fx.coinSpark(this.x, this.y);
    } else if (this.type === 'heal') {
      p.hp = Math.min(p.maxHp, p.hp + 1);
      game.sound.heal();
      game.notify('+1 ЗДОРОВЬЕ', C.green);
      game.fx.heal(this.x, this.y);
    } else if (this.amulet) {
      this.amulet.apply(p);
      game.amulets.push(this.amulet.id);
      game.sound.buy();
      game.notify(`АМУЛЕТ: ${this.amulet.name} — ${this.amulet.desc}`, this.amulet.color);
      game.fx.ring(this.x, this.y, this.amulet.color);
    }
  }

  draw(ctx: CanvasRenderingContext2D, time: number): void {
    if (this.dead) return;
    const blink = this.life < 5 && Math.floor(time * 10) % 2 === 0;
    if (blink) return;
    ctx.save();
    ctx.translate(Math.round(this.x), Math.round(this.y));
    if (this.type === 'coin') {
      const wobble = Math.abs(Math.sin(time * 5 + this.bobSeed));
      const w = 2 + wobble * 3;
      ctx.fillStyle = 'rgba(255,207,107,0.18)';
      ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C.gold;
      ctx.beginPath(); ctx.ellipse(0, 0, w, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff2c0';
      ctx.fillRect(-1, -2, 1.5, 2);
    } else if (this.type === 'heal') {
      ctx.fillStyle = 'rgba(224,72,92,0.18)';
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C.red;
      ctx.fillRect(-2, -5, 4, 10);
      ctx.fillRect(-5, -2, 10, 4);
      ctx.fillStyle = '#ff9aa8';
      ctx.fillRect(-1, -4, 2, 3);
    } else if (this.amulet) {
      const y = Math.sin(time * 3 + this.bobSeed) * 2;
      ctx.translate(0, y);
      ctx.fillStyle = this.amulet.color;
      ctx.globalAlpha = 0.2;
      ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = this.amulet.color;
      ctx.beginPath();
      ctx.moveTo(0, -6); ctx.lineTo(5, 0); ctx.lineTo(0, 6); ctx.lineTo(-5, 0);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.7;
      ctx.fillRect(-1, -3, 2, 2);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
}
