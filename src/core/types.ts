export const CAT_WIDTH = 256;
export const CAT_HEIGHT = 224;
export const CAT_BASELINE = 206;
export const CAT_STATES = ['idle', 'walk', 'sit', 'sleep', 'stretch', 'groom', 'happy', 'eat', 'play', 'dragged'] as const;
export type CatState = typeof CAT_STATES[number];
export const CHARACTER_IDS = ['cat', 'gugugaga'] as const;
export type CharacterId = typeof CHARACTER_IDS[number];
export const PET_STATES = [...CAT_STATES, 'sulk', 'land', 'wake', 'stumble'] as const;
export type PetState = typeof PET_STATES[number];
export type Personality = 'calm' | 'affectionate' | 'energetic';
export type PetAction = 'pet' | 'feed' | 'play';
export interface PetEvent { action: PetAction | 'poke'; character: CharacterId }
export interface Settings {
  character: CharacterId;
  name: string;
  personality: Personality;
  size: number;
  speed: number;
  sound: boolean;
  volume: number;
  alwaysOnTop: boolean;
  followMouse: boolean;
  autostart: boolean;
  focusMode: boolean;
}
export interface Needs { fullness: number; energy: number; affection: number }
export interface Point { x: number; y: number }
export interface Rect extends Point { width: number; height: number }
export interface SavedPosition extends Point { monitor: string | null }
export interface PetData {
  schemaVersion: 2;
  settings: Settings;
  needs: Needs;
  profiles: Record<CharacterId, { name: string; needs: Needs }>;
  position: SavedPosition | null;
  savedAt: number;
}
export interface Snapshot {
  data: PetData;
  revision: number;
  visible: boolean;
  saveError: string | null;
  warning: string | null;
}
export interface Desktop extends Rect {
  scale: number;
  workArea: Rect;
  cursor: Point;
  dragging: boolean;
  pressed: boolean;
}
export interface CatFrame {
  state: CatState;
  time: number;
  direction: 1 | -1;
  speed: number;
  lookX: number;
  lookY: number;
}
export interface PetFrame extends Omit<CatFrame, 'state'> { state: PetState; speech?: string }
export interface BehaviorContext {
  settings: Settings;
  needs: Needs;
  desktop: Desktop;
  visible: boolean;
}
export interface BehaviorOutput extends PetFrame { velocity: number }
export interface HitMask { width: number; height: number; cells: number[] }
export interface NativeFrame { character: CharacterId; velocity: number; state: PetState; mask?: HitMask }
export const DEFAULT_SETTINGS: Settings = {
  character: 'cat', name: 'こむぎ', personality: 'calm', size: 1, speed: 1, sound: false, volume: .4,
  alwaysOnTop: true, followMouse: true, autostart: false, focusMode: false,
};
export const DEFAULT_NEEDS: Needs = { fullness: 78, energy: 85, affection: 35 };
