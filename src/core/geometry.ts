import type { Point, Rect, SavedPosition } from './types';

/** A display and its work area use global physical desktop pixels. */
export interface Monitor {
  id: string;
  workArea: Rect;
  scale: number;
}

const safeScale = (scale: number): number => Number.isFinite(scale) && scale > 0 ? scale : 1;
const finite = (value: number, fallback = 0): number => Number.isFinite(value) ? value : fallback;

export function clampDt(dtSeconds: number, maximum = 0.1): number {
  return Math.min(Math.max(finite(dtSeconds), 0), Math.max(finite(maximum, 0.1), 0));
}

export function physicalToLogical(value: number, scale: number): number {
  return finite(value) / safeScale(scale);
}

export function logicalToPhysical(value: number, scale: number): number {
  return finite(value) * safeScale(scale);
}

/** Translate a global physical point into a display's local logical coordinates. */
export function physicalPointToLogical(point: Point, origin: Point, scale: number): Point {
  return {
    x: physicalToLogical(finite(point.x) - finite(origin.x), scale),
    y: physicalToLogical(finite(point.y) - finite(origin.y), scale),
  };
}

export function logicalPointToPhysical(point: Point, origin: Point, scale: number): Point {
  return {
    x: finite(origin.x) + logicalToPhysical(point.x, scale),
    y: finite(origin.y) + logicalToPhysical(point.y, scale),
  };
}

/** Clamp a physical window origin; oversized windows are anchored at the work area's origin. */
export function clampToWorkArea(position: Point, windowSize: Point, workArea: Rect): Point {
  const left = finite(workArea.x);
  const top = finite(workArea.y);
  const right = left + Math.max(finite(workArea.width), 0) - Math.max(finite(windowSize.x), 0);
  const bottom = top + Math.max(finite(workArea.height), 0) - Math.max(finite(windowSize.y), 0);
  return {
    x: Math.min(Math.max(finite(position.x, left), left), Math.max(left, right)),
    y: Math.min(Math.max(finite(position.y, top), top), Math.max(top, bottom)),
  };
}

function squaredDistanceToRect(point: Point, rect: Rect): number {
  const x = Math.min(Math.max(point.x, rect.x), rect.x + Math.max(rect.width, 0));
  const y = Math.min(Math.max(point.y, rect.y), rect.y + Math.max(rect.height, 0));
  return (point.x - x) ** 2 + (point.y - y) ** 2;
}

/** Prefer the saved monitor when connected; otherwise use the nearest work area. */
export function chooseMonitor(position: SavedPosition | Point | null, monitors: readonly Monitor[]): Monitor | null {
  if (monitors.length === 0) return null;
  if (position && 'monitor' in position && position.monitor) {
    const connected = monitors.find((monitor) => monitor.id === position.monitor);
    if (connected) return connected;
  }
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return monitors[0] ?? null;
  const center = { x: position.x, y: position.y };
  return monitors.reduce((nearest, monitor) =>
    squaredDistanceToRect(center, monitor.workArea) < squaredDistanceToRect(center, nearest.workArea)
      ? monitor : nearest, monitors[0]!);
}

/** Restore a saved physical origin after a monitor or DPI change. */
export function recoverPosition(
  saved: SavedPosition | null,
  windowSize: Point,
  monitors: readonly Monitor[],
): SavedPosition | null {
  const monitor = chooseMonitor(saved, monitors);
  if (!monitor) return null;
  const initial = saved ?? {
    x: monitor.workArea.x + (monitor.workArea.width - windowSize.x) / 2,
    y: monitor.workArea.y + (monitor.workArea.height - windowSize.y) / 2,
  };
  return { ...clampToWorkArea(initial, windowSize, monitor.workArea), monitor: monitor.id };
}
