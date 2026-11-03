import { RNG } from '../core/rng';
import { BIOMES, BiomePalette, C } from '../art/palette';
import { drawCustomAsset } from '../art/custom';

export const TILE = 16;
export const ROOM_H = 17;
export const GROUND_ROW = 14;
/** Комнат в локации: несколько обычных + комната босса. */
export const ROOMS_PER_LOCATION = 5;
export const BOSS_ROOM_INDEX = ROOMS_PER_LOCATION - 1;
/** Мирная комната-оазис: без врагов, постепенно лечит. */
export const OASIS_ROOM_INDEX = 1;
/** Комната, где встречается странствующий торговец. */
export const MERCHANT_ROOM_INDEX = 3;

export const T_EMPTY = 0;
export const T_SOLID = 1;
export const T_PLATFORM = 2;
export const T_SPIKE = 3;
/** Фальшивая стена: выглядит как камень, но разбивается по E. */
export const T_SECRET_WALL = 4;

export type EnemyKind = 'guard' | 'archer' | 'crawler' | 'mage' | 'bomber' | 'elite';
export type BossKind = 'executioner' | 'matriarch' | 'choir' | 'golem' | 'boneking' | 'hero' | 'incubus';

export interface EnemySpawn {
  kind: EnemyKind;
  x: number;
  y: number;
}

export interface Decor {
  type: 'pillar' | 'chain' | 'shroom' | 'window' | 'bones' | 'ember' | 'arch';
  x: number;
  y: number;
  s: number;
  seed: number;
}

export interface Secret {
  wallX: number;
  wallY: number;
  wallW: number;
  wallH: number;
  x: number;
  y: number;
  kind: 'coins' | 'souls';
  amount: number;
  opened: boolean;
  taken: boolean;
}

export interface Body {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  onGround: boolean;
}

export const BIOME_ORDER = ['ashen', 'fungal', 'sunken', 'forge', 'bone', 'throne'] as const;

const ENEMY_POOLS: Record<string, EnemyKind[]> = {
  ashen: ['guard', 'crawler', 'guard', 'archer'],
  fungal: ['crawler', 'mage', 'crawler', 'guard'],
  sunken: ['archer', 'mage', 'crawler', 'archer'],
  forge: ['bomber', 'guard', 'bomber', 'elite'],
  bone: ['elite', 'archer', 'mage', 'guard'],
  throne: [],
};

const BOSSES: Record<string, BossKind> = {
  ashen: 'executioner',
  fungal: 'matriarch',
  sunken: 'choir',
  forge: 'golem',
  bone: 'boneking',
  throne: 'hero',
};

export class Room {
  w: number;
  h: number;
  tiles: Uint8Array;
  biomeKey: string;
  biome: BiomePalette;
  locationIndex: number;
  roomInLocation: number;
  isBoss: boolean;
  spawnX: number;
  spawnY: number;
  enemies: EnemySpawn[] = [];
  decor: Decor[] = [];
  merchant: { x: number; y: number } | null = null;
  keeper: { x: number; y: number } | null = null;
  oasis = false;
  secret: Secret | null = null;
  boss: BossKind | null = null;
  door: { x: number; y: number; w: number; h: number };
  cleared = false;
  tutorialRoom = false;

  constructor(w: number, h: number, biomeKey: string, locationIndex: number, roomInLocation: number, isBoss: boolean) {
    this.w = w;
    this.h = h;
    this.biomeKey = biomeKey;
    this.biome = BIOMES[biomeKey] ?? BIOMES.ashen;
    this.locationIndex = locationIndex;
    this.roomInLocation = roomInLocation;
    this.isBoss = isBoss;
    this.tiles = new Uint8Array(w * h);
    this.spawnX = 3 * TILE;
    this.spawnY = GROUND_ROW * TILE;
    this.door = { x: (w - 1) * TILE, y: 11 * TILE, w: TILE, h: 3 * TILE };
  }

  get widthPx(): number { return this.w * TILE; }
  get heightPx(): number { return this.h * TILE; }

  idx(tx: number, ty: number): number { return ty * this.w + tx; }

  get(tx: number, ty: number): number {
    if (tx < 0 || tx >= this.w) return T_SOLID;
    if (ty < 0) return T_EMPTY;
    if (ty >= this.h) return T_SOLID;
    return this.tiles[this.idx(tx, ty)];
  }

  set(tx: number, ty: number, v: number): void {
    if (tx < 0 || tx >= this.w || ty < 0 || ty >= this.h) return;
    this.tiles[this.idx(tx, ty)] = v;
  }

  isSolid(tx: number, ty: number): boolean {
    const t = this.get(tx, ty);
    return t === T_SOLID || t === T_SECRET_WALL;
  }
  isPlatform(tx: number, ty: number): boolean { return this.get(tx, ty) === T_PLATFORM; }
  isSpike(tx: number, ty: number): boolean { return this.get(tx, ty) === T_SPIKE; }
  isSecretWall(tx: number, ty: number): boolean { return this.get(tx, ty) === T_SECRET_WALL; }

  solidInRect(x: number, y: number, w: number, h: number): boolean {
    const x0 = Math.floor(x / TILE);
    const x1 = Math.floor((x + w - 1) / TILE);
    const y0 = Math.floor(y / TILE);
    const y1 = Math.floor((y + h - 1) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (this.isSolid(tx, ty)) return true;
      }
    }
    return false;
  }

  spikeInRect(x: number, y: number, w: number, h: number): boolean {
    const x0 = Math.floor(x / TILE);
    const x1 = Math.floor((x + w - 1) / TILE);
    const y0 = Math.floor(y / TILE);
    const y1 = Math.floor((y + h - 1) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (this.isSpike(tx, ty)) return true;
      }
    }
    return false;
  }

  /** Ray-march for line of sight between two points. */
  lineOfSight(x1: number, y1: number, x2: number, y2: number): boolean {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.hypot(dx, dy);
    const steps = Math.ceil(dist / 8);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = x1 + dx * t;
      const y = y1 + dy * t;
      if (this.isSolid(Math.floor(x / TILE), Math.floor(y / TILE))) return false;
    }
    return true;
  }

  /** Find a safe spot on solid ground near a given point. */
  findGroundY(x: number, fromY = 0): number {
    const tx = Math.floor(x / TILE);
    for (let ty = Math.max(0, Math.floor(fromY / TILE)); ty < this.h; ty++) {
      if (this.isSolid(tx, ty) && !this.isSolid(tx, ty - 1)) return ty * TILE;
    }
    return GROUND_ROW * TILE;
  }
}

export function moveBody(room: Room, b: Body, dx: number, dy: number): void {
  if (dx !== 0) {
    const oldX = b.x;
    b.x += dx;
    const y0 = Math.floor(b.y / TILE);
    const y1 = Math.floor((b.y + b.h - 1) / TILE);
    if (dx > 0) {
      const tx = Math.floor((b.x + b.w - 1) / TILE);
      for (let ty = y0; ty <= y1; ty++) {
        if (room.isSolid(tx, ty)) {
          b.x = tx * TILE - b.w;
          b.vx = 0;
          break;
        }
      }
    } else {
      const tx = Math.floor(b.x / TILE);
      for (let ty = y0; ty <= y1; ty++) {
        if (room.isSolid(tx, ty)) {
          b.x = (tx + 1) * TILE;
          b.vx = 0;
          break;
        }
      }
    }
    if (b.x === oldX) b.vx = 0;
  }

  if (dy !== 0) {
    const oldBottom = b.y + b.h;
    b.y += dy;
    b.onGround = false;
    const x0 = Math.floor(b.x / TILE);
    const x1 = Math.floor((b.x + b.w - 1) / TILE);
    if (dy > 0) {
      const ty = Math.floor((b.y + b.h - 1) / TILE);
      for (let tx = x0; tx <= x1; tx++) {
        const solid = room.isSolid(tx, ty);
        const plat = room.isPlatform(tx, ty) && oldBottom <= ty * TILE + 2;
        if (solid || plat) {
          b.y = ty * TILE - b.h;
          b.vy = 0;
          b.onGround = true;
          break;
        }
      }
    } else {
      const ty = Math.floor(b.y / TILE);
      for (let tx = x0; tx <= x1; tx++) {
        if (room.isSolid(tx, ty)) {
          b.y = (ty + 1) * TILE;
          b.vy = 0;
          break;
        }
      }
    }
  }
}

function fillRect(room: Room, x: number, y: number, w: number, h: number, v: number): void {
  for (let ty = y; ty < y + h; ty++) {
    for (let tx = x; tx < x + w; tx++) room.set(tx, ty, v);
  }
}

function overlapsAny(x: number, y: number, w: number, h: number, list: { x: number; y: number; w: number; h: number }[]): boolean {
  return list.some((r) => x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y);
}

export function generateRoom(
  rng: RNG,
  biomeKey: string,
  locationIndex: number,
  roomInLocation: number,
  isBoss: boolean,
): Room {
  const isFinal = biomeKey === 'throne';
  const w = isFinal ? 40 : isBoss ? 44 : 38 + rng.int(0, 10);
  const room = new Room(w, ROOM_H, biomeKey, locationIndex, roomInLocation, isBoss);

  // floor
  fillRect(room, 0, GROUND_ROW, w, ROOM_H - GROUND_ROW, T_SOLID);
  // walls
  fillRect(room, 0, 0, 2, ROOM_H, T_SOLID);
  fillRect(room, w - 2, 0, 2, 11, T_SOLID);
  fillRect(room, w - 2, 14, 2, ROOM_H - 14, T_SOLID);
  // ceiling
  fillRect(room, 0, 0, w, 1, T_SOLID);

  // door opening
  for (let ty = 11; ty < 14; ty++) {
    room.set(w - 1, ty, T_EMPTY);
    room.set(w - 2, ty, T_EMPTY);
  }

  const blocked: { x: number; y: number; w: number; h: number }[] = [
    { x: 1, y: 9, w: 5, h: 6 }, // spawn area
    { x: w - 8, y: 9, w: 7, h: 6 }, // door area
  ];

  if (isFinal) {
    // flat arena with a couple of raised platforms
    for (let i = 0; i < 3; i++) {
      const px = 8 + i * 10;
      fillRect(room, px, 10, 5, 1, T_PLATFORM);
    }
    room.boss = BOSSES[biomeKey];
    room.merchant = null;
    room.decor = makeDecor(rng, room, biomeKey, true);
    return room;
  }

  if (isBoss) {
    fillRect(room, 6, 11, 4, 1, T_PLATFORM);
    fillRect(room, w - 16, 11, 4, 1, T_PLATFORM);
    fillRect(room, 14, 9, 5, 1, T_PLATFORM);
    room.boss = BOSSES[biomeKey];
    room.merchant = null;
    room.decor = makeDecor(rng, room, biomeKey, true);
    return room;
  }

  // Мирный оазис: без врагов, ловушек и платформ-ловушек.
  if (roomInLocation === OASIS_ROOM_INDEX) {
    fillRect(room, 8, GROUND_ROW - 1, 2, 1, T_PLATFORM);
    fillRect(room, 13, GROUND_ROW - 2, 2, 1, T_PLATFORM);
    fillRect(room, w - 12, GROUND_ROW - 1, 2, 1, T_PLATFORM);
    room.oasis = true;
    room.merchant = null;
    room.keeper = { x: 7 * TILE, y: GROUND_ROW * TILE };
    room.enemies = [];
    room.decor = [
      { type: 'shroom', x: 6 * TILE, y: GROUND_ROW * TILE, s: 1.1, seed: 71 },
      { type: 'shroom', x: 10 * TILE, y: GROUND_ROW * TILE, s: 0.8, seed: 72 },
      { type: 'shroom', x: w * TILE - 7 * TILE, y: GROUND_ROW * TILE, s: 1.2, seed: 73 },
      { type: 'arch', x: 15 * TILE, y: GROUND_ROW * TILE, s: 1, seed: 74 },
      { type: 'bones', x: w * TILE - 12 * TILE, y: GROUND_ROW * TILE, s: 1, seed: 75 },
    ];
    return room;
  }

  // floating platforms in reachable bands
  const bands = [11, 9, 7, 5];
  for (const row of bands) {
    const count = rng.int(1, 2);
    for (let i = 0; i < count; i++) {
      const pw = rng.int(3, 6);
      const px = rng.int(3, w - 6 - pw);
      const py = row;
      if (overlapsAny(px, py, pw, 1, blocked)) continue;
      // don't stack directly on another platform row
      let clear = true;
      for (let tx = px; tx < px + pw; tx++) {
        if (room.get(tx, py) !== T_EMPTY) clear = false;
      }
      if (!clear) continue;
      fillRect(room, px, py, pw, 1, T_PLATFORM);
    }
  }

  // ground obstacles
  const obstacles = rng.int(1, 3);
  for (let i = 0; i < obstacles; i++) {
    const ox = rng.int(8, w - 9);
    const ow = rng.int(1, 2);
    const oh = rng.int(1, 3);
    if (overlapsAny(ox, GROUND_ROW - oh, ow, oh, blocked)) continue;
    fillRect(room, ox, GROUND_ROW - oh, ow, oh, T_SOLID);
  }

  // spikes
  const spikeClusters = rng.int(0, 2);
  for (let i = 0; i < spikeClusters; i++) {
    const sx = rng.int(9, w - 9);
    const len = rng.int(2, 3);
    let ok = true;
    for (let tx = sx; tx < sx + len; tx++) {
      if (room.get(tx, GROUND_ROW - 1) !== T_EMPTY || room.get(tx, GROUND_ROW - 2) !== T_EMPTY) ok = false;
    }
    if (!ok) continue;
    for (let tx = sx; tx < sx + len; tx++) room.set(tx, GROUND_ROW - 1, T_SPIKE);
  }

  // странствующий торговец — ровно один раз за локацию, в комнате 3
  if (roomInLocation === MERCHANT_ROOM_INDEX) {
    room.merchant = { x: 7 * TILE, y: GROUND_ROW * TILE };
  }

  // скрытый проход: фальшивая стена, за ней капсула с монетами или душами
  // (в каждой обычной комнате, чтобы тайники не терялись из-за случайности)
  {
    for (let attempt = 0; attempt < 48; attempt++) {
      const tx = rng.int(10, w - 9);
      if (Math.abs(tx * TILE - room.spawnX) < 150) continue;
      if (Math.abs(tx * TILE - room.door.x) < 120) continue;
      let clear = true;
      for (let y = GROUND_ROW - 3; y < GROUND_ROW; y++) {
        for (let x = tx; x < tx + 3; x++) {
          if (room.get(x, y) !== T_EMPTY) clear = false;
        }
      }
      for (let x = tx; x < tx + 3; x++) {
        if (!room.isSolid(x, GROUND_ROW)) clear = false;
      }
      if (!clear) continue;

      fillRect(room, tx, GROUND_ROW - 3, 2, 3, T_SECRET_WALL);
      const kind = rng.chance(0.5) ? 'coins' : 'souls';
      const amount = kind === 'coins' ? rng.int(18, 40) : rng.int(45, 95);
      room.secret = {
        wallX: tx, wallY: GROUND_ROW - 3, wallW: 2, wallH: 3,
        x: (tx + 1) * TILE, y: GROUND_ROW * TILE - 13,
        kind, amount, opened: false, taken: false,
      };
      break;
    }
  }

  // enemies
  const pool = ENEMY_POOLS[biomeKey] ?? ENEMY_POOLS.ashen;
  const count = 4 + roomInLocation * 2;
  const used: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    let tries = 0;
    while (tries++ < 30) {
      const kind = rng.pick(pool);
      let x: number;
      let y: number;
      if (rng.chance(0.25)) {
        // on a platform
        const row = rng.pick([11, 9, 7, 5]);
        x = rng.int(3, w - 4) * TILE + TILE / 2;
        if (!room.isPlatform(Math.floor(x / TILE), row)) continue;
        y = row * TILE;
      } else {
        x = rng.int(8, w - 5) * TILE + TILE / 2;
        y = GROUND_ROW * TILE;
        if (room.isSolid(Math.floor(x / TILE), GROUND_ROW - 1)) continue;
      }
      if (Math.abs(x - room.spawnX) < 120) continue;
      if (used.some((u) => Math.abs(u.x - x) < 36 && Math.abs(u.y - y) < 30)) continue;
      used.push({ x, y });
      room.enemies.push({ kind, x, y });
      break;
    }
  }

  room.decor = makeDecor(rng, room, biomeKey, false);
  return room;
}

/** Светлый тренировочный зал в начале первого забега. */
export function createTutorialRoom(): Room {
  const w = 48;
  const room = new Room(w, ROOM_H, 'ashen', 0, 0, false);
  fillRect(room, 0, GROUND_ROW, w, ROOM_H - GROUND_ROW, T_SOLID);
  fillRect(room, 0, 0, 2, ROOM_H, T_SOLID);
  fillRect(room, w - 2, 0, 2, 11, T_SOLID);
  fillRect(room, w - 2, 14, 2, ROOM_H - 14, T_SOLID);
  fillRect(room, 0, 0, w, 1, T_SOLID);
  for (let ty = 11; ty < 14; ty++) {
    room.set(w - 1, ty, T_EMPTY);
    room.set(w - 2, ty, T_EMPTY);
  }
  room.spawnX = 3 * TILE;
  room.spawnY = GROUND_ROW * TILE;
  room.tutorialRoom = true;
  room.decor = [
    { type: 'pillar', x: 9 * TILE, y: GROUND_ROW * TILE, s: 1.2, seed: 11 },
    { type: 'pillar', x: 25 * TILE, y: GROUND_ROW * TILE, s: 1.2, seed: 23 },
    { type: 'pillar', x: 41 * TILE, y: GROUND_ROW * TILE, s: 1.2, seed: 37 },
    { type: 'chain', x: 15 * TILE, y: 3 * TILE, s: 1, seed: 5 },
    { type: 'chain', x: 33 * TILE, y: 2 * TILE, s: 1.1, seed: 8 },
    { type: 'arch', x: 21 * TILE, y: GROUND_ROW * TILE, s: 1.2, seed: 51 },
    { type: 'ember', x: 6 * TILE, y: GROUND_ROW * TILE, s: 1, seed: 61 },
    { type: 'ember', x: 44 * TILE, y: GROUND_ROW * TILE, s: 1, seed: 67 },
  ];
  return room;
}

function makeDecor(rng: RNG, room: Room, biomeKey: string, boss: boolean): Decor[] {
  const out: Decor[] = [];
  const count = boss ? 6 : rng.int(4, 9);
  for (let i = 0; i < count; i++) {
    const x = rng.int(2, room.w - 3) * TILE;
    const types: Decor['type'][] =
      biomeKey === 'ashen' ? ['pillar', 'chain', 'bones', 'arch'] :
      biomeKey === 'fungal' ? ['shroom', 'shroom', 'pillar', 'bones'] :
      biomeKey === 'sunken' ? ['window', 'pillar', 'arch', 'bones'] :
      biomeKey === 'forge' ? ['chain', 'pillar', 'ember', 'arch'] :
      biomeKey === 'bone' ? ['bones', 'pillar', 'bones', 'arch'] :
      ['window', 'arch', 'chain', 'pillar'];
    const type = rng.pick(types);
    let y = GROUND_ROW * TILE;
    if (type === 'chain' || type === 'window') y = rng.int(1, 6) * TILE;
    if (type === 'shroom') y = GROUND_ROW * TILE;
    out.push({ type, x, y, s: rng.range(0.7, 1.5), seed: rng.int(0, 9999) });
  }
  return out;
}

/** Капсула за секретной стеной: мягкое стекло, внутри монеты или души. */
export function drawSecret(
  ctx: CanvasRenderingContext2D,
  secret: Secret,
  time: number,
): void {
  if (secret.taken) return;
  const closed = !secret.opened;
  const bob = closed ? 0 : Math.sin(time * 2.2) * 1.5;
  const x = secret.x;
  const y = secret.y + bob;
  const soul = secret.kind === 'souls';
  const color = soul ? C.soul : C.gold;

  ctx.save();
  ctx.translate(x, y);
  if (closed) ctx.globalAlpha = 0.32;

  const glow = ctx.createRadialGradient(0, 0, 1, 0, 0, 24);
  glow.addColorStop(0, soul ? 'rgba(159,232,255,0.26)' : 'rgba(255,207,107,0.26)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, 24, 0, Math.PI * 2);
  ctx.fill();

  // стеклянная капсула
  ctx.fillStyle = 'rgba(210,240,255,0.12)';
  ctx.strokeStyle = 'rgba(220,245,255,0.55)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(-7, -11);
  ctx.quadraticCurveTo(-9, 0, -5, 10);
  ctx.quadraticCurveTo(0, 13, 5, 10);
  ctx.quadraticCurveTo(9, 0, 7, -11);
  ctx.quadraticCurveTo(0, -15, -7, -11);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // крышка
  ctx.fillStyle = 'rgba(200,190,160,0.75)';
  ctx.fillRect(-5, -14, 10, 3.5);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(-4, -13.4, 4, 1);

  if (soul) {
    const flame = ctx.createRadialGradient(0, -1, 0.5, 0, -1, 8);
    flame.addColorStop(0, '#ffffff');
    flame.addColorStop(0.4, color);
    flame.addColorStop(1, 'rgba(159,232,255,0)');
    ctx.fillStyle = flame;
    ctx.beginPath();
    ctx.ellipse(0, -1, 5.5, 7.5 + Math.sin(time * 4) * 1.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(220,255,255,0.75)';
    ctx.beginPath();
    ctx.ellipse(0, -2, 2.2, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    for (let i = 0; i < 3; i++) {
      const cx = (i - 1) * 3.5;
      const cy = 3 + Math.abs(i - 1) * 2.2;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 2.6, 3.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,245,200,0.7)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
  }

  // блик
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(-4, -6);
  ctx.lineTo(-4, 4);
  ctx.stroke();
  ctx.restore();
}

/** Simple tile renderer shared by all rooms. */
export function drawRoomTiles(
  ctx: CanvasRenderingContext2D,
  room: Room,
  camX: number,
  camY: number,
  viewW: number,
  viewH: number,
  time: number,
): void {
  const b = room.biome;
  const x0 = Math.max(0, Math.floor(camX / TILE) - 1);
  const x1 = Math.min(room.w - 1, Math.ceil((camX + viewW) / TILE) + 1);
  const y0 = Math.max(0, Math.floor(camY / TILE) - 1);
  const y1 = Math.min(room.h - 1, Math.ceil((camY + viewH) / TILE) + 1);

  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const t = room.get(tx, ty);
      const px = tx * TILE;
      const py = ty * TILE;
      const h = (tx * 73856093) ^ (ty * 19349663);

      // Кастомный SVG-тайл. Если файла нет — рисуется процедурный вариант.
      if (t !== T_EMPTY) {
        const tileName = t === T_SOLID ? 'solid'
          : t === T_PLATFORM ? 'platform'
            : t === T_SPIKE ? 'spike'
              : t === T_SECRET_WALL ? 'secret-wall' : null;
        if (tileName) {
          const custom = drawCustomAsset(ctx, `tiles/${room.biomeKey}/${tileName}`, {
            x: px, y: py, width: TILE, height: TILE, anchor: 'top-left',
          });
          if (custom) continue;
        }
      }

      if (t === T_SOLID || t === T_SECRET_WALL) {
        const secret = t === T_SECRET_WALL;
        const topOpen = !room.isSolid(tx, ty - 1);
        ctx.fillStyle = b.tile;
        ctx.fillRect(px, py, TILE, TILE);

        // неровная каменная фактура
        ctx.fillStyle = `rgba(255,255,255,${0.012 + ((h >>> 5) & 3) * 0.004})`;
        ctx.fillRect(px + ((h >>> 3) & 3), py + ((h >>> 7) & 3), TILE - 6, TILE - 7);
        ctx.fillStyle = b.tileDark;
        ctx.fillRect(px, py + TILE - 4, TILE, 4);
        ctx.fillRect(px + TILE - 3, py, 3, TILE);

        if (topOpen) {
          const top = ctx.createLinearGradient(0, py, 0, py + 5);
          top.addColorStop(0, b.tileTop);
          top.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = top;
          ctx.fillRect(px, py, TILE, 5);
          ctx.fillStyle = 'rgba(255,255,255,0.09)';
          ctx.fillRect(px, py, TILE, 1);
          ctx.fillStyle = `${b.accent}22`;
          ctx.fillRect(px, py + 5, TILE, 1);
        }
        if (!room.isSolid(tx - 1, ty)) {
          ctx.fillStyle = 'rgba(255,255,255,0.035)';
          ctx.fillRect(px, py + 2, 1, TILE - 4);
        }
        if (!room.isSolid(tx + 1, ty)) {
          ctx.fillStyle = 'rgba(0,0,0,0.18)';
          ctx.fillRect(px + TILE - 1, py + 2, 1, TILE - 4);
        }

        // трещины
        if ((h & 7) === 0) {
          ctx.strokeStyle = 'rgba(0,0,0,0.3)';
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(px + 3, py + 6);
          ctx.lineTo(px + 8, py + 7);
          ctx.lineTo(px + 9, py + 11);
          ctx.stroke();
        }
        // руническая искра
        if ((h % 23) === 0) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.2 + Math.sin(time * 2 + tx) * 0.08;
          ctx.fillStyle = b.accent;
          ctx.fillRect(px + 7, py + 6, 1.5, 4);
          ctx.fillRect(px + 5.5, py + 8, 4, 1);
          ctx.restore();
        }

        if (secret) {
          // трещина и слабое свечение капсулы из-за стены
          ctx.save();
          ctx.strokeStyle = 'rgba(8,6,12,0.85)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(px + 8, py + 1);
          ctx.lineTo(px + 6, py + 5);
          ctx.lineTo(px + 9, py + 8);
          ctx.lineTo(px + 7, py + 12);
          ctx.lineTo(px + 10, py + 15);
          ctx.stroke();
          const glow = ctx.createRadialGradient(px + 10, py + 8, 1, px + 10, py + 8, 11);
          glow.addColorStop(0, 'rgba(255,207,107,0.16)');
          glow.addColorStop(1, 'rgba(255,207,107,0)');
          ctx.fillStyle = glow;
          ctx.fillRect(px, py, TILE, TILE);
          ctx.strokeStyle = `rgba(255,207,107,${0.18 + Math.sin(time * 3 + tx) * 0.08})`;
          ctx.lineWidth = 0.7;
          ctx.strokeRect(px + 0.6, py + 0.6, TILE - 1.2, TILE - 1.2);
          ctx.restore();
        }
      } else if (t === T_PLATFORM) {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(px, py + 6, TILE, 3);
        const slab = ctx.createLinearGradient(0, py, 0, py + 7);
        slab.addColorStop(0, b.tileTop);
        slab.addColorStop(0.4, b.tile);
        slab.addColorStop(1, b.tileDark);
        ctx.fillStyle = slab;
        ctx.fillRect(px, py, TILE, 7);
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(px, py, TILE, 1);
        ctx.fillStyle = `${b.accent}30`;
        ctx.fillRect(px, py + 3, TILE, 0.7);
        // подвесы
        if ((tx & 1) === 0) {
          ctx.strokeStyle = 'rgba(200,200,220,0.12)';
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(px + 3, py + 7);
          ctx.lineTo(px + 1, py + 13);
          ctx.moveTo(px + TILE - 3, py + 7);
          ctx.lineTo(px + TILE - 1, py + 13);
          ctx.stroke();
        }
      } else if (t === T_SPIKE) {
        ctx.fillStyle = b.tileTop;
        for (let i = 0; i < 3; i++) {
          const sx = px + i * 5 + 1;
          const tip = py + 2 + ((h >>> (i * 2)) & 1);
          ctx.beginPath();
          ctx.moveTo(sx, py + TILE);
          ctx.lineTo(sx + 2.5, tip);
          ctx.lineTo(sx + 5, py + TILE);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.18)';
          ctx.fillRect(sx + 2, tip + 2, 0.8, TILE - 6);
          ctx.fillStyle = b.tileTop;
        }
        ctx.fillStyle = 'rgba(255,90,110,0.28)';
        ctx.fillRect(px, py + TILE - 2, TILE, 2);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.16 + Math.sin(time * 4 + tx) * 0.06;
        ctx.fillStyle = C.red;
        ctx.fillRect(px, py + TILE - 1, TILE, 1);
        ctx.restore();
      }
    }
  }

  // дверь-портал
  const d = room.door;
  const pulse = 0.55 + Math.sin(time * 2.4) * 0.2;
  ctx.save();
  ctx.fillStyle = '#050308';
  ctx.fillRect(d.x - 1, d.y, d.w + 2, d.h);
  const portal = ctx.createLinearGradient(d.x - 26, 0, d.x + d.w, 0);
  portal.addColorStop(0, 'rgba(0,0,0,0)');
  portal.addColorStop(0.55, `${b.accent}12`);
  portal.addColorStop(1, `${b.accent}44`);
  ctx.fillStyle = portal;
  ctx.fillRect(d.x - 26, d.y, 26 + d.w, d.h);
  ctx.strokeStyle = `${b.accent}${Math.round((0.25 + pulse * 0.3) * 255).toString(16).padStart(2, '0')}`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(d.x + 3, d.y + d.h - 2);
  ctx.lineTo(d.x + 3, d.y + 3);
  ctx.quadraticCurveTo(d.x + d.w / 2, d.y - 5, d.x + d.w - 3, d.y + 3);
  ctx.lineTo(d.x + d.w - 3, d.y + d.h - 2);
  ctx.stroke();
  // блуждающие души у двери
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 5; i++) {
    const a = time * (1.2 + i * 0.2) + i * 1.7;
    const wx = d.x + 4 + Math.sin(a) * 7;
    const wy = d.y + d.h - ((time * 12 + i * 17) % d.h);
    ctx.fillStyle = `rgba(159,232,255,${0.14 + (i % 3) * 0.05})`;
    ctx.beginPath();
    ctx.arc(wx, wy, 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawDecor(ctx: CanvasRenderingContext2D, room: Room, camX: number, viewW: number, time: number): void {
  const b = room.biome;
  for (const d of room.decor) {
    if (d.x < camX - 80 || d.x > camX + viewW + 80) continue;
    ctx.save();
    ctx.translate(d.x, d.y);
    if (d.type === 'pillar') {
      ctx.fillStyle = 'rgba(255,255,255,0.035)';
      ctx.fillRect(-7 * d.s, -120 * d.s, 14 * d.s, 120 * d.s);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(-9 * d.s, -124 * d.s, 18 * d.s, 6 * d.s);
    } else if (d.type === 'chain') {
      ctx.strokeStyle = 'rgba(200,200,220,0.09)';
      ctx.lineWidth = 2;
      const len = 40 + (d.seed % 50);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      for (let y = 0; y < len; y += 6) ctx.lineTo((y % 12 === 0 ? 1 : -1) * 2, y);
      ctx.stroke();
    } else if (d.type === 'shroom') {
      const glow = 0.5 + Math.sin(time * 1.6 + d.seed) * 0.2;
      ctx.fillStyle = `rgba(80,220,150,${0.09 * glow})`;
      ctx.beginPath();
      ctx.arc(0, -8 * d.s, 22 * d.s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(120,230,170,0.22)';
      ctx.fillRect(-1, -12 * d.s, 2, 12 * d.s);
      ctx.beginPath();
      ctx.ellipse(0, -12 * d.s, 7 * d.s, 3 * d.s, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (d.type === 'window') {
      ctx.fillStyle = 'rgba(120,170,255,0.06)';
      ctx.beginPath();
      ctx.ellipse(0, -70, 20 * d.s, 34 * d.s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(160,200,255,0.12)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -104);
      ctx.lineTo(0, -36);
      ctx.moveTo(-20 * d.s, -70);
      ctx.lineTo(20 * d.s, -70);
      ctx.stroke();
    } else if (d.type === 'bones') {
      ctx.strokeStyle = 'rgba(230,220,190,0.12)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-8 * d.s, 0);
      ctx.lineTo(-2 * d.s, -10 * d.s);
      ctx.moveTo(8 * d.s, 0);
      ctx.lineTo(2 * d.s, -8 * d.s);
      ctx.stroke();
      ctx.fillStyle = 'rgba(230,220,190,0.1)';
      ctx.beginPath();
      ctx.arc(0, -4 * d.s, 3 * d.s, 0, Math.PI * 2);
      ctx.fill();
    } else if (d.type === 'ember') {
      const f = 0.5 + Math.sin(time * 4 + d.seed) * 0.3;
      ctx.fillStyle = `rgba(255,110,50,${0.12 * f})`;
      ctx.beginPath();
      ctx.arc(0, -6, 14 * d.s, 0, Math.PI * 2);
      ctx.fill();
    } else if (d.type === 'arch') {
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth = 8 * d.s;
      ctx.beginPath();
      ctx.arc(0, 0, 46 * d.s, Math.PI, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
  // ambient particles
  ctx.fillStyle = b.fog;
  for (let i = 0; i < 14; i++) {
    const t = time * (4 + (i % 5)) + i * 53;
    const x = ((t * 7 + i * 97) % (viewW + 40)) - 20;
    const y = ((t * 3 + i * 61) % 200) + 20;
    ctx.fillRect(Math.floor(x), Math.floor(y), 2, 2);
  }
}

/** Странствующий торговец: фигура в плаще, фонарь и лоток с товарами. */
export function drawMerchant(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  time: number,
): void {
  if (drawCustomAsset(ctx, 'characters/npc/merchant', { x, y, alpha: 1 })) return;
  const bob = Math.sin(time * 1.6) * 0.9;
  ctx.save();
  ctx.translate(x, y);

  // тёплый ореол
  const halo = ctx.createRadialGradient(0, -26, 2, 0, -26, 42);
  halo.addColorStop(0, 'rgba(255,207,107,0.16)');
  halo.addColorStop(1, 'rgba(255,207,107,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, -26, 42, 0, Math.PI * 2);
  ctx.fill();

  // тень
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 16, 3.6, 0, 0, Math.PI * 2);
  ctx.fill();

  // посох
  ctx.strokeStyle = '#6b5636';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(12, 0);
  ctx.lineTo(14, -46);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,220,140,0.9)';
  ctx.beginPath();
  ctx.arc(14, -48, 2.6 + Math.sin(time * 3) * 0.4, 0, Math.PI * 2);
  ctx.fill();

  // плащ
  const cloak = ctx.createLinearGradient(0, -40, 0, 0);
  cloak.addColorStop(0, '#4a3b2a');
  cloak.addColorStop(0.55, '#2f2618');
  cloak.addColorStop(1, '#17120c');
  ctx.fillStyle = cloak;
  ctx.beginPath();
  ctx.moveTo(-11, 0);
  ctx.quadraticCurveTo(-14, -22, -6, -36 + bob);
  ctx.quadraticCurveTo(0, -41 + bob, 6, -36 + bob);
  ctx.quadraticCurveTo(14, -22, 11, 0);
  ctx.closePath();
  ctx.fill();

  // капюшон
  ctx.fillStyle = '#5a4831';
  ctx.beginPath();
  ctx.moveTo(-8, -35 + bob);
  ctx.quadraticCurveTo(0, -48 + bob, 8, -35 + bob);
  ctx.quadraticCurveTo(6, -27 + bob, 0, -25 + bob);
  ctx.quadraticCurveTo(-6, -27 + bob, -8, -35 + bob);
  ctx.closePath();
  ctx.fill();

  // лицо в тени и глаза
  ctx.fillStyle = '#0b0906';
  ctx.beginPath();
  ctx.ellipse(0, -34 + bob, 5.2, 5.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffcf6b';
  ctx.fillRect(-2.7, -35 + bob, 1.3, 1.3);
  ctx.fillRect(1.4, -35 + bob, 1.3, 1.3);

  // лоток с товарами
  ctx.fillStyle = '#3a2b1a';
  ctx.fillRect(-19, -13, 14, 8);
  ctx.fillStyle = 'rgba(255,220,160,0.16)';
  ctx.fillRect(-19, -13, 14, 1.5);
  ctx.fillStyle = C.gold;
  ctx.beginPath();
  ctx.ellipse(-15, -15, 2.4, 3, 0, 0, Math.PI * 2);
  ctx.ellipse(-11, -15.5, 2.2, 2.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.soul;
  ctx.beginPath();
  ctx.ellipse(-7.5, -15, 1.8, 2.6, 0, 0, Math.PI * 2);
  ctx.fill();

  // искры
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 5; i++) {
    const a = time * 1.2 + i * 1.4;
    ctx.fillStyle = `rgba(255,220,140,${0.12 + (i % 2) * 0.1})`;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * 16, -18 - Math.abs(Math.sin(a)) * 12, 0.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.restore();
}

/** Оазис: тёплый водоём, пальмы и светлячки — мирная зона восстановления. */
export function drawOasis(ctx: CanvasRenderingContext2D, width: number, time: number): void {
  const waterY = GROUND_ROW * TILE - 2;
  const cx = width / 2;

  ctx.save();
  // мягкое зелёное свечение над водой
  const bloom = ctx.createRadialGradient(cx, waterY - 8, 4, cx, waterY - 8, 130);
  bloom.addColorStop(0, 'rgba(120,255,210,0.14)');
  bloom.addColorStop(0.6, 'rgba(60,200,170,0.06)');
  bloom.addColorStop(1, 'rgba(30,110,100,0)');
  ctx.fillStyle = bloom;
  ctx.fillRect(cx - 140, waterY - 80, 280, 100);

  // водоём
  const pool = ctx.createLinearGradient(0, waterY - 8, 0, waterY + 9);
  pool.addColorStop(0, 'rgba(120,235,210,0.34)');
  pool.addColorStop(0.5, 'rgba(40,150,150,0.28)');
  pool.addColorStop(1, 'rgba(10,60,70,0.12)');
  ctx.fillStyle = pool;
  ctx.beginPath();
  ctx.ellipse(cx, waterY + 2, 118, 11, 0, 0, Math.PI * 2);
  ctx.fill();

  // блики и рябь
  for (let i = 0; i < 22; i++) {
    const x = cx - 110 + ((i * 47 + time * 12) % 220);
    const y = waterY - 3 + (i % 4) * 3;
    const a = 0.10 + Math.sin(time * 2 + i * 1.3) * 0.07;
    ctx.fillStyle = `rgba(200,255,240,${Math.max(0.02, a)})`;
    ctx.beginPath();
    ctx.ellipse(x, y, 3 + (i % 3), 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // кувшинки
  for (const [lx, ly, s] of [[cx - 72, waterY + 1, 1], [cx + 38, waterY - 2, 1.2], [cx + 84, waterY + 3, 0.8]] as const) {
    ctx.fillStyle = 'rgba(84,180,110,0.85)';
    ctx.beginPath();
    ctx.ellipse(lx, ly, 6 * s, 2.6 * s, 0.1, 0.3, Math.PI * 2 - 0.3);
    ctx.lineTo(lx, ly);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,190,220,0.9)';
    ctx.beginPath();
    ctx.arc(lx - 1, ly - 1, 1.5 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  // пальмы по краям
  for (const [px, dir] of [[cx - 132, -1], [cx + 128, 1]] as const) {
    const sway = Math.sin(time * 1.1 + px) * 0.05;
    ctx.save();
    ctx.translate(px, GROUND_ROW * TILE);
    ctx.rotate(sway);
    ctx.strokeStyle = '#4b3a2c';
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(dir * 4, -26, dir * 2, -52);
    ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i - 2.5) * 0.42;
      ctx.strokeStyle = i % 2 ? 'rgba(96,190,120,0.9)' : 'rgba(60,150,100,0.9)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(dir * 2, -52);
      ctx.quadraticCurveTo(dir * 2 + Math.cos(a) * 16, -52 + Math.sin(a) * 14, dir * 2 + Math.cos(a) * 26, -46 + Math.sin(a) * 22);
      ctx.stroke();
    }
    ctx.restore();
  }

  // камыши
  for (let i = 0; i < 9; i++) {
    const rx = cx - 108 + i * 26 + Math.sin(i * 2.1) * 8;
    const h = 10 + (i % 4) * 4;
    ctx.strokeStyle = 'rgba(100,170,120,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(rx, waterY + 6);
    ctx.quadraticCurveTo(rx + Math.sin(time * 1.4 + i) * 2, waterY - h * 0.5, rx + Math.sin(time * 1.2 + i) * 4, waterY - h);
    ctx.stroke();
  }

  // светлячки
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 14; i++) {
    const a = time * 0.8 + i * 1.7;
    const fx = cx + Math.cos(a) * (60 + (i % 5) * 16);
    const fy = waterY - 20 - Math.abs(Math.sin(a * 1.3)) * 34;
    const alpha = 0.25 + Math.sin(time * 3 + i) * 0.15;
    ctx.fillStyle = `rgba(210,255,190,${Math.max(0.06, alpha)})`;
    ctx.beginPath();
    ctx.arc(fx, fy, 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Хранитель оазиса — мирный NPC. */
export function drawKeeper(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  time: number,
): void {
  if (drawCustomAsset(ctx, 'characters/npc/oasis-keeper', { x, y, alpha: 1 })) return;
  const bob = Math.sin(time * 1.4) * 0.8;
  ctx.save();
  ctx.translate(x, y);

  const halo = ctx.createRadialGradient(0, -22, 2, 0, -22, 32);
  halo.addColorStop(0, 'rgba(160,255,210,0.16)');
  halo.addColorStop(1, 'rgba(160,255,210,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, -22, 32, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 12, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // длинная мантия
  const robe = ctx.createLinearGradient(0, -34, 0, 0);
  robe.addColorStop(0, '#3f7f6c');
  robe.addColorStop(1, '#173a34');
  ctx.fillStyle = robe;
  ctx.beginPath();
  ctx.moveTo(-9, 0);
  ctx.quadraticCurveTo(-12, -20, -5, -33 + bob);
  ctx.quadraticCurveTo(0, -37 + bob, 5, -33 + bob);
  ctx.quadraticCurveTo(12, -20, 9, 0);
  ctx.closePath();
  ctx.fill();

  // капюшон и лицо
  ctx.fillStyle = '#2d6157';
  ctx.beginPath();
  ctx.ellipse(0, -34 + bob, 7, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0a1a18';
  ctx.beginPath();
  ctx.ellipse(0, -33 + bob, 4.6, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#a8ffd8';
  ctx.fillRect(-2.3, -34 + bob, 1.2, 1.2);
  ctx.fillRect(1.1, -34 + bob, 1.2, 1.2);

  // посох с кристаллом
  ctx.strokeStyle = '#6b5a3a';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(11, 0);
  ctx.lineTo(13, -40);
  ctx.stroke();
  ctx.fillStyle = 'rgba(160,255,210,0.95)';
  ctx.beginPath();
  ctx.arc(13, -42, 2.4 + Math.sin(time * 2.6) * 0.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export function drawAltar(ctx: CanvasRenderingContext2D, x: number, y: number, time: number, active: boolean): void {
  const pulse = 0.6 + Math.sin(time * 2.2) * 0.25;
  ctx.save();
  ctx.translate(x, y);

  // ореол
  const halo = ctx.createRadialGradient(0, -24, 2, 0, -24, 34);
  halo.addColorStop(0, active ? `rgba(159,232,255,${0.16 + pulse * 0.06})` : 'rgba(120,110,150,0.05)');
  halo.addColorStop(1, 'rgba(159,232,255,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, -24, 34, 0, Math.PI * 2);
  ctx.fill();

  // плита
  const base = ctx.createLinearGradient(0, -12, 0, 0);
  base.addColorStop(0, '#443a63');
  base.addColorStop(0.4, '#2b2540');
  base.addColorStop(1, '#151120');
  ctx.fillStyle = base;
  ctx.fillRect(-10, -11, 20, 11);
  ctx.fillStyle = '#5d4f8a';
  ctx.fillRect(-12, -13, 24, 3);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(-12, -13, 24, 0.8);
  // руны
  ctx.strokeStyle = active ? `rgba(159,232,255,${0.35 + pulse * 0.3})` : 'rgba(120,110,150,0.22)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(-7, -7);
  ctx.lineTo(-4, -4);
  ctx.lineTo(-6, -2);
  ctx.moveTo(6, -7);
  ctx.lineTo(3, -4);
  ctx.lineTo(5, -2);
  ctx.stroke();

  // колонна
  const column = ctx.createLinearGradient(-3, -38, 3, -12);
  column.addColorStop(0, '#7b6ba8');
  column.addColorStop(0.5, '#443a63');
  column.addColorStop(1, '#221c34');
  ctx.fillStyle = column;
  ctx.fillRect(-2, -36, 4, 24);
  ctx.fillStyle = '#8a7ab8';
  ctx.fillRect(-3.5, -38, 7, 2);

  // огонь души
  if (active) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const fy = -42 + Math.sin(time * 4) * 1.5;
    const flame = ctx.createRadialGradient(0, fy, 0.5, 0, fy, 16);
    flame.addColorStop(0, 'rgba(255,255,255,0.9)');
    flame.addColorStop(0.3, 'rgba(159,232,255,0.55)');
    flame.addColorStop(0.7, 'rgba(143,123,255,0.2)');
    flame.addColorStop(1, 'rgba(143,123,255,0)');
    ctx.fillStyle = flame;
    ctx.beginPath();
    ctx.arc(0, fy, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.ectoplasm;
    ctx.beginPath();
    ctx.moveTo(0, fy - 8);
    ctx.bezierCurveTo(5, fy - 3, 5, fy + 4, 0, fy + 6);
    ctx.bezierCurveTo(-5, fy + 4, -5, fy - 3, 0, fy - 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-1.4, fy + 0.5, 0.8, 0, Math.PI * 2);
    ctx.arc(1.4, fy + 0.5, 0.8, 0, Math.PI * 2);
    ctx.fill();
    // искры
    for (let i = 0; i < 6; i++) {
      const a = time * 1.6 + i * 1.1;
      const r = 8 + (i % 3) * 4;
      ctx.fillStyle = `rgba(159,232,255,${0.18 + (i % 3) * 0.08})`;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r, fy - Math.abs(Math.sin(a)) * 8, 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  } else {
    ctx.fillStyle = 'rgba(120,110,150,0.35)';
    ctx.beginPath();
    ctx.arc(0, -42, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // пьедестал
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 15, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
