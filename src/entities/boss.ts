import type { Game } from '../game';
import { BossKind, TILE, moveBody, Body } from '../world/room';
import { C } from '../art/palette';

type Action = 'charge' | 'slam' | 'fan' | 'radial' | 'summon' | 'rain' | 'teleport';

interface BossDef {
  name: string;
  hp: number;
  w: number;
  h: number;
  soul: number;
  contact: number;
  actions: Action[][];
  body: string;
  accent: string;
}

const DEFS: Record<BossKind, BossDef> = {
  executioner: {
    name: 'ПАЛАЧ', hp: 46, w: 30, h: 46, soul: 100, contact: 2,
    actions: [['charge', 'slam'], ['charge', 'slam', 'rain']],
    body: '#3a2430', accent: '#e0485c',
  },
  matriarch: {
    name: 'ГНИЛОЙ МАТРИАРХ', hp: 42, w: 38, h: 34, soul: 100, contact: 2,
    actions: [['fan', 'summon'], ['fan', 'summon', 'rain']],
    body: '#243a2c', accent: '#7fe0a8',
  },
  choir: {
    name: 'ХОР ЗАТОНУВШИХ', hp: 40, w: 26, h: 44, soul: 100, contact: 1,
    actions: [['radial', 'teleport'], ['radial', 'fan', 'teleport']],
    body: '#1c3450', accent: '#8cc9ff',
  },
  golem: {
    name: 'КУЗНЕЧНЫЙ ГОЛЕМ', hp: 58, w: 36, h: 44, soul: 100, contact: 2,
    actions: [['charge', 'slam'], ['charge', 'slam', 'rain']],
    body: '#3a1c12', accent: '#ff9a5c',
  },
  boneking: {
    name: 'КОСТЯНОЙ КОРОЛЬ', hp: 50, w: 30, h: 46, soul: 100, contact: 2,
    actions: [['fan', 'summon'], ['fan', 'summon', 'radial']],
    body: '#35312a', accent: '#e8dfc4',
  },
  hero: {
    name: 'ГЕРОЙ', hp: 110, w: 28, h: 44, soul: 250, contact: 2,
    actions: [
      ['charge', 'fan'],
      ['radial', 'summon', 'slam'],
      ['charge', 'radial', 'rain', 'summon'],
    ],
    body: '#2b1a2e', accent: '#ffcf6b',
  },
};

const GRAVITY = 1400;

export class Boss implements Body {
  kind: BossKind;
  def: BossDef;
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
  contact: number;
  dead = false;
  hurtTimer = 0;
  animTime = 0;
  state: 'intro' | 'idle' | 'windup' | 'attack' | 'recover' | 'phase' = 'intro';
  timer = 1.4;
  attackCd = 0.8;
  action: Action | null = null;
  phase = 0;
  phaseCount: number;
  wasAir = false;
  airAttack = false;
  lastAction: Action | null = null;

  get cx(): number { return this.x + this.w / 2; }
  get cy(): number { return this.y + this.h / 2; }
  get bottom(): number { return this.y + this.h; }
  get name(): string { return this.def.name; }

  constructor(kind: BossKind, cx: number, bottom: number) {
    this.kind = kind;
    this.def = DEFS[kind];
    this.w = this.def.w;
    this.h = this.def.h;
    this.x = cx - this.w / 2;
    this.y = bottom - this.h;
    this.hp = this.def.hp;
    this.maxHp = this.hp;
    this.soulValue = this.def.soul;
    this.contact = this.def.contact;
    this.phaseCount = kind === 'hero' ? 3 : 2;
    this.facing = -1;
  }

  update(dt: number, game: Game): void {
    if (this.dead) return;
    this.animTime += dt;
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    this.timer -= dt;
    this.attackCd -= dt;

    // phase transitions
    const frac = this.hp / this.maxHp;
    const newPhase = this.phaseCount === 3
      ? frac > 0.66 ? 0 : frac > 0.33 ? 1 : 2
      : frac > 0.5 ? 0 : 1;
    if (newPhase > this.phase && this.state !== 'phase') {
      this.phase = newPhase;
      this.state = 'phase';
      this.timer = 0.9;
      this.vx = 0;
      this.vy = 0;
      game.camera.shake(7, 0.4);
      game.fx.ring(this.cx, this.cy, this.def.accent);
      game.fx.ring(this.cx, this.cy, C.white);
      game.sound.boss();
      game.notify(`ФАЗА ${this.phase + 1}`, this.def.accent);
    }

    this.vy += GRAVITY * dt;

    const p = game.player;
    const dx = p.cx - this.cx;

    switch (this.state) {
      case 'intro':
        if (this.timer <= 0) this.state = 'idle';
        break;
      case 'idle':
        this.facing = dx > 0 ? 1 : -1;
        if (Math.abs(dx) > 30) this.vx = this.facing * (this.kind === 'hero' ? 52 : 34);
        else this.vx *= 0.8;
        if (this.attackCd <= 0) {
          this.action = this.chooseAction();
          this.state = 'windup';
          this.timer = this.kind === 'hero' ? 0.4 : 0.5;
          this.vx = 0;
          this.facing = dx > 0 ? 1 : -1;
        }
        break;
      case 'windup':
        this.vx = 0;
        if (this.timer <= 0 && this.action) this.execute(this.action, game);
        break;
      case 'attack':
        if (this.action === 'charge') {
          this.vx = this.facing * (this.kind === 'hero' ? 300 : 250);
          if (this.timer <= 0) this.toRecover(0.45);
        } else if (this.action === 'slam') {
          if (!this.onGround) this.wasAir = true;
          if (this.onGround && this.wasAir) {
            this.wasAir = false;
            this.landSlam(game);
            this.toRecover(0.5);
          } else if (this.timer <= 0) {
            this.toRecover(0.4);
          }
        } else if (this.timer <= 0) {
          this.toRecover(0.45);
        }
        break;
      case 'recover':
        this.vx *= 0.85;
        if (this.timer <= 0) {
          this.state = 'idle';
          this.attackCd = this.kind === 'hero' ? 0.9 : 1.2;
        }
        break;
      case 'phase':
        this.vx = 0;
        if (this.timer <= 0) {
          this.state = 'idle';
          this.attackCd = 0.5;
        }
        break;
    }

    moveBody(game.room, this, this.vx * dt, this.vy * dt);
    const minX = 2 * TILE;
    const maxX = game.room.widthPx - 3 * TILE - this.w;
    if (this.x < minX) { this.x = minX; this.vx = 0; }
    if (this.x > maxX) { this.x = maxX; this.vx = 0; }
  }

  chooseAction(): Action {
    const pool = this.def.actions[Math.min(this.phase, this.def.actions.length - 1)];
    let pick = pool[Math.floor(Math.random() * pool.length)];
    if (pool.length > 1 && pick === this.lastAction) {
      pick = pool[(pool.indexOf(pick) + 1) % pool.length];
    }
    this.lastAction = pick;
    return pick;
  }

  toRecover(t: number): void {
    this.state = 'recover';
    this.timer = t;
    this.action = null;
    this.airAttack = false;
  }

  execute(action: Action, game: Game): void {
    const p = game.player;
    switch (action) {
      case 'charge':
        this.state = 'attack';
        this.timer = 0.45;
        this.vx = this.facing * (this.kind === 'hero' ? 300 : 250);
        game.sound.dash();
        game.camera.shake(2, 0.1);
        break;
      case 'slam':
        this.state = 'attack';
        this.timer = 1.4;
        this.vy = -340;
        this.vx = Math.sign(p.cx - this.cx) * 110;
        this.wasAir = false;
        this.airAttack = true;
        game.sound.dash();
        break;
      case 'fan': {
        const n = this.phase > 0 ? 5 : 3;
        const base = Math.atan2(p.cy - this.cy, p.cx - this.cx);
        for (let i = 0; i < n; i++) {
          const a = base + (i - (n - 1) / 2) * 0.17;
          game.spawnProjectile('heroorb', this.cx, this.cy, Math.cos(a) * 150, Math.sin(a) * 150, 'enemy', 1);
        }
        game.sound.spell();
        this.toRecover(0.5);
        break;
      }
      case 'radial': {
        const n = this.kind === 'hero' ? 12 : 9;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          game.spawnProjectile('orb', this.cx, this.cy, Math.cos(a) * 110, Math.sin(a) * 110, 'enemy', 1);
        }
        game.sound.spell();
        game.camera.shake(3, 0.2);
        this.toRecover(0.6);
        break;
      }
      case 'summon': {
        const kinds = this.kind === 'hero' ? ['guard', 'archer'] as const : this.kind === 'matriarch' ? ['crawler', 'crawler'] as const : ['guard', 'crawler'] as const;
        for (let i = 0; i < 2; i++) {
          const x = this.cx + (i === 0 ? -46 : 46);
          game.spawnEnemy(kinds[i % kinds.length], x, this.bottom - 2);
          game.fx.ring(x, this.cy, this.def.accent);
        }
        game.sound.summon();
        this.toRecover(0.7);
        break;
      }
      case 'rain': {
        for (let i = 0; i < 3; i++) {
          const x = p.cx + (i - 1) * 36;
          game.spawnProjectile('orb', x, 20, 0, 150, 'enemy', 1, 4);
        }
        game.sound.spell();
        this.toRecover(0.6);
        break;
      }
      case 'teleport': {
        for (let i = 0; i < 10; i++) {
          const nx = p.cx + (Math.random() < 0.5 ? -1 : 1) * (70 + Math.random() * 90);
          const clamped = Math.max(3 * TILE, Math.min(game.room.widthPx - 4 * TILE, nx));
          if (!game.room.solidInRect(clamped - this.w / 2, this.y, this.w, this.h)) {
            game.fx.ring(this.cx, this.cy, this.def.accent);
            this.x = clamped - this.w / 2;
            this.vx = 0;
            this.vy = 0;
            game.fx.ring(this.cx, this.cy, this.def.accent);
            break;
          }
        }
        this.toRecover(0.45);
        break;
      }
    }
  }

  landSlam(game: Game): void {
    game.camera.shake(8, 0.35);
    game.sound.boss();
    game.fx.explosion(this.cx, this.bottom, 50);
    game.spawnProjectile('shock', this.cx - 12, this.bottom - 8, -190, 0, 'enemy', 1);
    game.spawnProjectile('shock', this.cx + 12, this.bottom - 8, 190, 0, 'enemy', 1);
    const p = game.player;
    if (Math.abs(p.cx - this.cx) < 56 && Math.abs(p.bottom - this.bottom) < 30) p.hurt(2, this.cx, game);
  }

  hurt(dmg: number, dirX: number, game: Game): void {
    if (this.dead) return;
    this.hp -= dmg;
    this.hurtTimer = 0.12;
    game.fx.blood(this.cx, this.cy, dirX);
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      game.onBossKilled(this);
    }
  }

  draw(ctx: CanvasRenderingContext2D, time: number): void {
    ctx.save();
    ctx.translate(Math.round(this.cx), Math.round(this.bottom));
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(0, 0, this.w * 0.55, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    if (this.state === 'windup') {
      ctx.globalAlpha = 0.75 + Math.sin(time * 40) * 0.2;
    }
    ctx.scale(this.facing, 1);
    const flash = this.hurtTimer > 0;
    const body = flash ? '#ffffff' : this.def.body;
    const accent = this.def.accent;
    const bob = Math.sin(time * 2.2) * 1.2;

    if (this.kind === 'executioner') {
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(-14, 0); ctx.lineTo(-12, -32); ctx.lineTo(0, -40); ctx.lineTo(12, -32); ctx.lineTo(14, 0);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = flash ? '#fff' : '#4a2c3a';
      ctx.fillRect(-13, -30, 26, 8);
      ctx.fillStyle = flash ? '#fff' : '#6a3d4a';
      ctx.beginPath(); ctx.ellipse(0, -38 + bob, 8, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0b0a12';
      ctx.fillRect(-6, -40 + bob, 12, 3);
      ctx.fillStyle = accent;
      ctx.fillRect(-4, -39 + bob, 8, 1.6);
      // axe
      ctx.save();
      ctx.translate(14, -26);
      ctx.rotate(this.state === 'windup' ? -0.6 : 0.15);
      ctx.fillStyle = flash ? '#fff' : '#6b5a4a';
      ctx.fillRect(-1.5, -16, 3, 32);
      ctx.fillStyle = flash ? '#fff' : '#9a8a70';
      ctx.beginPath();
      ctx.moveTo(0, -16); ctx.lineTo(13, -10); ctx.lineTo(10, 0); ctx.lineTo(0, -4);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.fillStyle = flash ? '#fff' : '#2a1a22';
      ctx.fillRect(-10, -4, 8, 4);
      ctx.fillRect(3, -4, 8, 4);
    } else if (this.kind === 'matriarch') {
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.ellipse(0, -16 + bob, 19, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = flash ? '#fff' : '#3a5c44';
      ctx.beginPath();
      ctx.ellipse(0, -30 + bob, 22, 10, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = flash ? '#fff' : '#4f7a5c';
      ctx.beginPath();
      ctx.ellipse(-8, -32 + bob, 6, 3, 0, 0, Math.PI * 2);
      ctx.ellipse(8, -34 + bob, 5, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
      // tendrils
      ctx.strokeStyle = flash ? '#fff' : '#2c4a36';
      ctx.lineWidth = 3;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 6, -4);
        ctx.quadraticCurveTo(i * 9 + Math.sin(time * 3 + i) * 4, -8, i * 11, 0);
        ctx.stroke();
      }
      ctx.fillStyle = accent;
      ctx.beginPath(); ctx.ellipse(-6, -18 + bob, 3, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(6, -18 + bob, 3, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0b0a12';
      ctx.fillRect(-7.5, -19 + bob, 1.6, 3);
      ctx.fillRect(4.5, -19 + bob, 1.6, 3);
    } else if (this.kind === 'choir') {
      const float = Math.sin(time * 2) * 3;
      ctx.translate(0, -4 + float);
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(-11, 0); ctx.lineTo(-9, -30); ctx.lineTo(0, -36); ctx.lineTo(9, -30); ctx.lineTo(11, 0);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = flash ? '#fff' : '#2b4a70';
      ctx.beginPath(); ctx.ellipse(0, -36 + bob, 7, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0a1624';
      ctx.fillRect(-4.5, -37 + bob, 9, 3);
      ctx.fillStyle = accent;
      ctx.fillRect(-3, -36 + bob, 2, 1.6);
      ctx.fillRect(1, -36 + bob, 2, 1.6);
      // halo
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.6 + Math.sin(time * 3) * 0.2;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(0, -48 + bob, 11, 3.5, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (this.kind === 'golem') {
      ctx.fillStyle = body;
      ctx.fillRect(-16, -36, 32, 36);
      ctx.fillStyle = flash ? '#fff' : '#5a2c1a';
      ctx.fillRect(-18, -34, 6, 24);
      ctx.fillRect(12, -34, 6, 24);
      ctx.fillStyle = flash ? '#fff' : '#4a2416';
      ctx.fillRect(-12, -44, 24, 12);
      ctx.fillStyle = '#0b0a12';
      ctx.fillRect(-8, -41, 16, 4);
      ctx.fillStyle = accent;
      ctx.fillRect(-5, -40, 4, 2);
      ctx.fillRect(1, -40, 4, 2);
      // furnace core
      const glow = 0.5 + Math.sin(time * 5) * 0.3;
      ctx.fillStyle = `rgba(255,120,50,${glow})`;
      ctx.fillRect(-7, -26, 14, 12);
      ctx.fillStyle = '#ffd08a';
      ctx.fillRect(-3, -23, 6, 6);
      ctx.fillStyle = flash ? '#fff' : '#3a1c12';
      ctx.fillRect(-12, -4, 9, 4);
      ctx.fillRect(3, -4, 9, 4);
    } else if (this.kind === 'boneking') {
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(-10, 0); ctx.lineTo(-9, -30); ctx.lineTo(0, -36); ctx.lineTo(9, -30); ctx.lineTo(10, 0);
      ctx.closePath(); ctx.fill();
      // ribs
      ctx.strokeStyle = flash ? '#fff' : '#6b6450';
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(-7, -26 + i * 6);
        ctx.quadraticCurveTo(0, -23 + i * 6, 7, -26 + i * 6);
        ctx.stroke();
      }
      // skull
      ctx.fillStyle = flash ? '#fff' : '#e8dfc4';
      ctx.beginPath(); ctx.ellipse(0, -40 + bob, 7, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0b0a12';
      ctx.beginPath(); ctx.ellipse(-3, -41 + bob, 2, 2.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(3, -41 + bob, 2, 2.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = accent;
      ctx.fillRect(-3, -42 + bob, 1.5, 1.5);
      ctx.fillRect(2, -42 + bob, 1.5, 1.5);
      // crown
      ctx.fillStyle = flash ? '#fff' : '#8a6524';
      ctx.beginPath();
      ctx.moveTo(-7, -47 + bob); ctx.lineTo(-5, -54 + bob); ctx.lineTo(-2, -49 + bob);
      ctx.lineTo(0, -55 + bob); ctx.lineTo(2, -49 + bob); ctx.lineTo(5, -54 + bob); ctx.lineTo(7, -47 + bob);
      ctx.closePath(); ctx.fill();
    } else {
      // HERO
      const aura = 0.35 + Math.sin(time * 3) * 0.15;
      ctx.fillStyle = `rgba(255,207,107,${aura * 0.25})`;
      ctx.beginPath(); ctx.arc(0, -22, 34, 0, Math.PI * 2); ctx.fill();
      // cape
      ctx.fillStyle = flash ? '#fff' : '#4a1030';
      ctx.beginPath();
      ctx.moveTo(-10, -34);
      ctx.quadraticCurveTo(-22, -20, -16 + Math.sin(time * 3) * 2, 0);
      ctx.lineTo(0, -2);
      ctx.lineTo(8, 0);
      ctx.quadraticCurveTo(12, -20, 9, -34);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(-9, 0); ctx.lineTo(-8, -28); ctx.lineTo(0, -36); ctx.lineTo(8, -28); ctx.lineTo(9, 0);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = flash ? '#fff' : '#3d2340';
      ctx.fillRect(-9, -30, 18, 6);
      // mask
      ctx.fillStyle = flash ? '#fff' : '#e8dfc4';
      ctx.beginPath(); ctx.ellipse(0, -39 + bob, 7, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0b0a12';
      ctx.beginPath(); ctx.ellipse(-2.8, -40 + bob, 1.6, 2.8, 0.1, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(2.8, -40 + bob, 1.6, 2.8, -0.1, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = accent;
      ctx.fillRect(-3.4, -41 + bob, 1.2, 1.6);
      ctx.fillRect(2.2, -41 + bob, 1.2, 1.6);
      // horns
      ctx.fillStyle = flash ? '#fff' : '#e8dfc4';
      ctx.beginPath();
      ctx.moveTo(-6, -45 + bob); ctx.lineTo(-13, -58 + bob); ctx.lineTo(-3, -48 + bob); ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(6, -45 + bob); ctx.lineTo(13, -58 + bob); ctx.lineTo(3, -48 + bob); ctx.closePath(); ctx.fill();
      // blade
      ctx.save();
      ctx.translate(11, -24);
      ctx.rotate(this.state === 'windup' ? -0.8 : 0.1);
      ctx.fillStyle = flash ? '#fff' : '#ffcf6b';
      ctx.fillRect(-1.5, -26, 3, 38);
      ctx.fillStyle = '#fff6d8';
      ctx.fillRect(-0.7, -24, 1.4, 30);
      ctx.fillStyle = '#6b5a4a';
      ctx.fillRect(-4, -2, 8, 3);
      ctx.restore();
      ctx.fillStyle = flash ? '#fff' : '#241426';
      ctx.fillRect(-7, -4, 6, 4);
      ctx.fillRect(2, -4, 6, 4);
    }
    ctx.restore();
  }
}
