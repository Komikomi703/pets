import type { CharacterId, HitMask, PetFrame } from '../core/types';
import { CatRenderer } from './cat';
import { GugugagaRenderer, loadGugugaga } from './gugugaga';

export interface CharacterRenderer {
  draw(frame: PetFrame): void;
  hitTest(x: number, y: number): boolean;
  hitMask(): HitMask;
  dispose(): void;
}
export async function prepareCharacters(): Promise<void> { await loadGugugaga(); }
export function createRenderer(canvas: HTMLCanvasElement, character: CharacterId): CharacterRenderer {
  if (character === 'gugugaga') return new GugugagaRenderer(canvas);
  const cat = new CatRenderer(canvas);
  return {
    draw: frame => cat.draw({ ...frame, state: frame.state === 'wake' ? 'stretch' : ['sulk', 'land', 'stumble'].includes(frame.state) ? 'idle' : frame.state as import('../core/types').CatState }),
    hitTest: (x, y) => cat.hitTest(x, y), hitMask: () => cat.hitMask(), dispose: () => cat.dispose(),
  };
}
