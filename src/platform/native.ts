import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { Desktop, NativeFrame, PetAction, PetEvent, CharacterId, Settings, Snapshot } from '../core/types';
import type { Platform } from './platform';
export class NativePlatform implements Platform {
  readonly native = true;
  private character: CharacterId = 'cat';
  async snapshot(): Promise<Snapshot> { const value = await invoke<Snapshot>('get_snapshot'); this.character = value.data.settings.character; return value; }
  desktop(): Promise<Desktop> { return invoke('get_desktop_pos'); }
  subscribeSnapshot(fn: (value: Snapshot) => void) { return listen<Snapshot>('snapshot', event => { this.character = event.payload.data.settings.character; fn(event.payload); }); }
  subscribeDesktop(fn: (value: Desktop) => void) { return listen<Desktop>('desktop', event => fn(event.payload)); }
  subscribeAction(fn: (value: PetEvent) => void) { return listen<PetEvent>('pet-action', event => fn(event.payload)); }
  updateSettings(patch: Partial<Settings>): Promise<Snapshot> { return invoke('update_settings', { patch, expectedCharacter: this.character }); }
  action(action: PetAction): Promise<Snapshot> { return invoke('pet_action', { action, expectedCharacter: this.character }); }
  frame(frame: NativeFrame): Promise<void> { return invoke('sync_frame', { frame }); }
  press(): Promise<void> { return invoke('begin_press'); }
  release(): Promise<void> { return invoke('end_press'); }
  openMenu(): Promise<void> { return invoke('open_pet_menu'); }
  openSettings(): Promise<void> { return invoke('open_settings'); }
  setVisible(visible: boolean): Promise<Snapshot> { return invoke('set_visible', { visible }); }
  rescue(): Promise<void> { return invoke('rescue'); }
  quit(discardUnsaved = false): Promise<void> { return invoke('quit', { discardUnsaved }); }
  dispose(): void { /* subscriptions are owned by each view */ }
}
