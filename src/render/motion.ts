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
  const phase = ((time + 1.8) % 17.3 + 17.3) % 17.3;
  const pulse = (t: number) => t < 0 || t > .19 ? 0 : t < .07 ? t / .07 : 1 - (t - .07) / .12;
  return Math.max(pulse(phase - 4.2), pulse(phase - 4.52) * .85, pulse(phase - 10.8), pulse(phase - 15.5));
}

export const ease = (value: number): number => { const t = Math.min(1, Math.max(0, value)); return t * t * (3 - 2 * t); };

/** One jump, with planted preparation and a damped landing, in art coordinates. */
export function jumpAt(time: number, height: number, preparation = .3, flight = .7): { lift: number; squash: number } {
  if (time < preparation) return { lift: 0, squash: Math.sin(Math.max(0, time) / preparation * Math.PI) };
  const air = (time - preparation) / flight;
  if (air < 1) return { lift: -4 * height * air * (1 - air), squash: 0 };
  const settle = time - preparation - flight;
  return { lift: 0, squash: settle < .55 ? Math.sin(settle / .55 * Math.PI) * Math.exp(-settle * 3) : 0 };
}

/** Framerate-independent secondary motion; a zero dt holds the pose while paused. */
export function follow(value: number, target: number, dt: number, responsiveness: number): number {
  return value + (target - value) * (1 - Math.exp(-Math.max(0, dt) * responsiveness));
}
