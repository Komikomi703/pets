import { describe, expect, it } from 'vitest';
import { CatBehavior } from '../src/core/behavior';
import { DEFAULT_NEEDS, DEFAULT_SETTINGS, type BehaviorContext } from '../src/core/types';

function context(overrides: Partial<BehaviorContext> = {}): BehaviorContext {
  return {
    settings: { ...DEFAULT_SETTINGS }, needs: { ...DEFAULT_NEEDS },
    desktop: {
      x: 600, y: 700, width: 256, height: 224, scale: 1,
      workArea: { x: 0, y: 0, width: 1920, height: 1080 },
      cursor: { x: 900, y: 750 }, dragging: false, pressed: false,
    },
    visible: true, ...overrides,
  };
}

function advance(cat: CatBehavior, seconds: number, ctx: BehaviorContext): void {
  for (let elapsed = 0; elapsed < seconds; elapsed += 0.1) cat.step(0.1, ctx);
}

describe('cat behavior', () => {
  it('queues a request through waking and holds minimum stretch duration', () => {
    const cat = new CatBehavior(() => 0.5);
    const tired = context({ needs: { fullness: 80, energy: 0, affection: 60 } });
    advance(cat, 2.3, tired);
    expect(cat.step(0, tired).state).toBe('sleep');
    cat.interact('pet');
    expect(cat.step(0, tired).state).toBe('stretch');
    advance(cat, 1, tired);
    expect(cat.step(0, tired).state).toBe('stretch');
    advance(cat, 0.2, tired);
    expect(cat.step(0, tired).state).toBe('happy');
  });

  it('applies interaction cooldowns and pauses hidden time', () => {
    const cat = new CatBehavior(() => 0);
    const ctx = context();
    cat.interact('feed');
    expect(cat.step(0, ctx).state).toBe('eat');
    cat.interact('pet');
    expect(cat.step(0, ctx).state).toBe('happy');
    cat.interact('feed');
    expect(cat.step(0, ctx).state).toBe('happy');
    const time = cat.step(0, ctx).time;
    expect(cat.step(3600, { ...ctx, visible: false }).time).toBe(time);
    expect(cat.step(3600, ctx).time).toBeCloseTo(time + 0.1);
  });

  it('plays a platform-approved action after hidden time despite its paused local clock', () => {
    const cat = new CatBehavior(() => 0.5);
    const ctx = context();
    cat.interact('play', true);
    expect(cat.step(0, ctx).state).toBe('play');
    cat.step(3600, { ...ctx, visible: false });
    // The native store accepted this after a real-time cooldown. The behavior
    // clock intentionally did not advance while hidden.
    cat.interact('play', true);
    expect(cat.step(0, ctx)).toMatchObject({ state: 'play', time: 0 });
    advance(cat, 0.5, ctx);
    cat.interact('play');
    expect(cat.step(0, ctx).time).toBeGreaterThan(0.4);
  });

  it('stops self motion on drag and prohibits play and happy in focus mode', () => {
    const cat = new CatBehavior(() => 0.6);
    const ctx = context({ settings: { ...DEFAULT_SETTINGS, personality: 'energetic', focusMode: true } });
    cat.interact('play');
    expect(cat.step(0, ctx).state).toBe('sit');
    cat.interact('pet');
    expect(cat.step(0, ctx).state).toBe('sit');
    cat.setDragged(true);
    expect(cat.step(0.1, ctx)).toMatchObject({ state: 'dragged', velocity: 0, speed: 0 });
    cat.setDragged(false);
    advance(cat, 30, ctx);
    expect(['sit', 'sleep']).toContain(cat.step(0, ctx).state);
  });

  it.each(['pet', 'feed', 'play'] as const)('returns to idle after a requested %s animation', (action) => {
    const cat = new CatBehavior(() => 0.9);
    const ctx = context();
    cat.interact(action);
    const active = cat.step(0, ctx).state;
    expect(active).toBe(action === 'pet' ? 'happy' : action === 'feed' ? 'eat' : 'play');
    advance(cat, action === 'feed' ? 2.6 : action === 'pet' ? 1.9 : 2.3, ctx);
    expect(cat.step(0, ctx).state).toBe('idle');
  });

  it.each(['pet', 'feed', 'play'] as const)('immediately quiets active %s on focus', (action) => {
    const cat = new CatBehavior(() => 0.5);
    const normal = context();
    cat.interact(action);
    expect(['happy', 'eat', 'play']).toContain(cat.step(0, normal).state);
    const focused = context({ settings: { ...DEFAULT_SETTINGS, focusMode: true } });
    expect(cat.step(0, focused)).toMatchObject({ state: 'sit', velocity: 0 });
    advance(cat, 3, focused);
    expect(['sit', 'sleep']).toContain(cat.step(0, focused).state);
  });

  it('cancels a queued wake request but leaves an already sleeping cat asleep', () => {
    const cat = new CatBehavior(() => 0.5);
    const tired = context({ needs: { fullness: 80, energy: 0, affection: 60 } });
    advance(cat, 2.3, tired);
    expect(cat.step(0, tired).state).toBe('sleep');
    const focused = { ...tired, settings: { ...tired.settings, focusMode: true } };
    expect(cat.step(0, focused).state).toBe('sleep');
    cat.interact('feed');
    expect(cat.step(0, focused).state).toBe('sleep');
    const normal = cat.step(0, tired);
    expect(normal.state).toBe('sleep');
  });

  it('wakes through a full stretch before settling in focus mode', () => {
    const cat = new CatBehavior(() => 0.5);
    const tired = context({ needs: { fullness: 80, energy: 0, affection: 60 } });
    advance(cat, 2.3, tired);
    expect(cat.step(0, tired).state).toBe('sleep');
    const focused = { ...tired, settings: { ...tired.settings, focusMode: true } };
    advance(cat, 7.5, focused);
    expect(cat.step(0, focused).state).toBe('sleep');
    let wake = cat.step(0, focused);
    for (let tick = 0; tick < 10 && wake.state === 'sleep'; tick++) wake = cat.step(0.1, focused);
    expect(wake.state).toBe('stretch');
    expect(wake.time).toBe(0);
    advance(cat, 1, focused);
    expect(cat.step(0, focused).state).toBe('stretch');
    advance(cat, 0.3, focused);
    expect(cat.step(0, focused).state).toBe('sit');
  });

  it('lets a drag cancel a pending wake action and retry it after release', () => {
    const cat = new CatBehavior(() => 0.5);
    const tired = context({ needs: { fullness: 80, energy: 0, affection: 60 } });
    advance(cat, 2.3, tired);
    expect(cat.step(0, tired).state).toBe('sleep');
    cat.interact('feed');
    cat.setDragged(true);
    expect(cat.step(0.1, tired)).toMatchObject({ state: 'dragged', velocity: 0 });
    cat.setDragged(false);
    expect(cat.step(0, tired).state).toBe('idle');
    cat.interact('feed');
    expect(cat.step(0, tired).state).toBe('eat');
  });

  it('quiets an active mouse follow and does not resume the old chase after focus', () => {
    const cat = new CatBehavior(() => 0.4);
    const normal = context({ settings: { ...DEFAULT_SETTINGS, personality: 'energetic' } });
    advance(cat, 2.7, normal);
    expect(cat.step(0, normal)).toMatchObject({ state: 'walk', velocity: 52 });
    const focused = { ...normal, settings: { ...normal.settings, focusMode: true } };
    expect(cat.step(0, focused)).toMatchObject({ state: 'sit', velocity: 0 });
    expect(cat.step(0, normal)).toMatchObject({ state: 'sit', velocity: 0 });
  });

  it('keeps a brief mouse approach for at least the walk minimum', () => {
    const cat = new CatBehavior(() => 0.4);
    const ctx = context({ settings: { ...DEFAULT_SETTINGS, personality: 'energetic' } });
    advance(cat, 2.3, ctx);
    expect(cat.step(0, ctx).state).toBe('walk');
    advance(cat, 1.05, ctx);
    expect(cat.step(0, ctx).state).toBe('walk');
    advance(cat, 0.35, ctx);
    expect(cat.step(0, ctx).state).toBe('sit');
  });

  it('makes an affectionate cat approach more often when affection is low', () => {
    const needs = { fullness: 100, energy: 100, affection: 0 };
    const calm = new CatBehavior(() => 0.32);
    const affectionate = new CatBehavior(() => 0.32);
    const calmContext = context({ settings: { ...DEFAULT_SETTINGS, personality: 'calm' }, needs });
    const affectionateContext = context({ settings: { ...DEFAULT_SETTINGS, personality: 'affectionate' }, needs });
    advance(calm, 2.3, calmContext);
    advance(affectionate, 2.3, affectionateContext);
    expect(calm.step(0, calmContext).state).toBe('sit');
    expect(affectionate.step(0, affectionateContext).state).toBe('walk');
  });

  it('favors a nearby cursor for an affectionate walk while a calm walk wanders', () => {
    const randomFrom = (draws: number[]) => () => draws.shift() ?? 0.9;
    const calm = new CatBehavior(randomFrom([0.4, 0.6, 0.9]));
    const affectionate = new CatBehavior(randomFrom([0.32, 0.6]));
    const needs = { fullness: 100, energy: 100, affection: 0 };
    const desktop = { ...context().desktop, cursor: { x: 550, y: 750 } };
    const calmContext = context({ settings: { ...DEFAULT_SETTINGS, personality: 'calm' }, needs, desktop });
    const affectionateContext = context({ settings: { ...DEFAULT_SETTINGS, personality: 'affectionate' }, needs, desktop });
    advance(calm, 2.7, calmContext);
    advance(affectionate, 2.7, affectionateContext);
    expect(calm.step(0, calmContext).state).toBe('walk');
    expect(calm.step(0, calmContext).velocity).toBeGreaterThan(0);
    expect(affectionate.step(0, affectionateContext).velocity).toBeLessThan(0);
  });

  it('does not chase a horizontally close cursor far above the cat', () => {
    const draws = [0.21, 0.6];
    const cat = new CatBehavior(() => draws.shift() ?? 0.9);
    const ctx = context({
      settings: { ...DEFAULT_SETTINGS, personality: 'affectionate' },
      needs: { fullness: 100, energy: 100, affection: 0 },
      desktop: { ...context().desktop, cursor: { x: 550, y: 40 } },
    });
    advance(cat, 2.7, ctx);
    expect(cat.step(0, ctx)).toMatchObject({ state: 'walk' });
    expect(cat.step(0, ctx).velocity).toBeGreaterThan(0);
  });

  it('does not animate eating solely because hunger is low', () => {
    const cat = new CatBehavior(() => 0.7);
    const hungry = context({ needs: { fullness: 0, energy: 100, affection: 100 } });
    const visited = new Set<string>();
    for (let index = 0; index < 1200; index++) visited.add(cat.step(0.1, hungry).state);
    expect(visited.has('eat')).toBe(false);
    cat.interact('feed');
    expect(cat.step(0, hungry).state).toBe('eat');
  });

  it('uses needs and personality for weighted choices without sampling each frame', () => {
    let samples = 0;
    const cat = new CatBehavior(() => { samples++; return 0.7; });
    const ctx = context({
      settings: { ...DEFAULT_SETTINGS, personality: 'energetic' },
      needs: { fullness: 100, energy: 100, affection: 100 },
    });
    advance(cat, 2.1, ctx);
    expect(samples).toBe(0);
    advance(cat, 0.2, ctx);
    expect(samples).toBeGreaterThan(0);
    const selectedAt = samples;
    cat.step(0.01, ctx);
    expect(samples).toBe(selectedAt);
  });

  it('makes a calm cat settle while an energetic cat walks under the same draw', () => {
    const calm = new CatBehavior(() => 0.4);
    const energetic = new CatBehavior(() => 0.4);
    const rested = { fullness: 100, energy: 100, affection: 100 };
    const calmContext = context({
      settings: { ...DEFAULT_SETTINGS, personality: 'calm', followMouse: false }, needs: rested,
    });
    const energeticContext = context({
      settings: { ...DEFAULT_SETTINGS, personality: 'energetic', followMouse: false }, needs: rested,
    });
    advance(calm, 2.3, calmContext);
    advance(energetic, 2.3, energeticContext);
    expect(calm.step(0, calmContext).state).toBe('sit');
    expect(energetic.step(0, energeticContext).state).toBe('walk');
  });

  it('slows at the screen edge and reports actual movement speed', () => {
    const cat = new CatBehavior(() => 0.4);
    const ctx = context({ settings: { ...DEFAULT_SETTINGS, personality: 'energetic', followMouse: false } });
    advance(cat, 2.7, ctx);
    const middle = cat.step(0, ctx);
    expect(middle.state).toBe('walk');
    expect(middle.speed).toBe(Math.abs(middle.velocity));
    const movingRight = middle.velocity > 0;
    const edge = { ...ctx, desktop: { ...ctx.desktop, x: movingRight ? 1920 - 256 - 20 : 20 } };
    const near = cat.step(0, edge);
    expect(Math.abs(near.velocity)).toBeLessThan(Math.abs(middle.velocity));
    const outside = { ...ctx, desktop: { ...ctx.desktop, x: movingRight ? 1920 - 256 : 0 } };
    expect(cat.step(0, outside)).toMatchObject({ state: 'sit', velocity: 0 });
  });
});
