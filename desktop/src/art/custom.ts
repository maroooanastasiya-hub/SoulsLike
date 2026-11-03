/// <reference types="vite/client" />

import { VIEW_W, VIEW_H } from '../core/constants';

export type AssetAnchor = 'bottom-center' | 'center' | 'top-left';

export interface AssetRule {
  scale?: number;
  offsetX?: number;
  offsetY?: number;
  anchor?: AssetAnchor;
  alpha?: number;
  flip?: boolean;
}

export interface DrawAssetOptions {
  x: number;
  y: number;
  width?: number;
  height?: number;
  scale?: number;
  flip?: boolean;
  alpha?: number;
  rotation?: number;
  anchor?: AssetAnchor;
  offsetX?: number;
  offsetY?: number;
  filter?: string;
}

interface Manifest {
  overrides?: Record<string, AssetRule>;
}

// Все SVG из desktop/assets/custom автоматически попадают в сборку.
// Если файла нет — возвращаем false, и игра рисует свой векторный спрайт.
const svgModules = import.meta.glob('../../assets/custom/**/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const manifestModules = import.meta.glob('../../assets/custom/manifest.json', {
  eager: true,
  import: 'default',
}) as Record<string, Manifest>;

const manifest = Object.values(manifestModules)[0] ?? {};
const overrides = manifest.overrides ?? {};

function toAssetKey(path: string): string {
  const marker = '/assets/custom/';
  const index = path.lastIndexOf(marker);
  const raw = index >= 0 ? path.slice(index + marker.length) : path;
  return raw.replace(/^\.\.\/\.\.\/assets\/custom\//, '').replace(/\.svg$/i, '');
}

const urls = new Map<string, string>();
for (const [path, url] of Object.entries(svgModules)) {
  urls.set(toAssetKey(path), url);
}

const images = new Map<string, HTMLImageElement>();

/** Запускает фоновую загрузку всех найденных SVG. Вызывать один раз при старте. */
export function preloadCustomAssets(): void {
  for (const [key, url] of urls) {
    if (images.has(key)) continue;
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    images.set(key, image);
  }
}

export function customAssetKeys(): string[] {
  return [...urls.keys()].sort();
}

export function hasCustomAsset(key: string): boolean {
  const image = images.get(key);
  return Boolean(image && image.complete && image.naturalWidth > 0);
}

export function hasAnyCustomAsset(keys: string[]): boolean {
  return keys.some((key) => hasCustomAsset(key));
}

/**
 * Рисует SVG, если он загружен. Возвращает true — вызывающий код пропускает
 * процедурный спрайт. Логика, хитбоксы и атаки при этом не меняются.
 */
export function drawCustomAsset(
  ctx: CanvasRenderingContext2D,
  key: string,
  options: DrawAssetOptions,
): boolean {
  const image = images.get(key);
  if (!image || !image.complete || image.naturalWidth <= 0) return false;

  const rule = overrides[key] ?? {};
  const anchor = rule.anchor ?? options.anchor ?? 'bottom-center';
  const alpha = (options.alpha ?? 1) * (rule.alpha ?? 1);
  if (alpha <= 0.001) return false;

  const scale = (options.scale ?? 1) * (rule.scale ?? 1);
  let width: number;
  let height: number;
  if (options.width !== undefined && options.height !== undefined) {
    width = options.width;
    height = options.height;
  } else if (options.width !== undefined) {
    width = options.width;
    height = width * (image.naturalHeight / image.naturalWidth);
  } else if (options.height !== undefined) {
    height = options.height;
    width = height * (image.naturalWidth / image.naturalHeight);
  } else {
    width = image.naturalWidth;
    height = image.naturalHeight;
  }
  width *= scale;
  height *= scale;

  let dx = 0;
  let dy = 0;
  if (anchor === 'bottom-center') {
    dx = -width / 2;
    dy = -height;
  } else if (anchor === 'center') {
    dx = -width / 2;
    dy = -height / 2;
  }

  const offsetX = (options.offsetX ?? 0) + (rule.offsetX ?? 0);
  const offsetY = (options.offsetY ?? 0) + (rule.offsetY ?? 0);

  ctx.save();
  ctx.translate(options.x + offsetX, options.y + offsetY);
  if (options.rotation) ctx.rotate(options.rotation);
  if (options.flip ?? rule.flip ?? false) ctx.scale(-1, 1);
  ctx.globalAlpha *= Math.min(1, Math.max(0, alpha));
  if (options.filter) ctx.filter = options.filter;
  ctx.drawImage(image, dx, dy, width, height);
  ctx.restore();
  return true;
}

/** Пробует несколько состояний по порядку: attack -> idle -> общий fallback. */
export function drawCustomFirst(
  ctx: CanvasRenderingContext2D,
  keys: string[],
  options: DrawAssetOptions,
): boolean {
  for (const key of keys) {
    if (drawCustomAsset(ctx, key, options)) return true;
  }
  return false;
}

const BACKGROUND_PARALLAX: Record<string, number> = {
  back: 0.12,
  mid: 0.34,
  front: 0.62,
};

const BACKGROUND_ALPHA: Record<string, number> = {
  back: 1,
  mid: 0.9,
  front: 0.8,
};

/** Рисует слой фона с параллаксом. Возвращает false, если SVG нет. */
export function drawCustomBackground(
  ctx: CanvasRenderingContext2D,
  biomeKey: string,
  layer: 'back' | 'mid' | 'front',
  camX: number,
  camY: number,
): boolean {
  const key = `backgrounds/${biomeKey}/${layer}`;
  const image = images.get(key);
  if (!image || !image.complete || image.naturalWidth <= 0) return false;

  const cover = Math.max(VIEW_W / image.naturalWidth, VIEW_H / image.naturalHeight);
  const w = image.naturalWidth * cover;
  const h = image.naturalHeight * cover;
  const par = BACKGROUND_PARALLAX[layer];
  const shift = ((camX * par) % w + w) % w;
  const x = -shift;
  const y = (VIEW_H - h) / 2 - camY * par * 0.18;

  ctx.save();
  ctx.globalAlpha = BACKGROUND_ALPHA[layer];
  ctx.drawImage(image, x, y, w, h);
  // второй экземпляр закрывает стык при горизонтальном параллаксе
  if (x + w < VIEW_W) ctx.drawImage(image, x + w, y, w, h);
  ctx.restore();
  return true;
}
