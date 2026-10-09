import './settings.css';
import { createRenderer, prepareCharacters, type CharacterRenderer } from '../render/characters';
import { CHARACTERS } from '../core/characters';
import type { PetAction, PetState, Personality, CharacterId, Settings, Snapshot } from '../core/types';
import type { Platform, Unsubscribe } from '../platform/platform';

type SettingKey = keyof Settings;
type SettingControl = HTMLInputElement | HTMLSelectElement;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function icon(name: 'paw' | 'bowl' | 'heart' | 'spark' | 'eye' | 'rescue'): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('ui-icon');
  const paths: Record<typeof name, string> = {
    paw: 'M12 20c-3.5 0-6.5-1.4-6.5-4.1 0-1.6 1.4-2.6 2.8-3.5 1.1-.8 1.8-2 3.7-2s2.6 1.2 3.7 2c1.4.9 2.8 1.9 2.8 3.5C18.5 18.6 15.5 20 12 20ZM5 9.5c-1.3 0-2.2-1.3-2.2-2.8S3.7 4 5 4s2.2 1.2 2.2 2.7S6.3 9.5 5 9.5Zm4-2C7.7 7.5 7 6.2 7 4.8S7.7 2 9 2s2 1.3 2 2.8-.7 2.7-2 2.7Zm6 0c-1.3 0-2-1.3-2-2.7S13.7 2 15 2s2 1.3 2 2.8-.7 2.7-2 2.7Zm4 2c-1.3 0-2.2-1.3-2.2-2.8S17.7 4 19 4s2.2 1.2 2.2 2.7S20.3 9.5 19 9.5Z',
    bowl: 'M3 12h18c0 5-3.5 8-9 8s-9-3-9-8Zm1-2h16M8 7c-1-1 1-2 0-3m5 4c-1-1 1-2 0-3m4 2c-1-1 1-2 0-3',
    heart: 'M12 20s-8-4.6-8-10.4A4.5 4.5 0 0 1 12 6.8a4.5 4.5 0 0 1 8 2.8C20 15.4 12 20 12 20Z',
    spark: 'm12 2 1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2Zm7 14 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z',
    eye: 'M2 12s3.7-6 10-6 10 6 10 6-3.7 6-10 6S2 12 2 12Zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
    rescue: 'M12 3v4m0 10v4M3 12h4m10 0h4m-6.2-2.8L12 12l-2.8 2.8',
  };
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', paths[name]);
  path.setAttribute('fill', name === 'paw' ? 'currentColor' : 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.7');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.append(path);
  return svg;
}

function actionError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/cooldown|too soon|rate.limit|待|連続/i.test(message)) return '少し待ってから、もう一度おためしください。';
  return `操作できませんでした。${message}`;
}

function percent(value: number): number {
  return Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
}

export async function mountSettings(root: HTMLElement, platform: Platform): Promise<() => void> {
  await prepareCharacters();
  root.replaceChildren();
  root.classList.add('settings-root');
  let disposed = false;
  let snapshot: Snapshot | null = null;
  let unsubscribe: Unsubscribe | null = null;
  let renderer: CharacterRenderer | null = null;
  let previewCharacter: CharacterId = 'cat';
  let switching = false;
  const characterButtons = new Map<CharacterId, HTMLButtonElement>();
  let raf = 0;
  let previewStart = 0;
  let lastDraw = 0;
  let previewState: PetState = 'sit';
  let reactionTimer = 0;
  let carePending = false;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const dirty = new Set<SettingKey>();
  const requestIds = new Map<SettingKey, number>();
  const controls = new Map<SettingKey, SettingControl>();
  const values = new Map<SettingKey, HTMLElement>();

  const page = element('main', 'settings-page');
  const header = element('header', 'settings-header');
  const brand = element('div', 'brand');
  const brandMark = element('span', 'brand-mark');
  brandMark.append(icon('paw'));
  const brandText = element('div', 'brand-text');
  brandText.append(element('strong', '', 'まどねこ'), element('span', '', '小さな同居人'));
  brand.append(brandMark, brandText);
  const headerBadge = element('span', 'header-badge', 'いっしょに、のんびり。');
  header.append(brand, headerBadge);

  const content = element('div', 'settings-content');
  const hero = element('section', 'hero-card');
  hero.setAttribute('aria-label', 'まどねこのプレビュー');
  const heroCopy = element('div', 'hero-copy');
  heroCopy.append(element('span', 'eyebrow', '今日も、そばに。'));
  const catName = element('h1', 'hero-name', '読み込み中…');
  const heroDescription = element('p', 'pet-mood');
  heroCopy.append(catName, heroDescription);
  const stage = element('div', 'hero-stage');
  const canvas = element('canvas', 'cat-preview');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'まどねこのアニメーションプレビュー');
  stage.append(canvas);
  const companion = element('div', 'companion');
  companion.append(heroCopy, stage);
  hero.append(companion);

  const picker = element('section', 'panel character-picker');
  picker.append(element('h2', '', 'いっしょに過ごす子'));
  const choices = element('div', 'character-choices');
  for (const id of ['cat', 'gugugaga'] as const) {
    const card = element('button', 'character-choice'); card.type = 'button';
    card.setAttribute('aria-label', CHARACTERS[id].label); card.setAttribute('aria-pressed', 'false');
    const thumb = element('canvas', 'character-thumb'); thumb.setAttribute('aria-hidden', 'true');
    const thumbnail = createRenderer(thumb, id);
    thumbnail.draw({ state: 'idle', time: 1.2, direction: 1, speed: 0, lookX: 0, lookY: 0 }); thumbnail.dispose();
    const copy = element('span', 'character-copy'); copy.append(element('strong', '', CHARACTERS[id].label), element('small', '', CHARACTERS[id].description));
    const selected = element('span', 'character-selected', '✓ 一緒にいる');
    copy.append(selected);
    card.append(thumb, copy); choices.append(card); characterButtons.set(id, card);
    card.addEventListener('click', () => {
      if (switching || carePending || dirty.size || snapshot?.data.settings.character === id) return;
      switching = true;
      for (const control of controls.values()) control.disabled = true;
      for (const button of characterButtons.values()) button.disabled = true;
      for (const button of actionButtons.values()) button.disabled = true;
      void update('character', id).finally(() => {
        switching = false;
        for (const control of controls.values()) control.disabled = false;
        for (const button of characterButtons.values()) button.disabled = false;
        for (const button of actionButtons.values()) button.disabled = false;
      });
    });
  }
  picker.append(choices, element('p', 'field-help', '名前とお世話の状態は、それぞれの子が覚えています。'));
  const columns = element('div', 'settings-columns');
  const care = element('section', 'care-panel');
  care.append(element('h2', '', 'お世話'));
  const careIntro = element('p', 'section-intro', '今日は、なにをして過ごそう？');
  care.append(careIntro);
  const needs = element('div', 'needs');
  const needRows = new Map<'fullness' | 'energy' | 'affection', { fill: HTMLElement; value: HTMLElement; feeling: HTMLElement }>();
  const needLabels = [
    ['fullness', 'おなか', 'bowl'], ['energy', 'げんき', 'spark'], ['affection', 'なかよし', 'heart'],
  ] as const;
  for (const [key, label, symbol] of needLabels) {
    const row = element('div', 'need-row');
    const top = element('div', 'need-top');
    const name = element('span', 'need-name');
    name.append(icon(symbol), document.createTextNode(label));
    const value = element('span', 'need-value', '—');
    top.append(name, value);
    const feeling = element('span', 'need-feeling');
    const track = element('div', `need-track need-${key}`);
    track.setAttribute('role', 'progressbar');
    track.setAttribute('aria-label', label);
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', '100');
    const fill = element('span', 'need-fill');
    track.append(fill);
    row.append(top, feeling, track);
    needs.append(row);
    needRows.set(key, { fill, value, feeling });
  }
  care.append(needs);
  const careActions = element('div', 'care-actions');
  const actionButtons = new Map<PetAction, HTMLButtonElement>();
  for (const [action, label, symbol] of [
    ['feed', 'ごはん', 'bowl'], ['pet', 'なでる', 'heart'], ['play', 'あそぶ', 'spark'],
  ] as const) {
    const button = element('button', `care-button care-${action}`);
    button.type = 'button';
    button.append(icon(symbol), document.createTextNode(label));
    careActions.append(button);
    actionButtons.set(action, button);
  }
  care.append(careActions);
  const actionStatus = element('p', 'inline-status');
  actionStatus.setAttribute('role', 'status');
  actionStatus.setAttribute('aria-live', 'polite');
  care.append(actionStatus);
  hero.append(care);

  const identity = element('section', 'panel');
  identity.append(element('h2', '', 'この子らしさ'));
  const nameField = element('div', 'field');
  const nameLabel = element('label', 'field-label', 'おなまえ');
  const nameInput = element('input', 'text-input');
  nameInput.id = 'pet-name'; nameInput.type = 'text'; nameInput.maxLength = 40;
  nameInput.autocomplete = 'off'; nameInput.placeholder = 'なまえをつけてね';
  nameLabel.htmlFor = nameInput.id;
  const nameHelp = element('p', 'field-help', '1〜20文字でつけられます。');
  const nameError = element('p', 'field-error');
  nameError.id = 'pet-name-error';
  nameError.setAttribute('aria-live', 'polite');
  nameInput.setAttribute('aria-describedby', `${nameError.id} pet-name-help`);
  nameHelp.id = 'pet-name-help';
  nameField.append(nameLabel, nameInput, nameHelp, nameError);
  controls.set('name', nameInput);
  const personalityField = element('div', 'field');
  const personalityLabel = element('label', 'field-label', 'せいかく');
  const personalitySelect = element('select', 'select-input');
  personalitySelect.id = 'pet-personality';
  personalityLabel.htmlFor = personalitySelect.id;
  for (const [key, label] of [
    ['calm', 'のんびり'], ['affectionate', '甘えん坊'], ['energetic', '元気'],
  ] as const) {
    const option = element('option', '', label);
    option.value = key;
    personalitySelect.append(option);
  }
  const personalityHelp = element('p', 'field-help');
  personalityField.append(personalityLabel, personalitySelect, personalityHelp);
  controls.set('personality', personalitySelect);
  identity.append(nameField, personalityField);

  const preferences = element('section', 'panel');
  preferences.append(element('h2', '', '見た目と動き'));
  const soundPanel = element('section', 'panel');
  soundPanel.append(element('h2', '', '音とお返事'));
  const windowPanel = element('section', 'panel');
  windowPanel.append(element('h2', '', '起動と表示'));
  const slider = (parent: HTMLElement, key: 'size' | 'speed' | 'volume', label: string, min: number, max: number, step: number, help: string) => {
    const field = element('div', 'field slider-field');
    const line = element('div', 'field-line');
    const caption = element('label', 'field-label', label);
    const input = element('input', 'range-input');
    input.id = `pet-${key}`; input.type = 'range';
    input.min = String(min); input.max = String(max); input.step = String(step);
    caption.htmlFor = input.id;
    const output = element('output', 'range-value', '—');
    output.htmlFor = input.id;
    line.append(caption, output);
    field.append(line, input, element('p', 'field-help', help));
    controls.set(key, input); values.set(key, output);
    parent.append(field);
  };
  slider(preferences, 'size', '大きさ', 65, 150, 5, 'デスクトップに表示する大きさ');
  slider(preferences, 'speed', '歩く速さ', 40, 180, 10, 'ゆっくりから、ちょっと元気まで');
  slider(soundPanel, 'volume', '音量', 0, 100, 5, 'お返事の音の大きさ');
  const voiceHelp = element('p', 'field-help voice-help'); soundPanel.append(voiceHelp);
  const switchDefinitions = [
    ['sound', '反応の音・声', '初期状態はオフ。選んだ子の音でお返事します'],
    ['alwaysOnTop', 'いつも手前に表示', 'ほかのウィンドウの上で過ごします'],
    ['followMouse', 'マウスを追う', '近くのカーソルを見たり、少し近づいたりします'],
    ['autostart', 'パソコン起動時に開始', 'ログインしたら会いに来ます'],
    ['focusMode', '集中モード', 'この子へのクリックを通し、追いかけず静かに過ごします'],
  ] as const;
  for (const [key, label, help] of switchDefinitions) {
    const row = element('label', 'switch-row');
    const copy = element('span', 'switch-copy');
    copy.append(element('strong', '', label), element('small', '', help));
    const input = element('input', 'switch-input');
    input.type = 'checkbox'; input.id = `pet-${key}`;
    const track = element('span', 'switch-track');
    row.append(copy, input, track);
    (key === 'sound' ? soundPanel : key === 'followMouse' ? preferences : windowPanel).append(row);
    controls.set(key, input);
  }

  const display = element('section', 'panel display-panel');
  display.append(element('h2', '', '表示と復帰'));
  const visibilityNote = element('p', 'section-intro', 'この子が見えなくなっても、ここから呼び戻せます。');
  const displayActions = element('div', 'display-actions');
  const visibilityButton = element('button', 'secondary-button');
  visibilityButton.type = 'button'; visibilityButton.append(icon('eye'), document.createTextNode('読み込み中…'));
  const rescueButton = element('button', 'secondary-button');
  rescueButton.type = 'button'; rescueButton.append(icon('rescue'), document.createTextNode('画面内に戻す'));
  displayActions.append(visibilityButton, rescueButton);
  display.append(visibilityNote, displayActions);
  const browserNotice = element('p', 'browser-notice', 'ブラウザプレビュー中です。ウィンドウや起動設定はアプリ版で反映されます。');
  browserNotice.hidden = platform.native;
  display.append(browserNotice);

  columns.append(identity, preferences, soundPanel, windowPanel);
  const settingsHeading = element('div', 'settings-heading');
  settingsHeading.append(element('h2', '', '暮らしの設定'), element('p', 'field-help', '変更は自動で保存されます。'));
  const settingsStatus = element('p', 'settings-status');
  settingsStatus.setAttribute('role', 'status');
  settingsStatus.setAttribute('aria-live', 'polite');
  const notices = element('div', 'notices');
  notices.setAttribute('role', 'status');
  notices.setAttribute('aria-live', 'polite');
  const footer = element('footer', 'settings-footer');
  footer.append(element('p', '', 'クリック：なでる　・　ドラッグ：移動　・　右クリック：隠す／設定／終了'));
  footer.append(element('p', '', 'この画面を閉じても、この子は画面やトレイで過ごします。'));
  content.append(hero, picker, settingsHeading, columns, display, settingsStatus, notices, footer);
  page.append(header, content);
  root.append(page);

  function showError(message: string, target = actionStatus): void {
    target.textContent = message;
    target.dataset.kind = 'error';
  }

  function restMood(): string {
    if (!snapshot) return '';
    if (snapshot.data.settings.focusMode) return '集中モードで、静かにそばにいます。';
    const { fullness, energy, affection } = snapshot.data.needs;
    if (fullness < 35) return 'おなかがすいてきたみたい。';
    if (energy < 35) return '少し眠たそう。のんびりしよう。';
    if (affection < 50) return '少しかまってほしそう。';
    return 'いっしょにいられて、ごきげんです。';
  }

  function setPreviewState(state: PetState): void {
    previewState = state;
    previewStart = performance.now();
    lastDraw = 0;
    // A fresh renderer gives reduced-motion users the final pose without tweening.
    if (reducedMotion.matches && renderer) {
      renderer.dispose();
      renderer = createRenderer(canvas, previewCharacter);
    }
    visibilityChanged();
  }

  function react(action: PetAction): void {
    window.clearTimeout(reactionTimer);
    setPreviewState(action === 'feed' ? 'eat' : action === 'pet' ? 'happy' : 'play');
    heroDescription.textContent = action === 'feed' ? 'もぐもぐ、おいしいね。' : action === 'pet' ? 'なでてもらって、うれしそう。' : 'いっしょに遊んで、ごきげん！';
    reactionTimer = window.setTimeout(() => {
      reactionTimer = 0;
      if (disposed) return;
      setPreviewState('sit');
      heroDescription.textContent = restMood();
    }, 2600);
  }

  function render(current: Snapshot): void {
    if (disposed) return;
    const settings = current.data.settings;
    if (!renderer || previewCharacter !== settings.character) {
      window.clearTimeout(reactionTimer); reactionTimer = 0; previewState = 'sit';
      actionStatus.textContent = '';
      renderer?.dispose(); previewCharacter = settings.character; renderer = createRenderer(canvas, previewCharacter);
      previewStart = performance.now(); lastDraw = 0; visibilityChanged();
    }
    canvas.dataset.character = settings.character;
    if (settings.focusMode && previewState !== 'sit') {
      window.clearTimeout(reactionTimer); reactionTimer = 0; setPreviewState('sit');
    }
    if (!reactionTimer) heroDescription.textContent = restMood();
    voiceHelp.textContent = settings.character === 'gugugaga' ? '声は未収録です。いまは「ぐぐがが〜」の吹き出しでお返事します。' : '猫は、やさしい電子音でお返事します。';
    for (const [id, button] of characterButtons) {
      button.setAttribute('aria-pressed', String(id === settings.character));
      button.querySelector<HTMLElement>('.character-selected')!.hidden = id !== settings.character;
    }
    catName.textContent = `${settings.name} との毎日`;
    for (const [key, control] of controls) {
      if (dirty.has(key) || ((key === 'name' || key === 'size' || key === 'speed' || key === 'volume') && document.activeElement === control)) continue;
      const value = settings[key];
      if (control instanceof HTMLInputElement && control.type === 'checkbox') control.checked = Boolean(value);
      else if (key === 'size' || key === 'speed' || key === 'volume') control.value = String(Math.round(Number(value) * 100));
      else control.value = String(value);
      if (key === 'size' || key === 'speed' || key === 'volume') {
        const displayed = values.get(key);
        if (displayed) displayed.textContent = `${Math.round(Number(value) * 100)}%`;
      }
    }
    const descriptions: Record<Personality, string> = {
      calm: 'ひなたぼっこが好きな、のんびり屋さん。',
      affectionate: 'そばにいたい、あまえんぼさん。',
      energetic: '遊ぶのが好きな、元気いっぱいの子。',
    };
    personalityHelp.textContent = descriptions[settings.personality];
    for (const [key, row] of needRows) {
      const amount = Math.round(percent(current.data.needs[key]));
      const feelings = {
        fullness: ['おなかがすいた', 'そろそろごはん', 'おなかいっぱい'],
        energy: ['少しおやすみしたい', 'のんびりしたい', '元気いっぱい'],
        affection: ['少しかまってほしい', 'だんだんなかよし', 'だいすき！'],
      };
      row.feeling.textContent = feelings[key][amount < 35 ? 0 : amount < 70 ? 1 : 2]!;
      row.value.textContent = `${amount}%`;
      row.fill.style.width = `${amount}%`;
      row.fill.parentElement?.setAttribute('aria-valuenow', String(amount));
      row.fill.parentElement?.setAttribute('aria-valuetext', `${row.feeling.textContent}、${amount}%`);
    }
    visibilityButton.lastChild!.textContent = current.visible ? `${settings.character === 'cat' ? 'ねこ' : 'ググガガ'}を隠す` : `${settings.character === 'cat' ? 'ねこ' : 'ググガガ'}を表示`;
    notices.replaceChildren();
    if (current.saveError) {
      const saveNotice = element('div', 'notice notice-error');
      saveNotice.append(element('p', '', `保存できませんでした：${current.saveError}`));
      const discardButton = element('button', 'discard-button', '保存せず終了');
      discardButton.type = 'button';
      discardButton.addEventListener('click', async () => {
        if (!window.confirm('保存されていない変更は失われます。それでもアプリを終了しますか？')) return;
        discardButton.disabled = true;
        try { await platform.quit(true); }
        catch (error) {
          if (!disposed) showError(actionError(error));
          discardButton.disabled = false;
        }
      });
      saveNotice.append(discardButton);
      notices.append(saveNotice);
    }
    if (current.warning) notices.append(element('p', 'notice notice-warning', current.warning));
  }

  function accept(incoming: Snapshot): void {
    if (disposed || snapshot && incoming.revision < snapshot.revision) return;
    snapshot = incoming;
    render(incoming);
  }

  async function update<K extends SettingKey>(key: K, value: Settings[K]): Promise<void> {
    const id = (requestIds.get(key) ?? 0) + 1;
    requestIds.set(key, id);
    dirty.add(key);
    try {
      const next = await platform.updateSettings({ [key]: value } as Pick<Settings, K>);
      accept(next);
      if (!disposed && requestIds.get(key) === id) {
        settingsStatus.textContent = '設定を保存しました。';
        settingsStatus.dataset.kind = 'success';
      }
    } catch (error) {
      if (!disposed && requestIds.get(key) === id) showError(actionError(error), settingsStatus);
    } finally {
      if (requestIds.get(key) === id) {
        dirty.delete(key);
        if (snapshot) render(snapshot);
      }
    }
  }

  nameInput.addEventListener('input', () => {
    nameError.textContent = '';
    nameInput.removeAttribute('aria-invalid');
  });
  nameInput.addEventListener('change', () => {
    const name = nameInput.value.trim();
    const length = Array.from(name).length;
    if (length < 1 || length > 20) {
      nameError.textContent = 'おなまえは1〜20文字で入力してください。';
      nameInput.setAttribute('aria-invalid', 'true');
      return;
    }
    nameInput.value = name;
    if (snapshot?.data.settings.name !== name) void update('name', name);
  });
  personalitySelect.addEventListener('change', () => {
    const personality = personalitySelect.value as Personality;
    if (snapshot?.data.settings.personality !== personality) void update('personality', personality);
  });
  for (const key of ['size', 'speed', 'volume'] as const) {
    const input = controls.get(key) as HTMLInputElement;
    input.addEventListener('input', () => {
      const display = values.get(key);
      if (display) display.textContent = `${input.value}%`;
    });
    input.addEventListener('change', () => void update(key, Number(input.value) / 100));
  }
  for (const [key] of switchDefinitions) {
    const input = controls.get(key) as HTMLInputElement;
    input.addEventListener('change', () => void update(key, input.checked));
  }
  for (const [action, button] of actionButtons) {
    button.addEventListener('click', async () => {
      if (button.disabled || carePending || switching) return;
      carePending = true;
      const character = snapshot?.data.settings.character;
      for (const control of actionButtons.values()) control.disabled = true;
      for (const control of characterButtons.values()) control.disabled = true;
      actionStatus.textContent = '';
      try {
        accept(await platform.action(action));
        if (!disposed && snapshot?.data.settings.character === character) {
          react(action);
          actionStatus.textContent = action === 'feed' ? 'ごはんをあげました。' : action === 'pet' ? 'うれしそうにしています。' : 'いっしょに遊びました。';
          actionStatus.dataset.kind = 'success';
        }
      } catch (error) {
        if (!disposed) showError(actionError(error));
      } finally {
        carePending = false;
        for (const control of actionButtons.values()) control.disabled = switching;
        for (const control of characterButtons.values()) control.disabled = switching;
      }
    });
  }
  visibilityButton.addEventListener('click', async () => {
    if (!snapshot || visibilityButton.disabled) return;
    visibilityButton.disabled = true;
    try { accept(await platform.setVisible(!snapshot.visible)); }
    catch (error) { if (!disposed) showError(actionError(error), settingsStatus); }
    finally { visibilityButton.disabled = false; }
  });
  rescueButton.addEventListener('click', async () => {
    if (rescueButton.disabled) return;
    rescueButton.disabled = true;
    try {
      await platform.rescue();
      if (!disposed) { settingsStatus.textContent = '画面内に戻しました。'; settingsStatus.dataset.kind = 'success'; }
    } catch (error) { if (!disposed) showError(actionError(error), settingsStatus); }
    finally { rescueButton.disabled = false; }
  });

  function drawPreview(now: number): void {
    raf = 0;
    if (disposed || document.hidden || !renderer) return;
    if (lastDraw === 0 || now - lastDraw >= 80) {
      const time = reducedMotion.matches ? .35 : (now - previewStart) / 1000;
      renderer.draw({ state: previewState, time, direction: 1, speed: previewState === 'play' ? 42 : 0, lookX: 0.15, lookY: 0 });
      canvas.dataset.state = previewState;
      const poses: Partial<Record<PetState, string>> = { sit: 'くつろいでいる', eat: 'ごはんを食べている', happy: '喜んでいる', play: '遊んでいる' };
      canvas.setAttribute('aria-label', `${snapshot?.data.settings.name ?? 'ペット'}が${poses[previewState]}`);
      lastDraw = now;
    }
    if (!reducedMotion.matches) raf = requestAnimationFrame(drawPreview);
  }
  function visibilityChanged(): void {
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
    else if (!raf && renderer && !disposed) raf = requestAnimationFrame(drawPreview);
  }
  function motionChanged(): void {
    cancelAnimationFrame(raf);
    raf = 0;
    setPreviewState(previewState);
  }
  document.addEventListener('visibilitychange', visibilityChanged);
  reducedMotion.addEventListener('change', motionChanged);

  try {
    unsubscribe = await platform.subscribeSnapshot(accept);
    accept(await platform.snapshot());
    if (!disposed) {
      previewStart = performance.now();
      visibilityChanged();
    }
  } catch (error) {
    if (!disposed) showError(`設定を読み込めませんでした。${error instanceof Error ? error.message : String(error)}`);
  }

  return () => {
    if (disposed) return;
    disposed = true;
    window.clearTimeout(reactionTimer);
    unsubscribe?.();
    cancelAnimationFrame(raf);
    document.removeEventListener('visibilitychange', visibilityChanged);
    reducedMotion.removeEventListener('change', motionChanged);
    renderer?.dispose();
    root.replaceChildren();
    root.classList.remove('settings-root');
  };
}
