import type { CharacterId, PetAction } from '../core/types';
/** Add a bundled recording only after its redistribution conditions are known. */
export const VOICE_FILES: Record<CharacterId, string | null> = { cat: null, gugugaga: null };
export class PetSound {
  private audio: AudioContext | null = null;
  private voice: HTMLAudioElement | null = null;
  private generation = 0;
  private nextVoice = 0;
  async play(action: PetAction, character: CharacterId = 'cat', volume = .4): Promise<void> {
    volume = Math.max(0, Math.min(1, volume));
    if (!volume) return;
    if (character === 'gugugaga') {
      const file = VOICE_FILES[character];
      if (!file || performance.now() < this.nextVoice) return;
      this.nextVoice = performance.now() + 9000;
      this.voice?.pause(); this.voice = new Audio(file); this.voice.volume = volume;
      await this.voice.play(); return;
    }
    const generation = this.generation;
    const audio = this.audio ??= new AudioContext();
    await audio.resume();
    if (generation !== this.generation || audio.state === 'closed') return;
    const now = audio.currentTime;
    const oscillator = audio.createOscillator(); const gain = audio.createGain();
    oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(action === 'feed' ? 440 : 660, now);
    oscillator.frequency.exponentialRampToValueAtTime(action === 'play' ? 990 : 520, now + .18);
    gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(.0625 * volume, now + .035); gain.gain.exponentialRampToValueAtTime(.001, now + .24);
    oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(now); oscillator.stop(now + .25);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
  dispose(): void {
    this.generation++; this.voice?.pause(); if (this.voice) this.voice.src = ''; this.voice = null;
    if (this.audio && this.audio.state !== 'closed') void this.audio.close().catch(() => {});
    this.audio = null;
  }
}
