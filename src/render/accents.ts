// Shared warm accents keep both companions in the same visual family.
export function drawHearts(ctx: CanvasRenderingContext2D, time: number, x = 181, y = 77): void {
  ctx.save();
  for (let i = 0; i < 2; i++) {
    const px = x + i * 15 + Math.sin(time * 2 + i) * 3;
    const py = y - i * 18 - (time * 14 + i * 11) % 13;
    const size = 6 - i * .6;
    ctx.beginPath(); ctx.moveTo(px, py + size);
    ctx.bezierCurveTo(px - size * 1.6, py, px - size * .9, py - size, px, py - size * .35);
    ctx.bezierCurveTo(px + size * .9, py - size, px + size * 1.6, py, px, py + size);
    ctx.fillStyle = i === 1 ? '#eab0a4' : '#dc8e86'; ctx.fill();
  }
  ctx.restore();
}

export function drawGround(ctx: CanvasRenderingContext2D, y: number, width: number): void {
  ctx.save();
  const shadow = ctx.createRadialGradient(128, y, 5, 128, y, width + 9);
  shadow.addColorStop(0, 'rgba(101,70,49,.12)');
  shadow.addColorStop(1, 'rgba(101,70,49,0)');
  ctx.fillStyle = shadow;
  ctx.beginPath(); ctx.ellipse(128, y, width, 3.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
