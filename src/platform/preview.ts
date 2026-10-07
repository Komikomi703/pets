import { CHARACTERS, characterSize, initialData, rememberCharacter, restoreData, switchCharacter, validateSettings } from '../core/characters';
import { type Desktop, type NativeFrame, type PetAction, type PetEvent, type PetData, type Point, type Settings, type Snapshot } from '../core/types';
import type { Platform, Unsubscribe } from './platform';
import { showPetMenu } from '../ui/pet-menu';
const KEY = 'madoneko-web-preview-v1';
function initial(): Snapshot {
  const snapshot: Snapshot = { data: initialData(), revision: 0, visible: true, saveError: null, warning: null };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) snapshot.data = restoreData(JSON.parse(raw));
    snapshot.data.settings.autostart = false;
  } catch { snapshot.warning = 'Webプレビューの保存内容を読み込めませんでした。元の内容を保護するため保存を停止しています。'; }
  return snapshot;
}
export class PreviewPlatform implements Platform {
  readonly native = false;
  private value = initial();
  private snapshotListeners = new Set<(value: Snapshot) => void>();
  private desktopListeners = new Set<(value: Desktop) => void>();
  private actionListeners = new Set<(value: PetEvent) => void>();
  private channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(KEY);
  private view: Desktop = { x: 100, y: 200, width: 256, height: 224, scale: 1, workArea: { x: 16, y: 0, width: innerWidth - 32, height: innerHeight - 86 }, cursor: { x: 0, y: 0 }, dragging: false, pressed: false };
  private velocity = 0;
  private menu: ReturnType<typeof showPetMenu> | null = null;
  private lastAction = -Infinity;
  private readOnly = Boolean(this.value.warning);
  private pressStart: { x: number; y: number; offsetX: number; offsetY: number } | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  constructor() {
    this.view.x = Math.max(16, innerWidth / 2 - 128);
    this.view.y = Math.max(0, innerHeight - 224 - 110);
    if (this.value.data.position) { this.view.x = this.value.data.position.x; this.view.y = this.value.data.position.y; }
    this.updateSize(); this.clamp();
    addEventListener('pointermove', this.pointer);
    addEventListener('pointerup', this.up);
    addEventListener('resize', this.resize);
    if (this.channel) this.channel.onmessage = (event: MessageEvent<{ data?: PetData; visible?: boolean; event?: PetEvent }>) => {
      if (event.data.data) { const previous = this.value.data.settings.character; this.value.data = restoreData(event.data.data); this.value.visible = event.data.visible ?? this.value.visible; if (previous !== this.value.data.settings.character) this.resetInteraction(); this.updateSize(); this.clamp(); this.emit(false); }
      if (event.data.event?.character === this.value.data.settings.character) this.actionListeners.forEach(fn => fn(event.data.event!));
    };
  }
  private pointer = (event: PointerEvent) => {
    this.view.cursor = { x: event.clientX, y: event.clientY };
    const p = this.pressStart;
    if (!p) return;
    if (Math.hypot(event.clientX - p.x, event.clientY - p.y) >= 6) this.view.dragging = true;
    if (this.view.dragging) { this.view.x = event.clientX - p.offsetX; this.view.y = event.clientY - p.offsetY; }
  };
  private up = (event: PointerEvent) => { if (event.button === 0) void this.release(); };
  private resize = () => { this.updateSize(); this.view.workArea.width = innerWidth - 32; this.view.workArea.height = innerHeight - 86; this.clamp(); };
  private clamp() {
    this.view.x = Math.max(16, Math.min(this.view.x, innerWidth - this.view.width - 16));
    this.view.y = Math.max(0, Math.min(this.view.y, innerHeight - this.view.height - 86));
  }
  private resetInteraction() { this.menu?.dismiss(); this.pressStart = null; this.view.dragging = this.view.pressed = false; this.velocity = 0; this.lastAction = -Infinity; }
  private updateSize() { const m = characterSize(this.value.data.settings); const fit = Math.min(1, Math.max(1, innerWidth - 32) / m.width, Math.max(1, innerHeight - 86) / m.height); this.view.width = m.width * fit; this.view.height = m.height * fit; }
  private emit(broadcast = true): Snapshot {
    this.value.revision++;
    rememberCharacter(this.value.data); this.value.data.position = { x: this.view.x, y: this.view.y, monitor: null }; this.value.data.savedAt = Date.now();
    try { if (!this.readOnly) localStorage.setItem(KEY, JSON.stringify(this.value.data)); this.value.saveError = null; }
    catch { this.value.saveError = 'ブラウザーに保存できませんでした。'; }
    if (broadcast) this.channel?.postMessage({ data: this.value.data, visible: this.value.visible });
    this.snapshotListeners.forEach(fn => fn(structuredClone(this.value)));
    return structuredClone(this.value);
  }
  async snapshot() { return structuredClone(this.value); }
  async desktop() { return structuredClone(this.view); }
  async subscribeSnapshot(fn: (v: Snapshot) => void): Promise<Unsubscribe> { this.snapshotListeners.add(fn); return () => this.snapshotListeners.delete(fn); }
  async subscribeDesktop(fn: (v: Desktop) => void): Promise<Unsubscribe> {
    this.desktopListeners.add(fn);
    if (!this.timer) {
      let last = performance.now();
      this.timer = setInterval(() => {
        const now = performance.now(); const dt = now - last < 250 ? (now - last) / 1000 : 0; last = now;
        if (!this.value.visible || document.hidden) return;
        this.updateSize();
        if (!this.pressStart && !this.menu && !this.value.data.settings.focusMode) this.view.x += this.velocity * dt;
        if (!this.view.dragging) this.clamp();
        this.desktopListeners.forEach(listener => listener(structuredClone(this.view)));
      }, 33);
    }
    return () => { this.desktopListeners.delete(fn); if (!this.desktopListeners.size && this.timer) { clearInterval(this.timer); this.timer = null; } };
  }
  async subscribeAction(fn: (v: PetEvent) => void): Promise<Unsubscribe> { this.actionListeners.add(fn); return () => this.actionListeners.delete(fn); }
  async updateSettings(patch: Partial<Settings>) {
    if (patch.autostart) throw new Error('自動起動はWindowsアプリで利用できます。');
    const candidate = structuredClone(this.value.data);
    if (patch.character) switchCharacter(candidate, patch.character);
    candidate.settings = { ...candidate.settings, ...patch }; validateSettings(candidate.settings);
    const switched = candidate.settings.character !== this.value.data.settings.character;
    const center = this.view.x + this.view.width / 2, floor = this.view.y + this.view.height * 206 / 224;
    this.value.data = candidate; if (switched) this.resetInteraction();
    this.updateSize(); this.view.x = center - this.view.width / 2; this.view.y = floor - this.view.height * 206 / 224; this.clamp();
    this.desktopListeners.forEach(fn => fn(structuredClone(this.view))); return this.emit();
  }
  async action(action: PetAction) {
    if (this.value.data.settings.focusMode) throw new Error('作業に集中モードを解除すると、お世話できます。');
    if (this.pressStart) throw new Error('この子を下ろしてからお世話してください。');
    const coolingDown = performance.now() - this.lastAction < 4000;
    if (coolingDown && !(action === 'pet' && this.value.data.settings.character === 'gugugaga')) throw new Error('いまの反応が終わるまで、少し待ってください。');
    const needs = this.value.data.needs;
    if (!coolingDown) {
      this.lastAction = performance.now();
      if (action === 'feed') needs.fullness = Math.min(100, needs.fullness + 22);
      if (action === 'play') needs.energy = Math.max(10, needs.energy - 3);
      needs.affection = Math.min(100, needs.affection + (action === 'play' ? 2 : action === 'feed' ? 1 : .8));
      if (action === 'pet') needs.energy = Math.min(100, needs.energy + .4);
    }
    const event = { action, character: this.value.data.settings.character };
    this.actionListeners.forEach(fn => fn(event)); this.channel?.postMessage({ event }); return this.emit();
  }
  async frame(frame: NativeFrame) { if (frame.character === this.value.data.settings.character) this.velocity = frame.velocity; }
  async press() {
    if (this.menu || this.value.data.settings.focusMode) return;
    this.view.pressed = true;
    this.pressStart = { x: this.view.cursor.x, y: this.view.cursor.y, offsetX: this.view.cursor.x - this.view.x, offsetY: this.view.cursor.y - this.view.y };
  }
  async release() {
    if (!this.pressStart) return;
    const click = !this.view.dragging; this.view.dragging = false; this.view.pressed = false; this.pressStart = null; this.velocity = 0; this.clamp();
    if (click) { if (this.value.data.settings.character === 'gugugaga') this.actionListeners.forEach(fn => fn({ action: 'poke', character: 'gugugaga' })); try { await this.action('pet'); } catch { /* action cooldown */ } }
    this.emit();
  }
  async openMenu(position: Point) {
    if (this.menu || !this.value.visible || this.value.data.settings.focusMode) return;
    this.pressStart = null; this.view.pressed = false; this.view.dragging = false; this.velocity = 0;
    this.menu = showPetMenu(position, [
      { label: `${CHARACTERS[this.value.data.settings.character].label}を隠す`, run: () => this.setVisible(false) },
      { label: 'お世話と設定を開く', run: () => this.openSettings() },
      { label: 'まどねこを終了', run: () => this.quit() },
    ], `${CHARACTERS[this.value.data.settings.character].label}のメニュー`);
    try { await this.menu.closed; }
    finally { this.menu = null; this.velocity = 0; }
  }
  async openSettings() { window.open('?view=settings', 'madoneko-settings', 'width=880,height=800'); }
  async setVisible(visible: boolean) { this.value.visible = visible; return this.emit(); }
  async rescue() { this.view.x = innerWidth / 2 - 128; this.view.y = innerHeight - 340; this.clamp(); await this.setVisible(true); }
  async quit() { await this.setVisible(false); }
  dispose() { this.menu?.dismiss(); if (this.timer) clearInterval(this.timer); this.channel?.close(); removeEventListener('pointermove', this.pointer); removeEventListener('pointerup', this.up); removeEventListener('resize', this.resize); this.snapshotListeners.clear(); this.desktopListeners.clear(); this.actionListeners.clear(); }
}
