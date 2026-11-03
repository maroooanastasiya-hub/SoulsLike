import type { Game } from '../game';
import { BossKind, TILE, moveBody, Body } from '../world/room';
import { C } from '../art/palette';
import { drawCustomFirst, hasAnyCustomAsset } from '../art/custom';

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
  incubus: {
    name: 'ИНКУБ', hp: 84, w: 40, h: 64, soul: 180, contact: 2,
    actions: [
      ['fan', 'charge'],
      ['radial', 'summon', 'slam', 'rain'],
    ],
    body: '#2a1028', accent: '#ff8ad4',
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
    const flash = this.hurtTimer > 0;
    const accent = this.def.accent;

    // Кастомный SVG босса. Фазы и атаки продолжают работать из кода.
    const action = this.state === 'attack' || this.state === 'windup' ? 'attack' : flash ? 'hurt' : 'idle';
    const phaseKey = this.phase >= 2 ? 'phase3' : this.phase >= 1 ? 'phase2' : 'idle';
    const customKeys = [
      `characters/bosses/${this.kind}/${action}`,
      `characters/bosses/${this.kind}/${phaseKey}`,
      `characters/bosses/${this.kind}/idle`,
      `characters/bosses/${this.kind}`,
    ];
    if (hasAnyCustomAsset(customKeys)) {
      ctx.save();
      ctx.globalAlpha = 0.32;
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.ellipse(this.cx, this.bottom - 1, this.w * 0.7, 4.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    const custom = drawCustomFirst(
      ctx,
      customKeys,
      {
        x: this.cx,
        y: this.bottom,
        height: this.h * 1.65,
        flip: this.facing < 0,
        scale: this.state === 'phase' ? 1.05 : 1,
        filter: flash ? 'brightness(1.75)' : undefined,
      },
    );
    if (custom) return;
    const white = flash ? '#ffffff' : null;
    const bob = Math.sin(time * 2.2) * 1.2;
    const windup = this.state === 'windup';
    const phaseFrac = 1 - this.hp / this.maxHp;

    ctx.save();
    ctx.translate(Math.round(this.cx), Math.round(this.bottom));

    // тень и аура босса
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.beginPath();
    ctx.ellipse(0, 0, this.w * 0.62, 4.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const aura = ctx.createRadialGradient(0, -this.h * 0.45, 3, 0, -this.h * 0.45, this.w * 1.35);
    aura.addColorStop(0, `rgba(${this.kind === 'hero' ? '255,207,107' : '185,166,255'},${0.06 + phaseFrac * 0.05})`);
    aura.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(0, -this.h * 0.45, this.w * 1.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (windup) ctx.globalAlpha = 0.76 + Math.sin(time * 40) * 0.18;
    ctx.scale(this.facing, 1);

    if (this.kind === 'executioner') {
      // плащ
      ctx.fillStyle = white ?? '#2a0d16';
      ctx.beginPath();
      ctx.moveTo(-13, -34);
      ctx.quadraticCurveTo(-23, -18, -17, 0);
      ctx.lineTo(-4, -3);
      ctx.lineTo(0, 0);
      ctx.lineTo(10, -2);
      ctx.quadraticCurveTo(16, -18, 11, -34);
      ctx.closePath();
      ctx.fill();
      // ноги
      ctx.fillStyle = white ?? '#201018';
      ctx.fillRect(-11, -5, 8, 5);
      ctx.fillRect(3, -5, 8, 5);
      // корпус
      const body = ctx.createLinearGradient(-14, -38, 14, 0);
      body.addColorStop(0, '#5a2733');
      body.addColorStop(0.45, '#3a1b24');
      body.addColorStop(1, '#1d0d13');
      ctx.fillStyle = white ?? body;
      ctx.beginPath();
      ctx.moveTo(-14, 0);
      ctx.lineTo(-12, -32);
      ctx.lineTo(0, -40);
      ctx.lineTo(12, -32);
      ctx.lineTo(14, 0);
      ctx.closePath();
      ctx.fill();
      // нагрудник
      ctx.fillStyle = white ?? '#4a2530';
      ctx.fillRect(-13, -30, 26, 8);
      ctx.strokeStyle = white ?? 'rgba(224,72,92,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -29);
      ctx.lineTo(-4, -20);
      ctx.moveTo(0, -29);
      ctx.lineTo(4, -20);
      ctx.stroke();
      // наплечники с шипами
      ctx.fillStyle = white ?? '#5c2c3a';
      ctx.beginPath();
      ctx.moveTo(-12, -33);
      ctx.lineTo(-20, -29);
      ctx.lineTo(-15, -22);
      ctx.lineTo(-10, -26);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(12, -33);
      ctx.lineTo(20, -29);
      ctx.lineTo(15, -22);
      ctx.lineTo(10, -26);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = white ?? '#b9b0c8';
      ctx.beginPath();
      ctx.moveTo(-19, -29);
      ctx.lineTo(-22, -36);
      ctx.lineTo(-16, -31);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(19, -29);
      ctx.lineTo(22, -36);
      ctx.lineTo(16, -31);
      ctx.closePath();
      ctx.fill();
      // голова
      ctx.fillStyle = white ?? '#3c1d26';
      ctx.beginPath();
      ctx.ellipse(0, -38 + bob, 8.5, 8.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = white ?? '#cfc7b2';
      ctx.beginPath();
      ctx.ellipse(0, -38 + bob, 6.2, 5.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0b0a12';
      ctx.beginPath();
      ctx.ellipse(-2.6, -38.5 + bob, 1.6, 2.6, 0.15, 0, Math.PI * 2);
      ctx.ellipse(2.6, -38.5 + bob, 1.6, 2.6, -0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = windup ? '#ff4055' : accent;
      ctx.fillRect(-3.1, -39 + bob, 1.1, 1.4);
      ctx.fillRect(2, -39 + bob, 1.1, 1.4);
      // рога шлема
      ctx.fillStyle = white ?? '#7a6a50';
      ctx.beginPath();
      ctx.moveTo(-7, -42 + bob);
      ctx.quadraticCurveTo(-15, -48, -13, -55 + bob);
      ctx.quadraticCurveTo(-9, -48, -4, -44 + bob);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(7, -42 + bob);
      ctx.quadraticCurveTo(15, -48, 13, -55 + bob);
      ctx.quadraticCurveTo(9, -48, 4, -44 + bob);
      ctx.closePath();
      ctx.fill();
      // топор
      ctx.save();
      ctx.translate(15, -25);
      ctx.rotate(windup ? -0.75 : 0.18 + Math.sin(time * 2) * 0.03);
      ctx.strokeStyle = white ?? '#6b5a4a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, -18);
      ctx.lineTo(0, 18);
      ctx.stroke();
      const axe = ctx.createLinearGradient(0, -20, 16, 0);
      axe.addColorStop(0, '#c8c0d8');
      axe.addColorStop(0.45, '#8a8098');
      axe.addColorStop(1, '#4a4058');
      ctx.fillStyle = white ?? axe;
      ctx.beginPath();
      ctx.moveTo(0, -19);
      ctx.quadraticCurveTo(16, -15, 14, -4);
      ctx.lineTo(0, -7);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = white ?? 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.fillStyle = white ?? '#3a1b24';
      ctx.fillRect(-4, 15, 8, 3);
      ctx.restore();
      // цепи
      ctx.strokeStyle = white ?? 'rgba(200,190,160,0.35)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(-10 + i * 1.5, -22 + i * 5, 1.6, 2.4, 0.3, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (this.kind === 'matriarch') {
      // щупальца
      ctx.strokeStyle = white ?? '#2c4a36';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 6, -8);
        ctx.quadraticCurveTo(i * 10 + Math.sin(time * 3 + i) * 5, -2, i * 13, 0);
        ctx.stroke();
      }
      // тело
      const body = ctx.createRadialGradient(-4, -22 + bob, 2, 0, -16 + bob, 20);
      body.addColorStop(0, '#4f7a5c');
      body.addColorStop(0.55, '#243a2c');
      body.addColorStop(1, '#102018');
      ctx.fillStyle = white ?? body;
      ctx.beginPath();
      ctx.ellipse(0, -16 + bob, 19, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      // шляпка
      const cap = ctx.createLinearGradient(0, -42 + bob, 0, -25 + bob);
      cap.addColorStop(0, '#5f916b');
      cap.addColorStop(1, '#2d4d37');
      ctx.fillStyle = white ?? cap;
      ctx.beginPath();
      ctx.ellipse(0, -30 + bob, 23, 11, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      // пластины шляпки
      ctx.fillStyle = white ?? '#7fb08a';
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.ellipse(i * 7, -35 + bob + Math.abs(i) * 1.5, 4.5, 2.4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // глаза
      ctx.fillStyle = '#07100b';
      ctx.beginPath();
      ctx.ellipse(-7, -19 + bob, 3.5, 4.4, 0.1, 0, Math.PI * 2);
      ctx.ellipse(7, -19 + bob, 3.5, 4.4, -0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.shadowColor = accent;
      ctx.shadowBlur = 7;
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(-6, -19 + bob, 1.5, 0, Math.PI * 2);
      ctx.arc(8, -19 + bob, 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // пасть
      ctx.strokeStyle = white ?? '#132219';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, -12 + bob, 6, 0.2, Math.PI - 0.2);
      ctx.stroke();
      ctx.strokeStyle = white ?? 'rgba(232,223,196,0.4)';
      ctx.lineWidth = 0.8;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 2.4, -10.5 + bob);
        ctx.lineTo(i * 2.1, -13 + bob);
        ctx.stroke();
      }
      // споры
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 12; i++) {
        const a = time * 0.9 + i * 1.7;
        const r = 17 + (i % 5) * 5;
        const sx = Math.cos(a) * r;
        const sy = -20 + Math.sin(a * 1.4) * 15;
        ctx.fillStyle = `rgba(127,224,168,${0.18 + (i % 3) * 0.12})`;
        ctx.beginPath();
        ctx.arc(sx, sy, 0.9 + (i % 2) * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    } else if (this.kind === 'choir') {
      const float = Math.sin(time * 2) * 3;
      ctx.translate(0, -4 + float);
      // мантия
      const robe = ctx.createLinearGradient(0, -42, 0, 2);
      robe.addColorStop(0, '#2b4a70');
      robe.addColorStop(0.55, '#162c46');
      robe.addColorStop(1, '#08111c');
      ctx.fillStyle = white ?? robe;
      ctx.beginPath();
      ctx.moveTo(-11, 0);
      ctx.lineTo(-9, -30);
      ctx.lineTo(0, -37);
      ctx.lineTo(9, -30);
      ctx.lineTo(11, 0);
      ctx.lineTo(6, -3);
      ctx.lineTo(2, 1);
      ctx.lineTo(-3, -2);
      ctx.closePath();
      ctx.fill();
      // складки
      ctx.strokeStyle = white ?? 'rgba(140,201,255,0.25)';
      ctx.lineWidth = 0.8;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 5, -28);
        ctx.quadraticCurveTo(i * 6, -14, i * 7, -2);
        ctx.stroke();
      }
      // маска
      ctx.fillStyle = white ?? '#cfd6dc';
      ctx.beginPath();
      ctx.ellipse(0, -38 + bob, 7, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0a1624';
      ctx.beginPath();
      ctx.ellipse(-2.6, -38.5 + bob, 1.4, 2.7, 0.1, 0, Math.PI * 2);
      ctx.ellipse(2.6, -38.5 + bob, 1.4, 2.7, -0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = accent;
      ctx.fillRect(-3.2, -39 + bob, 1, 1.5);
      ctx.fillRect(2.2, -39 + bob, 1, 1.5);
      // нимб
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = accent;
      ctx.shadowColor = accent;
      ctx.shadowBlur = 6;
      ctx.globalAlpha = 0.6 + Math.sin(time * 3) * 0.2;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(0, -51 + bob, 12, 3.5, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      // парящие маски
      for (let i = 0; i < 3; i++) {
        const a = time * 0.8 + i * (Math.PI * 2 / 3);
        const mx = Math.cos(a) * 18;
        const my = -34 + Math.sin(a) * 7 + Math.sin(time + i) * 2;
        ctx.fillStyle = white ?? 'rgba(207,214,220,0.55)';
        ctx.beginPath();
        ctx.ellipse(mx, my, 3, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0a1624';
        ctx.fillRect(mx - 1.4, my - 0.8, 1, 1.2);
        ctx.fillRect(mx + 0.4, my - 0.8, 1, 1.2);
      }
      // капли воды
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 6; i++) {
        const a = time * 1.5 + i;
        ctx.fillStyle = 'rgba(140,201,255,0.35)';
        ctx.beginPath();
        ctx.arc(Math.sin(a) * 18, -6 + Math.cos(a * 1.5) * 10, 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    } else if (this.kind === 'golem') {
      // ноги
      ctx.fillStyle = white ?? '#2a110a';
      ctx.fillRect(-14, -5, 11, 5);
      ctx.fillRect(4, -5, 11, 5);
      // корпус
      const body = ctx.createLinearGradient(-17, -38, 17, 0);
      body.addColorStop(0, '#6d3620');
      body.addColorStop(0.5, '#3a1c12');
      body.addColorStop(1, '#1a0a06');
      ctx.fillStyle = white ?? body;
      ctx.fillRect(-17, -36, 34, 32);
      // плечи
      ctx.fillStyle = white ?? '#5a2c1a';
      ctx.fillRect(-21, -38, 9, 20);
      ctx.fillRect(12, -38, 9, 20);
      ctx.fillStyle = white ?? '#6d3620';
      ctx.fillRect(-20, -40, 7, 5);
      ctx.fillRect(13, -40, 7, 5);
      // голова
      ctx.fillStyle = white ?? '#4a2416';
      ctx.fillRect(-12, -49, 24, 13);
      ctx.fillStyle = '#0b0a12';
      ctx.fillRect(-8, -46, 16, 5);
      ctx.fillStyle = windup ? '#ff4055' : accent;
      ctx.fillRect(-5, -45, 4, 2.4);
      ctx.fillRect(1, -45, 4, 2.4);
      // печная пасть
      const furnace = 0.5 + Math.sin(time * 5) * 0.3;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.shadowColor = C.ember;
      ctx.shadowBlur = 10;
      ctx.fillStyle = `rgba(255,120,50,${0.7 * furnace})`;
      ctx.fillRect(-8, -28, 16, 13);
      ctx.fillStyle = '#ffd08a';
      ctx.fillRect(-3.5, -24, 7, 6);
      ctx.restore();
      // заклёпки
      ctx.fillStyle = white ?? '#8a5a40';
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(-14 + (i % 2) * 26, -34 + Math.floor(i / 2) * 20, 2, 2);
      }
      // трубы
      ctx.strokeStyle = white ?? '#5a2c1a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-19, -34);
      ctx.lineTo(-24, -40);
      ctx.lineTo(-24, -48);
      ctx.stroke();
      ctx.strokeStyle = white ?? 'rgba(120,110,100,0.35)';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 3; i++) {
        const sy = -48 - i * 4 + Math.sin(time * 2 + i) * 1.5;
        ctx.beginPath();
        ctx.arc(-24 + Math.sin(time * 1.5 + i) * 3, sy, 3 + i, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (this.kind === 'boneking') {
      // плащ
      ctx.fillStyle = white ?? '#1b1712';
      ctx.beginPath();
      ctx.moveTo(-12, -36);
      ctx.quadraticCurveTo(-22, -16, -15, 0);
      ctx.lineTo(0, -2);
      ctx.lineTo(15, 0);
      ctx.quadraticCurveTo(21, -18, 11, -36);
      ctx.closePath();
      ctx.fill();
      // позвоночник и рёбра
      ctx.strokeStyle = white ?? '#6b6450';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(0, -32);
      ctx.stroke();
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(-8, -28 + i * 6);
        ctx.quadraticCurveTo(0, -25 + i * 6, 8, -28 + i * 6);
        ctx.stroke();
      }
      // таз и ноги
      ctx.fillStyle = white ?? '#4a4436';
      ctx.beginPath();
      ctx.moveTo(-8, -10);
      ctx.lineTo(8, -10);
      ctx.lineTo(6, -4);
      ctx.lineTo(-6, -4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = white ?? '#2a251c';
      ctx.fillRect(-9, -4, 6, 4);
      ctx.fillRect(3, -4, 6, 4);
      // череп
      const skull = ctx.createRadialGradient(-2, -44 + bob, 1, 0, -41 + bob, 9);
      skull.addColorStop(0, '#ffffff');
      skull.addColorStop(0.55, '#e8dfc4');
      skull.addColorStop(1, '#9a8f70');
      ctx.fillStyle = white ?? skull;
      ctx.beginPath();
      ctx.ellipse(0, -41 + bob, 8, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0b0a12';
      ctx.beginPath();
      ctx.ellipse(-3.2, -42 + bob, 2.3, 3, 0.1, 0, Math.PI * 2);
      ctx.ellipse(3.2, -42 + bob, 2.3, 3, -0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.shadowColor = accent;
      ctx.shadowBlur = 6;
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(-3, -42 + bob, 1.2, 0, Math.PI * 2);
      ctx.arc(3, -42 + bob, 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = white ?? '#8a8068';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-3, -36 + bob);
      ctx.lineTo(0, -34 + bob);
      ctx.lineTo(3, -36 + bob);
      ctx.stroke();
      // корона
      const crown = ctx.createLinearGradient(0, -58 + bob, 0, -47 + bob);
      crown.addColorStop(0, '#ffcf6b');
      crown.addColorStop(1, '#8a6524');
      ctx.fillStyle = white ?? crown;
      ctx.beginPath();
      ctx.moveTo(-8, -49 + bob);
      ctx.lineTo(-6, -57 + bob);
      ctx.lineTo(-2, -51 + bob);
      ctx.lineTo(0, -59 + bob);
      ctx.lineTo(2, -51 + bob);
      ctx.lineTo(6, -57 + bob);
      ctx.lineTo(8, -49 + bob);
      ctx.closePath();
      ctx.fill();
      // меч
      ctx.save();
      ctx.translate(-12, -24);
      ctx.rotate(-0.35 + Math.sin(time * 1.6) * 0.03);
      ctx.fillStyle = white ?? '#b9b4cc';
      ctx.fillRect(-1.2, -20, 2.4, 28);
      ctx.fillStyle = white ?? '#6b5a4a';
      ctx.fillRect(-4, 6, 8, 2.5);
      ctx.restore();
    } else if (this.kind === 'incubus') {
      // ---------------------------------------------------------------- INCUBUS
      ctx.scale(1.22, 1.22);
      const float = Math.sin(time * 2.4) * 2;
      // широкие крылья
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const wing = ctx.createLinearGradient(0, -50, 0, -4);
      wing.addColorStop(0, 'rgba(255,138,212,0.28)');
      wing.addColorStop(1, 'rgba(90,20,80,0.02)');
      ctx.fillStyle = wing;
      for (const dir of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(dir * 6, -44);
        ctx.quadraticCurveTo(dir * 34, -62, dir * 40, -26);
        ctx.quadraticCurveTo(dir * 30, -30, dir * 24, -16);
        ctx.quadraticCurveTo(dir * 17, -26, dir * 8, -20);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      // хвост
      ctx.strokeStyle = white ?? '#5a1e48';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-2, -8);
      ctx.quadraticCurveTo(-22, -2, -26 + Math.sin(time * 3) * 4, -24);
      ctx.stroke();
      ctx.fillStyle = white ?? '#ff8ad4';
      ctx.beginPath();
      ctx.moveTo(-30 + Math.sin(time * 3) * 4, -27);
      ctx.lineTo(-23, -28);
      ctx.lineTo(-25, -21);
      ctx.closePath();
      ctx.fill();

      // длинные светлые волосы за спиной
      const hair = ctx.createLinearGradient(0, -66, 0, -2);
      hair.addColorStop(0, '#fff6d8');
      hair.addColorStop(0.5, '#f2d79a');
      hair.addColorStop(1, '#b69a5c');
      ctx.fillStyle = white ?? hair;
      ctx.beginPath();
      ctx.moveTo(-9, -50);
      ctx.quadraticCurveTo(-20, -30, -16 + Math.sin(time * 1.8) * 2, -6);
      ctx.quadraticCurveTo(-8, -14, -6, -34);
      ctx.lineTo(6, -34);
      ctx.quadraticCurveTo(8, -14, 16 + Math.sin(time * 1.8 + 1) * 2, -6);
      ctx.quadraticCurveTo(20, -30, 9, -50);
      ctx.closePath();
      ctx.fill();

      // ноги
      ctx.fillStyle = white ?? '#2a1226';
      ctx.fillRect(-7, -5, 5, 5);
      ctx.fillRect(2, -5, 5, 5);
      ctx.fillStyle = white ?? '#ff8ad4';
      ctx.fillRect(-8, -2, 6, 1.4);
      ctx.fillRect(2, -2, 6, 1.4);

      // обнажённый торс
      const skin = ctx.createLinearGradient(-10, -40, 10, -6);
      skin.addColorStop(0, '#f6dcea');
      skin.addColorStop(0.55, '#d8a9c8');
      skin.addColorStop(1, '#8a5a80');
      ctx.fillStyle = white ?? skin;
      ctx.beginPath();
      ctx.moveTo(-8, -6);
      ctx.quadraticCurveTo(-10, -28, -5, -38);
      ctx.quadraticCurveTo(0, -42, 5, -38);
      ctx.quadraticCurveTo(10, -28, 8, -6);
      ctx.closePath();
      ctx.fill();

      // татуировки
      ctx.strokeStyle = white ?? 'rgba(120,20,90,0.6)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(-5, -30);
      ctx.quadraticCurveTo(0, -26, 5, -30);
      ctx.moveTo(-4, -22);
      ctx.quadraticCurveTo(0, -19, 4, -22);
      ctx.stroke();

      // шея и голова
      ctx.fillStyle = white ?? '#e8c6dc';
      ctx.fillRect(-2.4, -45 + float, 4.8, 7);
      ctx.fillStyle = white ?? '#f6dcea';
      ctx.beginPath();
      ctx.ellipse(0, -50 + float, 7.4, 8.4, 0, 0, Math.PI * 2);
      ctx.fill();

      // светлые пряди спереди
      ctx.fillStyle = white ?? '#fff2cf';
      ctx.beginPath();
      ctx.moveTo(-7.5, -56 + float);
      ctx.quadraticCurveTo(-9, -44, -5.5, -37);
      ctx.quadraticCurveTo(-4, -46, -2.4, -54);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(7.5, -56 + float);
      ctx.quadraticCurveTo(9, -44, 5.5, -37);
      ctx.quadraticCurveTo(4, -46, 2.4, -54);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-4, -58 + float);
      ctx.quadraticCurveTo(0, -66 + float, 4, -58 + float);
      ctx.quadraticCurveTo(0, -61 + float, -4, -58 + float);
      ctx.closePath();
      ctx.fill();

      // рога
      ctx.fillStyle = white ?? '#3a1030';
      for (const dir of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(dir * 5.5, -56 + float);
        ctx.quadraticCurveTo(dir * 12, -68 + float, dir * 9, -74 + float);
        ctx.quadraticCurveTo(dir * 8, -64 + float, dir * 3, -57 + float);
        ctx.closePath();
        ctx.fill();
      }

      // светящиеся глаза
      ctx.save();
      ctx.shadowColor = accent;
      ctx.shadowBlur = 8;
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.ellipse(-2.8, -50.5 + float, 1.7, 1.1, 0.15, 0, Math.PI * 2);
      ctx.ellipse(2.8, -50.5 + float, 1.7, 1.1, -0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // ухмылка
      ctx.strokeStyle = white ?? '#7a2048';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(-2.5, -45 + float);
      ctx.quadraticCurveTo(0, -43.5 + float, 2.5, -45 + float);
      ctx.stroke();

      // аура похоти
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 7; i++) {
        const a = time * 1.4 + i * 0.9;
        ctx.fillStyle = `rgba(255,138,212,${0.14 + (i % 3) * 0.06})`;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 20, -30 + Math.sin(a * 1.3) * 18, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    } else {
      // ---------------------------------------------------------------- HERO
      const aura = 0.5 + Math.sin(time * 3) * 0.15;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const halo = ctx.createRadialGradient(0, -24, 4, 0, -24, 40);
      halo.addColorStop(0, `rgba(255,207,107,${0.16 * aura})`);
      halo.addColorStop(0.6, 'rgba(255,138,212,0.05)');
      halo.addColorStop(1, 'rgba(255,207,107,0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(0, -24, 40, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // плащ
      const cape = ctx.createLinearGradient(0, -38, 0, 2);
      cape.addColorStop(0, '#5a1038');
      cape.addColorStop(0.6, '#3a0a24');
      cape.addColorStop(1, '#1b0411');
      ctx.fillStyle = white ?? cape;
      ctx.beginPath();
      ctx.moveTo(-10, -34);
      ctx.quadraticCurveTo(-24, -18, -18 + Math.sin(time * 3) * 2, 0);
      ctx.lineTo(-5, -3);
      ctx.lineTo(0, 1);
      ctx.lineTo(7, -4);
      ctx.lineTo(13, 0);
      ctx.quadraticCurveTo(16, -20, 9, -34);
      ctx.closePath();
      ctx.fill();

      // ноги
      ctx.fillStyle = white ?? '#1d101f';
      ctx.fillRect(-8, -5, 6, 5);
      ctx.fillRect(2, -5, 6, 5);
      ctx.fillStyle = white ?? '#c8a24e';
      ctx.fillRect(-9, -2, 7, 1.5);
      ctx.fillRect(2, -2, 7, 1.5);

      // корпус
      const armor = ctx.createLinearGradient(-10, -36, 10, 0);
      armor.addColorStop(0, '#f4dd9a');
      armor.addColorStop(0.25, '#a9822f');
      armor.addColorStop(0.6, '#4a2a18');
      armor.addColorStop(1, '#241018');
      ctx.fillStyle = white ?? armor;
      ctx.beginPath();
      ctx.moveTo(-9, 0);
      ctx.lineTo(-8, -28);
      ctx.lineTo(0, -37);
      ctx.lineTo(8, -28);
      ctx.lineTo(9, 0);
      ctx.closePath();
      ctx.fill();
      // нагрудник
      ctx.fillStyle = white ?? '#ffcf6b';
      ctx.beginPath();
      ctx.moveTo(-7, -26);
      ctx.lineTo(0, -22);
      ctx.lineTo(7, -26);
      ctx.lineTo(6, -14);
      ctx.lineTo(0, -10);
      ctx.lineTo(-6, -14);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = white ?? 'rgba(255,247,210,0.8)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.fillStyle = white ?? '#e0485c';
      ctx.beginPath();
      ctx.moveTo(0, -21);
      ctx.lineTo(2.4, -17);
      ctx.lineTo(0, -13);
      ctx.lineTo(-2.4, -17);
      ctx.closePath();
      ctx.fill();
      // пояс
      ctx.fillStyle = white ?? '#3a1e16';
      ctx.fillRect(-9, -13, 18, 3);
      ctx.fillStyle = white ?? '#ffcf6b';
      ctx.fillRect(-2, -13.5, 4, 4);
      // наплечники
      ctx.fillStyle = white ?? '#c8a24e';
      ctx.beginPath();
      ctx.moveTo(-8, -29);
      ctx.lineTo(-16, -26);
      ctx.lineTo(-11, -19);
      ctx.lineTo(-6, -22);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(8, -29);
      ctx.lineTo(16, -26);
      ctx.lineTo(11, -19);
      ctx.lineTo(6, -22);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = white ?? '#fff0bd';
      ctx.beginPath();
      ctx.moveTo(-15, -26);
      ctx.lineTo(-18, -31);
      ctx.lineTo(-12, -28);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(15, -26);
      ctx.lineTo(18, -31);
      ctx.lineTo(12, -28);
      ctx.closePath();
      ctx.fill();

      // маска
      const mask = ctx.createRadialGradient(-2, -42 + bob, 1, 0, -39 + bob, 9);
      mask.addColorStop(0, '#ffffff');
      mask.addColorStop(0.55, '#e8dfc4');
      mask.addColorStop(1, '#a89870');
      ctx.fillStyle = white ?? mask;
      ctx.beginPath();
      ctx.ellipse(0, -39 + bob, 7.5, 8.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0b0a12';
      ctx.beginPath();
      ctx.ellipse(-2.8, -40 + bob, 1.7, 2.9, 0.1, 0, Math.PI * 2);
      ctx.ellipse(2.8, -40 + bob, 1.7, 2.9, -0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.shadowColor = C.gold;
      ctx.shadowBlur = 7;
      ctx.fillStyle = windup ? '#ff4055' : C.gold;
      ctx.fillRect(-3.4, -41 + bob, 1.2, 1.7);
      ctx.fillRect(2.2, -41 + bob, 1.2, 1.7);
      ctx.restore();
      // рога
      ctx.fillStyle = white ?? '#e8dfc4';
      ctx.beginPath();
      ctx.moveTo(-6.5, -45 + bob);
      ctx.quadraticCurveTo(-14, -52, -12, -60 + bob);
      ctx.quadraticCurveTo(-8, -53, -3, -47 + bob);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(6.5, -45 + bob);
      ctx.quadraticCurveTo(14, -52, 12, -60 + bob);
      ctx.quadraticCurveTo(8, -53, 3, -47 + bob);
      ctx.closePath();
      ctx.fill();

      // золотой нимб
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(255,207,107,${0.35 + Math.sin(time * 2.5) * 0.15})`;
      ctx.shadowColor = C.gold;
      ctx.shadowBlur = 7;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, -52 + bob, 14, 3.2, 0, 0, Math.PI * 2);
      ctx.stroke();
      // парящие осколки клинков
      for (let i = 0; i < 5; i++) {
        const a = time * 1.1 + i * (Math.PI * 2 / 5);
        const sx = Math.cos(a) * 24;
        const sy = -32 + Math.sin(a) * 13;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(a + Math.PI / 2);
        ctx.fillStyle = `rgba(255,207,107,${0.45 + phaseFrac * 0.3})`;
        ctx.beginPath();
        ctx.moveTo(0, -5);
        ctx.lineTo(1.2, 0);
        ctx.lineTo(0, 5);
        ctx.lineTo(-1.2, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();

      // огромный клинок
      ctx.save();
      ctx.translate(12, -23);
      ctx.rotate(windup ? -0.85 : 0.12 + Math.sin(time * 2) * 0.02);
      const blade = ctx.createLinearGradient(0, -28, 0, 8);
      blade.addColorStop(0, '#fff8dc');
      blade.addColorStop(0.35, '#ffcf6b');
      blade.addColorStop(0.75, '#c8962e');
      blade.addColorStop(1, '#6b4a18');
      ctx.fillStyle = white ?? blade;
      ctx.beginPath();
      ctx.moveTo(0, -30);
      ctx.lineTo(2.8, -22);
      ctx.lineTo(2, -2);
      ctx.lineTo(0, 1);
      ctx.lineTo(-2, -2);
      ctx.lineTo(-2.8, -22);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = white ?? 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(0.3, -27);
      ctx.lineTo(0.3, -4);
      ctx.stroke();
      ctx.fillStyle = white ?? '#6b4a18';
      ctx.fillRect(-5, -3, 10, 2);
      ctx.fillStyle = white ?? '#e8dfc4';
      ctx.fillRect(-4, 3, 8, 2.5);
      ctx.fillStyle = white ?? '#e0485c';
      ctx.beginPath();
      ctx.arc(0, 6, 1.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // светящиеся глаза-искры при ветре
      if (windup) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(255,207,107,0.2)';
        ctx.beginPath();
        ctx.ellipse(0, -22, 22, 28, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();
  }
}
