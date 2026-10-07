import { isTauri } from '@tauri-apps/api/core';
import { CatBehavior } from './core/behavior';
import { CAT_STATES, PET_STATES, type CharacterId, type PetState, type Desktop, type Snapshot } from './core/types';
import { createRenderer, prepareCharacters } from './render/characters';
import { CHARACTERS, characterSize } from './core/characters';
import { NativePlatform } from './platform/native';
import { IpcBackoff } from './platform/backoff';
import { PreviewPlatform } from './platform/preview';
import type { Unsubscribe } from './platform/platform';
import { PetSound } from './ui/sound';
import './style.css';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('アプリの表示領域がありません。');
const platform = isTauri() ? new NativePlatform() : new PreviewPlatform();
const subscriptions: Unsubscribe[] = [];
let disposeView = () => {};
const errors = document.createElement('p'); errors.className = 'app-error'; errors.setAttribute('role', 'alert'); errors.hidden = true;
function report(error: unknown) { errors.textContent = error instanceof Error ? error.message : String(error); errors.hidden = false; }
const params = new URLSearchParams(location.search);
async function boot(container: HTMLElement) {
  await prepareCharacters();
  if (params.get('view') === 'settings') {
    document.body.classList.add('settings-view');
    const { mountSettings } = await import('./ui/settings');
    disposeView = await mountSettings(container, platform); return;
  }
  if (!platform.native && params.get('view') === 'gallery') {
    document.body.classList.add('gallery-view');
    const heading = document.createElement('h1'); heading.textContent = 'こむぎの一日'; container.append(heading);
    const grid = document.createElement('div'); grid.className = 'gallery-grid'; container.append(grid);
    const character: CharacterId = params.get('character') === 'gugugaga' ? 'gugugaga' : 'cat';
    heading.textContent = character === 'cat' ? 'こむぎの一日' : 'ググガガの一日';
    const cats: ReturnType<typeof createRenderer>[] = [];
    const descriptions: Record<PetState, string> = {
      idle: 'くつろぐ猫', walk: '歩く猫', sit: '座る猫', sleep: '眠る猫', stretch: '伸びをする猫',
      groom: '毛づくろいする猫', happy: '喜ぶ猫', eat: 'ごはんを食べる猫', play: '遊ぶ猫', dragged: '抱き上げられた姿', sulk: '拗ねる', land: '着地', wake: '目覚め', stumble: 'つまずく',
    };
    (character === 'cat' ? CAT_STATES : PET_STATES).forEach(state => {
      const card = document.createElement('section');
      const canvas = document.createElement('canvas'); canvas.dataset.state = state;
      canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', descriptions[state]);
      card.append(canvas); grid.append(card);
      const cat = createRenderer(canvas, character); cats.push(cat);
      cat.draw({ state, time: 0, direction: 1, speed: 52, lookX: 0, lookY: 0 });
      cat.draw({ state, time: 2.3, direction: 1, speed: 52, lookX: 0, lookY: 0 });
    });
    disposeView = () => cats.forEach(cat => cat.dispose()); return;
  }
  document.body.classList.add(platform.native ? 'pet-view' : 'preview-view');
  const canvas = document.createElement('canvas'); canvas.className = 'pet-canvas'; canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', '猫。クリックでなでる、ドラッグで移動、右クリックでメニュー');
  container.append(canvas, errors);
  let character: CharacterId = 'cat';
  let renderer = createRenderer(canvas, character); let behavior = new CatBehavior(Math.random, character); let sound = new PetSound();
  let snapshot: Snapshot | undefined; let desktop: Desktop | undefined;
  let raf = 0; let disposed = false; let previous = 0; let lastPaint = 0; let behaviorTime = 0;
  let frameIpc = new IpcBackoff();
  let frameError: string | null = null;
  const characterButtons: { button: HTMLButtonElement; suffix: string }[] = [];
  let menuOpen = false;
  let output = { state: 'idle' as const, time: 0, direction: 1 as const, speed: 0, lookX: 0, lookY: 0, velocity: 0 } as ReturnType<CatBehavior['step']>;
  const canAnimate = () => Boolean(snapshot?.visible && !document.hidden && !menuOpen);
  function start() { if (!disposed && !raf && canAnimate()) { previous = 0; raf = requestAnimationFrame(tick); } }
  function tick(now: number) {
    raf = 0;
    if (!snapshot || !desktop || !canAnimate() || disposed) return;
    const interval = output.state === 'sleep' ? 1000 / 15 : 1000 / 30;
    if (now - lastPaint >= interval - 1) {
      const raw = previous ? (now - previous) / 1000 : 0; const dt = raw > .25 ? 0 : raw;
      previous = now; lastPaint = now; behaviorTime += dt;
      let send = false;
      if (behaviorTime >= .095) {
        behavior.setDragged(desktop.dragging);
        output = behavior.step(behaviorTime, { settings: snapshot.data.settings, needs: snapshot.data.needs, desktop, visible: snapshot.visible });
        behaviorTime = 0; send = true;
      } else { output = { ...output, time: output.time + dt }; }
      // The native loop holds still as soon as a press begins, even before drag threshold.
      if (desktop.pressed) output.velocity = 0;
      renderer.draw({ ...output, speed: output.speed / characterSize(snapshot.data.settings).scale });
      canvas.style.cursor = snapshot.data.settings.focusMode ? 'default' : desktop.dragging ? 'grabbing' : 'grab';
      if (!platform.native) {
        canvas.style.transform = `translate(${desktop.x}px, ${desktop.y}px)`;
        canvas.style.width = `${desktop.width}px`; canvas.style.height = `${desktop.height}px`;
        canvas.style.pointerEvents = snapshot.data.settings.focusMode ? 'none' : 'auto';
      }
      if (send) {
        void frameIpc.run(() => platform.frame({ character, velocity: output.velocity, state: output.state, mask: renderer.hitMask() }),
          error => { report(error); frameError = errors.textContent; },
          () => { if (errors.textContent === frameError) errors.hidden = true; frameError = null; });
      }
      canvas.dataset.state = output.state; canvas.dataset.character = character; canvas.dataset.speech = output.speech ?? '';
    }
    raf = requestAnimationFrame(tick);
  }
  const update = (value: Snapshot) => {
    if (snapshot && value.revision < snapshot.revision) return;
    if (character !== value.data.settings.character) {
      cancelAnimationFrame(raf); raf = 0; previous = lastPaint = behaviorTime = 0;
      frameIpc.dispose(); frameIpc = new IpcBackoff(); frameError = null;
      renderer.dispose(); sound.dispose(); character = value.data.settings.character;
      renderer = createRenderer(canvas, character); behavior = new CatBehavior(Math.random, character); sound = new PetSound();
      output = { state: 'idle', time: 0, direction: 1, speed: 0, lookX: 0, lookY: 0, velocity: 0 };
      errors.hidden = true; canvas.dataset.character = character; canvas.dataset.speech = '';
    }
    if (snapshot?.data.settings.sound && !value.data.settings.sound) { sound.dispose(); sound = new PetSound(); }
    snapshot = value; canvas.hidden = !value.visible;
    for (const { button, suffix } of characterButtons) button.textContent = CHARACTERS[character].label + suffix;
    canvas.setAttribute('aria-label', `${value.data.settings.name}。クリックでなでる、ドラッグで移動、右クリックでメニュー`);
    if (!value.visible) {cancelAnimationFrame(raf);raf = 0;previous = 0;} else start();
  };
  subscriptions.push(await platform.subscribeSnapshot(update));
  subscriptions.push(await platform.subscribeDesktop(value => { desktop = value; start(); }));
  subscriptions.push(await platform.subscribeAction(event => {
    if (event.character !== character) return;
    if (event.action === 'poke') { behavior.poke(); return; }
    behavior.interact(event.action, true);
    if (snapshot?.data.settings.sound) void sound.play(event.action, character, snapshot.data.settings.volume).catch(() => {});
  }));
  desktop = await platform.desktop(); update(await platform.snapshot());
  const onCat = (event: MouseEvent) => {
    const bounds = canvas.getBoundingClientRect();
    return renderer.hitTest((event.clientX - bounds.left) / bounds.width * 256, (event.clientY - bounds.top) / bounds.height * 224);
  };
  const down = (event: PointerEvent) => {
    if (event.button !== 0 || menuOpen || !onCat(event)) return;
    event.preventDefault(); void platform.press().catch(report);
  };
  const up = (event: PointerEvent) => { if (event.button === 0) void platform.release().catch(report); };
  const context = (event: MouseEvent) => {
    event.preventDefault();
    const keyboard = event.button === 0;
    if (menuOpen || !snapshot?.visible || snapshot.data.settings.focusMode || (!keyboard && !onCat(event))) return;
    const bounds = canvas.getBoundingClientRect();
    const position = keyboard ? { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 }
      : { x: event.clientX, y: event.clientY };
    menuOpen = true; cancelAnimationFrame(raf); raf = 0; previous = 0;
    errors.hidden = true;
    void platform.openMenu(position).catch(report).finally(() => { menuOpen = false; start(); });
  };
  const visibility = () => { if (document.hidden) {cancelAnimationFrame(raf);raf = 0;previous = 0;} else start(); };
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointerup', up); canvas.addEventListener('contextmenu', context);
  document.addEventListener('visibilitychange', visibility);
  if (!platform.native) {
    const intro = document.createElement('div'); intro.className = 'preview-intro';
    intro.innerHTML = '<span class="wordmark">まどねこ <small>MadoNeko</small></span><h1>いつもの窓辺に、<br>小さな同居人。</h1><p>なでたり、遊んだり。<br>何もしない時間も、一緒に。</p><span class="preview-note">Webプレビュー · Windowsの入力透過・トレイはアプリで動作します</span>';
    const controls = document.createElement('nav'); controls.className = 'preview-controls'; controls.setAttribute('aria-label', 'プレビュー操作');
    const buttons: [string, () => Promise<unknown>][] = [
      ['なでる', () => platform.action('pet')], ['ご飯', () => platform.action('feed')], ['おもちゃ', () => platform.action('play')],
      ['お世話と設定', () => platform.openSettings()], ['集中モード切替', () => platform.updateSettings({ focusMode: !snapshot?.data.settings.focusMode })],
      ['を隠す', () => platform.setVisible(false)],
      ['を呼ぶ', () => platform.rescue()],
    ];
    for (const [text, action] of buttons) {
      const b = document.createElement('button'); b.textContent = text;
      if (text.startsWith('を')) { characterButtons.push({ button: b, suffix: text }); b.textContent = CHARACTERS[character].label + text; }
      b.onclick = () => { errors.hidden = true; void action().catch(report); }; controls.append(b);
    }
    container.append(intro, controls);
  }
  disposeView = () => { disposed = true;frameIpc.dispose();cancelAnimationFrame(raf);renderer.dispose();sound.dispose();canvas.removeEventListener('pointerdown', down);canvas.removeEventListener('pointerup', up);canvas.removeEventListener('contextmenu', context);document.removeEventListener('visibilitychange', visibility); };
}
void boot(root).catch(error => { root.append(errors); report(error); });
window.addEventListener('beforeunload', () => { disposeView(); subscriptions.forEach(unsubscribe => unsubscribe()); platform.dispose(); }, { once: true });
