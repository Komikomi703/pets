import { describe, expect, it } from 'vitest';
import { CatBehavior } from '../src/core/behavior';
import { DEFAULT_NEEDS, DEFAULT_SETTINGS, type BehaviorContext, type CharacterId, type PetState } from '../src/core/types';

const additions = ['observe', 'yawn', 'sniff', 'wave', 'hop'] as const;
function context(character: CharacterId, energy = 85): BehaviorContext {
  return {
    settings: { ...DEFAULT_SETTINGS, character, followMouse: false },
    needs: { ...DEFAULT_NEEDS, energy }, visible: true,
    desktop: { x: 600, y: 700, width: 256, height: 224, scale: 1,
      workArea: { x: 0, y: 0, width: 1920, height: 1080 },
      cursor: { x: 900, y: 750 }, dragging: false, pressed: false },
  };
}
// Select through the public behavior API, without depending on exact weight boundaries.
function select(state: PetState, ctx: BehaviorContext): CatBehavior {
  for (let sample = 0; sample <= 1000; sample++) {
    const pet = new CatBehavior(() => sample / 1000, ctx.settings.character);
    for (let tick = 0; tick < 22; tick++) pet.step(.1, ctx);
    if (pet.step(0, ctx).state === state) return pet;
  }
  throw new Error(`Unreachable state: ${state}`);
}

describe.each(['cat', 'gugugaga'] as const)('%s new autonomous behaviors', character => {
  it.each(additions)('%s is reachable, stationary, pausable and interruptible', state => {
    const ctx = context(character), pet = select(state, ctx);
    expect(pet.step(.1, ctx)).toMatchObject({ state, velocity: 0, speed: 0 });
    const time = pet.step(0, ctx).time;
    expect(pet.step(60, { ...ctx, visible: false }).time).toBe(time);
    expect(pet.step(.1, { ...ctx, desktop: { ...ctx.desktop, pressed: true } }).time).toBe(time);
    pet.interact('feed', true);
    expect(pet.step(0, ctx).state).toBe('eat');
    expect(ctx.needs).toEqual({ ...DEFAULT_NEEDS });
  });

  it.each(additions)('%s yields immediately to focus mode and dragging', state => {
    const ctx = context(character), pet = select(state, ctx);
    expect(pet.step(0, { ...ctx, settings: { ...ctx.settings, focusMode: true } }))
      .toMatchObject({ state: 'sit', velocity: 0 });
    const grabbed = select(state, ctx);
    grabbed.setDragged(true);
    expect(grabbed.step(0, ctx)).toMatchObject({ state: 'dragged', velocity: 0 });
  });

  it.each([10, 85])('settles after yawning according to energy (%s)', energy => {
    const ctx = context(character, energy), pet = select('yawn', ctx);
    for (let tick = 0; tick < 24; tick++) pet.step(.1, ctx);
    expect(pet.step(0, ctx).state).toBe(energy < 30 ? 'sleep' : 'sit');
  });

  it('grooms after sniffing and looks around independently of cursor following', () => {
    const ctx = context(character), pet = select('sniff', ctx);
    for (let tick = 0; tick < 26; tick++) pet.step(.1, ctx);
    expect(pet.step(0, ctx).state).toBe('groom');
    const observer = select('observe', ctx);
    const first = observer.step(.1, ctx).lookX;
    expect(observer.step(.1, ctx).lookX).not.toBe(first);
  });

  it('visits all new states with cooldowns, and never hops while exhausted', () => {
    let seed = 42;
    const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    const pet = new CatBehavior(random, character), ctx = context(character);
    const starts = new Map<string, number>();
    const cooldowns = { observe: 10, yawn: 20, sniff: 12, wave: 15, hop: 14 };
    let previous: PetState = 'idle';
    for (let tick = 0; tick < 30000; tick++) {
      const frame = pet.step(.1, ctx);
      if (frame.state !== previous && additions.includes(frame.state as typeof additions[number])) {
        const state = frame.state as typeof additions[number];
        if (starts.has(state)) expect(tick / 10 - starts.get(state)!).toBeGreaterThanOrEqual(cooldowns[state] - .1);
        starts.set(state, tick / 10);
      }
      previous = frame.state;
    }
    expect([...starts.keys()].sort()).toEqual([...additions].sort());
    const tired = new CatBehavior(random, character), tiredContext = context(character, 10);
    for (let tick = 0; tick < 6000; tick++) expect(tired.step(.1, tiredContext).state).not.toBe('hop');
  });
});
