import { CAT_BASELINE, CAT_HEIGHT, CAT_WIDTH, type CatFrame, type CatState, type HitMask } from '../core/types';
import { blinkAt, footstep } from './motion';

const SCALE = 2;
const WALK_STRIDE = 9;
const INK = '#98715f';
const FUR = '#f8e6c9';
const FUR_LIGHT = '#fff8e9';
const FUR_SHADE = '#e8c7a3';
const COCOA = '#d5a17c';
const ROSE = '#eaa49d';

interface Pose {
  bx: number; by: number; bw: number; bh: number;
  hx: number; hy: number; headTilt: number;
  lift: number; tilt: number; tail: number;
  rearX: number; rearY: number; frontX: number; frontY: number;
  farRearX: number; farRearY: number; farFrontX: number; farFrontY: number;
  eyeClose: number; smile: number; ears: number; pawUp: number;
  curl: number; blush: number;
}

function mix(a: number, b: number, t: number): number { return a + (b - a) * t; }
function clamp(value: number, min = 0, max = 1): number { return Math.max(min, Math.min(max, value)); }
function smooth(value: number): number { const t = clamp(value); return t * t * (3 - 2 * t); }

function interpolate(a: Pose, b: Pose, t: number): Pose {
  const result = {} as Pose;
  for (const key of Object.keys(a) as (keyof Pose)[]) result[key] = mix(a[key], b[key], t);
  return result;
}

function poseFor(state: CatState, time: number, speed: number, walkPhase: number, elapsed: number): Pose {
  const breath = Math.sin(elapsed * 2.1);
  const blink = blinkAt(elapsed);
  const pose: Pose = {
    bx: 119, by: 169 - breath * .45, bw: 44, bh: 32 + breath * .45,
    hx: 146, hy: 135 - breath * .22, headTilt: Math.sin(elapsed * .7) * .017,
    lift: 0, tilt: 0, tail: Math.sin(elapsed * 1.3) * 4,
    rearX: 92, rearY: 198, frontX: 146, frontY: 199,
    farRearX: 110, farRearY: 197, farFrontX: 163, farFrontY: 197,
    eyeClose: blink, smile: .12, ears: Math.max(0, Math.sin(elapsed * .8)) ** 24 * .3, pawUp: 0,
    curl: 0, blush: .24,
  };

  switch (state) {
    case 'walk': {
      const motion = speed > .1 ? 1 : 0;
      const near = footstep(walkPhase, WALK_STRIDE, 6), far = footstep(walkPhase + Math.PI, WALK_STRIDE, 6);
      pose.by -= Math.sin(walkPhase * 2) ** 2 * .9 * motion;
      pose.hx = 147; pose.hy -= Math.sin(walkPhase * 2) ** 2 * .45 * motion;
      pose.rearX = 93 + far.x * motion; pose.rearY = 199 - far.lift * motion;
      pose.frontX = 148 + near.x * motion; pose.frontY = 199 - near.lift * motion;
      pose.farRearX = 107 + near.x * motion; pose.farRearY = 197 - near.lift * motion;
      pose.farFrontX = 164 + far.x * motion; pose.farFrontY = 197 - far.lift * motion;
      pose.tail = 4 + Math.sin(walkPhase * .5) * 4;
      break;
    }
    case 'sit':
      pose.bx = 127; pose.by = 167 - breath * .4; pose.bw = 37; pose.bh = 35 + breath * .4;
      pose.hx = 138; pose.hy = 130; pose.headTilt = -.035;
      pose.rearX = 98; pose.rearY = 198; pose.farRearX = 114; pose.farRearY = 198;
      pose.frontX = 136; pose.frontY = 200; pose.farFrontX = 157; pose.farFrontY = 199;
      pose.tail = -8 + Math.sin(time * 1.5) * 4;
      pose.ears = Math.pow(Math.max(0, Math.sin(time * 1.7)), 18) * .22;
      pose.smile = .2;
      break;
    case 'sleep':
      pose.bx = 132; pose.by = 178 - breath * .5; pose.bw = 57; pose.bh = 25 + breath * .5;
      pose.hx = 105; pose.hy = 169; pose.headTilt = -.11;
      pose.rearX = 160; pose.rearY = 190; pose.farRearX = 175; pose.farRearY = 190;
      pose.frontX = 104; pose.frontY = 194; pose.farFrontX = 119; pose.farFrontY = 192;
      pose.eyeClose = 1; pose.curl = 1; pose.tail = 0; pose.ears = .2;
      pose.lift = 0; pose.smile = 0;
      break;
    case 'stretch': {
      const wave = Math.sin(time * 2.1);
      pose.bx = 120; pose.by = 169; pose.bw = 59; pose.bh = 27;
      pose.hx = 176; pose.hy = 157 + wave * 2; pose.headTilt = -.1;
      pose.rearX = 73; pose.rearY = 198; pose.farRearX = 91; pose.farRearY = 199;
      pose.frontX = 196; pose.frontY = 202; pose.farFrontX = 179; pose.farFrontY = 202;
      pose.tail = 16 + wave * 3; pose.eyeClose = .94; pose.smile = .2;
      break;
    }
    case 'groom':
      pose.bx = 124; pose.by = 168; pose.bw = 41; pose.bh = 33;
      pose.hx = 139; pose.hy = 124; pose.headTilt = -.14 + Math.sin(time * 4) * .035;
      pose.rearX = 91; pose.rearY = 198; pose.farRearX = 108; pose.farRearY = 198;
      pose.frontX = 149; pose.frontY = 146 + Math.sin(time * 6) * 3;
      pose.farFrontX = 156; pose.farFrontY = 199;
      pose.eyeClose = 1; pose.pawUp = 1; pose.tail = -4; pose.smile = .75;
      break;
    case 'happy':
      pose.hx = 149 + Math.sin(Math.min(1, time / 1.8) * Math.PI) * 3;
      pose.hy = 132; pose.headTilt = -.06 + Math.sin(time * 3) * .025;
      pose.tail = 7 + Math.sin(time * 4) * 5;
      pose.eyeClose = 1; pose.smile = 1; pose.blush = .65;
      pose.ears = -.18;
      break;
    case 'eat':
      pose.bx = 111; pose.by = 170; pose.hx = 159;
      pose.hy = 159 + Math.sin(time * 8) * 3; pose.headTilt = .1;
      pose.rearX = 84; pose.frontX = 146; pose.farFrontX = 158;
      pose.eyeClose = .9; pose.smile = .8; pose.tail = -5;
      break;
    case 'play': {
      const hop = Math.abs(Math.sin(time * 5.5));
      pose.lift = -4 - hop * 17; pose.tilt = -.08 + Math.sin(time * 5.5) * .08;
      pose.hx = 159; pose.hy = 127; pose.headTilt = -.12;
      pose.frontX = 177; pose.frontY = 177; pose.farFrontX = 167; pose.farFrontY = 180;
      pose.rearX = 84; pose.rearY = 195; pose.farRearX = 99; pose.farRearY = 193;
      pose.tail = 25 + Math.sin(time * 8) * 8; pose.smile = 1;
      break;
    }
    case 'dragged':
      pose.bx = 122; pose.by = 155; pose.bw = 44; pose.bh = 36;
      pose.hx = 151; pose.hy = 130; pose.headTilt = .12 + Math.sin(time * 3) * .04;
      pose.lift = -29 + Math.sin(time * 3) * 2; pose.tilt = .08;
      pose.rearX = 91; pose.rearY = 208; pose.farRearX = 108; pose.farRearY = 211;
      pose.frontX = 151; pose.frontY = 210; pose.farFrontX = 167; pose.farFrontY = 212;
      pose.eyeClose = blink * .5; pose.ears = .25; pose.tail = -20; pose.smile = 0;
      break;
  }
  return pose;
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, angle = 0): void {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, angle, 0, Math.PI * 2);
}

function fillStroke(ctx: CanvasRenderingContext2D, fill: string | CanvasGradient, stroke = INK, width = 3): void {
  ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = width; ctx.strokeStyle = stroke; ctx.stroke();
}

function gradient(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): CanvasGradient {
  const g = ctx.createRadialGradient(x - radius * .35, y - radius * .5, 2, x, y, radius * 1.45);
  g.addColorStop(0, FUR_LIGHT); g.addColorStop(.65, FUR); g.addColorStop(1, FUR_SHADE);
  return g;
}

function limb(ctx: CanvasRenderingContext2D, sx: number, sy: number, ex: number, ey: number, far = false): void {
  const width = far ? 7 : 9;
  // One continuous paw/leg contour, with an open shoulder seam under the fur.
  ctx.beginPath(); ctx.moveTo(sx - width, sy - 5);
  ctx.bezierCurveTo(sx - width - 2, sy + 8, ex - width - 3, ey - 11, ex - width - 2, ey - 2);
  ctx.bezierCurveTo(ex - width - 3, ey + 8, ex + width + 5, ey + 9, ex + width + 3, ey - 1);
  ctx.bezierCurveTo(ex + width + 2, ey - 8, sx + width + 3, sy + 9, sx + width, sy - 5);
  ctx.fillStyle = far ? '#ead0ae' : gradient(ctx, ex, ey - 5, 24); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = far ? 1.8 : 2.2; ctx.lineCap = 'round'; ctx.stroke();
  ctx.strokeStyle = '#c4a084'; ctx.lineWidth = .9;
  for (const offset of [-2, 3]) {
    ctx.beginPath(); ctx.moveTo(ex + offset, ey + 3); ctx.quadraticCurveTo(ex + offset - .5, ey + 4, ex + offset, ey + 5); ctx.stroke();
  }
}

function tail(ctx: CanvasRenderingContext2D, p: Pose): void {
  const startX = p.bx - p.bw * .73, startY = p.by + 7;
  const curl = p.curl;
  const tipX = mix(52 + p.tail * .17, 127, curl);
  const tipY = mix(145 - p.tail * .4, 193, curl);
  // A hooked, tapering tail. The base lies underneath the haunch, the tip bends softly.
  ctx.beginPath(); ctx.moveTo(startX, startY + 8);
  ctx.bezierCurveTo(mix(38, 52, curl), mix(201, 211, curl), mix(22, 53, curl), mix(141 - p.tail * .6, 185, curl), mix(37, 85, curl), mix(135 - p.tail * .6, 187, curl));
  ctx.bezierCurveTo(mix(52, 100, curl), mix(125 - p.tail * .5, 187, curl), tipX + 9, tipY - 12, tipX + 4, tipY - 3);
  ctx.quadraticCurveTo(tipX, tipY + 3, tipX - 5, tipY - 2);
  ctx.bezierCurveTo(mix(37, 103, curl), mix(136 - p.tail * .5, 192, curl), mix(48, 73, curl), mix(177, 201, curl), startX + 6, startY - 8);
  ctx.closePath(); fillStroke(ctx, COCOA, INK, 2.3);
  ctx.save(); ctx.clip();
  ellipse(ctx, tipX + 1, tipY - 6, 10, 9, -.5); ctx.fillStyle = FUR_LIGHT; ctx.fill();
  ctx.restore();
}

function body(ctx: CanvasRenderingContext2D, p: Pose): void {
  ellipse(ctx, p.bx, p.by, p.bw, p.bh, p.tilt);
  fillStroke(ctx, gradient(ctx, p.bx, p.by, p.bw), INK, 3);

  ctx.save();
  ellipse(ctx, p.bx, p.by, p.bw - 2, p.bh - 2, p.tilt); ctx.clip();
  // Soft caramel markings follow the rounded body in every pose.
  ctx.fillStyle = COCOA;
  ctx.beginPath();
  ctx.moveTo(p.bx - p.bw * .65, p.by - p.bh * .43);
  ctx.bezierCurveTo(p.bx - 29, p.by - p.bh - 6, p.bx + 3, p.by - p.bh - 3, p.bx + 15, p.by - 11);
  ctx.bezierCurveTo(p.bx - 3, p.by - 19, p.bx - 18, p.by + 2, p.bx - p.bw * .65, p.by - p.bh * .43);
  ctx.fill();
  ellipse(ctx, p.bx - p.bw * .65, p.by + p.bh * .18, 13, 18, -.3);
  ctx.fillStyle = '#ecc49e'; ctx.fill();
  // Chest bib uses the body clip so it follows each pose smoothly.
  ellipse(ctx, p.bx + p.bw * .66, p.by + p.bh * .38, p.bw * .35, p.bh * .57, -.28);
  ctx.fillStyle = FUR_LIGHT; ctx.fill();
  ctx.restore();
}

function ear(ctx: CanvasRenderingContext2D, x: number, side: -1 | 1, droop: number): void {
  ctx.save(); ctx.translate(x, -27); ctx.rotate(side * (.09 + droop * .22));
  ctx.beginPath(); ctx.moveTo(-15, 7);
  ctx.bezierCurveTo(-17, -1, -15, -20, -10, -23);
  ctx.bezierCurveTo(-4, -26, 9, -10, 16, 7);
  ctx.closePath(); fillStroke(ctx, COCOA, INK, 2.4);
  ctx.beginPath(); ctx.moveTo(-9, 1); ctx.bezierCurveTo(-11, -6, -11, -15, -8, -16);
  ctx.quadraticCurveTo(0, -13, 7, 2); ctx.closePath();
  ctx.fillStyle = '#efc5b6'; ctx.fill(); ctx.restore();
}

function headShape(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath(); ctx.moveTo(-44, -10);
  ctx.bezierCurveTo(-46, -31, -26, -40, 0, -39);
  ctx.bezierCurveTo(26, -40, 46, -30, 44, -10);
  ctx.bezierCurveTo(53, 2, 53, 18, 39, 28);
  ctx.bezierCurveTo(21, 40, -20, 40, -38, 29);
  ctx.bezierCurveTo(-53, 21, -55, 5, -44, -10); ctx.closePath();
}

function head(ctx: CanvasRenderingContext2D, p: Pose, lookX: number, lookY: number): void {
  ctx.save(); ctx.translate(p.hx, p.hy); ctx.rotate(p.headTilt);
  ear(ctx, -28, -1, p.ears); ear(ctx, 28, 1, p.ears * .65);
  headShape(ctx);
  fillStroke(ctx, gradient(ctx, 0, -2, 49), INK, 2.4);

  ctx.save();
  headShape(ctx); ctx.clip();
  // A little asymmetrical caramel cap leaves plenty of cream around the eyes.
  ctx.fillStyle = COCOA;
  ctx.beginPath(); ctx.moveTo(-51, -45); ctx.lineTo(-5, -45);
  ctx.bezierCurveTo(-5, -31, -16, -15, -29, -17);
  ctx.quadraticCurveTo(-43, -17, -49, -4); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(12, -44); ctx.lineTo(50, -44); ctx.lineTo(49, -11);
  ctx.bezierCurveTo(31, -12, 21, -23, 12, -44); ctx.fill();
  ellipse(ctx, 0, 22, 31, 16); ctx.fillStyle = FUR_LIGHT; ctx.fill();
  ctx.restore();

  const eyeY = 5 + clamp(lookY, -1, 1) * 1.7;
  const eyeX = clamp(lookX, -1, 1) * 2;
  const closed = clamp(p.eyeClose);
  const eyeHeight = mix(7.6, .6, closed);
  const eyeSmile = smooth((p.smile - .65) / .35);
  for (const side of [-1, 1]) {
    const x = side * 20 + eyeX;
    ctx.save();
    ctx.globalAlpha = 1 - smooth((closed - .45) / .55);
    ellipse(ctx, x, eyeY, 6.1, eyeHeight); ctx.clip();
    const iris = ctx.createLinearGradient(x, eyeY - eyeHeight, x, eyeY + eyeHeight);
    iris.addColorStop(0, '#493c37'); iris.addColorStop(.6, '#604739'); iris.addColorStop(1, '#9d704c');
    ctx.fillStyle = iris; ctx.fillRect(x - 7, eyeY - eyeHeight, 14, eyeHeight * 2);
    ellipse(ctx, x - 2.1, eyeY - eyeHeight * .36, 1.65, 1.8 * (1 - closed));
    ctx.fillStyle = '#fffcf3'; ctx.fill();
    ellipse(ctx, x + 2.1, eyeY + eyeHeight * .48, .9, 1.05 * (1 - closed)); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#705244'; ctx.lineCap = 'round'; ctx.lineWidth = 2;
    ctx.globalAlpha = smooth(closed);
    ctx.beginPath(); ctx.moveTo(x - 6.3, eyeY + 1);
    ctx.quadraticCurveTo(x, eyeY + mix(5, -4.5, eyeSmile), x + 6.3, eyeY + 1); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  if (p.blush > .1) {
    ctx.globalAlpha = p.blush * .6;
    ellipse(ctx, -34, 15, 8.5, 4.5, .1); ctx.fillStyle = ROSE; ctx.fill();
    ellipse(ctx, 34, 15, 8.5, 4.5, -.1); ctx.fill();
    ctx.globalAlpha = 1;
  }
  // Small rosy nose and two relaxed muzzle curves; no permanent wide smile.
  ctx.beginPath(); ctx.moveTo(-2.7, 17); ctx.quadraticCurveTo(0, 15.5, 2.7, 17);
  ctx.quadraticCurveTo(2.4, 19.4, 0, 20); ctx.quadraticCurveTo(-2.4, 19.4, -2.7, 17);
  ctx.fillStyle = '#c88f86'; ctx.fill();
  ctx.strokeStyle = '#916c5a'; ctx.lineWidth = 1.25; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 20); ctx.lineTo(0, 21.8);
  ctx.quadraticCurveTo(-2.1, 24 + p.smile, -4.5, 22.8);
  ctx.moveTo(0, 21.8); ctx.quadraticCurveTo(2.1, 24 + p.smile, 4.5, 22.8); ctx.stroke();
  for (const side of [-1, 1]) {
    ctx.strokeStyle = '#b89377'; ctx.lineWidth = .95;
    for (const i of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(side * 36, 23 + i * 3);
      ctx.quadraticCurveTo(side * 45, 24 + i * 4, side * 51, 22 + i * 4); ctx.stroke();
    }
  }
  ctx.restore();
}

function drawCat(ctx: CanvasRenderingContext2D, p: Pose, frame: CatFrame): void {
  ctx.save();
  if (frame.direction === -1) { ctx.translate(CAT_WIDTH, 0); ctx.scale(-1, 1); }
  ctx.translate(0, p.lift);
  tail(ctx, p);
  limb(ctx, p.bx - p.bw * .49, p.by + 9, p.farRearX, p.farRearY, true);
  limb(ctx, p.bx + p.bw * .48, p.by + 11, p.farFrontX, p.farFrontY, true);
  body(ctx, p);
  limb(ctx, p.bx - p.bw * .53, p.by + p.bh * .36, p.rearX, p.rearY);
  limb(ctx,
    mix(p.bx + p.bw * .56, p.bx - 17, p.curl),
    mix(p.by + p.bh * .22, p.by + 9, p.curl),
    p.frontX, p.frontY,
  );
  head(ctx, p, frame.direction * frame.lookX, frame.lookY);
  if (p.pawUp > 0) {
    ctx.globalAlpha = p.pawUp;
    ellipse(ctx, p.frontX + 2, p.frontY, 10, 8, -.35);
    fillStroke(ctx, FUR_LIGHT, INK, 2.5);
    ctx.fillStyle = ROSE;
    ellipse(ctx, p.frontX + 2, p.frontY + 1, 3.7, 2.7); ctx.fill();
    for (const dx of [-5, 0, 5]) { ellipse(ctx, p.frontX + dx, p.frontY - 3.5, 1.55, 1.8); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function decorations(ctx: CanvasRenderingContext2D, frame: CatFrame): void {
  ctx.save();
  // The ground contact is deliberately omitted from the alpha hit canvas.
  const shadow = ctx.createRadialGradient(128, CAT_BASELINE + 1, 5, 128, CAT_BASELINE + 1, 71);
  shadow.addColorStop(0, 'rgba(101,70,49,.12)');
  shadow.addColorStop(1, 'rgba(101,70,49,0)');
  ctx.fillStyle = shadow; ellipse(ctx, 128, CAT_BASELINE + 1, 62, 3.5); ctx.fill();
  if (frame.direction === -1) { ctx.translate(CAT_WIDTH, 0); ctx.scale(-1, 1); }
  if (frame.state === 'happy') {
    const t = frame.time;
    for (let i = 0; i < 2; i++) {
      const x = 181 + i * 15 + Math.sin(t * 2 + i) * 3;
      const y = 77 - i * 18 - (t * 14 + i * 11) % 13;
      const size = 6 - i * .6;
      ctx.beginPath(); ctx.moveTo(x, y + size);
      ctx.bezierCurveTo(x - size * 1.6, y, x - size * .9, y - size, x, y - size * .35);
      ctx.bezierCurveTo(x + size * .9, y - size, x + size * 1.6, y, x, y + size);
      ctx.fillStyle = i === 1 ? '#eab0a4' : '#dc8e86'; ctx.fill();
    }
  }
  if (frame.state === 'eat') {
    ctx.beginPath(); ctx.ellipse(177, 202, 26, 6, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#a77b64'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(151, 190); ctx.lineTo(156, 202);
    ctx.quadraticCurveTo(177, 210, 198, 202); ctx.lineTo(203, 190); ctx.closePath();
    fillStroke(ctx, '#c9a589', INK, 2.5);
    ellipse(ctx, 177, 190, 26, 7); fillStroke(ctx, '#e7c4a0', INK, 2.5);
    ellipse(ctx, 177, 189, 19, 3.8); ctx.fillStyle = '#a46c51'; ctx.fill();
    for (const dx of [-8, 1, 10]) { ellipse(ctx, 177 + dx, 188, 2.4, 1.4); ctx.fillStyle = '#68483d'; ctx.fill(); }
  }
  if (frame.state === 'play') {
    const x = 207 + Math.sin(frame.time * 5.5) * 5;
    const y = 194 - Math.abs(Math.sin(frame.time * 5.5)) * 8;
    ellipse(ctx, x, y, 10, 10); fillStroke(ctx, '#d98d80', INK, 2.3);
    ctx.beginPath(); ctx.moveTo(x - 8, y - 6); ctx.quadraticCurveTo(x + 3, y + 1, x + 5, y + 9);
    ctx.strokeStyle = '#f7d5b5'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 4, y + 8); ctx.quadraticCurveTo(x - 17, y + 14, x - 20, y + 7);
    ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.stroke();
  }
  if (frame.state === 'sleep') {
    ctx.globalAlpha = .8;
    ctx.fillStyle = '#a88473'; ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillText('z', 54, 127 + Math.sin(frame.time * 1.7) * 3);
    ctx.font = 'bold 10px system-ui, sans-serif'; ctx.fillText('z', 43, 112);
  }
  ctx.restore();
}

/** Canvas art is 256×224 logical pixels; CSS may scale the element freely. */
export class CatRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly catCanvas: HTMLCanvasElement;
  private readonly visible: CanvasRenderingContext2D;
  private readonly cat: CanvasRenderingContext2D;
  private pixels: Uint8ClampedArray | null = null;
  private mask: HitMask = { width: 64, height: 56, cells: new Array(64 * 56).fill(0) };
  private state: CatState | null = null;
  private transitionFrom: Pose | null = null;
  private transitionStart = 0;
  private lastPose: Pose | null = null;
  private walkPhase = 0;
  private previousWalkTime: number | null = null;
  private elapsed = 0;
  private lastFrameTime: number | null = null;
  private hasDrawn = false;
  private maskDirty = false;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.canvas.width = CAT_WIDTH * SCALE;
    this.canvas.height = CAT_HEIGHT * SCALE;
    this.catCanvas = document.createElement('canvas');
    this.catCanvas.width = CAT_WIDTH * SCALE;
    this.catCanvas.height = CAT_HEIGHT * SCALE;
    const visible = canvas.getContext('2d');
    const cat = this.catCanvas.getContext('2d', { willReadFrequently: true });
    if (!visible || !cat) throw new Error('MadoNeko requires a 2D canvas context');
    this.visible = visible;
    this.cat = cat;
  }

  draw(frame: CatFrame): void {
    if (this.disposed) return;
    const speed = Number.isFinite(frame.speed) ? Math.max(0, frame.speed) : 0;
    if (this.state === frame.state && this.lastFrameTime !== null) this.elapsed += Math.min(.25, Math.max(0, frame.time - this.lastFrameTime));
    this.lastFrameTime = frame.time;
    if (frame.state !== this.state) {
      this.transitionFrom = this.lastPose;
      this.transitionStart = frame.time;
      this.state = frame.state;
      this.previousWalkTime = null;
    }
    if (frame.state === 'walk') {
      const time = Number.isFinite(frame.time) ? Math.max(0, frame.time) : 0;
      const dt = this.previousWalkTime === null ? 0 : Math.min(.25, Math.max(0, time - this.previousWalkTime));
      // speed is art pixels/second. A paw spans twice the stride in each half cycle.
      this.walkPhase = (this.walkPhase + speed * dt * Math.PI / (2 * WALK_STRIDE)) % (Math.PI * 2);
      this.previousWalkTime = time;
    }
    const target = poseFor(frame.state, frame.time, speed, this.walkPhase, this.elapsed);
    const progress = smooth((frame.time - this.transitionStart) / .22);
    const pose = this.transitionFrom ? interpolate(this.transitionFrom, target, progress) : target;
    if (progress >= 1) this.transitionFrom = null;
    this.lastPose = pose;

    this.cat.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    this.cat.clearRect(0, 0, CAT_WIDTH, CAT_HEIGHT);
    drawCat(this.cat, pose, frame);
    this.hasDrawn = true;
    this.pixels = null;
    this.maskDirty = true;

    this.visible.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    this.visible.clearRect(0, 0, CAT_WIDTH, CAT_HEIGHT);
    decorations(this.visible, frame);
    this.visible.setTransform(1, 0, 0, 1, 0, 0);
    this.visible.drawImage(this.catCanvas, 0, 0);
  }

  hitTest(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= CAT_WIDTH || y >= CAT_HEIGHT) return false;
    const pixels = this.ensurePixels();
    if (!pixels) return false;
    const px = Math.floor(x * SCALE), py = Math.floor(y * SCALE);
    return (pixels[(py * this.catCanvas.width + px) * 4 + 3] ?? 0) > 48;
  }

  hitMask(): HitMask {
    if (this.maskDirty) {
      this.ensurePixels();
      this.rebuildMask();
      this.maskDirty = false;
    }
    return { width: this.mask.width, height: this.mask.height, cells: this.mask.cells.slice() };
  }

  dispose(): void {
    this.disposed = true;
    this.pixels = null;
    this.lastPose = null;
    this.transitionFrom = null;
    this.previousWalkTime = null;
    this.hasDrawn = false;
    this.maskDirty = false;
    this.catCanvas.width = 0;
    this.catCanvas.height = 0;
  }

  private ensurePixels(): Uint8ClampedArray | null {
    if (!this.hasDrawn || this.disposed) return null;
    if (!this.pixels) {
      this.pixels = this.cat.getImageData(0, 0, this.catCanvas.width, this.catCanvas.height).data;
    }
    return this.pixels;
  }

  private rebuildMask(): void {
    const pixels = this.pixels;
    if (!pixels) return;
    const cells = this.mask.cells;
    const stride = this.catCanvas.width;
    // Each cell represents 4×4 art pixels. Require real opaque pixels, not antialias fringe.
    for (let row = 0; row < 56; row++) {
      for (let col = 0; col < 64; col++) {
        let solid = 0;
        for (let py = 0; py < 8; py++) {
          const offset = ((row * 8 + py) * stride + col * 8) * 4 + 3;
          for (let px = 0; px < 8; px++) if ((pixels[offset + px * 4] ?? 0) > 80) solid++;
        }
        cells[row * 64 + col] = solid >= 3 ? 1 : 0;
      }
    }
  }
}
