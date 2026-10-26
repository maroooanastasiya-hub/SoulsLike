import { Room } from '../world/room';
import { VIEW_W, VIEW_H } from '../core/constants';

export function drawBackground(
  ctx: CanvasRenderingContext2D,
  room: Room,
  camX: number,
  camY: number,
  time: number,
): void {
  const b = room.biome;
  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, b.sky0);
  g.addColorStop(0.65, b.sky1);
  g.addColorStop(1, b.sky0);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // distant glow
  const glow = ctx.createRadialGradient(VIEW_W * 0.5, VIEW_H * 0.45, 10, VIEW_W * 0.5, VIEW_H * 0.45, VIEW_W * 0.7);
  glow.addColorStop(0, `${b.glow}14`);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // far silhouettes
  const off1 = ((camX * 0.14) % 190 + 190) % 190;
  ctx.fillStyle = b.far;
  for (let i = -1; i < 5; i++) {
    const x = i * 190 - off1;
    const h = 110 + ((i * 37) % 60);
    ctx.fillRect(x, VIEW_H - h - 20, 54, h + 20);
    ctx.beginPath();
    ctx.arc(x + 27, VIEW_H - h - 20, 27, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x + 18, VIEW_H - h - 60, 18, 40);
  }

  // mid arches
  const off2 = ((camX * 0.3) % 240 + 240) % 240;
  ctx.fillStyle = b.mid;
  for (let i = -1; i < 4; i++) {
    const x = i * 240 - off2;
    ctx.fillRect(x, 90, 20, VIEW_H - 90);
    ctx.fillRect(x + 150, 90, 20, VIEW_H - 90);
    ctx.strokeStyle = b.mid;
    ctx.lineWidth = 20;
    ctx.beginPath();
    ctx.arc(x + 85, 96, 75, Math.PI, Math.PI * 2);
    ctx.stroke();
  }

  // hanging fog bands
  ctx.fillStyle = b.fog;
  for (let i = 0; i < 4; i++) {
    const y = 60 + i * 44 + Math.sin(time * 0.3 + i) * 6 - (camY % 20);
    ctx.fillRect(0, y, VIEW_W, 10 + i * 4);
  }

  // vignette
  const v = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.35, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}
