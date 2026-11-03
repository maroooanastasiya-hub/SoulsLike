import { C } from './palette';
import { drawCustomFirst } from './custom';

export interface GhostPose {
  time: number;
  facing?: number;
  vx?: number;
  vy?: number;
  onGround?: boolean;
  moving?: boolean;
  attackTimer?: number;
  attackDir?: 'side' | 'up' | 'down';
  combo?: number;
  dashTime?: number;
  hurtFlash?: number;
  castGlow?: number;
  castColor?: string;
  alpha?: number;
}

function rgba(hex: string, a: number): string {
  const clean = hex.replace('#', '');
  const n = parseInt(clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/**
 * Векторный спрайт призрака павшего злодея.
 * Точка (x, y) — «ноги» призрака; спрайт свободно парит над землёй.
 */
export function drawGhostHero(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  pose: GhostPose,
): void {
  const t = pose.time;
  const facing = pose.facing ?? 1;
  const speed = Math.abs(pose.vx ?? 0);
  const moving = pose.moving ?? speed > 18;
  const dashing = (pose.dashTime ?? 0) > 0;
  const attack = (pose.attackTimer ?? 0) > 0;
  const hurt = (pose.hurtFlash ?? 0) > 0;
  const alpha = pose.alpha ?? 1;

  const bob = Math.sin(t * 2.5) * 1.15 + (moving ? Math.sin(t * 11) * 0.7 : 0);
  const hover = -5 + bob + (dashing ? -1.5 : 0);
  const sway = Math.sin(t * 2.1) * 1.1;
  const flare = Math.sin(t * 3.3) * 0.5 + 0.5;
  const lean = Math.min(1, speed / 145) * 1.7;

  ctx.save();
  ctx.translate(x, y);
  if (facing < 0) ctx.scale(-1, 1);
  if (alpha < 1) ctx.globalAlpha *= alpha;

  // --- аура души ---------------------------------------------------------
  const auraCol = hurt ? '224,72,92' : '118,224,255';
  const aura = ctx.createRadialGradient(0, -17 + hover, 2, 0, -17 + hover, 26);
  aura.addColorStop(0, `rgba(${auraCol},${0.2 + flare * 0.04})`);
  aura.addColorStop(0.5, `rgba(${auraCol},0.07)`);
  aura.addColorStop(1, `rgba(${auraCol},0)`);
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.ellipse(0, -17 + hover, 23, 28, 0, 0, Math.PI * 2);
  ctx.fill();

  // --- хвостовые языки эктоплазмы ---------------------------------------
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) {
    const phase = t * 2.7 + i * 1.45;
    const tailSway = Math.sin(phase) * (3 + i);
    const startX = -5 + i * 5;
    const endX = -7 + i * 7 + tailSway;
    const grad = ctx.createLinearGradient(startX, -11 + hover, endX, 5);
    grad.addColorStop(0, `rgba(145,235,255,${0.28 - i * 0.05})`);
    grad.addColorStop(1, 'rgba(145,235,255,0)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 3.2 - i * 0.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(startX, -12 + hover);
    ctx.bezierCurveTo(
      startX - 5, -7 + hover,
      endX + Math.sin(phase + 1) * 3, -1,
      endX, 5 + (i === 1 ? 1 : 0),
    );
    ctx.stroke();
  }
  ctx.restore();

  // --- рваный саван ------------------------------------------------------
  const robe = ctx.createLinearGradient(0, -30 + hover, 0, 3);
  robe.addColorStop(0, hurt ? '#5a2333' : '#302858');
  robe.addColorStop(0.45, hurt ? '#3b1724' : '#211b3c');
  robe.addColorStop(1, hurt ? '#260d16' : '#120e24');
  ctx.fillStyle = robe;
  ctx.beginPath();
  ctx.moveTo(-7, -25 + hover);
  ctx.quadraticCurveTo(-10 - lean, -18 + hover, -9 + sway, -9 + hover);
  ctx.lineTo(-10 + sway, -3 + hover);
  ctx.lineTo(-7.5, -5 + hover);
  ctx.lineTo(-5.5, -1 + hover);
  ctx.lineTo(-3, -6 + hover);
  ctx.lineTo(-0.5, -2.5 + hover);
  ctx.lineTo(2.5, -6.5 + hover);
  ctx.lineTo(5, -2 + hover);
  ctx.lineTo(7, -7 + hover);
  ctx.lineTo(9, -3 + hover);
  ctx.lineTo(9, -16 + hover);
  ctx.quadraticCurveTo(9.5 - lean, -23 + hover, 7, -25 + hover);
  ctx.quadraticCurveTo(0, -29 + hover, -7, -25 + hover);
  ctx.closePath();
  ctx.fill();

  // подкладка савана
  ctx.fillStyle = 'rgba(111,92,180,0.34)';
  ctx.beginPath();
  ctx.moveTo(-4.5, -24 + hover);
  ctx.quadraticCurveTo(-5.5, -16 + hover, -4 + sway * 0.5, -10 + hover);
  ctx.lineTo(-2, -13 + hover);
  ctx.lineTo(0, -9 + hover);
  ctx.lineTo(2.2, -13.5 + hover);
  ctx.lineTo(4.5, -10 + hover);
  ctx.quadraticCurveTo(5.5, -17 + hover, 4.5, -24 + hover);
  ctx.closePath();
  ctx.fill();

  // край савана светится
  ctx.strokeStyle = `rgba(137,224,255,${0.16 + flare * 0.08})`;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(-9 + sway, -9 + hover);
  ctx.lineTo(-10 + sway, -3 + hover);
  ctx.lineTo(-7.5, -5 + hover);
  ctx.lineTo(-5.5, -1 + hover);
  ctx.stroke();

  // --- пояс и цепь -------------------------------------------------------
  ctx.strokeStyle = 'rgba(232,223,196,0.42)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-6.5, -13 + hover);
  ctx.quadraticCurveTo(0, -11.5 + hover, 6.5, -13 + hover);
  ctx.stroke();
  for (let i = -2; i <= 2; i++) {
    ctx.strokeStyle = 'rgba(205,196,170,0.26)';
    ctx.beginPath();
    ctx.ellipse(i * 2.6, -11.3 + hover, 1.2, 1.8, 0.4, 0, Math.PI * 2);
    ctx.stroke();
  }

  // --- наплечники --------------------------------------------------------
  const pauldron = ctx.createLinearGradient(-9, -26, 9, -20);
  pauldron.addColorStop(0, '#4a3d75');
  pauldron.addColorStop(1, '#241d40');
  ctx.fillStyle = pauldron;
  ctx.beginPath();
  ctx.moveTo(-7.5, -25 + hover);
  ctx.lineTo(-11, -22 + hover);
  ctx.lineTo(-8.5, -18.5 + hover);
  ctx.lineTo(-6, -21 + hover);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(7.5, -25 + hover);
  ctx.lineTo(11, -22 + hover);
  ctx.lineTo(8.5, -18.5 + hover);
  ctx.lineTo(6, -21 + hover);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(232,223,196,0.5)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(-10.6, -22 + hover);
  ctx.lineTo(-8.6, -19 + hover);
  ctx.moveTo(10.6, -22 + hover);
  ctx.lineTo(8.6, -19 + hover);
  ctx.stroke();

  // --- руки --------------------------------------------------------------
  ctx.strokeStyle = '#4e4279';
  ctx.lineWidth = 2.3;
  ctx.lineCap = 'round';
  // дальняя рука
  ctx.beginPath();
  ctx.moveTo(-7, -22 + hover);
  ctx.quadraticCurveTo(-11, -18 + hover, -8.5, -13 + hover);
  ctx.stroke();
  ctx.fillStyle = '#9fe8ff';
  ctx.beginPath();
  ctx.arc(-8.5, -12.6 + hover, 1.15, 0, Math.PI * 2);
  ctx.fill();

  // --- призрачный клинок ------------------------------------------------
  const atk = attack ? 1 - (pose.attackTimer ?? 0) / 0.2 : 0;
  let bladeAngle = -0.72 + Math.sin(t * 1.9) * 0.035;
  if (dashing) bladeAngle = -0.18;
  if (attack) {
    if (pose.attackDir === 'up') bladeAngle = -2.9 + atk * 1.45;
    else if (pose.attackDir === 'down') bladeAngle = 0.65 + atk * 1.2;
    else bladeAngle = -1.9 + atk * 2.55;
  } else if ((pose.castGlow ?? 0) > 0) {
    bladeAngle = -0.15;
  }

  ctx.save();
  ctx.translate(7.2, -15 + hover);
  ctx.rotate(bladeAngle);
  const bladeLen = pose.combo === 3 && attack ? 27 : 23;
  const bladeGrad = ctx.createLinearGradient(0, -bladeLen, 0, 0);
  bladeGrad.addColorStop(0, 'rgba(220,255,255,0.95)');
  bladeGrad.addColorStop(0.35, '#9fe8ff');
  bladeGrad.addColorStop(0.75, '#6b8cff');
  bladeGrad.addColorStop(1, '#8f7bff');
  ctx.shadowColor = C.spectral;
  ctx.shadowBlur = attack ? 10 : 5;
  ctx.fillStyle = bladeGrad;
  ctx.beginPath();
  ctx.moveTo(0, -bladeLen);
  ctx.lineTo(2.1, -bladeLen + 5);
  ctx.lineTo(1.5, -4);
  ctx.lineTo(-1.5, -4);
  ctx.lineTo(-2.1, -bladeLen + 5);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  // блик
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(0.2, -bladeLen + 3);
  ctx.lineTo(0.2, -6);
  ctx.stroke();
  // гарда и рукоять
  ctx.fillStyle = '#e8dfc4';
  ctx.fillRect(-4, -4.5, 8, 1.6);
  ctx.fillStyle = '#6b5a8f';
  ctx.fillRect(-1.1, -3, 2.2, 5);
  ctx.fillStyle = C.gold;
  ctx.beginPath();
  ctx.arc(0, 2.5, 1.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // ладонь на рукояти
  ctx.fillStyle = '#9fe8ff';
  ctx.beginPath();
  ctx.arc(7.2, -14.7 + hover, 1.3, 0, Math.PI * 2);
  ctx.fill();

  // --- горящее ядро души -------------------------------------------------
  const corePulse = 0.75 + Math.sin(t * 4.2) * 0.22;
  const core = ctx.createRadialGradient(0, -17.5 + hover, 0.5, 0, -17.5 + hover, 5.5);
  core.addColorStop(0, '#ffffff');
  core.addColorStop(0.25, C.ectoplasm);
  core.addColorStop(0.6, hurt ? C.red : C.purple);
  core.addColorStop(1, 'rgba(143,123,255,0)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(0, -17.5 + hover, 5.2 * corePulse, 0, Math.PI * 2);
  ctx.fill();
  // трещины-руны на груди
  ctx.strokeStyle = `rgba(200,255,242,${0.35 + corePulse * 0.3})`;
  ctx.lineWidth = 0.55;
  ctx.beginPath();
  ctx.moveTo(0, -20 + hover);
  ctx.lineTo(-2, -17 + hover);
  ctx.lineTo(0.5, -14.5 + hover);
  ctx.moveTo(2.2, -19 + hover);
  ctx.lineTo(3.6, -16.5 + hover);
  ctx.stroke();

  // --- капюшон и лицо ----------------------------------------------------
  const hood = ctx.createLinearGradient(0, -38 + hover, 0, -24 + hover);
  hood.addColorStop(0, hurt ? '#6a2a3c' : '#3c3268');
  hood.addColorStop(1, hurt ? '#2c1019' : '#171329');
  ctx.fillStyle = hood;
  ctx.beginPath();
  ctx.moveTo(-7, -24.5 + hover);
  ctx.quadraticCurveTo(-8.8, -31 + hover, -4, -35 + hover);
  ctx.quadraticCurveTo(0, -38 + hover, 4, -35 + hover);
  ctx.quadraticCurveTo(8.8, -31 + hover, 7, -24.5 + hover);
  ctx.quadraticCurveTo(0, -21 + hover, -7, -24.5 + hover);
  ctx.closePath();
  ctx.fill();

  // рваные края капюшона
  ctx.strokeStyle = 'rgba(159,232,255,0.2)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(-7, -24.5 + hover);
  ctx.lineTo(-6, -21 + hover);
  ctx.lineTo(-4, -23.5 + hover);
  ctx.moveTo(7, -24.5 + hover);
  ctx.lineTo(5.8, -21 + hover);
  ctx.stroke();

  // тьма под капюшоном
  ctx.fillStyle = '#030208';
  ctx.beginPath();
  ctx.ellipse(0, -29 + hover, 5.2, 5.8, 0, 0, Math.PI * 2);
  ctx.fill();

  // глаза
  const eyeGlow = 0.65 + Math.sin(t * 3.8) * 0.25 + (hurt ? 0.35 : 0);
  ctx.save();
  ctx.shadowColor = C.spectral;
  ctx.shadowBlur = 5 + eyeGlow * 4;
  ctx.fillStyle = hurt ? '#ffb3bd' : C.ectoplasm;
  ctx.beginPath();
  ctx.moveTo(-3.8, -30.4 + hover);
  ctx.lineTo(-1.2, -30 + hover);
  ctx.lineTo(-1.5, -28.2 + hover);
  ctx.lineTo(-3.9, -28.7 + hover);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(3.8, -30.4 + hover);
  ctx.lineTo(1.2, -30 + hover);
  ctx.lineTo(1.5, -28.2 + hover);
  ctx.lineTo(3.9, -28.7 + hover);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-2.8, -30.2 + hover, 0.9, 0.9);
  ctx.fillRect(2, -30.2 + hover, 0.9, 0.9);
  ctx.restore();

  // --- рога павшего злодея ----------------------------------------------
  ctx.fillStyle = hurt ? '#f3b7c0' : '#cfc4a4';
  ctx.beginPath();
  ctx.moveTo(-5.8, -33.8 + hover);
  ctx.quadraticCurveTo(-9.5, -37.5 + hover, -11.8, -43.2 + hover);
  ctx.quadraticCurveTo(-8.8, -40.2 + hover, -3.8, -35.4 + hover);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(5.8, -33.8 + hover);
  ctx.quadraticCurveTo(9.5, -37.5 + hover, 11.8, -43.2 + hover);
  ctx.quadraticCurveTo(8.8, -40.2 + hover, 3.8, -35.4 + hover);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(50,30,50,0.5)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(-6.5, -35.5 + hover);
  ctx.lineTo(-9.6, -39.8 + hover);
  ctx.moveTo(6.5, -35.5 + hover);
  ctx.lineTo(9.6, -39.8 + hover);
  ctx.stroke();

  // --- сломанная корона --------------------------------------------------
  const crownY = -42 + hover + Math.sin(t * 2.2) * 1.2;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = `rgba(255,207,107,${0.22 + flare * 0.12})`;
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.ellipse(0, crownY, 10.5, 2.6, 0, 0.15, Math.PI - 0.15);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, crownY, 10.5, 2.6, 0, Math.PI + 0.2, Math.PI * 2 - 0.2);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = '#c8a24e';
  const crownPts: [number, number, number][] = [
    [-8.5, crownY + 1.5, -0.25],
    [0, crownY - 3.5 + Math.sin(t * 2.7) * 0.8, 0.1],
    [8.5, crownY + 1.5, 0.3],
  ];
  for (const [cx, cy, rot] of crownPts) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot + Math.sin(t * 1.5 + cx) * 0.03);
    ctx.beginPath();
    ctx.moveTo(0, -3);
    ctx.lineTo(1.4, 0);
    ctx.lineTo(0, 2);
    ctx.lineTo(-1.4, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(-0.4, -2, 0.8, 1.2);
    ctx.fillStyle = '#c8a24e';
    ctx.restore();
  }

  // --- магический огонь в руке ------------------------------------------
  if ((pose.castGlow ?? 0) > 0) {
    const castColor = pose.castColor ?? C.soul;
    const pulse = 3.5 + Math.sin(t * 16) * 0.8;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(10, -17 + hover, 0.5, 10, -17 + hover, pulse * 2.4);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.35, rgba(castColor, 0.8));
    g.addColorStop(1, rgba(castColor, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(10, -17 + hover, pulse * 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // --- светящиеся мотыльки-души -----------------------------------------
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 5; i++) {
    const a = t * 1.25 + i * 1.85;
    const r = 9 + (i % 3) * 4 + Math.sin(t * 2 + i) * 1.5;
    const px = Math.cos(a) * r + Math.sin(t * 0.9 + i) * 2;
    const py = -17 + Math.sin(a * 1.3) * 9 + hover;
    ctx.fillStyle = i % 2 ? 'rgba(159,232,255,0.7)' : 'rgba(185,166,255,0.55)';
    ctx.beginPath();
    ctx.arc(px, py, i % 3 === 0 ? 0.9 : 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // --- вспышка урона -----------------------------------------------------
  if (hurt) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(255,70,90,${Math.min(0.5, (pose.hurtFlash ?? 0) * 1.6)})`;
    ctx.beginPath();
    ctx.ellipse(0, -17 + hover, 14, 20, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/** Упрощённый след призрака для рывка. */
export function drawGhostAfterimage(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  facing: number,
  alpha: number,
  time: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing, 1);
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = 'lighter';

  const grad = ctx.createLinearGradient(0, -34, 0, 3);
  grad.addColorStop(0, 'rgba(159,232,255,0.55)');
  grad.addColorStop(0.55, 'rgba(143,123,255,0.28)');
  grad.addColorStop(1, 'rgba(125,249,255,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(-7, -25);
  ctx.quadraticCurveTo(-9, -15, -8 + Math.sin(time * 14) * 2, -4);
  ctx.lineTo(-4, -8);
  ctx.lineTo(-1, -2);
  ctx.lineTo(2, -8);
  ctx.lineTo(6, -4);
  ctx.quadraticCurveTo(8, -17, 7, -25);
  ctx.quadraticCurveTo(0, -29, -7, -25);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(3,2,8,0.5)';
  ctx.beginPath();
  ctx.ellipse(0, -29, 5, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(200,255,255,0.9)';
  ctx.fillRect(-3.4, -30, 2, 1.2);
  ctx.fillRect(1.4, -30, 2, 1.2);
  ctx.restore();
}

/** Капля здоровья: читается лучше, чем ромб или язык пламени. */
export function drawBloodDrop(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  time: number,
  filled: boolean,
): void {
  ctx.save();
  ctx.translate(x, y);
  const s = size / 10;
  ctx.scale(s, s);
  const pulse = 1 + Math.sin(time * 4 + x * 0.5) * 0.04;

  if (filled) {
    ctx.shadowColor = 'rgba(224,72,92,0.75)';
    ctx.shadowBlur = 6;
  }

  const drop = ctx.createLinearGradient(0, -11, 0, 8);
  if (filled) {
    drop.addColorStop(0, '#ffd8de');
    drop.addColorStop(0.28, '#ff6b7e');
    drop.addColorStop(0.7, C.red);
    drop.addColorStop(1, '#7a1f2c');
  } else {
    drop.addColorStop(0, 'rgba(110,58,74,0.5)');
    drop.addColorStop(1, 'rgba(42,16,24,0.4)');
  }
  ctx.fillStyle = drop;
  ctx.beginPath();
  ctx.moveTo(0, -11 * pulse);
  ctx.bezierCurveTo(5.4, -4.6, 6, 1.4, 4.2, 4.5);
  ctx.bezierCurveTo(2.4, 7.8, -2.4, 7.8, -4.2, 4.5);
  ctx.bezierCurveTo(-6, 1.4, -5.4, -4.6, 0, -11 * pulse);
  ctx.closePath();
  ctx.fill();

  if (filled) {
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,235,240,0.7)';
    ctx.lineWidth = 0.55;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(-2, -3.2, 1.2, 2.1, -0.35, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.strokeStyle = 'rgba(190,100,118,0.3)';
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }
  ctx.restore();
}

export interface RabbitPose {
  time: number;
  facing?: number;
  hop?: number;
  scale?: number;
  alpha?: number;
  fleeing?: boolean;
  angry?: boolean;
  vanish?: number;
}

/** Белый кролик — редкий мирный житель подземелья. */
export function drawRabbit(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  pose: RabbitPose,
): void {
  const {
    time,
    facing = 1,
    hop = 0,
    scale = 1,
    alpha = 1,
    fleeing = false,
    angry = false,
    vanish = 0,
  } = pose;
  const fade = Math.max(0, 1 - vanish);
  const twitch = Math.sin(time * 3.2) * 0.9;
  const blink = Math.sin(time * 1.7 + 2) > 0.985;

  // тень остаётся на земле, даже когда кролик подпрыгивает
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.globalAlpha = alpha * fade * 0.55;
  ctx.fillStyle = 'rgba(3,2,8,0.55)';
  ctx.beginPath();
  ctx.ellipse(0, -1, 8, 2.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const rabbitKeys = angry
    ? ['characters/rabbit/angry', 'characters/rabbit/idle']
    : fleeing
      ? ['characters/rabbit/flee', 'characters/rabbit/idle']
      : ['characters/rabbit/idle'];
  const custom = drawCustomFirst(ctx, rabbitKeys, {
    x,
    y: y - hop - vanish * 12,
    height: 34 * scale,
    flip: facing < 0,
    alpha: alpha * fade,
    rotation: fleeing ? -0.1 : 0,
  });
  if (custom) return;

  ctx.save();
  ctx.translate(x, y - hop - vanish * 12);
  ctx.scale(facing * scale, scale);
  ctx.globalAlpha = alpha * fade;
  if (fleeing) ctx.rotate(-0.1);

  // мягкое белое свечение
  const halo = ctx.createRadialGradient(0, -12, 2, 0, -12, 24);
  halo.addColorStop(0, 'rgba(255,255,255,0.28)');
  halo.addColorStop(0.55, 'rgba(210,225,255,0.1)');
  halo.addColorStop(1, 'rgba(210,225,255,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(-26, -38, 52, 42);

  if (fleeing) {
    ctx.strokeStyle = 'rgba(225,218,255,0.4)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-12 - i * 4, -4 - i * 5);
      ctx.lineTo(-19 - i * 4, -4 - i * 5);
      ctx.stroke();
    }
  }

  // хвост
  ctx.fillStyle = '#f7f4ff';
  ctx.strokeStyle = 'rgba(120,110,155,0.4)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.arc(-6.4, -7, 2.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // задняя лапа
  ctx.fillStyle = '#ddd6ee';
  ctx.beginPath();
  ctx.ellipse(-2.5, -4, 4.5, 4, -0.3, 0, Math.PI * 2);
  ctx.fill();

  // тело
  const body = ctx.createLinearGradient(0, -16, 0, 0);
  body.addColorStop(0, '#ffffff');
  body.addColorStop(0.6, '#f4f0ff');
  body.addColorStop(1, '#cfc7e4');
  ctx.fillStyle = body;
  ctx.strokeStyle = 'rgba(115,105,150,0.45)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.ellipse(0, -8, 6.6, 7.2, -0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // лапки
  ctx.fillStyle = '#f8f5ff';
  ctx.beginPath();
  ctx.ellipse(-3, -1.3, 3, 1.5, 0, 0, Math.PI * 2);
  ctx.ellipse(3.2, -1.3, 3, 1.5, 0.12, 0, Math.PI * 2);
  ctx.fill();

  // уши: два цельных изогнутых лепестка, без изломов
  const earPath = (
    bx: number, by: number, tx: number, ty: number, baseW: number, tipW: number,
  ): void => {
    const dx = tx - bx;
    const dy = ty - by;
    const len = Math.max(0.001, Math.hypot(dx, dy));
    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy;
    const ny = ux;
    const mx = bx + ux * len * 0.55;
    const my = by + uy * len * 0.55;
    ctx.beginPath();
    ctx.moveTo(bx + nx * baseW, by + ny * baseW);
    ctx.quadraticCurveTo(mx + nx * baseW * 0.84, my + ny * baseW * 0.84, tx + nx * tipW, ty + ny * tipW);
    ctx.quadraticCurveTo(tx + ux * 1.8, ty + uy * 1.8, tx - nx * tipW, ty - ny * tipW);
    ctx.quadraticCurveTo(mx - nx * baseW * 0.84, my - ny * baseW * 0.84, bx - nx * baseW, by - ny * baseW);
    ctx.quadraticCurveTo(bx - ux * 0.4, by + 1.8, bx + nx * baseW, by + ny * baseW);
    ctx.closePath();
  };
  const drawEar = (
    baseX: number, tipX: number, tipY: number, width: number, back: boolean,
  ): void => {
    const by = -17.2;
    const tipShift = angry && !back ? 0.9 : 0;
    const tx = tipX + tipShift;
    const dy = tipY - by;
    const dx = tx - baseX;

    // внешний лепесток
    earPath(baseX, by, tx, tipY, width, width * 0.32);
    ctx.fillStyle = back ? '#f3efff' : '#fdfaff';
    ctx.strokeStyle = 'rgba(115,105,150,0.42)';
    ctx.lineWidth = 0.6;
    ctx.fill();
    ctx.stroke();

    // розовая внутренняя часть — укорочена и не доходит до кончика
    const sx = baseX + dx * 0.16;
    const sy = by + dy * 0.16;
    const ex = baseX + dx * 0.82;
    const ey = by + dy * 0.82;
    earPath(sx, sy, ex, ey, width * 0.5, width * 0.16);
    ctx.fillStyle = back ? 'rgba(238,148,170,0.62)' : 'rgba(255,154,176,0.78)';
    ctx.fill();
  };
  drawEar(1.4, -3.9 + twitch * 0.5, -29.4 + Math.sin(time * 2.4) * 0.3, 2.35, true);
  drawEar(5.6, 9.4 + twitch * 0.3, -28.5 + Math.sin(time * 2.1 + 1.2) * 0.3, 2.55, false);

  // голова
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = 'rgba(115,105,150,0.42)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.ellipse(4, -15.4, 4.8, 4.4, 0.02, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // мордочка
  ctx.fillStyle = '#f3edff';
  ctx.beginPath();
  ctx.ellipse(7.3, -14.1, 2.5, 2.1, 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ff9ab0';
  ctx.beginPath();
  ctx.ellipse(8.6, -14.5, 0.85, 0.7, 0.1, 0, Math.PI * 2);
  ctx.fill();

  // глаз
  if (!blink) {
    ctx.save();
    ctx.shadowColor = '#ff5f76';
    ctx.shadowBlur = 5;
    ctx.fillStyle = angry ? '#ff304c' : '#e0485c';
    ctx.beginPath();
    ctx.ellipse(6.1, -16.2, 1.15, 1.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(6.3, -16.9, 0.7, 0.7);
  } else {
    ctx.strokeStyle = '#8a6a80';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(4.9, -16.2);
    ctx.lineTo(7.2, -16.2);
    ctx.stroke();
  }
  if (angry) {
    ctx.strokeStyle = '#d83a55';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(4.8, -18.1);
    ctx.lineTo(7.2, -17.4);
    ctx.stroke();
  }

  // усы
  ctx.strokeStyle = 'rgba(235,228,255,0.75)';
  ctx.lineWidth = 0.35;
  ctx.beginPath();
  ctx.moveTo(8.4, -14.6);
  ctx.lineTo(12.6, -16.2);
  ctx.moveTo(8.5, -14.2);
  ctx.lineTo(13.1, -13.8);
  ctx.stroke();

  // душа при расколдовывании
  if (vanish > 0) {
    ctx.globalAlpha = alpha * Math.sin(Math.min(1, vanish) * Math.PI) * 0.9;
    drawSoulFlame(ctx, 0.5, -34 - vanish * 8, 11, time, C.soul, true);
  }

  // искры
  ctx.globalAlpha = alpha * fade;
  const spark = (sx: number, sy: number, phase: number): void => {
    const a = 0.25 + Math.max(0, Math.sin(time * 2.4 + phase)) * 0.45;
    ctx.globalAlpha = alpha * fade * a;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(sx, sy, 1, 1);
    ctx.fillRect(sx - 1, sy + 1, 3, 0.8);
    ctx.fillRect(sx + 0.2, sy - 1, 0.8, 3);
  };
  spark(-8, -25, 0.4);
  spark(9, -30, 2.1);
  spark(1, -33, 4.2);

  ctx.restore();
}

/** Иконка души для HUD: маленькое пламя с глазами. */
export function drawSoulFlame(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  time: number,
  color: string,
  filled: boolean,
): void {
  ctx.save();
  ctx.translate(x, y);
  const s = size / 10;
  ctx.scale(s, s);
  const flick = Math.sin(time * 5 + x * 0.7) * 0.7;
  if (filled) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 5;
  }
  const grad = ctx.createLinearGradient(0, -11, 0, 2);
  grad.addColorStop(0, filled ? '#ffffff' : 'rgba(90,80,120,0.4)');
  grad.addColorStop(0.4, filled ? color : 'rgba(70,62,100,0.35)');
  grad.addColorStop(1, filled ? rgba(color, 0.62) : 'rgba(40,35,60,0.18)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, -11 + flick * 0.4);
  ctx.bezierCurveTo(5.5, -7, 5.5, -1.5, 0, 1.5);
  ctx.bezierCurveTo(-5.5, -1.5, -5.5, -7, 0, -11 + flick * 0.4);
  ctx.closePath();
  ctx.fill();
  if (filled) {
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-1.8, 0.2, 0.8, 0, Math.PI * 2);
    ctx.arc(1.8, 0.2, 0.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
