/** A planted foot moves backwards at the same speed as the window moves forwards. */
export function footstep(phase: number, stride: number, height: number): { x: number; lift: number } {
  const cycle = ((phase / (Math.PI * 2)) % 1 + 1) % 1;
  if (cycle < .5) return { x: stride * (1 - cycle * 4), lift: 0 };
  const swing = (cycle - .5) * 2;
  const eased = swing * swing * (3 - 2 * swing);
  return { x: stride * (eased * 2 - 1), lift: Math.sin(swing * Math.PI) * height };
}

/** Long open intervals, a quick close, then a slightly slower opening. */
export function blinkAt(time: number): number {
  const phase = ((time + 1.8) % 6.7 + 6.7) % 6.7;
  const pulse = (t: number) => t < 0 || t > .19 ? 0 : t < .07 ? t / .07 : 1 - (t - .07) / .12;
  return Math.max(pulse(phase), pulse(phase - .32) * .85);
}

export const ease = (value: number): number => { const t = Math.min(1, Math.max(0, value)); return t * t * (3 - 2 * t); };
