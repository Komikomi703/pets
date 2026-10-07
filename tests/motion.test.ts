import { describe, expect, it } from 'vitest';
import { footstep, blinkAt } from '../src/render/motion';

describe('ground contact at desktop walking speeds', () => {
  for (const stride of [5.5, 9]) for (const speed of [8, 42, 94]) {
    it(`keeps the planted foot still in world coordinates (stride ${stride}, speed ${speed})`, () => {
      const time = .015, phase = .2;
      const first = footstep(phase, stride, 6);
      const next = footstep(phase + speed * time * Math.PI / (2 * stride), stride, 6);
      expect(first.lift).toBe(0); expect(next.lift).toBe(0);
      expect(next.x + speed * time).toBeCloseTo(first.x, 8);
    });
  }
  it('never lifts both feet and joins the planted/swinging paths continuously', () => {
    for (let phase = 0; phase < Math.PI * 2; phase += .02) {
      const a = footstep(phase, 9, 6), b = footstep(phase + Math.PI, 9, 6);
      expect(Math.min(a.lift, b.lift)).toBe(0);
      expect(a.lift).toBeGreaterThanOrEqual(0);
    }
    for (const phase of [Math.PI, Math.PI * 2]) {
      const a = footstep(phase - 1e-7, 9, 6), b = footstep(phase + 1e-7, 9, 6);
      expect(Math.abs(a.x - b.x)).toBeLessThan(.00001);
      expect(Math.abs(a.lift - b.lift)).toBeLessThan(.00001);
    }
  });
  it('leaves the eyes fully open for over 90 percent of quiet time', () => {
    const frames = Array.from({ length: 1800 }, (_, i) => blinkAt(i / 30));
    expect(frames.filter(x => x === 0).length / frames.length).toBeGreaterThan(.9);
    expect(Math.max(...frames)).toBeGreaterThan(.9);
  });
});
