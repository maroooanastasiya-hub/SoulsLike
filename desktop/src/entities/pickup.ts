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
      game.notify('+1 К ОБОЛОЧКЕ', C.green);
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
      const w = 1.6 + wobble * 3.4;
      const glow = ctx.createRadialGradient(0, 0, 0.5, 0, 0, 10);
      glow.addColorStop(0, 'rgba(255,207,107,0.32)');
      glow.addColorStop(1, 'rgba(255,207,107,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.fill();

      const coin = ctx.createLinearGradient(-w, -4, w, 4);
      coin.addColorStop(0, '#8a6524');
      coin.addColorStop(0.4, '#ffcf6b');
      coin.addColorStop(0.65, '#fff2c0');
      coin.addColorStop(1, '#c8962e');
      ctx.fillStyle = coin;
      ctx.beginPath();
      ctx.ellipse(0, 0, w, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,240,190,0.7)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
      if (w > 2.4) {
        ctx.fillStyle = '#6b4a18';
        ctx.beginPath();
        ctx.arc(0, 0, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect(-w * 0.45, -1.6, 0.9, 0.9);
    } else if (this.type === 'heal') {
      const bob = Math.sin(time * 3 + this.bobSeed) * 1.2;
      ctx.translate(0, bob);
      const glow = ctx.createRadialGradient(0, 0, 0.5, 0, 0, 13);
      glow.addColorStop(0, 'rgba(127,224,168,0.3)');
      glow.addColorStop(1, 'rgba(127,224,168,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, 13, 0, Math.PI * 2);
      ctx.fill();

      // склянка
      ctx.fillStyle = 'rgba(200,255,235,0.18)';
      ctx.strokeStyle = 'rgba(200,255,235,0.55)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(-2.2, -7);
      ctx.lineTo(-2.2, -4);
      ctx.quadraticCurveTo(-4.5, -2, -4.5, 3);
      ctx.quadraticCurveTo(-4.5, 6, 0, 6);
      ctx.quadraticCurveTo(4.5, 6, 4.5, 3);
      ctx.quadraticCurveTo(4.5, -2, 2.2, -4);
      ctx.lineTo(2.2, -7);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // жидкость
      const liquid = ctx.createLinearGradient(0, -1, 0, 6);
      liquid.addColorStop(0, '#9dffd0');
      liquid.addColorStop(0.5, C.green);
      liquid.addColorStop(1, '#2f9c68');
      ctx.fillStyle = liquid;
      ctx.beginPath();
      ctx.moveTo(-3.6, 0);
      ctx.quadraticCurveTo(0, 1.2, 3.6, 0);
      ctx.lineTo(3.6, 3.2);
      ctx.quadraticCurveTo(3.6, 5.2, 0, 5.2);
      ctx.quadraticCurveTo(-3.6, 5.2, -3.6, 3.2);
      ctx.closePath();
      ctx.fill();
      // пробка
      ctx.fillStyle = '#8a7a54';
      ctx.fillRect(-2.3, -8.5, 4.6, 2);
      // блик
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(-2.4, 1.5);
      ctx.lineTo(-2.4, 4);
      ctx.stroke();
    } else if (this.amulet) {
      const y = Math.sin(time * 3 + this.bobSeed) * 2;
      ctx.translate(0, y);
      const glow = ctx.createRadialGradient(0, 0, 0.5, 0, 0, 15);
      glow.addColorStop(0, this.amulet.color);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // цепочка
      ctx.strokeStyle = 'rgba(232,223,196,0.6)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.arc(0, 0, 8.5, -Math.PI * 0.8, -Math.PI * 0.2);
      ctx.stroke();

      // огранённый камень
      const gem = ctx.createLinearGradient(-5, -6, 5, 6);
      gem.addColorStop(0, '#ffffff');
      gem.addColorStop(0.25, this.amulet.color);
      gem.addColorStop(1, '#221a3a');
      ctx.fillStyle = gem;
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(5.5, -1.5);
      ctx.lineTo(0, 7);
      ctx.lineTo(-5.5, -1.5);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(0, 7);
      ctx.moveTo(-5.5, -1.5);
      ctx.lineTo(5.5, -1.5);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.65;
      ctx.fillRect(-1.2, -4, 1.8, 1.8);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
}
