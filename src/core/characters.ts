import { CHARACTER_IDS, DEFAULT_NEEDS, DEFAULT_SETTINGS, type CharacterId, type PetData, type Settings } from './types';

export const CHARACTERS = {
  cat: { label: '猫', name: 'こむぎ', scale: 1, description: '気ままな、クリーム色の小さな猫。' },
  gugugaga: { label: 'ググガガ', name: 'ググガガ', scale: .875, description: 'ペンギンのフードで、ぽてぽて。ぐぐがが〜' },
} as const;
export function characterSize(settings: Settings) {
  const scale = CHARACTERS[settings.character].scale * settings.size;
  return { width: 256 * scale, height: 224 * scale, baseline: 206 * scale, scale };
}
export function initialData(): PetData {
  return { schemaVersion: 2, settings: { ...DEFAULT_SETTINGS }, needs: { ...DEFAULT_NEEDS },
    profiles: { cat: { name: 'こむぎ', needs: { ...DEFAULT_NEEDS } }, gugugaga: { name: 'ググガガ', needs: { ...DEFAULT_NEEDS } } },
    position: null, savedAt: Date.now() };
}
export function rememberCharacter(data: PetData): void {
  data.profiles[data.settings.character] = { name: data.settings.name, needs: { ...data.needs } };
}
export function switchCharacter(data: PetData, character: CharacterId): void {
  if (!CHARACTER_IDS.includes(character)) throw new Error('キャラクターが正しくありません。');
  rememberCharacter(data);
  const profile = data.profiles[character];
  data.settings.character = character;
  data.settings.name = profile.name;
  data.needs = { ...profile.needs };
}
export function validateSettings(s: Settings): void {
  if (!CHARACTER_IDS.includes(s.character) || typeof s.name !== 'string' || !s.name.trim() || [...s.name].length > 20 || /\p{Cc}/u.test(s.name)) throw new Error('おなまえは1〜20文字で入力してください。');
  if (!['calm', 'affectionate', 'energetic'].includes(s.personality)) throw new Error('性格が正しくありません。');
  for (const [value, min, max] of [[s.size, .65, 1.5], [s.speed, .4, 1.8], [s.volume, 0, 1]]) {
    if (!Number.isFinite(value) || value! < min! || value! > max!) throw new Error('設定値が範囲外です。');
  }
  for (const key of ['sound', 'alwaysOnTop', 'followMouse', 'autostart', 'focusMode'] as const) {
    if (typeof s[key] !== 'boolean') throw new Error('設定値の型が正しくありません。');
  }
}
/** Migrate the existing cat save without losing its name or care values. */
export function restoreData(raw: unknown): PetData {
  if (!raw || typeof raw !== 'object') throw new Error('保存形式が正しくありません。');
  const saved = raw as PetData;
  if (![1, 2].includes(saved.schemaVersion)) throw new Error('新しいバージョンの保存データです。');
  const data = initialData();
  data.settings = { ...DEFAULT_SETTINGS, ...saved.settings };
  if (!saved.settings || (saved.schemaVersion as number) === 1) data.settings.character = 'cat';
  validateSettings(data.settings);
  const needsValid = (needs: PetData['needs']) => needs && ['fullness', 'energy', 'affection'].every(key => {
    const value = needs[key as keyof typeof needs]; return Number.isFinite(value) && value >= 0 && value <= 100;
  });
  if (!needsValid(saved.needs)) throw new Error('育成データが正しくありません。');
  data.needs = { ...saved.needs };
  if (saved.schemaVersion === 2) {
    for (const character of CHARACTER_IDS) {
      const profile = saved.profiles?.[character];
      if (!profile || !needsValid(profile.needs)) throw new Error('キャラクターの保存データが正しくありません。');
      validateSettings({ ...data.settings, name: profile.name });
      data.profiles[character] = structuredClone(profile);
    }
  }
  rememberCharacter(data);
  data.savedAt = Number.isFinite(saved.savedAt) ? saved.savedAt : Date.now();
  if (saved.position && Number.isFinite(saved.position.x) && Number.isFinite(saved.position.y)) data.position = { ...saved.position };
  return data;
}
