import { Input } from './core/input';
import { Sound } from './core/audio';
import { RNG, randomSeed } from './core/rng';
import { Camera, text, rect } from './core/draw';
import { VIEW_W, VIEW_H, RENDER_SCALE } from './core/constants';
import { C } from './art/palette';
import { FX } from './art/fx';
import { drawBackground } from './art/background';
import {
  Room, generateRoom, createTutorialRoom, drawRoomTiles, drawDecor, drawSecret,
  drawMerchant, drawOasis, drawKeeper,
  TILE, GROUND_ROW, BIOME_ORDER, BOSS_ROOM_INDEX, EnemyKind, T_EMPTY,
} from './world/room';
import { Player } from './entities/player';
import { Enemy } from './entities/enemies';
import { Boss } from './entities/boss';
import { Ally } from './entities/ally';
import { Corpse } from './entities/corpse';
import { Pickup, AMULETS } from './entities/pickup';
import { Projectile, ProjectileKind, ProjectileOwner } from './entities/projectile';
import { Rabbit } from './entities/rabbit';
import { drawHUD } from './ui/hud';
import {
  drawTitle, drawShop, drawDeath, drawVictory, drawPause, drawHeroMenu, drawRabbitDialog,
} from './ui/screens';
import {
  TUTORIAL_STEPS, TUTORIAL_SKIP_BUTTON, drawTutorial, drawTutorialSigns,
} from './ui/tutorial';

export type GameState =
  | 'title' | 'playing' | 'hero' | 'rabbit' | 'shop' | 'paused' | 'dying' | 'dead' | 'victory';

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
const TUTORIAL_KEY = 'ashen-legion-tutorial-done';

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
  rabbit: Rabbit | null = null;
  /** Локация, на которой уже встречался кролик (не больше одного на уровень). */
  rabbitLevel = -1;
  rabbitChoice = 0;
  rabbitResult: 'pet' | 'eat' | null = null;
  rabbitResultTimer = 0;
  rabbitSoulGain = 0;
  rabbitBiteDamage = 0;
  /** Локация, где кролика съели: в конце вернётся инкуб. */
  rabbitEatenLocation = -1;
  incubusDefeated = false;

  tutorial = false;
  tutorialDone = false;
  tutorialSteps: boolean[] = [];
  tutorialStartX = 0;

  souls = 0;
  money = 0;
  kills = 0;
  raised: Record<string, number> = {};
  amulets: string[] = [];
  armyTier = 0;
  summonBonus = 0;

  notifications: Notification[] = [];
  nearCorpse: Corpse | null = null;
  nearMerchant = false;
  nearKeeper = false;
  nearSecret = false;
  oasisNotified = false;
  oasisHeal = 0;
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

  /** Время текущего забега в секундах (для меню героя). */
  get runTime(): number {
    return Math.max(0, (performance.now() - this.runStart) / 1000);
  }

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D не поддерживается');
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
    this.loadRecord();
    this.initShop();
    (window as unknown as { __gameRef: Game }).__gameRef = this;
    document.body.dataset.ready = 'yes';
    this.stateEl = document.getElementById('game-state');
    window.addEventListener('keydown', () => this.sound.init());
    window.addEventListener('game-cmd', (e) => {
      this.handleCommand((e as CustomEvent).detail);
    });
    window.addEventListener('blur', () => {
      if (this.state === 'playing' && !this.transition) this.state = 'paused';
    });

    // кнопка пропуска обучения — кликабельная
    const buttonHit = (e: MouseEvent): boolean => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const x = (e.clientX - rect.left) / rect.width * VIEW_W;
      const y = (e.clientY - rect.top) / rect.height * VIEW_H;
      const b = TUTORIAL_SKIP_BUTTON;
      return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
    };
    canvas.addEventListener('click', (e) => {
      if (this.tutorial && buttonHit(e)) this.skipTutorial();
    });
    canvas.addEventListener('mousemove', (e) => {
      canvas.style.cursor = this.tutorial && buttonHit(e) ? 'pointer' : 'default';
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
        this.roomInLocation = Math.max(0, Math.min(BOSS_ROOM_INDEX, Number(cmd.room ?? 0)));
        this.loadRoom();
        break;
      case 'rabbit':
        this.rabbit = null;
        this.spawnRabbit(true);
        break;
      case 'secret':
        if (this.room.secret) {
          this.openSecret();
          const s = this.room.secret;
          this.player.placeAt(s.x, GROUND_ROW * TILE);
          this.snapCamera();
        }
        break;
      case 'merchant':
        this.room.merchant = { x: this.player.cx + 30, y: GROUND_ROW * TILE };
        this.snapCamera();
        break;
      case 'oasis':
        this.room.oasis = true;
        this.enemies = [];
        this.boss = null;
        this.oasisNotified = false;
        this.snapCamera();
        break;
      case 'incubus':
        this.boss = new Boss('incubus', (this.room.w - 10) * TILE, GROUND_ROW * TILE);
        this.bossIntroTimer = 2.2;
        this.rabbitEatenLocation = this.locationIndex;
        this.snapCamera();
        break;
      case 'die':
        this.killPlayer();
        break;
      case 'tutorial':
        localStorage.removeItem(TUTORIAL_KEY);
        this.startRun();
        break;
      case 'tutorialReset':
        localStorage.removeItem(TUTORIAL_KEY);
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
      rabbit: this.rabbit
        ? {
          x: Math.round(this.rabbit.x),
          y: Math.round(this.rabbit.groundY),
          resolved: this.rabbit.resolved,
          fleeing: this.rabbit.fleeing,
        }
        : null,
      nearCorpse: this.nearCorpse ? this.nearCorpse.soulValue : 0,
      nearMerchant: this.nearMerchant,
      oasis: this.room.oasis,
      merchant: this.room.merchant,
      nearSecret: this.nearSecret,
      secret: this.room.secret
        ? { kind: this.room.secret.kind, amount: this.room.secret.amount, opened: this.room.secret.opened, taken: this.room.secret.taken }
        : null,
      tutorial: this.tutorial,
      tutorialDone: this.tutorialDone,
      tutorialSteps: this.tutorialSteps,
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
    this.enemies = [];
    this.allies = [];
    this.corpses = [];
    this.pickups = [];
    this.projectiles = [];
    this.boss = null;
    this.rabbit = null;
    this.rabbitLevel = -1;
    this.rabbitChoice = 0;
    this.rabbitResult = null;
    this.rabbitResultTimer = 0;
    this.rabbitSoulGain = 0;
    this.rabbitBiteDamage = 0;
    this.rabbitEatenLocation = -1;
    this.incubusDefeated = false;
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

    // Первый забег начинается с тренировочного зала. Пропуск запоминается.
    this.tutorial = localStorage.getItem(TUTORIAL_KEY) !== '1';
    this.tutorialDone = false;
    this.tutorialSteps = new Array(TUTORIAL_STEPS.length).fill(false);
    if (this.tutorial) this.loadTutorialRoom();
    else this.loadRoom();
  }

  loadTutorialRoom(): void {
    this.tutorial = true;
    this.tutorialDone = false;
    this.tutorialSteps = new Array(TUTORIAL_STEPS.length).fill(false);
    this.room = createTutorialRoom();
    this.enemies = [];
    this.allies = [];
    this.corpses = [];
    this.pickups = [];
    this.projectiles = [];
    this.boss = null;
    this.rabbit = null;
    this.rabbitResult = null;
    this.rabbitChoice = 0;
    this.fx.particles.length = 0;
    this.nearCorpse = null;
    this.nearMerchant = false;
    this.nearKeeper = false;
    this.nearSecret = false;
    this.oasisNotified = false;
    this.oasisHeal = 0;
    this.notifications = [];
    this.bossIntroTimer = 0;
    this.heroBonus = 0;
    this.victoryTimer = 0;

    this.player.placeAt(this.room.spawnX, this.room.spawnY);
    this.player.hp = Math.max(1, this.player.maxHp - 1);
    this.player.mana = this.player.maxMana;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.iframes = 1;
    this.tutorialStartX = this.player.cx;
    this.snapCamera();

    // два павших воина: один для E (душа), второй для F (обыск)
    const c1 = new Corpse('guard', 444, GROUND_ROW * TILE, 20, 2, 4, 0.8, C.soul);
    c1.life = 999;
    c1.maxLife = 999;
    const c2 = new Corpse('guard', 502, GROUND_ROW * TILE, 0, 6, 10, 0.9, C.gold);
    c2.life = 999;
    c2.maxLife = 999;
    this.corpses.push(c1, c2);

    this.totalRooms++;
    this.notify('ТРЕНИРОВОЧНЫЙ ЗАЛ', C.soul);
  }

  /** Завершает обучение досрочно по кнопке/клавише S. */
  skipTutorial(): void {
    if (!this.tutorial) return;
    this.markTutorialSeen();
    this.state = 'playing';
    this.sound.select();
    this.startTransition(() => {
      this.tutorial = false;
      this.tutorialDone = true;
      this.locationIndex = 0;
      this.roomInLocation = 0;
      this.loadRoom();
      this.notify('ОБУЧЕНИЕ ПРОПУЩЕНО', C.dim);
    });
  }

  markTutorialSeen(): void {
    try {
      localStorage.setItem(TUTORIAL_KEY, '1');
    } catch {
      // приватный режим — не страшно, обучение просто покажется снова
    }
  }

  completeTutorialStep(index: number): void {
    if (!this.tutorial || index < 0 || index >= this.tutorialSteps.length) return;
    if (this.tutorialSteps[index]) return;
    this.tutorialSteps[index] = true;
    this.sound.select();
    if (this.tutorialSteps.every(Boolean)) {
      this.tutorialDone = true;
      this.sound.raise();
      this.notify('ОБУЧЕНИЕ ЗАВЕРШЕНО · ДВЕРЬ ОТКРЫТА', C.gold);
    }
  }

  updateTutorial(): void {
    if (!this.tutorial) return;
    if (Math.abs(this.player.cx - this.tutorialStartX) > 50) this.completeTutorialStep(0);
    if (this.input.pressed('Space', 'KeyZ')) this.completeTutorialStep(1);
    if (this.input.pressed('ShiftLeft', 'ShiftRight', 'KeyX')) this.completeTutorialStep(2);
    if (this.input.pressed('KeyJ')) this.completeTutorialStep(3);
    if (this.input.pressed('KeyK')) this.completeTutorialStep(4);
    if (this.input.pressed('KeyL')) this.completeTutorialStep(5);
    if (this.input.pressed('KeyE') || this.souls > 0) this.completeTutorialStep(6);
    if (this.input.pressed('KeyF')) this.completeTutorialStep(7);
    if (this.input.pressed('KeyQ')) this.completeTutorialStep(8);
  }

  loadRoom(): void {
    this.tutorial = false;
    this.tutorialDone = false;
    const biomeKey = BIOME_ORDER[Math.min(this.locationIndex, BIOME_ORDER.length - 1)];
    const isBoss = biomeKey === 'throne' ? true : this.roomInLocation === BOSS_ROOM_INDEX;
    const roomSeed = (this.seed ^ (this.locationIndex * 73856093) ^ (this.roomInLocation * 19349663)) >>> 0;
    this.room = generateRoom(new RNG(roomSeed), biomeKey, this.locationIndex, this.roomInLocation, isBoss);

    this.enemies = [];
    this.allies = [];
    this.corpses = [];
    this.pickups = [];
    this.projectiles = [];
    this.boss = null;
    this.rabbit = null;
    this.rabbitResult = null;
    this.rabbitChoice = 0;
    this.fx.particles.length = 0;
    this.nearCorpse = null;
    this.nearMerchant = false;
    this.nearKeeper = false;
    this.nearSecret = false;
    this.oasisNotified = false;
    this.oasisHeal = 0;
    this.notifications = [];
    this.heroBonus = 0;

    this.player.placeAt(this.room.spawnX, this.room.spawnY);
    this.snapCamera();

    for (const s of this.room.enemies) {
      this.enemies.push(new Enemy(s.kind, s.x, s.y, this.locationIndex));
    }

    if (this.room.boss) {
      const incubus =
        !this.incubusDefeated &&
        this.rabbitEatenLocation === this.locationIndex &&
        this.room.boss !== 'hero';
      this.boss = new Boss(
        incubus ? 'incubus' : this.room.boss,
        (this.room.w - 10) * TILE,
        GROUND_ROW * TILE,
      );
      if (incubus) this.notify('СЪЕДЕННЫЙ КРОЛИК ВЕРНУЛСЯ', C.red);
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

    // редкий белый кролик: не больше одного на локацию
    if (!isBoss && this.rabbitLevel !== this.locationIndex && this.rng.chance(0.09)) {
      this.spawnRabbit();
    }

    this.totalRooms++;
    if (!this.room.boss && this.roomInLocation === 0) {
      this.notify(this.room.biome.name, this.room.biome.accent);
    }
  }

  /** Ищет безопасное место на полу и выпускает белого кролика. */
  spawnRabbit(force = false): Rabbit | null {
    if (!this.room || this.room.isBoss) return null;
    if (!force && this.rabbitLevel === this.locationIndex) return null;
    if (this.rabbit && !this.rabbit.dead) return this.rabbit;

    for (let attempt = 0; attempt < 48; attempt++) {
      const tx = this.rng.int(8, this.room.w - 9);
      const gy = GROUND_ROW;
      if (!this.room.isSolid(tx, gy)) continue;
      if (this.room.isSpike(tx, gy - 1) || this.room.isSpike(tx, gy - 2)) continue;
      if (this.room.isSolid(tx, gy - 1) || this.room.isSolid(tx, gy - 2)) continue;

      const x = tx * TILE + 8;
      if (Math.abs(x - this.room.spawnX) < 110) continue;
      if (Math.abs(x - this.room.door.x) < 90) continue;

      const minX = Math.max(2 * TILE + 10, x - 52);
      const maxX = Math.min(this.room.widthPx - 2 * TILE - 10, x + 52);
      this.rabbit = new Rabbit(x, gy * TILE, minX, maxX);
      this.rabbitLevel = this.locationIndex;
      return this.rabbit;
    }
    return null;
  }

  snapCamera(): void {
    const x = Math.max(0, Math.min(this.room.widthPx - VIEW_W, this.player.cx - VIEW_W / 2));
    const y = Math.max(0, Math.min(this.room.heightPx - VIEW_H, this.player.cy - VIEW_H * 0.58));
    this.camera.snap(x, y);
  }

  enterNextRoom(): void {
    if (this.tutorial) {
      this.markTutorialSeen();
      this.tutorial = false;
      this.tutorialDone = true;
      this.locationIndex = 0;
      this.roomInLocation = 0;
      this.loadRoom();
      return;
    }
    if (this.locationIndex >= 5) return;
    if (this.roomInLocation < BOSS_ROOM_INDEX) {
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
    if (this.input.pressed('KeyV', 'F11')) this.toggleFullscreen();
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
      case 'rabbit':
        this.updateRabbitDialog(dt);
        return;
      case 'hero':
        if (this.input.pressed('Tab', 'KeyI', 'Escape')) this.state = 'playing';
        return;
      case 'paused':
        if (this.input.pressed('Escape')) this.state = 'playing';
        return;
    }

    if (this.tutorial && !this.transition && this.input.pressed('KeyS')) {
      this.skipTutorial();
      return;
    }

    if (!this.transition && this.input.pressed('Tab', 'KeyI')) {
      if (this.tutorial) this.completeTutorialStep(9);
      this.state = 'hero';
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
    this.updateOasis(dt);

    this.player.update(dt, this.input, this);
    if (this.state !== 'playing') return;

    for (const e of this.enemies) e.update(dt, this);
    if (this.boss) this.boss.update(dt, this);
    for (const a of this.allies) a.update(dt, this);
    for (const p of this.projectiles) p.update(dt, this);
    for (const c of this.corpses) c.update(dt);
    for (const p of this.pickups) p.update(dt, this);
    if (this.rabbit) {
      this.rabbit.update(dt, this);
      if (this.rabbit.dead) this.rabbit = null;
    }

    this.enemies = this.enemies.filter((e) => !e.dead);
    this.allies = this.allies.filter((a) => !a.dead);
    this.projectiles = this.projectiles.filter((p) => !p.dead);
    this.corpses = this.corpses.filter((c) => !c.used);
    this.pickups = this.pickups.filter((p) => !p.dead);

    this.contactDamage();
    this.updateInteractables();
    this.checkDoor();
    this.checkRabbit();
    if (this.state !== 'playing') return;
    this.checkInteractInput();
    this.checkSecretPickup();
    if (this.tutorial) this.updateTutorial();

    this.fx.update(dt);
    this.camera.follow(this.player.cx, this.player.cy, this.room.widthPx, this.room.heightPx, VIEW_W, VIEW_H, dt);

    if (this.victoryTimer > 0) {
      this.victoryTimer -= dt;
      if (this.victoryTimer <= 0) this.winRun();
    }
  }

  /** Оазис постепенно восстанавливает оболочку. */
  updateOasis(dt: number): void {
    if (!this.room.oasis || this.player.dead) return;
    if (!this.oasisNotified) {
      this.oasisNotified = true;
      this.notify('ОАЗИС · ОБОЛОЧКА ВОССТАНАВЛИВАЕТСЯ', C.green);
      this.sound.heal();
    }
    const p = this.player;
    if (p.hp < p.maxHp) {
      this.oasisHeal += dt * 0.9;
      while (this.oasisHeal >= 1 && p.hp < p.maxHp) {
        this.oasisHeal -= 1;
        p.hp = Math.min(p.maxHp, p.hp + 1);
        this.fx.heal(p.cx + (Math.random() - 0.5) * 14, p.cy);
        this.sound.heal();
      }
    } else {
      this.oasisHeal = 0;
    }
    if (p.mana < p.maxMana) p.mana = Math.min(p.maxMana, p.mana + dt * 10);
  }

  updateNotifications(dt: number): void {    for (let i = this.notifications.length - 1; i >= 0; i--) {
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
    this.nearMerchant = false;
    if (this.room.merchant && !this.nearCorpse) {
      const d = Math.hypot(this.room.merchant.x - p.cx, this.room.merchant.y - 22 - p.cy);
      this.nearMerchant = d < 44;
    }
    this.nearKeeper = false;
    if (this.room.keeper && !this.nearCorpse) {
      const d = Math.hypot(this.room.keeper.x - p.cx, this.room.keeper.y - 20 - p.cy);
      this.nearKeeper = d < 40;
    }
    this.nearSecret = false;
    const secret = this.room.secret;
    if (secret && !secret.taken) {
      if (!secret.opened) {
        const sx = (secret.wallX + 1) * TILE;
        const sy = (secret.wallY + 1.5) * TILE;
        this.nearSecret = Math.hypot(sx - p.cx, sy - p.cy) < 34;
      } else {
        this.nearSecret = Math.hypot(secret.x - p.cx, secret.y - p.cy) < 30;
      }
    }
  }

  checkInteractInput(): void {
    if (this.input.pressed('KeyE')) {
      if (this.nearSecret) {
        if (this.room.secret?.opened) this.collectSecret();
        else this.openSecret();
        return;
      }
      if (this.nearMerchant) {
        this.openMerchant();
        return;
      }
      if (this.nearKeeper) {
        this.notify('ХРАНИТЕЛЬ: «ОТДОХНИ, ПРИЗРАК. ВОДА ПОМНИТ ТЕБЯ»', C.green);
        this.sound.heal();
        this.fx.heal(this.player.cx, this.player.cy);
        this.oasisHeal = 0;
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

  /** Разбивает фальшивую стену и выпускает капсулу с наградой. */  openSecret(): void {
    const secret = this.room.secret;
    if (!secret || secret.opened) return;
    secret.opened = true;
    this.nearSecret = false;
    for (let ty = secret.wallY; ty < secret.wallY + secret.wallH; ty++) {
      for (let tx = secret.wallX; tx < secret.wallX + secret.wallW; tx++) {
        this.room.set(tx, ty, T_EMPTY);
      }
    }
    const cx = (secret.wallX + secret.wallW / 2) * TILE;
    const cy = (secret.wallY + secret.wallH / 2) * TILE;
    this.camera.shake(4, 0.25);
    this.sound.explode();
    this.fx.explosion(cx, cy, 26);
    this.fx.burst(cx, cy, C.gold, 16);
    this.fx.burst(cx, cy, 'rgba(200,200,230,0.8)', 10);
    this.notify('ТАЙНИК ОТКРЫТ', C.gold);
  }

  /** Забирает содержимое капсулы. */
  collectSecret(): void {
    const secret = this.room.secret;
    if (!secret || !secret.opened || secret.taken) return;
    secret.taken = true;
    if (secret.kind === 'coins') {
      this.money += secret.amount;
      this.notify(`+${secret.amount} МОНЕТ ИЗ ТАЙНИКА`, C.gold);
      this.sound.coin();
      for (let i = 0; i < 6; i++) this.fx.coinSpark(secret.x + (Math.random() - 0.5) * 16, secret.y);
    } else {
      const gain = Math.max(0, Math.min(secret.amount, 1000 - this.souls));
      this.souls += gain;
      this.checkThresholds();
      this.notify(gain > 0 ? `+${gain} ДУШ ИЗ ТАЙНИКА` : 'ЛЕГИОН УЖЕ ПОЛОН', C.soul);
      this.sound.raise();
      this.fx.ring(secret.x, secret.y, C.soul);
      this.fx.burst(secret.x, secret.y, C.white, 18);
    }
  }

  /** Подбирает награду, когда игрок касается уже открытой капсулы. */
  checkSecretPickup(): void {
    const secret = this.room.secret;
    if (!secret || !secret.opened || secret.taken) return;
    const p = this.player;
    if (Math.abs(secret.x - p.cx) < 22 && Math.abs(secret.y + 4 - p.cy) < 30) {
      this.collectSecret();
    }
  }

  checkRabbit(): void {
    const r = this.rabbit;
    if (!r || r.dead || r.resolved || r.fleeing || r.vanishing) return;
    if (this.transition || this.player.dead || !this.player.onGround) return;
    if (Math.hypot(r.x - this.player.cx, r.cy - this.player.cy) < 38) {
      this.openRabbitDialog();
    }
  }

  openRabbitDialog(): void {
    this.state = 'rabbit';
    this.rabbitChoice = 0;
    this.rabbitResult = null;
    this.rabbitResultTimer = 0;
    this.rabbitSoulGain = 0;
    this.rabbitBiteDamage = 0;
    this.player.vx = 0;
    this.sound.select();
  }

  updateRabbitDialog(dt: number): void {
    const r = this.rabbit;
    if (!r) {
      this.state = 'playing';
      return;
    }

    if (this.rabbitResult) {
      this.rabbitResultTimer = Math.max(0, this.rabbitResultTimer - dt);
      if (this.rabbitResultTimer <= 0 && this.input.pressed('Enter', 'Space', 'KeyE', 'Escape', 'ShiftLeft')) {
        this.state = 'playing';
        this.sound.select();
      }
      return;
    }

    if (this.input.pressed('ArrowUp', 'KeyW')) {
      this.rabbitChoice = (this.rabbitChoice + 1) % 2;
      this.sound.select();
    }
    if (this.input.pressed('ArrowDown', 'KeyS')) {
      this.rabbitChoice = (this.rabbitChoice + 1) % 2;
      this.sound.select();
    }
    if (this.input.pressed('Escape', 'ShiftLeft')) {
      r.scare(this.player.cx);
      this.state = 'playing';
      this.notify('КРОЛИК УСКАКАЛ ПРОЧЬ', C.dim);
      this.sound.select();
      return;
    }
    if (this.input.pressed('Enter', 'Space', 'KeyE')) {
      this.chooseRabbit(this.rabbitChoice);
    }
  }

  chooseRabbit(choice: number): void {
    const r = this.rabbit;
    if (!r || r.resolved) return;

    if (choice === 0) {
      const gain = Math.max(0, Math.min(500, 1000 - this.souls));
      this.souls += gain;
      this.rabbitSoulGain = gain;
      this.checkThresholds();
      r.bless();
      this.sound.raise();
      this.fx.ring(r.x, r.groundY - 12, C.soul);
      this.fx.burst(r.x, r.groundY - 12, C.white, 22);
      this.fx.burst(r.x, r.groundY - 12, C.soul, 14);
      this.notify(
        gain > 0 ? `+${gain} ДУШ · ${this.souls}/1000` : 'ЛЕГИОН УЖЕ ПОЛОН — 1000 ДУШ',
        gain > 0 ? C.soul : C.dim,
      );
      this.rabbitResult = 'pet';
    } else {
      const p = this.player;
      const before = p.hp;
      const dmg = Math.max(1, Math.ceil(p.hp / 2));
      p.hp = Math.max(1, p.hp - dmg);
      this.rabbitBiteDamage = before - p.hp;
      p.iframes = 1.2;
      p.hurtFlash = 0.32;
      const dir = p.cx < r.x ? -1 : 1;
      p.vx = dir * 210;
      p.vy = -175;
      this.damageFlash = 1;
      this.camera.shake(6, 0.3);
      this.sound.hurt();
      this.sound.deny();
      this.hitstop(0.08);
      this.fx.ectoplasm(p.cx, p.cy, dir);
      this.fx.burst(r.x, r.groundY - 12, C.white, 12);
      r.scare(p.cx);
      this.notify('НЕ МАТЕРИСЬ!', C.red);
      this.rabbitResult = 'eat';
      this.rabbitEatenLocation = this.locationIndex;
    }

    this.rabbitResultTimer = 0.55;
  }

  checkDoor(): void {
    if (this.locationIndex >= 5) return;
    const p = this.player;
    const d = this.room.door;
    const touching = p.x + p.w > d.x - 6 && p.y + p.h > d.y + 4 && p.y < d.y + d.h;
    if (!touching) return;
    if (this.tutorial && this.tutorialSteps.some((v) => !v)) {
      if (this.doorMsgCd <= 0) {
        this.notify('ПРОЙДИ ОБУЧЕНИЕ ИЛИ НАЖМИ S — ПРОПУСТИТЬ', C.gold);
        this.doorMsgCd = 1.8;
      }
      return;
    }
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
    if (boss.kind === 'incubus') {
      this.incubusDefeated = true;
      this.rabbitEatenLocation = -1;
      this.notify('ИНКУБ ИЗГНАН · ПРОКЛЯТИЕ СНЯТО', C.soul);
    }
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
    this.fx.burst(this.player.cx, this.player.cy, C.spectral, 24);
    this.fx.ring(this.player.cx, this.player.cy, C.red);
    this.fx.ring(this.player.cx, this.player.cy, C.purple);
    this.fx.ghostMotes(this.player.cx, this.player.cy, 16);
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
          this.notify('ЛЕГИОН ЩИТИТ: +1 ОБОЛОЧКА', C.purple);
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
      { id: 'hp', name: 'ПРИНОШЕНИЕ ДУШИ', desc: '+1 К МАКС. ОБОЛОЧКЕ', detail: 'ПРИЗРАК ПОМНИТ КАЖДУЮ РАНУ. ТОРГОВЕЦ ЗАЛЕЧИТ ИХ ВСЕ.', baseCost: 45, cost: 45, level: 0 },
      { id: 'dmg', name: 'ЗАТОЧЕННЫЙ КЛИНОК', desc: '+1 К УРОНУ', detail: 'КЛИНОК, ИСПИВШИЙ ПЕПЛА, РЕЖЕТ ГЛУБЖЕ.', baseCost: 65, cost: 65, level: 0 },
      { id: 'mana', name: 'РАСШИРЕНИЕ ДУШИ', desc: '+20 К МАКС. ЭКТОПЛАЗМЕ', detail: 'ПУСТОТА ВНУТРИ СТАНОВИТСЯ ВМЕСТИТЕЛЬНЕЕ.', baseCost: 40, cost: 40, level: 0 },
      { id: 'heal', name: 'СГУСТОК ЭКТОПЛАЗМЫ', desc: 'ПОЛНОСТЬЮ ВОССТАНОВИТЬ ОБОЛОЧКУ', detail: 'ГОРЬКИЙ, НО ВОЗВРАЩАЕТ ТЕБЯ К БЫТИЮ.', baseCost: 20, cost: 20, level: 0 },
      { id: 'ritual', name: 'ТЁМНЫЙ РИТУАЛ', desc: '+40 ДУШ В ЛЕГИОН', detail: 'МОНЕТЫ, ОТДАННЫЕ ПУСТОТЕ, СТАНОВЯТСЯ ВОИНАМИ.', baseCost: 70, cost: 70, level: 0 },
    ];
  }

  refreshShop(): void {
    for (const item of this.shopItems) {
      item.cost = item.id === 'heal' ? item.baseCost : Math.round(item.baseCost * Math.pow(1.55, item.level));
    }
  }

  openMerchant(): void {
    this.state = 'shop';
    this.shopIndex = 0;
    this.shopMessage = '';
    this.refreshShop();
    this.sound.select();
    this.notify('СТРАНСТВУЮЩИЙ ТОРГОВЕЦ', C.gold);
  }

  openShop(): void {
    this.state = 'shop';
    this.shopIndex = 0;
    this.shopMessage = '';
    this.refreshShop();
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
      this.shopMessage = 'ОБОЛОЧКА УЖЕ ЦЕЛА';
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
        this.shopMessage = '+1 К МАКС. ОБОЛОЧКЕ';
        break;
      case 'dmg':
        this.player.damageBonus += 1;
        this.shopMessage = '+1 К УРОНУ';
        break;
      case 'mana':
        this.player.maxMana += 20;
        this.player.mana += 20;
        this.shopMessage = '+20 К МАКС. ЭКТОПЛАЗМЕ';
        break;
      case 'heal':
        this.player.hp = this.player.maxHp;
        this.shopMessage = 'ОБОЛОЧКА ВОССТАНОВЛЕНА';
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
    const desktop = window.desktop;
    if (desktop?.toggleFullscreen) {
      desktop.toggleFullscreen().then((on) => {
        this.notify(on ? 'ПОЛНЫЙ ЭКРАН' : 'ОКОННЫЙ РЕЖИМ', C.dim);
      }).catch(() => {});
      return;
    }
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
    ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);

    if (this.state === 'title') {
      drawTitle(ctx, this);
      return;
    }

    this.renderWorld();
    if (this.state !== 'dying' && this.state !== 'dead' && this.state !== 'victory') {
      drawHUD(ctx, this);
    }
    if (this.tutorial && (this.state === 'playing' || this.state === 'shop' || this.state === 'rabbit')) {
      drawTutorial(ctx, this);
    }

    if (this.state === 'hero') drawHeroMenu(ctx, this);
    if (this.state === 'rabbit') drawRabbitDialog(ctx, this);
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

    if (this.room.merchant) {
      drawMerchant(ctx, this.room.merchant.x, this.room.merchant.y, this.time);
    }
    if (this.room.oasis) {
      drawOasis(ctx, this.room.widthPx, this.time);
      if (this.room.keeper) {
        drawKeeper(ctx, this.room.keeper.x, this.room.keeper.y, this.time);
      }
    }

    if (this.room.tutorialRoom) drawTutorialSigns(ctx, this);

    // soft light around the ghost
    const lx = this.player.cx;
    const ly = this.player.cy;
    const lg = ctx.createRadialGradient(lx, ly, 8, lx, ly, 110);
    lg.addColorStop(0, 'rgba(140,240,255,0.13)');
    lg.addColorStop(0.45, 'rgba(143,123,255,0.06)');
    lg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(lx - 110, ly - 110, 220, 220);

    for (const c of this.corpses) c.draw(ctx, this.time);
    if (this.room.secret) drawSecret(ctx, this.room.secret, this.time);
    for (const p of this.pickups) p.draw(ctx, this.time);
    for (const a of this.allies) a.draw(ctx, this.time);
    for (const e of this.enemies) e.draw(ctx, this.time, this.room.biome.accent);
    if (this.boss) this.boss.draw(ctx, this.time);
    if (this.rabbit && !this.rabbit.dead) this.rabbit.draw(ctx, this.time);
    for (const p of this.projectiles) p.draw(ctx, this.time);
    this.player.draw(ctx, this.time);
    this.fx.draw(ctx);
    ctx.restore();
  }
}
