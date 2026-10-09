import { describe, expect, it } from 'vitest';
import { CatBehavior } from '../src/core/behavior';
import { DEFAULT_SETTINGS, DEFAULT_NEEDS, type BehaviorContext, type CharacterId } from '../src/core/types';
import { follow, jumpAt } from '../src/render/motion';

function context(character: CharacterId = 'cat'): BehaviorContext {
  return { settings: { ...DEFAULT_SETTINGS, character }, needs: { ...DEFAULT_NEEDS }, visible: true,
    desktop: { x: 600, y: 700, width: 256, height: 224, scale: 1, dragging: false, pressed: false,
      cursor: { x: 780, y: 810 }, workArea: { x: 0, y: 0, width: 1920, height: 1080 } } };
}
function advance(pet: CatBehavior, seconds: number, ctx: BehaviorContext) {
  for (let i = 0; i < Math.round(seconds * 10); i++) pet.step(.1, ctx);
  return pet.step(0, ctx);
}

describe('weight and secondary motion', () => {
  it('prepares on the ground, flies once and settles without sinking below the floor', () => {
    expect(jumpAt(.15, 24)).toEqual({ lift: 0, squash: 1 });
    expect(jumpAt(.65, 24).lift).toBeCloseTo(-24);
    expect(jumpAt(1.2, 24).squash).toBeGreaterThan(0);
    expect(jumpAt(1.6, 24)).toEqual({ lift: 0, squash: 0 });
    for (let t = 0; t < 4; t += .01) expect(jumpAt(t, 24).lift).toBeLessThanOrEqual(0);
  });
  it('keeps follow-through independent of frame rate and holds when paused', () => {
    const simulate = (fps: number) => { let x = 0; for (let i = 0; i < fps; i++) x = follow(x, 1, 1 / fps, 7); return x; };
    expect(simulate(30)).toBeCloseTo(simulate(60), 10);
    expect(follow(.4, 1, 0, 7)).toBe(.4);
  });
  it('looks and shifts weight before accelerating into a walk', () => {
    const ctx = context(); ctx.settings.personality = 'energetic'; ctx.settings.followMouse = false;
    const pet = new CatBehavior(() => .4);
    expect(advance(pet, 2.2, ctx)).toMatchObject({ state: 'walk', velocity: 0 });
    expect(advance(pet, .1, ctx).speed).toBe(0);
    const starting = advance(pet, .2, ctx).speed;
    expect(starting).toBeGreaterThan(0); expect(starting).toBeLessThan(52);
    expect(advance(pet, .2, ctx).speed).toBe(52);
  });
});

describe.each(['cat', 'gugugaga'] as const)('%s contextual reactions', character => {
  it('notices a nearby cursor before a character-specific greeting, with a cooldown', () => {
    const pet = new CatBehavior(() => 0, character), ctx = context(character);
    const starts: { state: string; at: number }[] = []; let previous = '';
    for (let tick = 0; tick < 600; tick++) {
      const frame = pet.step(.1, ctx);
      if (frame.state !== previous) starts.push({ state: frame.state, at: tick / 10 });
      previous = frame.state;
    }
    const notices = starts.filter(x => x.state === 'observe');
    expect(notices.length).toBeGreaterThanOrEqual(2);
    for (const notice of notices) {
      const next = starts[starts.indexOf(notice) + 1];
      expect(next?.state).toBe(character === 'cat' ? 'play' : 'wave');
      expect(next!.at - notice.at).toBeGreaterThanOrEqual(2.9);
    }
    expect(notices[1]!.at - notices[0]!.at).toBeGreaterThanOrEqual(29.9);
  });
  it.each(['disabled', 'distant', 'tired', 'focused'] as const)('does not solicit attention when %s', reason => {
    const pet = new CatBehavior(() => 0, character), ctx = context(character);
    if (reason === 'disabled') ctx.settings.followMouse = false;
    if (reason === 'distant') ctx.desktop.cursor.y = 0;
    if (reason === 'tired') ctx.needs.energy = 10;
    if (reason === 'focused') ctx.settings.focusMode = true;
    for (let tick = 0; tick < 400; tick++) expect(pet.step(.1, ctx).state).not.toBe('observe');
  });
  it.each(['feed', 'drag', 'focus'] as const)('cancels a queued greeting for %s', interruption => {
    const pet = new CatBehavior(() => 0, character), ctx = context(character);
    for (let tick = 0; tick < 160 && pet.step(.1, ctx).state !== 'observe'; tick++) { /* await notice */ }
    expect(pet.step(0, ctx).state).toBe('observe');
    if (interruption === 'feed') pet.interact('feed', true);
    if (interruption === 'drag') { pet.setDragged(true); pet.setDragged(false); }
    if (interruption === 'focus') { pet.step(0, { ...ctx, settings: { ...ctx.settings, focusMode: true } }); }
    const visited = new Set<string>();
    for (let tick = 0; tick < 90; tick++) visited.add(pet.step(.1, ctx).state);
    expect(visited.has(character === 'cat' ? 'play' : 'wave')).toBe(false);
  });
  it('keeps the touch direction while nuzzling even after the cursor moves', () => {
    const pet = new CatBehavior(() => 0, character), ctx = context(character);
    pet.interact('pet', true, { x: -.8, y: -.5 });
    expect(pet.step(0, ctx)).toMatchObject({ state: 'happy', lookX: -.8, lookY: -.5 });
    ctx.desktop.cursor.x = 1900;
    expect(pet.step(.1, ctx).lookX).toBe(-.8);
    expect(advance(pet, 2, ctx).lookX).toBe(1);
  });
});
