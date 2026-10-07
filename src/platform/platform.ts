import type { Desktop, NativeFrame, PetAction, PetEvent, Point, Settings, Snapshot } from '../core/types';
export type Unsubscribe = () => void;
export interface Platform {
  readonly native: boolean;
  snapshot(): Promise<Snapshot>;
  desktop(): Promise<Desktop>;
  subscribeSnapshot(fn: (snapshot: Snapshot) => void): Promise<Unsubscribe>;
  subscribeDesktop(fn: (desktop: Desktop) => void): Promise<Unsubscribe>;
  subscribeAction(fn: (action: PetEvent) => void): Promise<Unsubscribe>;
  updateSettings(patch: Partial<Settings>): Promise<Snapshot>;
  action(action: PetAction): Promise<Snapshot>;
  frame(frame: NativeFrame): Promise<void>;
  press(): Promise<void>;
  release(): Promise<void>;
  openMenu(position: Point): Promise<void>;
  openSettings(): Promise<void>;
  setVisible(visible: boolean): Promise<Snapshot>;
  rescue(): Promise<void>;
  quit(discardUnsaved?: boolean): Promise<void>;
  dispose(): void;
}
