import { C } from '../art/palette';

export interface TextOpts {
  size?: number;
  color?: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  shadow?: boolean;
  weight?: string;
  alpha?: number;
}

export function text(
  ctx: CanvasRenderingContext2D,
  str: string,
  x: number,
  y: number,
  opts: TextOpts = {},
): void {
  const {
    size = 9,
    color = C.white,
    align = 'left',
    baseline = 'alphabetic',
    shadow = true,
    weight = 'bold',
    alpha = 1,
  } = opts;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.font = `${weight} ${size}px "Courier New", ui-monospace, monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  if (shadow) {
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillText(str, x + 1, y + 1);
  }
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
  ctx.restore();
}

export function measure(ctx: CanvasRenderingContext2D, str: string, size: number, weight = 'bold'): number {
  ctx.save();
  ctx.font = `${weight} ${size}px "Courier New", ui-monospace, monospace`;
  const w = ctx.measureText(str).width;
  ctx.restore();
  return w;
}

export function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

export function bar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  pct: number,
  fill: string,
  bg = 'rgba(0,0,0,0.6)',
  border = 'rgba(255,255,255,0.18)',
): void {
  const p = Math.max(0, Math.min(1, pct));
  rect(ctx, x - 1, y - 1, w + 2, h + 2, border);
  rect(ctx, x, y, w, h, bg);
  rect(ctx, x, y, Math.round(w * p), h, fill);
}

export class Camera {
  x = 0;
  y = 0;
  private shakeTime = 0;
  private shakeMag = 0;
  ox = 0;
  oy = 0;

  snap(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  follow(tx: number, ty: number, roomW: number, roomH: number, viewW: number, viewH: number, dt: number): void {
    let destX = tx - viewW / 2;
    let destY = ty - viewH * 0.58;
    if (roomW <= viewW) destX = (roomW - viewW) / 2;
    else destX = Math.max(0, Math.min(roomW - viewW, destX));
    if (roomH <= viewH) destY = (roomH - viewH) / 2;
    else destY = Math.max(0, Math.min(roomH - viewH, destY));
    const k = 1 - Math.pow(0.0008, dt);
    this.x += (destX - this.x) * k;
    this.y += (destY - this.y) * k;
    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      const m = this.shakeMag * (this.shakeTime > 0 ? 1 : 0);
      this.ox = (Math.random() * 2 - 1) * m;
      this.oy = (Math.random() * 2 - 1) * m;
    } else {
      this.ox = 0;
      this.oy = 0;
      this.shakeMag = 0;
    }
  }

  shake(mag: number, time: number): void {
    this.shakeMag = Math.max(this.shakeMag, mag);
    this.shakeTime = Math.max(this.shakeTime, time);
  }

  get drawX(): number {
    return Math.round(this.x + this.ox);
  }

  get drawY(): number {
    return Math.round(this.y + this.oy);
  }
}
