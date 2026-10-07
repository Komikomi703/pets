import { describe, expect, it } from 'vitest';
import {
  chooseMonitor, clampDt, clampToWorkArea, logicalPointToPhysical,
  physicalPointToLogical, recoverPosition,
} from '../src/core/geometry';

describe('desktop coordinates', () => {
  it.each([1, 1.5, 2])('round trips a point on a negative-origin monitor at %s scale', (scale) => {
    const origin = { x: -1920, y: -240 };
    const logical = { x: 123.5, y: 76.25 };
    const physical = logicalPointToPhysical(logical, origin, scale);
    expect(physicalPointToLogical(physical, origin, scale)).toEqual(logical);
  });

  it('clamps a window to a work area with negative global coordinates', () => {
    const area = { x: -1920, y: -80, width: 1920, height: 1000 };
    expect(clampToWorkArea({ x: -2500, y: 999 }, { x: 300, y: 200 }, area))
      .toEqual({ x: -1920, y: 720 });
  });

  it('recovers a disconnected monitor by selecting the nearest connected work area', () => {
    const monitors = [
      { id: 'left', scale: 1.5, workArea: { x: -1920, y: 0, width: 1920, height: 1000 } },
      { id: 'right', scale: 2, workArea: { x: 0, y: 0, width: 2560, height: 1400 } },
    ];
    const saved = { x: 3200, y: 180, monitor: 'disconnected' };
    expect(chooseMonitor(saved, monitors)?.id).toBe('right');
    expect(recoverPosition(saved, { x: 300, y: 200 }, monitors))
      .toEqual({ x: 2260, y: 180, monitor: 'right' });
    expect(recoverPosition(saved, { x: 300, y: 200 }, [])).toBeNull();
  });

  it('keeps a dragged cat on the destination monitor in mixed-DPI coordinates', () => {
    const monitors = [
      { id: 'left', scale: 1.5, workArea: { x: -1920, y: -100, width: 1920, height: 1080 } },
      { id: 'right', scale: 2, workArea: { x: 0, y: 0, width: 2560, height: 1400 } },
    ];
    const destination = { x: 160, y: 280, monitor: 'right' };
    expect(chooseMonitor(destination, monitors)?.id).toBe('right');
    expect(physicalPointToLogical(destination, { x: 0, y: 0 }, 2)).toEqual({ x: 80, y: 140 });
    expect(recoverPosition(destination, { x: 512, y: 448 }, monitors)).toEqual(destination);
    expect(recoverPosition({ ...destination, x: 2500 }, { x: 512, y: 448 }, monitors))
      .toEqual({ x: 2048, y: 280, monitor: 'right' });
  });

  it('anchors an oversized window and repairs a corrupt physical position', () => {
    const monitor = { id: 'left', scale: 1.5, workArea: { x: -1920, y: -80, width: 300, height: 200 } };
    expect(recoverPosition({ x: Number.POSITIVE_INFINITY, y: Number.NaN, monitor: 'left' },
      { x: 450, y: 300 }, [monitor])).toEqual({ x: -1920, y: -80, monitor: 'left' });
  });

  it('limits elapsed time after a suspended or invalid frame', () => {
    expect(clampDt(3600)).toBe(0.1);
    expect(clampDt(Number.NaN)).toBe(0);
    expect(clampDt(-4)).toBe(0);
  });
});
