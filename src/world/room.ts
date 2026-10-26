import { RNG } from '../core/rng';
import { BIOMES, BiomePalette, C } from '../art/palette';

export const TILE = 16;
export const ROOM_H = 17;
export const GROUND_ROW = 14;

export const T_EMPTY = 0;
export const T_SOLID = 1;
export const T_PLATFORM = 2;
export const T_SPIKE = 3;

export type EnemyKind = 'guard' | 'archer' | 'crawler' | 'mage' | 'bomber' | 'elite';
export type BossKind = 'executioner' | 'matriarch' | 'choir' | 'golem' | 'boneking' | 'hero';

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
  altar: { x: number; y: number } | null = null;
  boss: BossKind | null = null;
  door: { x: number; y: number; w: number; h: number };
  cleared = false;

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

  isSolid(tx: number, ty: number): boolean { return this.get(tx, ty) === T_SOLID; }
  isPlatform(tx: number, ty: number): boolean { return this.get(tx, ty) === T_PLATFORM; }
  isSpike(tx: number, ty: number): boolean { return this.get(tx, ty) === T_SPIKE; }

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
    room.enemies = [];
    room.altar = null;
    room.decor = makeDecor(rng, room, biomeKey, true);
    return room;
  }

  if (isBoss) {
    fillRect(room, 6, 11, 4, 1, T_PLATFORM);
    fillRect(room, w - 16, 11, 4, 1, T_PLATFORM);
    fillRect(room, 14, 9, 5, 1, T_PLATFORM);
    room.boss = BOSSES[biomeKey];
    room.altar = { x: 5 * TILE, y: GROUND_ROW * TILE };
    room.decor = makeDecor(rng, room, biomeKey, true);
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

  // altar at the start of a location and before its boss
  if (roomInLocation === 0 || roomInLocation === 2) {
    room.altar = { x: 6 * TILE, y: GROUND_ROW * TILE };
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
      if (t === T_SOLID) {
        const topOpen = !room.isSolid(tx, ty - 1);
        ctx.fillStyle = b.tile;
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = b.tileDark;
        ctx.fillRect(px, py + TILE - 4, TILE, 4);
        ctx.fillRect(px + TILE - 3, py, 3, TILE);
        if (topOpen) {
          ctx.fillStyle = b.tileTop;
          ctx.fillRect(px, py, TILE, 3);
          ctx.fillStyle = 'rgba(255,255,255,0.05)';
          ctx.fillRect(px, py + 3, TILE, 1);
        }
        // subtle cracks
        const h = (tx * 73856093) ^ (ty * 19349663);
        if ((h & 7) === 0) {
          ctx.fillStyle = 'rgba(0,0,0,0.22)';
          ctx.fillRect(px + 4, py + 6, 5, 1);
          ctx.fillRect(px + 8, py + 7, 1, 4);
        }
      } else if (t === T_PLATFORM) {
        ctx.fillStyle = b.tileTop;
        ctx.fillRect(px, py, TILE, 4);
        ctx.fillStyle = b.tile;
        ctx.fillRect(px, py + 4, TILE, 2);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(px, py + 6, TILE, 2);
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        ctx.fillRect(px, py, TILE, 1);
      } else if (t === T_SPIKE) {
        ctx.fillStyle = b.tileTop;
        for (let i = 0; i < 3; i++) {
          const sx = px + i * 5 + 1;
          ctx.beginPath();
          ctx.moveTo(sx, py + TILE);
          ctx.lineTo(sx + 2.5, py + 4);
          ctx.lineTo(sx + 5, py + TILE);
          ctx.closePath();
          ctx.fill();
        }
        ctx.fillStyle = 'rgba(255,90,110,0.25)';
        ctx.fillRect(px, py + TILE - 2, TILE, 2);
      }
    }
  }

  // door arch glow
  const d = room.door;
  const pulse = 0.55 + Math.sin(time * 2.4) * 0.2;
  const grad = ctx.createLinearGradient(d.x - 20, 0, d.x, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, `rgba(185,166,255,${0.16 * pulse})`);
  ctx.fillStyle = grad;
  ctx.fillRect(d.x - 20, d.y, 20, d.h);
  ctx.fillStyle = b.accent;
  ctx.globalAlpha = 0.5 + pulse * 0.3;
  ctx.fillRect(d.x + 2, d.y + 4, 2, d.h - 8);
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(d.x, d.y, d.w, 2);
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

export function drawAltar(ctx: CanvasRenderingContext2D, x: number, y: number, time: number, active: boolean): void {
  const pulse = 0.6 + Math.sin(time * 2.2) * 0.25;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(185,166,255,0.08)';
  ctx.beginPath();
  ctx.arc(0, -18, 26 + pulse * 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2b2540';
  ctx.fillRect(-9, -10, 18, 10);
  ctx.fillStyle = '#443a63';
  ctx.fillRect(-11, -12, 22, 3);
  ctx.fillStyle = '#5d4f8a';
  ctx.fillRect(-2, -34, 4, 22);
  ctx.fillStyle = active ? `rgba(185,166,255,${0.5 + pulse * 0.5})` : 'rgba(120,110,150,0.5)';
  ctx.beginPath();
  ctx.arc(0, -37, 4 + pulse * 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.soul;
  ctx.globalAlpha = 0.5 + pulse * 0.4;
  ctx.fillRect(-1, -38, 2, 2);
  ctx.restore();
}
