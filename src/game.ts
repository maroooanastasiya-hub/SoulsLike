import { Input } from './core/input';
import { Sound } from './core/audio';
import { RNG, randomSeed } from './core/rng';
import { Camera, text, rect } from './core/draw';
import { VIEW_W, VIEW_H } from './core/constants';
import { C } from './art/palette';
import { FX } from './art/fx';
import { drawBackground } from './art/background';
import {
  Room, generateRoom, drawRoomTiles, drawDecor, drawAltar,
  TILE, GROUND_ROW, BIOME_ORDER, EnemyKind,
} from './world/room';
import { Player } from './entities/player';
import { Enemy } from './entities/enemies';
import { Boss } from './entities/boss';
import { Ally } from './entities/ally';
import { Corpse } from './entities/corpse';
import { Pickup, AMULETS } from './entities/pickup';
import { Projectile, ProjectileKind, ProjectileOwner } from './entities/projectile';
import { drawHUD } from './ui/hud';
import { drawTitle, drawShop, drawDeath, drawVictory, drawPause } from './ui/screens';

export type GameState = 'title' | 'playing' | 'shop' | 'paused' | 'dying' | 'dead' | 'victory';

export interface ShopItem {
  id: string;
  name: string;
  desc: string;
  detail: string;
  baseCost: number;
  cost: number;
  level: number;
}

interface Notification {
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

interface RecordData {
  bestSouls: number;
  bestKills: number;
  bestTime: number;
  runs: number;
}

interface Transition {
  phase: 'out' | 'in';
  t: number;
  cb: () => void;
}

const RECORD_KEY = 'ashen-legion-record';

export class Game {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  input = new Input();
  sound = new Sound();
  camera = new Camera();
  fx = new FX();

  state: GameState = 'title';
  time = 0;
  seed = randomSeed();
  rng = new RNG(this.seed);

  locationIndex = 0;
  roomInLocation = 0;
  room!: Room;

  player = new Player();
  enemies: Enemy[] = [];
  allies: Ally[] = [];
  corpses: Corpse[] = [];
  pickups: Pickup[] = [];
  projectiles: Projectile[] = [];
  boss: Boss | null = null;

  souls = 0;
  money = 0;
  kills = 0;
  raised: Record<string, number> = {};
  amulets: string[] = [];
  armyTier = 0;
  summonBonus = 0;
  altarUsed = new Set<string>();

  notifications: Notification[] = [];
  nearCorpse: Corpse | null = null;
  nearAltar = false;
  bossIntroTimer = 0;
  heroBonus = 0;
  hitstopTimer = 0;
  damageFlash = 0;
  transition: Transition | null = null;
  victoryTimer = 0;
  deathFade = 0;
  doorMsgCd = 0;

  shopIndex = 0;
  shopMessage = '';
  shopItems: ShopItem[] = [];

  runStart = 0;
  totalRooms = 0;
  record: RecordData = { bestSouls: 0, bestKills: 0, bestTime: 0, runs: 0 };
  recordSaved = false;

  stats = { souls: 0, kills: 0, money: 0, depth: 1, time: 0, newRecord: false };
  ending: 'true' | 'ash' | null = null;
  debug = false;
  stateEl: HTMLElement | null = null;
  stateTimer = 0;

  get shopOpen(): boolean { return this.state === 'shop'; }

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D не поддерживается');
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;
    this.loadRecord();
    this.initShop();
    (window as unknown as { __gameRef: Game }).__gameRef = this;
    document.body.dataset.ready = 'yes';
    this.stateEl = document.getElementById('game-state');
    window.addEventListener('keydown', () => this.sound.init());
    window.addEventListener('game-cmd', (e) => {
      this.handleCommand((e as CustomEvent).detail);
    });
  }

  handleCommand(cmd: { type: string; [k: string]: unknown }): void {
    if (!cmd || typeof cmd.type !== 'string') return;
    switch (cmd.type) {
      case 'start':
        this.startRun();
        break;
      case 'teleport':
        this.player.x = Number(cmd.x ?? this.player.x);
        this.player.y = Number(cmd.y ?? this.player.y);
        this.player.vx = 0;
        this.player.vy = 0;
        this.snapCamera();
        break;
      case 'souls':
        this.souls = Math.max(0, Math.min(1000, Number(cmd.n ?? 0)));
        this.checkThresholds();
        break;
      case 'money':
        this.money = Math.max(0, Number(cmd.n ?? 0));
        break;
      case 'spawn':
        this.spawnEnemy((cmd.kind as EnemyKind) ?? 'guard', this.player.cx + 50, this.player.bottom);
        break;
      case 'killAll':
        this.damageEnemiesInRect(0, 0, this.room.widthPx, this.room.heightPx, 99, 1, true);
        if (this.boss && !this.boss.dead) this.boss.hurt(999, 1, this);
        break;
      case 'raiseAll':
        for (const c of this.corpses) if (!c.used) this.raiseCorpse(c);
        break;
      case 'lootAll':
        for (const c of this.corpses) if (!c.used) this.lootCorpse(c);
        break;
      case 'nextRoom':
        this.startTransition(() => this.enterNextRoom());
        break;
      case 'goto':
        this.locationIndex = Math.max(0, Math.min(5, Number(cmd.loc ?? 0)));
        this.roomInLocation = Math.max(0, Math.min(3, Number(cmd.room ?? 0)));
        this.loadRoom();
        break;
      case 'heal':
        this.player.hp = this.player.maxHp;
        this.player.mana = this.player.maxMana;
        break;
      case 'damage':
        this.player.iframes = 0;
        this.player.hurt(Number(cmd.n ?? 1), this.player.cx + 10, this);
        break;
      case 'bossDamage':
        if (this.boss && !this.boss.dead) {
          this.boss.hurt(Number(cmd.n ?? 1), this.player.facing, this);
        }
        break;
      case 'god':
        this.player.iframes = 9999;
        break;
    }
  }

  writeState(): void {
    if (!this.stateEl) return;
    if (!this.room) {
      this.stateEl.textContent = JSON.stringify({ state: this.state, seed: this.seed, record: this.record });
      return;
    }
    const b = this.boss;
    this.stateEl.textContent = JSON.stringify({
      state: this.state,
      seed: this.seed,
      hp: this.player.hp,
      maxHp: this.player.maxHp,
      mana: Math.round(this.player.mana),
      maxMana: this.player.maxMana,
      souls: this.souls,
      money: this.money,
      kills: this.kills,
      amulets: this.amulets,
      loc: this.locationIndex,
      roomInLoc: this.roomInLocation,
      biome: this.room.biomeKey,
      room: [this.room.w, this.room.h],
      player: [Math.round(this.player.x), Math.round(this.player.y)],
      enemies: this.enemies.length,
      allies: this.allies.length,
      corpses: this.corpses.filter((c) => !c.used).length,
      corpseList: this.corpses.filter((c) => !c.used).map((c) => ({ x: Math.round(c.x), y: Math.round(c.y), soul: c.soulValue, kind: c.kind })),
      pickups: this.pickups.length,
      projectiles: this.projectiles.length,
      boss: b ? { name: b.name, hp: b.hp, maxHp: b.maxHp, phase: b.phase } : null,
      nearCorpse: this.nearCorpse ? this.nearCorpse.soulValue : 0,
      nearAltar: this.nearAltar,
      altar: this.room.altar,
      door: this.room.door,
      raised: this.raised,
      ending: this.ending,
      heroBonus: this.heroBonus,
      stats: this.stats,
      record: this.record,
      shop: this.state === 'shop' ? { index: this.shopIndex, message: this.shopMessage, items: this.shopItems.map((i) => ({ id: i.id, cost: i.cost })) } : null,
    });
  }

  // ---------------------------------------------------------------- run flow

  startRun(): void {
    this.sound.init();
    this.seed = randomSeed();
    this.rng = new RNG(this.seed);
    this.locationIndex = 0;
    this.roomInLocation = 0;
    this.souls = 0;
    this.money = 0;
    this.kills = 0;
    this.raised = {};
    this.amulets = [];
    this.armyTier = 0;
    this.summonBonus = 0;
    this.altarUsed.clear();
    this.enemies = [];
    this.allies = [];
    this.corpses = [];
    this.pickups = [];
    this.projectiles = [];
    this.boss = null;
    this.notifications = [];
    this.bossIntroTimer = 0;
    this.heroBonus = 0;
    this.hitstopTimer = 0;
    this.damageFlash = 0;
    this.doorMsgCd = 0;
    this.time = 0;
    this.transition = null;
    this.victoryTimer = 0;
    this.deathFade = 0;
    this.runStart = performance.now();
    this.totalRooms = 0;
    this.recordSaved = false;
    this.ending = null;
    this.fx.particles.length = 0;
    this.player = new Player();
    this.shopIndex = 0;
    this.shopMessage = '';
    this.initShop();
    this.stats = { souls: 0, kills: 0, money: 0, depth: 1, time: 0, newRecord: false };
    this.state = 'playing';
    this.loadRoom();
  }

  loadRoom(): void {
    const biomeKey = BIOME_ORDER[Math.min(this.locationIndex, BIOME_ORDER.length - 1)];
    const isBoss = biomeKey === 'throne' ? true : this.roomInLocation === 3;
    const roomSeed = (this.seed ^ (this.locationIndex * 73856093) ^ (this.roomInLocation * 19349663)) >>> 0;
    this.room = generateRoom(new RNG(roomSeed), biomeKey, this.locationIndex, this.roomInLocation, isBoss);

    this.enemies = [];
    this.allies = [];
    this.corpses = [];
    this.pickups = [];
    this.projectiles = [];
    this.boss = null;
    this.fx.particles.length = 0;
    this.nearCorpse = null;
    this.nearAltar = false;
    this.notifications = [];
    this.heroBonus = 0;

    this.player.placeAt(this.room.spawnX, this.room.spawnY);
    this.snapCamera();

    for (const s of this.room.enemies) {
      this.enemies.push(new Enemy(s.kind, s.x, s.y, this.locationIndex));
    }

    if (this.room.boss) {
      this.boss = new Boss(this.room.boss, (this.room.w - 10) * TILE, GROUND_ROW * TILE);
      if (this.boss.kind === 'hero') {
        // Without a legion behind you, the traitor is far stronger.
        const missing = Math.max(0, 1000 - this.souls);
        const extra = Math.round(missing * 0.12);
        this.boss.maxHp += extra;
        this.boss.hp = this.boss.maxHp;
        this.heroBonus = extra;
      }
      this.bossIntroTimer = 2.2;
      this.sound.boss();
      this.camera.shake(4, 0.4);
    }

    this.totalRooms++;
    if (!this.room.boss && this.roomInLocation === 0) {
      this.notify(this.room.biome.name, this.room.biome.accent);
    }
  }

  snapCamera(): void {
    const x = Math.max(0, Math.min(this.room.widthPx - VIEW_W, this.player.cx - VIEW_W / 2));
    const y = Math.max(0, Math.min(this.room.heightPx - VIEW_H, this.player.cy - VIEW_H * 0.58));
    this.camera.snap(x, y);
  }

  enterNextRoom(): void {
    if (this.locationIndex >= 5) return;
    if (this.roomInLocation < 3) {
      this.roomInLocation++;
    } else {
      this.locationIndex++;
      this.roomInLocation = 0;
    }
    this.loadRoom();
  }

  startTransition(cb: () => void): void {
    if (this.transition) return;
    this.transition = { phase: 'out', t: 0, cb };
  }

  updateTransition(dt: number): void {
    if (!this.transition) return;
    this.transition.t += dt;
    if (this.transition.phase === 'out' && this.transition.t >= 0.22) {
      this.transition.cb();
      this.transition.phase = 'in';
      this.transition.t = 0;
    } else if (this.transition.phase === 'in' && this.transition.t >= 0.3) {
      this.transition = null;
    }
  }

  // ---------------------------------------------------------------- update

  update(dt: number): void {
    this.time += dt;
    this.stateTimer -= dt;
    if (this.stateTimer <= 0) {
      this.stateTimer = 0.08;
      this.writeState();
    }

    if (this.input.pressed('KeyM')) {
      const on = this.sound.toggle();
      this.notify(on ? 'ЗВУК ВКЛЮЧЁН' : 'ЗВУК ВЫКЛЮЧЕН', C.dim);
    }
    if (this.input.pressed('KeyV')) this.toggleFullscreen();
    if (this.input.pressed('Backquote')) this.debug = !this.debug;

    switch (this.state) {
      case 'title':
        if (this.input.pressed('Enter', 'Space')) this.startRun();
        return;
      case 'dead':
      case 'victory':
        this.deathFade = Math.min(1, this.deathFade + dt * 0.6);
        if (this.input.pressed('Enter', 'Space')) this.startRun();
        return;
      case 'dying':
        this.deathFade = Math.min(1, this.deathFade + dt * 1.4);
        this.fx.update(dt);
        this.camera.follow(this.player.cx, this.player.cy, this.room.widthPx, this.room.heightPx, VIEW_W, VIEW_H, dt);
        if (this.deathFade >= 1) {
          this.state = 'dead';
          this.saveRecord();
        }
        return;
      case 'shop':
        this.updateShop();
        return;
      case 'paused':
        if (this.input.pressed('Escape')) this.state = 'playing';
        return;
    }

    if (this.input.pressed('Escape')) {
      this.state = 'paused';
      return;
    }

    if (this.transition) {
      this.updateTransition(dt);
      this.fx.update(dt);
      this.camera.follow(this.player.cx, this.player.cy, this.room.widthPx, this.room.heightPx, VIEW_W, VIEW_H, dt);
      return;
    }

    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= dt;
      return;
    }

    this.doorMsgCd = Math.max(0, this.doorMsgCd - dt);
    this.damageFlash = Math.max(0, this.damageFlash - dt * 2.5);
    this.bossIntroTimer = Math.max(0, this.bossIntroTimer - dt);
    this.updateNotifications(dt);

    this.player.update(dt, this.input, this);
    if (this.state !== 'playing') return;

    for (const e of this.enemies) e.update(dt, this);
    if (this.boss) this.boss.update(dt, this);
    for (const a of this.allies) a.update(dt, this);
    for (const p of this.projectiles) p.update(dt, this);
    for (const c of this.corpses) c.update(dt);
    for (const p of this.pickups) p.update(dt, this);

    this.enemies = this.enemies.filter((e) => !e.dead);
    this.allies = this.allies.filter((a) => !a.dead);
    this.projectiles = this.projectiles.filter((p) => !p.dead);
    this.corpses = this.corpses.filter((c) => !c.used);
    this.pickups = this.pickups.filter((p) => !p.dead);

    this.contactDamage();
    this.updateInteractables();
    this.checkDoor();
    this.checkInteractInput();

    this.fx.update(dt);
    this.camera.follow(this.player.cx, this.player.cy, this.room.widthPx, this.room.heightPx, VIEW_W, VIEW_H, dt);

    if (this.victoryTimer > 0) {
      this.victoryTimer -= dt;
      if (this.victoryTimer <= 0) this.winRun();
    }
  }

  updateNotifications(dt: number): void {
    for (let i = this.notifications.length - 1; i >= 0; i--) {
      this.notifications[i].life -= dt;
      if (this.notifications[i].life <= 0) this.notifications.splice(i, 1);
    }
  }

  contactDamage(): void {
    const p = this.player;
    if (p.dead) return;
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (this.overlap(p.x, p.y, p.w, p.h, e.x, e.y, e.w, e.h)) {
        p.hurt(e.contact, e.cx, this);
      }
    }
    if (this.boss && !this.boss.dead) {
      const b = this.boss;
      if (this.overlap(p.x, p.y, p.w, p.h, b.x, b.y, b.w, b.h)) {
        p.hurt(b.contact, b.cx, this);
      }
    }
  }

  updateInteractables(): void {
    const p = this.player;
    this.nearCorpse = null;
    let best = 999;
    for (const c of this.corpses) {
      if (c.used) continue;
      const d = Math.hypot(c.x - p.cx, c.y - p.cy);
      if (d < 36 && d < best) { best = d; this.nearCorpse = c; }
    }
    this.nearAltar = false;
    if (this.room.altar && !this.nearCorpse) {
      const d = Math.hypot(this.room.altar.x - p.cx, this.room.altar.y - 20 - p.cy);
      this.nearAltar = d < 42;
    }
  }

  checkInteractInput(): void {
    if (this.input.pressed('KeyE')) {
      if (this.nearAltar) {
        this.openShop();
        return;
      }
      if (this.nearCorpse) {
        this.raiseCorpse(this.nearCorpse);
        return;
      }
    }
    if (this.input.pressed('KeyF') && this.nearCorpse && !this.nearCorpse.used) {
      this.lootCorpse(this.nearCorpse);
    }
  }

  checkDoor(): void {
    if (this.locationIndex >= 5) return;
    const p = this.player;
    const d = this.room.door;
    const touching = p.x + p.w > d.x - 6 && p.y + p.h > d.y + 4 && p.y < d.y + d.h;
    if (!touching) return;
    if (this.boss) {
      if (this.doorMsgCd <= 0) {
        this.notify('ДВЕРЬ ЗАПЕЧАТАНА ХРАНИТЕЛЕМ', C.red);
        this.doorMsgCd = 1.6;
      }
      return;
    }
    this.startTransition(() => this.enterNextRoom());
  }

  // ---------------------------------------------------------------- combat

  damageEnemiesInRect(
    x: number, y: number, w: number, h: number,
    dmg: number, dir: number, credit: boolean, exclude?: Enemy,
  ): number {
    let hits = 0;
    for (const e of this.enemies) {
      if (e.dead || e === exclude) continue;
      if (this.overlap(x, y, w, h, e.x, e.y, e.w, e.h)) {
        e.hurt(dmg, dir, this);
        this.fx.number(e.cx, e.y - 2, `-${dmg}`, C.white);
        hits++;
      }
    }
    if (this.boss && !this.boss.dead) {
      const b = this.boss;
      if (this.overlap(x, y, w, h, b.x, b.y, b.w, b.h)) {
        b.hurt(dmg, dir, this);
        this.fx.number(b.cx, b.y - 2, `-${dmg}`, C.gold);
        hits++;
      }
    }
    return hits;
  }

  explode(x: number, y: number, r: number, dmg: number, credit: boolean): void {
    this.fx.explosion(x, y, r);
    this.camera.shake(4, 0.2);
    this.sound.explode();
    this.damageEnemiesInRect(x - r, y - r, r * 2, r * 2, dmg, 1, credit);
  }

  spawnFireball(x: number, y: number, dir: number): void {
    this.projectiles.push(new Projectile('fireball', x, y, dir * 265, 0, 'player', 2, 1.7));
  }

  spawnProjectile(
    kind: ProjectileKind, x: number, y: number,
    vx: number, vy: number, owner: ProjectileOwner, damage: number, life = 3,
  ): void {
    const gravity = kind === 'arrow' ? 180 : 0;
    this.projectiles.push(new Projectile(kind, x, y, vx, vy, owner, damage, life, gravity));
  }

  spawnEnemy(kind: EnemyKind, x: number, bottom: number): Enemy {
    const e = new Enemy(kind, x, bottom, this.locationIndex);
    this.enemies.push(e);
    return e;
  }

  onEnemyKilled(enemy: Enemy, credit: boolean): void {
    if (!credit) return;
    this.kills++;
    const accent = this.room.biome.accent;
    this.corpses.push(new Corpse(
      enemy.kind, enemy.cx, enemy.bottom,
      enemy.soulValue, enemy.coinRange[0], enemy.coinRange[1],
      enemy.kind === 'elite' ? 0.45 : 0.22, accent,
    ));
    // automatic pocket coins
    const coins = this.rng.int(1, 3);
    for (let i = 0; i < coins; i++) {
      const p = new Pickup('coin', enemy.cx, enemy.cy, (Math.random() - 0.5) * 90, -60 - Math.random() * 60);
      p.value = 1;
      this.pickups.push(p);
    }
    if (this.rng.chance(0.06)) {
      this.pickups.push(new Pickup('heal', enemy.cx, enemy.cy, 0, -50));
    }
  }

  onBossKilled(boss: Boss): void {
    this.kills++;
    const accent = this.room.biome.accent;
    this.corpses.push(new Corpse(
      'elite', boss.cx, boss.bottom,
      boss.soulValue, 30, 55, 1, accent,
    ));
    this.fx.explosion(boss.cx, boss.cy, 70);
    this.fx.ring(boss.cx, boss.cy, C.gold);
    this.camera.shake(10, 0.7);
    this.sound.explode();
    this.sound.boss();
    this.notify(`${boss.name} ПАЛ`, C.gold);
    const isHero = boss.kind === 'hero';
    this.boss = null;
    if (isHero) {
      this.victoryTimer = 3.4;
      this.enemies = [];
      this.projectiles = [];
      this.player.iframes = 9999;
      this.notify('ЛЕГИОН ПОДНИМАЕТСЯ', C.soul);
    } else {
      this.notify('ПУТЬ ОТКРЫТ', C.green);
    }
  }

  killPlayer(): void {
    if (this.state !== 'playing') return;
    this.player.dead = true;
    this.state = 'dying';
    this.deathFade = 0;
    this.sound.death();
    this.camera.shake(9, 0.8);
    this.fx.burst(this.player.cx, this.player.cy, C.red, 26);
    this.fx.ring(this.player.cx, this.player.cy, C.red);
    this.finalizeStats();
  }

  winRun(): void {
    if (this.state === 'victory') return;
    this.ending = this.souls >= 1000 ? 'true' : 'ash';
    this.state = 'victory';
    this.deathFade = 0;
    if (this.ending === 'true') this.sound.victory();
    else this.sound.death();
    this.finalizeStats();
    this.saveRecord();
  }

  // ---------------------------------------------------------------- souls & loot

  raiseCorpse(c: Corpse): void {
    if (c.used) return;
    if (this.souls >= 1000) {
      this.notify('ЛЕГИОН УЖЕ ПОЛОН — 1000 ДУШ', C.dim);
      this.sound.deny();
      return;
    }
    c.used = true;
    const gain = Math.min(c.soulValue, 1000 - this.souls);
    this.souls += gain;
    this.raised[c.kind] = (this.raised[c.kind] ?? 0) + 1;
    this.sound.raise();
    this.fx.ring(c.x, c.y - 12, C.soul);
    this.fx.burst(c.x, c.y - 12, C.soul, 12);
    this.notify(`+${gain} ДУШ · ${this.souls}/1000`, C.soul);
    this.checkThresholds();

    if (this.allies.length < 4) {
      const a = new Ally(c.kind, this.player.cx + (Math.random() - 0.5) * 30, this.player.cy);
      a.life = 14;
      a.maxLife = 14;
      this.allies.push(a);
    }
  }

  lootCorpse(c: Corpse): void {
    if (c.used) return;
    c.used = true;
    const total = Math.round(this.rng.int(c.coinMin, c.coinMax) * this.player.coinMult);
    this.money += total;
    let gotAmulet = false;
    if (this.rng.chance(c.lootChance)) {
      const amulet = this.rng.pick(AMULETS);
      const p = new Pickup('amulet', c.x, c.y - 14, (Math.random() - 0.5) * 40, -110);
      p.amulet = amulet;
      this.pickups.push(p);
      gotAmulet = true;
    }
    if (this.rng.chance(0.12)) {
      this.pickups.push(new Pickup('heal', c.x, c.y - 10, 0, -80));
    }
    this.sound.loot();
    this.fx.burst(c.x, c.y - 8, C.gold, 14);
    for (let i = 0; i < 5; i++) this.fx.coinSpark(c.x + (Math.random() - 0.5) * 18, c.y - 10);
    this.notify(gotAmulet ? `ОБЫСКАНО: ${total} МОНЕТ + АМУЛЕТ` : `ОБЫСКАНО: ${total} МОНЕТ`, C.gold);
  }

  checkThresholds(): void {
    const thresholds = [100, 250, 500, 750, 1000];
    while (this.armyTier < thresholds.length && this.souls >= thresholds[this.armyTier]) {
      this.armyTier++;
      switch (this.armyTier) {
        case 1:
          this.player.maxMana += 10;
          this.player.mana += 10;
          this.notify('ЛЕГИОН РАСТЁТ: +10 МАНЫ', C.purple);
          break;
        case 2:
          this.player.damageBonus += 1;
          this.notify('ЛЕГИОН КРЕПНЕТ: +1 УРОН', C.purple);
          break;
        case 3:
          this.player.maxHp += 1;
          this.player.hp += 1;
          this.notify('ЛЕГИОН ЩИТИТ: +1 ЗДОРОВЬЕ', C.purple);
          break;
        case 4:
          this.summonBonus = 1;
          this.notify('ПРИЗЫВ УСИЛЕН: +1 ВОИН', C.purple);
          break;
        case 5:
          this.notify('ЛЕГИОН ПОЛОН — R: АТАКА ЛЕГИОНА', C.soul);
          break;
      }
      this.sound.buy();
      this.camera.shake(2, 0.2);
      this.fx.ring(this.player.cx, this.player.cy, C.purple);
    }
  }

  summonSquad(): number {
    const kinds = Object.keys(this.raised).filter((k) => (this.raised[k] ?? 0) > 0) as EnemyKind[];
    if (kinds.length === 0) return 0;
    const priority: EnemyKind[] = ['elite', 'mage', 'archer', 'guard', 'bomber', 'crawler'];
    kinds.sort((a, b) => priority.indexOf(a) - priority.indexOf(b));
    const count = Math.min(3 + this.summonBonus, 5);
    for (let i = 0; i < count; i++) {
      const kind = kinds[i % kinds.length];
      const x = this.player.cx + (i - (count - 1) / 2) * 26;
      const a = new Ally(kind, x, this.player.cy + 8);
      this.allies.push(a);
      this.fx.ring(x, this.player.cy, C.ghost);
    }
    if (this.allies.length > 12) this.allies.splice(0, this.allies.length - 12);
    return count;
  }

  legionCharge(): void {
    this.notify('ЛЕГИОН ИДЁТ', C.purple);
    this.sound.summon();
    this.camera.shake(10, 0.9);
    for (let i = 0; i < 5; i++) {
      this.fx.ring(this.player.cx + (Math.random() - 0.5) * 120, this.player.cy + (Math.random() - 0.5) * 80, C.purple);
    }
    this.damageEnemiesInRect(0, 0, this.room.widthPx, this.room.heightPx, 8, this.player.facing, true);
    if (this.boss && !this.boss.dead) this.boss.hurt(16, this.player.facing, this);
    const kinds: EnemyKind[] = ['guard', 'archer', 'crawler', 'mage', 'elite'];
    for (let i = 0; i < 8; i++) {
      const kind = kinds[i % kinds.length];
      const a = new Ally(kind, this.player.cx + (Math.random() - 0.5) * 160, this.player.cy + (Math.random() - 0.5) * 60);
      a.life = 22;
      a.maxLife = 22;
      this.allies.push(a);
    }
  }

  nearestEnemy(x: number, y: number, maxDist: number): { cx: number; cy: number; dist: number } | null {
    let best: { cx: number; cy: number; dist: number } | null = null;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.cx - x, e.cy - y);
      if (d < maxDist && (!best || d < best.dist)) best = { cx: e.cx, cy: e.cy, dist: d };
    }
    if (this.boss && !this.boss.dead) {
      const d = Math.hypot(this.boss.cx - x, this.boss.cy - y);
      if (d < maxDist && (!best || d < best.dist)) best = { cx: this.boss.cx, cy: this.boss.cy, dist: d };
    }
    return best;
  }

  // ---------------------------------------------------------------- shop

  initShop(): void {
    this.shopItems = [
      { id: 'hp', name: 'ПРИНОШЕНИЕ КРОВИ', desc: '+1 К МАКС. ЗДОРОВЬЮ', detail: 'ПЛОТЬ ПОМНИТ КАЖДУЮ РАНУ. АЛТАРЬ ЗАЛЕЧИТ ИХ ВСЕ.', baseCost: 45, cost: 45, level: 0 },
      { id: 'dmg', name: 'ЗАТОЧЕННЫЙ КЛИНОК', desc: '+1 К УРОНУ', detail: 'КЛИНОК, ИСПИВШИЙ ПЕПЛА, РЕЖЕТ ГЛУБЖЕ.', baseCost: 65, cost: 65, level: 0 },
      { id: 'mana', name: 'РАСШИРЕНИЕ ДУШИ', desc: '+20 К МАКС. МАНЕ', detail: 'ПУСТОТА ВНУТРИ СТАНОВИТСЯ ВМЕСТИТЕЛЬНЕЕ.', baseCost: 40, cost: 40, level: 0 },
      { id: 'heal', name: 'ЦЕЛЕБНЫЙ ЭЛИКСИР', desc: 'ПОЛНОСТЬЮ ВОССТАНОВИТЬ ЗДОРОВЬЕ', detail: 'ГОРЬКИЙ, НО ВОЗВРАЩАЕТ ТЕБЯ К ЖИЗНИ.', baseCost: 20, cost: 20, level: 0 },
      { id: 'ritual', name: 'ТЁМНЫЙ РИТУАЛ', desc: '+40 ДУШ В ЛЕГИОН', detail: 'МОНЕТЫ, ОТДАННЫЕ ПЕПЛУ, СТАНОВЯТСЯ ВОИНАМИ.', baseCost: 70, cost: 70, level: 0 },
    ];
  }

  refreshShop(): void {
    for (const item of this.shopItems) {
      item.cost = item.id === 'heal' ? item.baseCost : Math.round(item.baseCost * Math.pow(1.55, item.level));
    }
  }

  openShop(): void {
    this.state = 'shop';
    this.shopIndex = 0;
    this.shopMessage = '';
    this.refreshShop();
    const key = `${this.locationIndex}:${this.roomInLocation}`;
    if (!this.altarUsed.has(key)) {
      this.altarUsed.add(key);
      this.player.hp = this.player.maxHp;
      this.player.mana = this.player.maxMana;
      this.sound.heal();
      this.fx.heal(this.player.cx, this.player.cy);
      this.notify('АЛТАРЬ ВОССТАНОВИЛ СИЛЫ', C.green);
    }
  }

  updateShop(): void {
    if (this.input.pressed('Escape', 'KeyE')) {
      this.state = 'playing';
      this.sound.select();
      return;
    }
    if (this.input.pressed('ArrowUp', 'KeyW')) {
      this.shopIndex = (this.shopIndex + this.shopItems.length - 1) % this.shopItems.length;
      this.sound.select();
    }
    if (this.input.pressed('ArrowDown', 'KeyS')) {
      this.shopIndex = (this.shopIndex + 1) % this.shopItems.length;
      this.sound.select();
    }
    if (this.input.pressed('Enter', 'Space')) this.buyShopItem();
  }

  buyShopItem(): void {
    const item = this.shopItems[this.shopIndex];
    if (!item) return;
    if (this.money < item.cost) {
      this.shopMessage = 'НЕ ХВАТАЕТ МОНЕТ';
      this.sound.deny();
      return;
    }
    if (item.id === 'heal' && this.player.hp >= this.player.maxHp) {
      this.shopMessage = 'ЗДОРОВЬЕ УЖЕ ПОЛНОЕ';
      this.sound.deny();
      return;
    }
    if (item.id === 'ritual' && this.souls >= 1000) {
      this.shopMessage = 'ЛЕГИОН УЖЕ ПОЛОН';
      this.sound.deny();
      return;
    }

    this.money -= item.cost;
    switch (item.id) {
      case 'hp':
        this.player.maxHp += 1;
        this.player.hp += 1;
        this.shopMessage = '+1 К МАКС. ЗДОРОВЬЮ';
        break;
      case 'dmg':
        this.player.damageBonus += 1;
        this.shopMessage = '+1 К УРОНУ';
        break;
      case 'mana':
        this.player.maxMana += 20;
        this.player.mana += 20;
        this.shopMessage = '+20 К МАКС. МАНЕ';
        break;
      case 'heal':
        this.player.hp = this.player.maxHp;
        this.shopMessage = 'ЗДОРОВЬЕ ВОССТАНОВЛЕНО';
        break;
      case 'ritual': {
        const gain = Math.min(40, 1000 - this.souls);
        this.souls += gain;
        this.shopMessage = `+${gain} ДУШ В ЛЕГИОН`;
        this.checkThresholds();
        break;
      }
    }
    if (item.id !== 'heal') item.level++;
    this.refreshShop();
    this.sound.buy();
    this.fx.ring(this.player.cx, this.player.cy, C.gold);
  }

  // ---------------------------------------------------------------- helpers

  overlap(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number): boolean {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  notify(str: string, color: string): void {
    this.notifications.push({ text: str, color, life: 2.8, maxLife: 2.8 });
    if (this.notifications.length > 4) this.notifications.shift();
  }

  hitstop(t: number): void {
    this.hitstopTimer = Math.max(this.hitstopTimer, t);
  }

  toggleFullscreen(): void {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }

  finalizeStats(): void {
    this.stats = {
      souls: this.souls,
      kills: this.kills,
      money: this.money,
      depth: Math.min(6, this.locationIndex + 1),
      time: (performance.now() - this.runStart) / 1000,
      newRecord: this.souls > this.record.bestSouls,
    };
  }

  loadRecord(): void {
    try {
      const raw = localStorage.getItem(RECORD_KEY);
      if (raw) {
        const data = JSON.parse(raw) as Partial<RecordData>;
        this.record = {
          bestSouls: data.bestSouls ?? 0,
          bestKills: data.bestKills ?? 0,
          bestTime: data.bestTime ?? 0,
          runs: data.runs ?? 0,
        };
      }
    } catch {
      // ignore
    }
  }

  saveRecord(): void {
    if (this.recordSaved) return;
    this.recordSaved = true;
    this.record.runs++;
    this.record.bestSouls = Math.max(this.record.bestSouls, this.souls);
    this.record.bestKills = Math.max(this.record.bestKills, this.kills);
    this.record.bestTime = Math.max(this.record.bestTime, (performance.now() - this.runStart) / 1000);
    try {
      localStorage.setItem(RECORD_KEY, JSON.stringify(this.record));
    } catch {
      // ignore
    }
  }

  // ---------------------------------------------------------------- render

  draw(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);

    if (this.state === 'title') {
      drawTitle(ctx, this);
      return;
    }

    this.renderWorld();
    if (this.state !== 'dying' && this.state !== 'dead' && this.state !== 'victory') {
      drawHUD(ctx, this);
    }

    if (this.state === 'shop') drawShop(ctx, this);
    if (this.state === 'paused') drawPause(ctx, this);
    if (this.state === 'dying' || this.state === 'dead') drawDeath(ctx, this);
    if (this.state === 'victory') drawVictory(ctx, this);

    if (this.transition) {
      const a = this.transition.phase === 'out'
        ? Math.min(1, this.transition.t / 0.22)
        : 1 - Math.min(1, this.transition.t / 0.3);
      ctx.fillStyle = `rgba(5,4,9,${a})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }

    if (this.debug) {
      text(ctx, `FPS ~60  state=${this.state}  enemies=${this.enemies.length}  allies=${this.allies.length}`, 6, VIEW_H - 6, { size: 6, color: '#7fe0a8' });
      text(ctx, `room=${this.room.w}x${this.room.h}  pos=${this.player.x.toFixed(0)},${this.player.y.toFixed(0)}  cam=${this.camera.drawX},${this.camera.drawY}`, 6, VIEW_H - 14, { size: 6, color: '#7fe0a8' });
    }
  }

  renderWorld(): void {
    const ctx = this.ctx;
    const camX = this.camera.drawX;
    const camY = this.camera.drawY;

    drawBackground(ctx, this.room, camX, camY, this.time);

    ctx.save();
    ctx.translate(-camX, -camY);
    drawDecor(ctx, this.room, camX, VIEW_W, this.time);
    drawRoomTiles(ctx, this.room, camX, camY, VIEW_W, VIEW_H, this.time);

    if (this.room.altar) {
      const key = `${this.locationIndex}:${this.roomInLocation}`;
      drawAltar(ctx, this.room.altar.x, this.room.altar.y, this.time, !this.altarUsed.has(key));
    }

    // soft light around the knight
    const lx = this.player.cx;
    const ly = this.player.cy;
    const lg = ctx.createRadialGradient(lx, ly, 8, lx, ly, 100);
    lg.addColorStop(0, 'rgba(160,140,230,0.10)');
    lg.addColorStop(0.5, 'rgba(120,100,200,0.045)');
    lg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(lx - 100, ly - 100, 200, 200);

    for (const c of this.corpses) c.draw(ctx, this.time);
    for (const p of this.pickups) p.draw(ctx, this.time);
    for (const a of this.allies) a.draw(ctx, this.time);
    for (const e of this.enemies) e.draw(ctx, this.time, this.room.biome.accent);
    if (this.boss) this.boss.draw(ctx, this.time);
    for (const p of this.projectiles) p.draw(ctx, this.time);
    this.player.draw(ctx, this.time);
    this.fx.draw(ctx);
    ctx.restore();
  }
}
