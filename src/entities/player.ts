import type { Game } from '../game';
import { Input } from '../core/input';
import { TILE, Room, moveBody, Body } from '../world/room';
import { C } from '../art/palette';

const GRAVITY = 1500;
const RUN_SPEED = 132;
const GROUND_ACCEL = 1500;
const AIR_ACCEL = 900;
const FRICTION = 1800;
const JUMP_VEL = -382;
const AIR_JUMP_VEL = -338;
const DASH_SPEED = 430;
const DASH_TIME = 0.15;
const DASH_CD = 0.55;

export class Player implements Body {
  x = 0;
  y = 0;
  w = 12;
  h = 22;
  vx = 0;
  vy = 0;
  onGround = false;

  facing = 1;
  hp = 5;
  maxHp = 5;
  mana = 40;
  maxMana = 100;

  damageBonus = 0;
  speedMult = 1;
  spellCostMult = 1;
  iframesBonus = 0;
  coinMult = 1;
  leech = false;

  iframes = 0;
  hurtFlash = 0;
  dashTime = 0;
  dashCd = 0;
  jumpsLeft = 1;
  coyote = 0;
  jumpBuffer = 0;
  jumpHeld = false;

  attackTimer = 0;
  attackCd = 0;
  combo = 0;
  comboTimer = 0;
  attackDir: 'side' | 'up' | 'down' = 'side';
  hitThisSwing = false;

  spellCd = 0;
  healCd = 0;
  summonCd = 0;
  ultCd = 0;

  animTime = 0;
  lastSafeX = 0;
  lastSafeY = 0;
  safeTimer = 0;
  dead = false;

  get cx(): number { return this.x + this.w / 2; }
  get cy(): number { return this.y + this.h / 2; }
  get bottom(): number { return this.y + this.h; }

  placeAt(x: number, bottomY: number): void {
    this.x = x - this.w / 2;
    this.y = bottomY - this.h;
    this.vx = 0;
    this.vy = 0;
    this.lastSafeX = this.x;
    this.lastSafeY = this.y;
  }

  reset(): void {
    this.hp = this.maxHp;
    this.mana = this.maxMana;
    this.iframes = 0;
    this.dead = false;
    this.attackTimer = 0;
    this.attackCd = 0;
    this.dashTime = 0;
    this.dashCd = 0;
    this.combo = 0;
    this.jumpsLeft = 1;
  }

  update(dt: number, input: Input, game: Game): void {
    if (this.dead) return;
    this.animTime += dt;
    this.iframes = Math.max(0, this.iframes - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.attackTimer = Math.max(0, this.attackTimer - dt);
    this.comboTimer = Math.max(0, this.comboTimer - dt);
    this.spellCd = Math.max(0, this.spellCd - dt);
    this.healCd = Math.max(0, this.healCd - dt);
    this.summonCd = Math.max(0, this.summonCd - dt);
    this.ultCd = Math.max(0, this.ultCd - dt);
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.coyote = Math.max(0, this.coyote - dt);

    if (this.comboTimer <= 0) this.combo = 0;

    // passive mana trickle
    this.mana = Math.min(this.maxMana, this.mana + 2.2 * dt);

    const left = input.down('KeyA', 'ArrowLeft');
    const right = input.down('KeyD', 'ArrowRight');
    const axis = (right ? 1 : 0) - (left ? 1 : 0);

    if (input.pressed('Space', 'KeyZ')) this.jumpBuffer = 0.12;
    if (input.pressed('ShiftLeft', 'ShiftRight', 'KeyX') && this.dashCd <= 0 && this.dashTime <= 0) {
      this.startDash(game, axis);
    }

    if (this.dashTime > 0) {
      this.dashTime -= dt;
      this.vx = this.facing * DASH_SPEED;
      this.vy = 0;
      this.iframes = Math.max(this.iframes, 0.08);
      if (Math.random() < 0.7) game.fx.afterimage(this.cx, this.cy, this.facing);
      if (this.dashTime <= 0) {
        this.vx *= 0.45;
        this.dashCd = DASH_CD;
      }
    } else {
      const target = axis * RUN_SPEED * this.speedMult;
      const accel = this.onGround ? GROUND_ACCEL : AIR_ACCEL;
      if (axis !== 0) {
        this.facing = axis;
        if (this.vx * axis < 0) this.vx += axis * accel * 1.6 * dt;
        else this.vx += axis * accel * dt;
        if (Math.abs(this.vx) > Math.abs(target)) this.vx = target;
      } else if (this.onGround) {
        if (Math.abs(this.vx) <= FRICTION * dt) this.vx = 0;
        else this.vx -= Math.sign(this.vx) * FRICTION * dt;
      }

      if (this.jumpBuffer > 0) {
        if (this.onGround || this.coyote > 0) {
          this.vy = JUMP_VEL;
          this.onGround = false;
          this.coyote = 0;
          this.jumpBuffer = 0;
          this.jumpsLeft = 1;
          game.sound.jump();
          game.fx.dust(this.cx, this.bottom, 4);
        } else if (this.jumpsLeft > 0) {
          this.vy = AIR_JUMP_VEL;
          this.jumpsLeft--;
          this.jumpBuffer = 0;
          game.sound.doubleJump();
          game.fx.ring(this.cx, this.cy, C.soul);
          game.fx.dust(this.cx, this.bottom, 3);
        }
      }

      if (!input.down('Space', 'KeyZ') && this.vy < -130) this.vy = -130;

      this.vy += GRAVITY * dt;
      if (this.vy > 620) this.vy = 620;
    }

    moveBody(game.room, this, this.vx * dt, this.vy * dt);
    if (this.onGround) {
      this.coyote = 0.1;
      this.jumpsLeft = 1;
      this.safeTimer += dt;
      if (this.safeTimer > 0.35 && !game.room.spikeInRect(this.x, this.y + this.h, this.w, 4)) {
        this.safeTimer = 0;
        this.lastSafeX = this.x;
        this.lastSafeY = this.y;
      }
    }

    // spikes
    if (game.room.spikeInRect(this.x, this.y + 2, this.w, this.h - 2)) {
      this.hurt(1, this.cx, game);
      this.vy = -300;
    }

    // fell out of the world
    if (this.y > game.room.heightPx + 60) {
      this.x = this.lastSafeX;
      this.y = this.lastSafeY;
      this.vx = 0;
      this.vy = 0;
      this.hurt(1, this.cx, game);
    }

    // attacks
    if (input.pressed('KeyJ') && this.attackCd <= 0 && this.dashTime <= 0) {
      this.attack(input, game);
    }

    // spells
    if (input.pressed('KeyK') && this.spellCd <= 0) this.castFireball(game);
    if (input.pressed('KeyL') && this.healCd <= 0) this.castHeal(game);
    if (input.pressed('KeyQ') && this.summonCd <= 0) this.summon(game);
    if (input.pressed('KeyR') && this.ultCd <= 0) this.ultimate(game);

    if (this.hp <= 0 && !this.dead) game.killPlayer();
  }

  startDash(game: Game, axis: number): void {
    if (axis !== 0) this.facing = axis;
    this.dashTime = DASH_TIME;
    this.dashCd = DASH_CD;
    this.iframes = Math.max(this.iframes, 0.22);
    game.sound.dash();
    game.camera.shake(1.5, 0.08);
  }

  attack(input: Input, game: Game): void {
    const up = input.down('KeyW', 'ArrowUp');
    const down = input.down('KeyS', 'ArrowDown') && !this.onGround;
    this.attackDir = up ? 'up' : down ? 'down' : 'side';
    this.combo = this.comboTimer > 0 ? Math.min(3, this.combo + 1) : 1;
    this.comboTimer = 0.55;
    this.attackTimer = 0.2;
    this.attackCd = 0.26;
    this.hitThisSwing = false;

    const dmg = (this.combo === 3 ? 2 : 1) + this.damageBonus;
    let hx = this.x;
    let hy = this.y;
    let hw = 12;
    let hh = 22;
    if (this.attackDir === 'side') {
      hw = 30 + (this.combo === 3 ? 8 : 0);
      hh = 22;
      hx = this.facing > 0 ? this.x + this.w - 2 : this.x - hw + 2;
      hy = this.y + 1;
    } else if (this.attackDir === 'up') {
      hw = 24;
      hh = 26;
      hx = this.cx - hw / 2;
      hy = this.y - hh + 4;
    } else {
      hw = 22;
      hh = 24;
      hx = this.cx - hw / 2;
      hy = this.y + this.h - 4;
    }

    const hits = game.damageEnemiesInRect(hx, hy, hw, hh, dmg, this.facing, true);
    if (hits > 0) {
      this.hitThisSwing = true;
      this.mana = Math.min(this.maxMana, this.mana + 9 * hits);
      this.iframes = Math.max(this.iframes, 0.06);
      game.hitstop(0.045);
      game.camera.shake(2.2, 0.1);
      game.sound.hit();
      game.fx.slashSpark(this.facing > 0 ? hx + hw : hx, this.cy, this.facing);
      if (this.attackDir === 'down') {
        this.vy = -300;
        this.jumpsLeft = 1;
      }
      if (this.leech && Math.random() < 0.35) this.hp = Math.min(this.maxHp, this.hp + 1);
    } else {
      game.sound.select();
    }
  }

  spellCost(base: number): number {
    return Math.round(base * this.spellCostMult);
  }

  castFireball(game: Game): void {
    const cost = this.spellCost(22);
    if (this.mana < cost) { game.sound.deny(); return; }
    this.mana -= cost;
    this.spellCd = 0.4;
    this.attackTimer = 0.18;
    game.spawnFireball(this.cx + this.facing * 10, this.cy - 2, this.facing);
    game.sound.spell();
    game.camera.shake(1.2, 0.08);
  }

  castHeal(game: Game): void {
    const cost = this.spellCost(33);
    if (this.mana < cost) { game.sound.deny(); return; }
    if (this.hp >= this.maxHp) { game.notify('ЗДОРОВЬЕ ПОЛНОЕ', C.dim); return; }
    this.mana -= cost;
    this.healCd = 0.9;
    this.hp = Math.min(this.maxHp, this.hp + 1);
    game.sound.heal();
    game.fx.heal(this.cx, this.cy);
    game.notify('+1 ЗДОРОВЬЕ', C.green);
  }

  summon(game: Game): void {
    if (game.souls <= 0) { game.notify('НЕТ ПАВШИХ ДЛЯ ПРИЗЫВА', C.dim); game.sound.deny(); return; }
    const cost = this.spellCost(40);
    if (this.mana < cost) { game.sound.deny(); return; }
    this.mana -= cost;
    this.summonCd = 8;
    const n = game.summonSquad();
    if (n > 0) {
      game.sound.summon();
      game.notify(`ПРИЗВАНО ВОИНОВ: ${n}`, C.ghost);
      game.camera.shake(2, 0.15);
    } else {
      this.mana += cost;
      game.sound.deny();
    }
  }

  ultimate(game: Game): void {
    if (game.souls < 1000) {
      game.notify(`ЛЕГИОН НЕ ПОЛОН: ${game.souls}/1000`, C.dim);
      game.sound.deny();
      return;
    }
    if (this.ultCd > 0) { game.sound.deny(); return; }
    this.ultCd = 20;
    game.legionCharge();
  }

  hurt(dmg: number, fromX: number, game: Game): void {
    if (this.iframes > 0 || this.dead) return;
    this.hp -= dmg;
    this.iframes = 1.0 + this.iframesBonus;
    this.hurtFlash = 0.25;
    game.damageFlash = 1;
    const dir = this.cx < fromX ? -1 : 1;
    this.vx = dir * 190;
    this.vy = -170;
    game.sound.hurt();
    game.camera.shake(5, 0.25);
    game.hitstop(0.08);
    game.fx.blood(this.cx, this.cy, dir);
    if (this.hp <= 0) game.killPlayer();
  }

  addMana(n: number): void {
    this.mana = Math.min(this.maxMana, this.mana + n);
  }

  draw(ctx: CanvasRenderingContext2D, time: number): void {
    const blink = this.iframes > 0 && Math.floor(time * 30) % 2 === 0;
    ctx.save();
    ctx.translate(Math.round(this.cx), Math.round(this.bottom));

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 8, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.scale(this.facing, 1);
    const bob = this.onGround && Math.abs(this.vx) < 5 ? Math.sin(time * 2.6) * 0.7 : 0;
    const run = Math.abs(this.vx) > 20 && this.onGround;
    const legSwing = run ? Math.sin(time * 15) * 2.5 : 0;

    if (blink) ctx.globalAlpha = 0.45;

    // cloak
    const sway = Math.sin(time * 3.2) * 0.8 + (run ? 1.2 : 0);
    ctx.fillStyle = '#1a1730';
    ctx.beginPath();
    ctx.moveTo(-7, -4 + bob);
    ctx.lineTo(-6, -15 + bob);
    ctx.lineTo(0, -18 + bob);
    ctx.lineTo(6, -15 + bob);
    ctx.lineTo(7, -4 + bob);
    ctx.lineTo(4 + sway, -1 + bob);
    ctx.lineTo(-4 + sway, -1 + bob);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#2b2650';
    ctx.beginPath();
    ctx.moveTo(-5, -6 + bob);
    ctx.lineTo(-4, -15 + bob);
    ctx.lineTo(0, -17 + bob);
    ctx.lineTo(3, -14 + bob);
    ctx.lineTo(2, -6 + bob);
    ctx.closePath();
    ctx.fill();

    // legs
    ctx.fillStyle = '#141126';
    ctx.fillRect(-4, -4 + bob, 3, 4 + legSwing * 0.4);
    ctx.fillRect(1, -4 + bob, 3, 4 - legSwing * 0.4);

    // mask
    ctx.fillStyle = '#e9e3d2';
    ctx.beginPath();
    ctx.ellipse(0, -18 + bob, 6.2, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#cfc7b2';
    ctx.beginPath();
    ctx.ellipse(0.5, -16.5 + bob, 5.4, 5.2, 0, 0, Math.PI * 2);
    ctx.fill();
    // horns
    ctx.fillStyle = '#e9e3d2';
    ctx.beginPath();
    ctx.moveTo(-6, -21 + bob);
    ctx.lineTo(-9, -28 + bob);
    ctx.lineTo(-4, -24 + bob);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(6, -21 + bob);
    ctx.lineTo(9, -28 + bob);
    ctx.lineTo(4, -24 + bob);
    ctx.closePath();
    ctx.fill();
    // eyes
    ctx.fillStyle = '#0b0a12';
    ctx.beginPath();
    ctx.ellipse(-2.4, -18.5 + bob, 1.5, 2.5, 0.1, 0, Math.PI * 2);
    ctx.ellipse(2.4, -18.5 + bob, 1.5, 2.5, -0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(185,166,255,0.85)';
    ctx.fillRect(-3, -19 + bob, 1, 1);
    ctx.fillRect(2, -19 + bob, 1, 1);

    // scarf
    ctx.fillStyle = '#5b4a8a';
    ctx.beginPath();
    ctx.moveTo(-5, -13 + bob);
    ctx.lineTo(5, -13 + bob);
    ctx.lineTo(4, -11 + bob);
    ctx.lineTo(-4, -11 + bob);
    ctx.closePath();
    ctx.fill();

    // sword idle
    if (this.attackTimer <= 0) {
      ctx.strokeStyle = '#b9b4cc';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(6, -8 + bob);
      ctx.lineTo(10, -20 + bob);
      ctx.stroke();
      ctx.fillStyle = '#7d6ad6';
      ctx.fillRect(5, -9 + bob, 3, 2);
    }
    ctx.restore();

    // attack arc
    if (this.attackTimer > 0) {
      const p = 1 - this.attackTimer / 0.2;
      ctx.save();
      ctx.translate(this.cx, this.cy);
      ctx.globalAlpha = 0.8 * (1 - p * 0.5);
      ctx.strokeStyle = this.combo === 3 ? C.purple : C.white;
      ctx.lineWidth = this.combo === 3 ? 3 : 2;
      const r = 22 + p * 10 + (this.combo === 3 ? 6 : 0);
      if (this.attackDir === 'side') {
        const base = this.facing > 0 ? -0.9 : Math.PI + 0.9;
        ctx.beginPath();
        ctx.arc(0, 0, r, base, base + this.facing * 1.6);
        ctx.stroke();
      } else if (this.attackDir === 'up') {
        ctx.beginPath();
        ctx.arc(0, 0, r, -Math.PI * 0.85, -Math.PI * 0.15);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, r, Math.PI * 0.15, Math.PI * 0.85);
        ctx.stroke();
      }
      ctx.restore();
    }

    // hurt flash
    if (this.hurtFlash > 0) {
      ctx.save();
      ctx.globalAlpha = this.hurtFlash * 2;
      ctx.fillStyle = '#ff4055';
      ctx.fillRect(this.x - 3, this.y - 3, this.w + 6, this.h + 6);
      ctx.restore();
    }
  }
}
