import type { HitMask, PetFrame } from '../core/types';
import { blinkAt, ease, footstep } from './motion';
import { drawGround, drawHearts } from './accents';

let atlas: HTMLImageElement | null = null;
let loading: Promise<void> | null = null;
export function loadGugugaga(): Promise<void> {
  return loading ??= new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => { atlas = image; resolve(); };
    image.onerror = () => { loading = null; reject(new Error('ググガガの画像を読み込めませんでした。')); };
    image.src = '/characters/gugugaga/parts-v3.png';
  });
}
// Tight alpha bounds, not equal grid cells: the generated atlas has uneven spacing.
const parts = {
  head: [4, 160, 541, 449], body: [536, 186, 468, 435],
  leftWing: [117, 731, 276, 332], rightWing: [633, 730, 270, 332],
  leftFoot: [133, 1275, 220, 148], rightFoot: [669, 1274, 220, 149],
} as const;
function part(c: CanvasRenderingContext2D, name: keyof typeof parts, x: number, y: number, width: number, height: number) {
  const [sx, sy, sw, sh] = parts[name];
  c.save(); c.translate(x, y); c.scale(width / sw, height / sh);
  if (name === 'head') {
    // Exclude the neighbouring torso's shoulder at the right edge of the crop.
    c.beginPath(); c.moveTo(0, 0); c.lineTo(525, 0); c.lineTo(525, 266);
    c.lineTo(541, 290); c.lineTo(541, 449); c.lineTo(0, 449); c.closePath(); c.clip();
  }
  if (name === 'body') {
    // Remove baked shoulder stubs: the independently animated flippers replace them.
    c.beginPath(); c.moveTo(89, 0); c.lineTo(367, 0); c.lineTo(370, 74);
    c.bezierCurveTo(410, 109, 439, 210, 438, 309);
    c.bezierCurveTo(434, 420, 369, 435, 236, 435);
    c.bezierCurveTo(91, 435, 22, 408, 22, 306);
    c.bezierCurveTo(19, 205, 44, 112, 89, 74); c.closePath(); c.clip();
  }
  if (atlas) c.drawImage(atlas, sx, sy, sw, sh, 0, 0, sw, sh);
  c.restore();
}
function oval(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string) {
  c.beginPath(); c.ellipse(x, y, rx, Math.max(.1, ry), 0, 0, Math.PI * 2); c.fillStyle = color; c.fill();
}
const STRIDE = 5.5;
interface Pose {
  lift: number; tilt: number; head: number; breath: number;
  left: number; right: number; leftX: number; rightX: number; leftFoot: number; rightFoot: number;
  squat: number; closed: number; smile: number; pout: number; lean: number; yawn: number;
}
function pose(frame: PetFrame, phase: number, elapsed: number): Pose {
  const t = frame.time, state = frame.state;
  const p: Pose = { lift: 0, tilt: 0, head: Math.sin(elapsed * .65) * .014, breath: Math.sin(elapsed * 2) * .65,
    left: .04, right: -.04, leftX: 0, rightX: 0, leftFoot: 0, rightFoot: 0,
    squat: 0, closed: blinkAt(elapsed), smile: 0, pout: 0, lean: 0, yawn: 0 };
  if (state === 'observe') { p.head = Math.sin(t * 2.1) * .16; p.lean = Math.sin(t * 2.1) * 3; }
  if (state === 'yawn') {
    p.yawn = Math.sin(Math.min(1, t / 2.4) * Math.PI) ** 2;
    p.closed = p.yawn; p.head = -p.yawn * .1; p.left = -.9 * p.yawn; p.squat = p.yawn * 3;
  }
  if (state === 'sniff') { p.head = .12 + Math.sin(t * 9) * .035; p.lean = 5; p.squat = 5; p.left = -.2; p.right = .2; }
  if (state === 'wave') { p.right = -1.35 + Math.sin(t * 8) * .28; p.head = -.1; p.smile = .85; p.closed = .9; }
  if (state === 'hop') {
    const flight = Math.min(1, Math.max(0, (t - .3) / .7));
    p.lift = -Math.sin(flight * Math.PI) * 22;
    p.squat = (t < .3 ? Math.sin(t / .3 * Math.PI) : Math.sin(Math.min(1, Math.max(0, (t - 1) / .6)) * Math.PI)) * 6;
    p.left = .6; p.right = -.6; p.smile = .85;
  }
  if (state === 'idle') p.head += Math.sin(Math.min(1, t / 1.5) * Math.PI) * .075;
  if (state === 'walk' || state === 'play') {
    const moving = frame.speed > .1 ? 1 : 0;
    const left = footstep(phase, STRIDE, 4.2), right = footstep(phase + Math.PI, STRIDE, 4.2);
    p.leftX = left.x * moving * frame.direction; p.rightX = right.x * moving * frame.direction;
    p.leftFoot = left.lift * moving; p.rightFoot = right.lift * moving;
    p.tilt = Math.cos(phase) * .042 * moving;
    p.breath = -(Math.sin(phase * 2) ** 2) * 1.1 * moving;
    // Flippers follow the weight shift with a small delay.
    p.left += Math.cos(phase - .5) * .12 * moving; p.right += Math.cos(phase - .5) * .12 * moving;
    p.head = -p.tilt * .5; p.lean = frame.direction * 1.4;
    if (state === 'play') { p.left += .35; p.right -= .35; p.smile = .8; }
  }
  if (state === 'sit' || state === 'sleep') { p.squat = 8; p.left = -.16; p.right = .16; }
  if (state === 'sleep') { p.closed = 1; p.head = .12; p.breath = Math.sin(elapsed * 1.5) * .8; p.lean = -2; }
  if (state === 'wake') { p.closed = 1 - ease(t / .65); p.squat = 8 * (1 - ease(t / .8)); p.left = .25; p.right = -.25; }
  if (state === 'happy') {
    const hop = (t - .18) / .5;
    p.squat = t < .18 ? Math.sin(t / .18 * Math.PI) * 4 : t < .68 ? 0 : Math.sin(Math.min(1, (t - .68) / .32) * Math.PI) * 3;
    p.lift = hop > 0 && hop < 1 ? -4 * hop * (1 - hop) * 7 : 0;
    const flutter = t < .95 ? 1 : Math.max(0, 1 - (t - .95) * 1.6);
    p.left = .65 + Math.sin(t * 19) * .22 * flutter; p.right = -p.left;
    p.closed = 1; p.smile = 1; p.head = -.06; p.lean = frame.lookX * 2;
  }
  if (state === 'sulk') { p.pout = 1; p.head = -.11; p.lean = -3; p.left = -.23; p.right = .23; p.closed = .35; p.squat = 2; }
  if (state === 'eat') { p.left = -.85; p.right = .85; p.head = Math.sin(t * 7) * .018; p.closed = .2; p.smile = .35 + Math.sin(t * 9) * .25; }
  if (state === 'dragged') { p.lift = -12; p.left = .4 + Math.sin(t * 6) * .12; p.right = -.4; p.leftFoot = Math.sin(t * 6) * 2; p.rightFoot = -p.leftFoot; p.head = -.06; }
  if (state === 'land') { p.squat = Math.sin(Math.min(1, t / .4) * Math.PI) * 6; p.left = .2; p.right = -.2; }
  if (state === 'stumble') { const trip = Math.sin(Math.min(1, t / .65) * Math.PI); p.tilt = trip * .16; p.head = -trip * .1; p.left = .5; p.right = -.7; p.leftFoot = trip * 4; p.closed = t < .35 ? .7 : 0; }
  if (state === 'stretch') { p.left = .85; p.right = -.85; p.closed = .9; p.breath = -2; }
  if (state === 'groom') { p.left = -1.8; p.right = -.1; p.head = -.09; p.closed = .4; }
  return p;
}
function face(c: CanvasRenderingContext2D, p: Pose, frame: PetFrame) {
  const glance = p.pout ? -1.5 : frame.lookX * 1.4;
  const y = 20.8 + frame.lookY * .6;
  for (const side of [-1, 1]) {
    const x = side * 18.5;
    const close = ease(p.closed);
    c.save();
    if (close < .98) {
      // A nearly level upper eyelid and a rounded lower lid give the reference's quiet gaze.
      const top = y - 5.7 + close * 6.8, bottom = y + 7.4 - close * 5;
      c.beginPath(); c.moveTo(x - 8.1, top + .6); c.quadraticCurveTo(x, top - .9, x + 8.1, top + .4);
      c.bezierCurveTo(x + 8.5, bottom + 1.8, x - 7.9, bottom + 2.3, x - 8.1, top + .6); c.closePath(); c.clip();
      c.fillStyle = '#fff7ec'; c.fillRect(x - 10, y - 9, 20, 19);
      const g = c.createLinearGradient(0, y - 6, 0, y + 8);
      g.addColorStop(0, '#3e5662'); g.addColorStop(1, '#8ebbc4');
      oval(c, x + glance, y + 1.2, 6.4, 8, '#5894b3'); c.fillStyle = g; c.fill();
      oval(c, x + glance, y + .3, 2.45, 5, '#29455b');
      oval(c, x + glance - 2.2, y - 2.7, 1.75, 1.6, '#fff9ed');
    }
    c.restore(); c.strokeStyle = '#493c37'; c.lineCap = 'round'; c.lineWidth = 2; c.beginPath();
    if (close > .9) { c.moveTo(x - 6.5, y + 2); c.quadraticCurveTo(x, y + (p.smile > .6 ? -3.8 : 5.4), x + 6.5, y + 2); }
    else { c.moveTo(x - 8.4, y - 5 + close * 6.8); c.quadraticCurveTo(x, y - 6.6 + close * 6.8, x + 8, y - 5.3 + close * 6.8); }
    c.stroke();
    oval(c, side * 26, 29.5, p.pout ? 5.5 : 4.5, p.pout ? 2.5 : 1.65, '#eaaea266');
  }
  c.save(); c.translate(0, 4);
  c.strokeStyle = '#885950'; c.lineWidth = 1.2; c.lineCap = 'round'; c.beginPath();
  if (p.yawn > .05) { oval(c, 0, 29, 2 + p.yawn * 2, 1 + p.yawn * 5, '#814b4b'); }
  else if (p.pout) { c.moveTo(-2.5, 28.5); c.quadraticCurveTo(0, 26.5, 2.5, 28.5); c.stroke(); }
  else if (p.smile > .6) {
    c.moveTo(-5, 27); c.quadraticCurveTo(0, 25.5, 5, 27); c.bezierCurveTo(5, 36, -5, 36, -5, 27);
    c.fillStyle = '#814b4b'; c.fill(); c.stroke(); oval(c, 0, 31.1, 2.5, 1.45, '#efa59b');
  } else {
    // Tiny open mouth, distinct from the yellow beak on the hood.
    oval(c, 0, 28.3, 1.9, 1.3 + p.smile, '#94605b');
  }
  c.restore();
}
function figure(c: CanvasRenderingContext2D, p: Pose, frame: PetFrame) {
  c.save(); c.translate(128, 206 + p.lift);
  part(c, 'leftFoot', -33 + p.leftX, -13 - p.leftFoot, 26, 13);
  part(c, 'rightFoot', 8 + p.rightX, -13 - p.rightFoot, 26, 13);
  c.translate(p.lean, -9); c.rotate(p.tilt);
  const top = -83 + p.squat + p.breath;
  const wing = (left: boolean) => {
    c.save(); c.translate(left ? -41 : 41, top + 14); c.rotate(left ? p.left : p.right);
    part(c, left ? 'leftWing' : 'rightWing', left ? -17 : -5, -4, 22, 33); c.restore();
  };
  if (frame.state !== 'eat' && frame.state !== 'groom') { wing(true); wing(false); }
  part(c, 'body', -59, top, 118, 84 - p.squat - p.breath);
  c.save(); c.translate(0, -110 + p.squat + p.breath * .45); c.rotate(p.head);
  part(c, 'head', -58, -43, 116, 90); face(c, p, frame); c.restore();
  if (frame.state === 'eat') {
    oval(c, 0, -36, 10, 9, '#f3cf8c'); oval(c, -3, -38, 1.5, 1.5, '#b98859'); oval(c, 4, -33, 1.2, 1.2, '#b98859');
  }
  if (frame.state === 'eat' || frame.state === 'groom') { wing(true); wing(false); }
  c.restore();
}
function effects(c: CanvasRenderingContext2D, frame: PetFrame) {
  drawGround(c, 209, 43);
  if (frame.state === 'happy') drawHearts(c, frame.time, 185, 77);
  if (frame.state === 'play') {
    const x = 128 + frame.direction * (66 + Math.sin(frame.time * 3) * 10), y = 120 + Math.sin(frame.time * 4) * 12;
    oval(c, x - 4, y, 4 + Math.sin(frame.time * 18) * 2, 6, '#bda4da'); oval(c, x + 4, y, 4 + Math.sin(frame.time * 18) * 2, 6, '#f0bec8'); oval(c, x, y + 1, 1.2, 4, '#776881');
  }
  if (frame.state === 'sleep' || (frame.state === 'stumble' && frame.time > .5)) {
    c.font = 'bold 13px system-ui'; c.fillStyle = '#a88473'; c.fillText(frame.state === 'sleep' ? 'z z' : '？', 190, 81 + Math.sin(frame.time * 2) * 2);
  }
  if (frame.speech) {
    c.fillStyle = '#fff9ed'; c.strokeStyle = '#dfcdb9'; c.lineWidth = 1;
    c.beginPath(); c.roundRect(79, 10, 99, 25, 10); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(124, 35); c.lineTo(131, 40); c.lineTo(134, 35); c.fill();
    c.fillStyle = '#625463'; c.font = '11px "Meiryo",sans-serif'; c.textAlign = 'center'; c.fillText(frame.speech, 129, 27); c.textAlign = 'start';
  }
}
/** 256×224 art coordinates; the native window applies character-specific scale. */
export class GugugagaRenderer {
  private layer = document.createElement('canvas');
  private c: CanvasRenderingContext2D;
  private visible: CanvasRenderingContext2D;
  private pixels: Uint8ClampedArray | null = null;
  private previous: PetFrame | null = null;
  private phase = 0;
  private elapsed = 0;
  private transitionStart = 0;
  private current: Pose | null = null;
  private from: Pose | null = null;
  private disposed = false;
  constructor(canvas: HTMLCanvasElement) {
    canvas.width = this.layer.width = 512; canvas.height = this.layer.height = 448;
    this.c = this.layer.getContext('2d', { willReadFrequently: true })!; this.visible = canvas.getContext('2d')!;
  }
  draw(frame: PetFrame): void {
    if (this.disposed || !atlas) return;
    const changed = this.previous?.state !== frame.state;
    const dt = changed ? 0 : Math.max(0, Math.min(.25, frame.time - (this.previous?.time ?? frame.time)));
    this.elapsed += dt;
    if (frame.state === 'walk' || frame.state === 'play') this.phase += Math.max(0, frame.speed) * dt * Math.PI / (2 * STRIDE);
    if (changed) { this.from = this.current; this.transitionStart = frame.time; }
    const target = pose(frame, this.phase, this.elapsed), amount = ease((frame.time - this.transitionStart) / .2);
    const current = { ...target };
    if (this.from && amount < 1) for (const key of Object.keys(target) as (keyof Pose)[]) current[key] = this.from[key] + (target[key] - this.from[key]) * amount;
    this.current = current; this.previous = { ...frame }; this.pixels = null;
    this.c.setTransform(2, 0, 0, 2, 0, 0); this.c.clearRect(0, 0, 256, 224); figure(this.c, current, frame);
    this.visible.setTransform(2, 0, 0, 2, 0, 0); this.visible.clearRect(0, 0, 256, 224);
    effects(this.visible, frame); this.visible.setTransform(1, 0, 0, 1, 0, 0); this.visible.save(); this.visible.shadowColor = '#e3c9ae57'; this.visible.shadowBlur = 1.5; this.visible.drawImage(this.layer, 0, 0); this.visible.restore();
  }
  private alpha() { return this.pixels ??= this.c.getImageData(0, 0, 512, 448).data; }
  hitTest(x: number, y: number): boolean {
    if (this.disposed || x < 0 || y < 0 || x >= 256 || y >= 224) return false;
    return (this.alpha()[(Math.floor(y * 2) * 512 + Math.floor(x * 2)) * 4 + 3] ?? 0) > 160;
  }
  hitMask(): HitMask {
    const cells = new Array<number>(64 * 56).fill(0);
    if (!this.disposed) {
      const pixels = this.alpha();
      for (let y = 0; y < 56; y++) for (let x = 0; x < 64; x++) {
        let count = 0;
        for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) if (pixels[((y * 8 + j) * 512 + x * 8 + i) * 4 + 3]! > 160) count++;
        cells[y * 64 + x] = count >= 3 ? 1 : 0;
      }
    }
    return { width: 64, height: 56, cells };
  }
  dispose(): void { this.disposed = true; this.layer.width = this.layer.height = 0; this.pixels = null; this.current = this.from = null; this.previous = null; }
}
