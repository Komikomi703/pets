import { describe, it, expect } from 'vitest';
import { CatBehavior } from '../src/core/behavior';
import { characterSize, initialData, rememberCharacter, restoreData, switchCharacter } from '../src/core/characters';
import { DEFAULT_NEEDS, DEFAULT_SETTINGS, type BehaviorContext } from '../src/core/types';

function context(): BehaviorContext {
  return { settings: { ...DEFAULT_SETTINGS, character: 'gugugaga', followMouse: false }, needs: { ...DEFAULT_NEEDS }, visible: true,
    desktop: { x: 400, y: 500, width: 224, height: 196, scale: 1, workArea: { x: 0, y: 0, width: 1920, height: 1080 }, cursor: { x: 0, y: 0 }, dragging: false, pressed: false } };
}
function advance(behavior: CatBehavior, seconds: number, ctx: BehaviorContext) {
  for (let i = 0; i < Math.ceil(seconds * 10); i++) behavior.step(.1, ctx);
  return behavior.step(0, ctx);
}
describe('character profiles', () => {
  it('migrates the existing cat without losing its name, care values or preferences', () => {
    const legacy = { schemaVersion: 1, settings: { ...DEFAULT_SETTINGS, name: 'みけ', size: 1.3 }, needs: { fullness: 42, energy: 51, affection: 66 }, position: { x: -1300, y: 40, monitor: null }, savedAt: 123 };
    const data = restoreData(legacy);
    expect(data.schemaVersion).toBe(2); expect(data.profiles.cat).toEqual({ name: 'みけ', needs: legacy.needs });
    expect(data.position).toEqual(legacy.position); expect(data.settings.size).toBe(1.3);
    switchCharacter(data, 'gugugaga'); expect(data.settings.name).toBe('ググガガ'); expect(data.needs).toEqual(DEFAULT_NEEDS);
  });
  it('keeps separate names and care values through repeated switching and reload', () => {
    const data = initialData(); data.settings.name = 'むぎ'; data.needs.affection = 73;
    switchCharacter(data, 'gugugaga'); data.settings.name = 'ぐーちゃん'; data.needs.fullness = 99;
    for (let i = 0; i < 20; i++) { switchCharacter(data, 'cat'); expect(data.settings.name).toBe('むぎ'); expect(data.needs.affection).toBe(73); switchCharacter(data, 'gugugaga'); }
    rememberCharacter(data);
    const restored = restoreData(JSON.parse(JSON.stringify(data)));
    expect(restored.settings.character).toBe('gugugaga'); expect(restored.settings.name).toBe('ぐーちゃん'); expect(restored.needs.fullness).toBe(99);
    expect(restored.profiles.cat.needs.fullness).toBe(DEFAULT_NEEDS.fullness);
  });
  it('rejects unsupported schemas and invalid inactive profiles', () => {
    expect(() => restoreData({ schemaVersion: 99 })).toThrow();
    const data = initialData(); data.profiles.gugugaga.needs.energy = NaN;
    expect(() => restoreData(data)).toThrow();
  });
  it('uses a smaller viewport for the penguin and preserves zero volume', () => {
    expect(characterSize({ ...DEFAULT_SETTINGS, character: 'gugugaga' })).toMatchObject({ width: 224, height: 196 });
    const data = initialData(); data.settings.volume = 0;
    expect(restoreData(data).settings.volume).toBe(0);
    expect(data.settings.sound).toBe(false);
  });
});
describe('Gugugaga interaction priorities', () => {
  it('freezes autonomous decisions while a pointer is held before dragging', () => {
    const pet = new CatBehavior(() => .99, 'gugugaga'), ctx = context();
    ctx.desktop.pressed = true;
    expect(advance(pet, 5, ctx)).toMatchObject({ state: 'idle', time: 0, velocity: 0 });
    ctx.desktop.pressed = false;
    expect(pet.step(.1, ctx).time).toBeCloseTo(.1);
  });
  it('gives dragging priority and lands before accepting another action', () => {
    const pet = new CatBehavior(() => 0, 'gugugaga'), ctx = context();
    pet.interact('feed'); expect(pet.step(0, ctx).state).toBe('eat');
    pet.setDragged(true); pet.interact('pet', true); pet.poke();
    expect(pet.step(.1, ctx)).toMatchObject({ state: 'dragged', velocity: 0 });
    pet.setDragged(false); pet.interact('play', true); expect(pet.step(0, ctx).state).toBe('land');
    advance(pet, .5, ctx); expect(pet.step(0, ctx).state).toBe('play');
  });
  it('lets a click interrupt food, and holds that reaction before queued play', () => {
    const pet = new CatBehavior(() => 0, 'gugugaga'), ctx = context();
    pet.interact('feed', true); pet.step(0, ctx); pet.interact('pet', true);
    expect(pet.step(0, ctx)).toMatchObject({ state: 'happy', speech: 'ぐぐがが〜' });
    pet.interact('play', true); expect(pet.step(.1, ctx).state).toBe('happy');
    advance(pet, 1.9, ctx); expect(pet.step(0, ctx).state).toBe('play');
  });
  it('reacts to rapid pokes without awarding extra care, calms down and limits speech', () => {
    const pet = new CatBehavior(() => 0, 'gugugaga'), ctx = context();
    pet.interact('pet', true); pet.step(0, ctx);
    for (let i = 0; i < 3; i++) { pet.poke(); pet.step(.1, ctx); }
    expect(pet.step(0, ctx)).toMatchObject({ state: 'sulk', velocity: 0 });
    expect(pet.step(0, ctx).speech).toBeUndefined();
    expect(advance(pet, 2.6, ctx).state).toBe('idle');
    pet.interact('pet', true); expect(pet.step(0, ctx).speech).toBeUndefined();
    expect(ctx.needs).toEqual(DEFAULT_NEEDS);
  });
  it('wakes with a blink before a requested reaction', () => {
    const pet = new CatBehavior(() => .5, 'gugugaga'), ctx = context();
    ctx.needs = { fullness: 80, energy: 0, affection: 60 };
    expect(advance(pet, 2.3, ctx).state).toBe('sleep');
    pet.interact('pet'); expect(pet.step(0, ctx).state).toBe('wake');
    expect(advance(pet, .5, ctx).state).toBe('wake');
    expect(advance(pet, .4, ctx).state).toBe('happy');
  });
  it('keeps stumbling rare even when the random draw always favors it', () => {
    const pet = new CatBehavior(() => .99999, 'gugugaga'), ctx = context();
    const starts: number[] = []; let previous = '';
    for (let i = 0; i < 2300; i++) { const frame = pet.step(.1, ctx); if (frame.state === 'stumble' && previous !== 'stumble') starts.push(i / 10); previous = frame.state; }
    expect(starts.length).toBeGreaterThan(0); expect(starts[0]).toBeGreaterThanOrEqual(45);
    for (let i = 1; i < starts.length; i++) expect(starts[i]! - starts[i - 1]!).toBeGreaterThanOrEqual(89.9);
  });
  it('stops a play chase at a display edge and quiets reactions in focus mode', () => {
    const pet = new CatBehavior(() => 0, 'gugugaga'), ctx = context();
    pet.interact('play', true); expect(pet.step(0, ctx).velocity).toBe(0);
    expect(advance(pet, .7, ctx).velocity).toBeGreaterThan(0);
    ctx.desktop.x = 1920 - 224; expect(pet.step(.1, ctx).velocity).toBe(0);
    ctx.settings.focusMode = true; pet.interact('pet', true); expect(pet.step(.1, ctx)).toMatchObject({ state: 'sit', velocity: 0, speech: undefined });
  });
});
