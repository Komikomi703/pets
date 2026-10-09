import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import type { Platform } from '../src/platform/platform';
import type { Snapshot } from '../src/core/types';

const storageKey = 'madoneko-web-preview-v1';
const artifacts = 'artifacts/visual';

async function settings(page: Page) {
  await page.goto('/?view=settings');
  await expect(page.getByRole('heading', { name: 'お世話' })).toBeVisible();
}

async function stored(page: Page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '{}') as { settings?: Record<string, unknown>; needs?: Record<string, number> }, storageKey);
}

async function rightClickCat(page: Page) {
  const canvas = page.locator('.pet-canvas');
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute('data-state', /\w+/);
  const point = await canvas.evaluate((node: HTMLCanvasElement) => {
    const bounds = node.getBoundingClientRect();
    return { x: bounds.left + bounds.width * 125 / 256, y: bounds.top + bounds.height * 160 / 224 };
  });
  await page.mouse.click(point.x, point.y, { button: 'right' });
  await expect(page.getByRole('menu', { name: '猫のメニュー' })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
});

test('Japanese settings controls and accessible care indicators render', async ({ page }) => {
  await settings(page);
  await expect(page.getByLabel('おなまえ')).toHaveValue('こむぎ');
  await expect(page.getByLabel('せいかく')).toHaveValue('calm');
  await expect(page.getByLabel('大きさ')).toHaveValue('100');
  await expect(page.getByRole('button', { name: 'ごはん' })).toBeVisible();
  for (const label of ['おなか', 'げんき', 'なかよし']) {
    await expect(page.getByRole('progressbar', { name: label })).toHaveAttribute('aria-valuenow', /\d+/);
  }
  await expect(page.getByText('ブラウザプレビュー中です。', { exact: false })).toBeVisible();
});

test('name, personality and size survive reload', async ({ page }) => {
  await settings(page);
  await page.getByLabel('おなまえ').fill('みけ');
  await page.getByLabel('おなまえ').press('Tab');
  await page.getByLabel('せいかく').selectOption('energetic');
  await page.getByLabel('大きさ').fill('130');
  await page.getByLabel('大きさ').dispatchEvent('change');
  await expect.poll(async () => (await stored(page)).settings?.size).toBe(1.3);
  await page.reload();
  await expect(page.getByLabel('おなまえ')).toHaveValue('みけ');
  await expect(page.getByLabel('せいかく')).toHaveValue('energetic');
  await expect(page.getByLabel('大きさ')).toHaveValue('130');
  await expect(page.getByText('みけ との毎日')).toBeVisible();
});

test('blank and overlong names are rejected without replacing saved name', async ({ page }) => {
  await settings(page);
  const name = page.getByLabel('おなまえ');
  await name.fill('   ');
  await name.press('Tab');
  await expect(name).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#pet-name-error')).toContainText('1〜20文字');
  await expect(page.getByText('こむぎ との毎日')).toBeVisible();
  await name.fill('あ'.repeat(21));
  await name.press('Tab');
  await expect(name).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('こむぎ との毎日')).toBeVisible();
});

test('focus mode suppresses care actions and disables preview pointer input', async ({ page }) => {
  await settings(page);
  await page.getByLabel('集中モード').check();
  await expect.poll(async () => (await stored(page)).settings?.focusMode).toBe(true);
  const before = (await stored(page)).needs;
  await page.getByRole('button', { name: 'ごはん' }).click();
  await expect(page.locator('.inline-status')).toContainText('集中モード');
  expect((await stored(page)).needs).toEqual(before);
  await page.goto('/');
  await expect(page.locator('.pet-canvas')).toHaveCSS('pointer-events', 'none');
  await page.getByRole('button', { name: '集中モード切替' }).click();
  await expect(page.locator('.pet-canvas')).toHaveCSS('pointer-events', 'auto');
});

test('care actions update needs and cooldown reports a useful message', async ({ page }) => {
  await settings(page);
  const initial = Number(await page.getByRole('progressbar', { name: 'おなか' }).getAttribute('aria-valuenow'));
  await page.getByRole('button', { name: 'ごはん' }).click();
  await expect(page.locator('.inline-status')).toContainText('ごはんをあげました');
  expect(Number((await stored(page)).needs?.fullness)).toBeGreaterThan(initial);
  await page.getByRole('button', { name: 'あそぶ' }).click();
  await expect(page.locator('.inline-status')).toContainText('少し待って');
});

test('hiding and rescuing the cat works through settings', async ({ page }) => {
  await settings(page);
  await page.getByRole('button', { name: 'ねこを隠す' }).click();
  await expect(page.getByRole('button', { name: 'ねこを表示' })).toBeVisible();
  await page.getByRole('button', { name: '画面内に戻す' }).click();
  await expect(page.getByRole('button', { name: 'ねこを隠す' })).toBeVisible();
});

test('settings preview stays still when reduced motion is requested', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await settings(page);
  const preview = page.locator('.cat-preview');
  await expect.poll(() => preview.evaluate((canvas: HTMLCanvasElement) =>
    canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
      .some((channel, index) => index % 4 === 3 && channel > 0))).toBe(true);
  const first = await preview.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  await page.waitForTimeout(320);
  expect(await preview.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).toBe(first);
});

test('daily care fits above the fold at desktop and narrow sizes', async ({ page }) => {
  for (const viewport of [{ width: 860, height: 740 }, { width: 640, height: 550 }, { width: 390, height: 780 }]) {
    await page.setViewportSize(viewport);
    await settings(page);
    for (const name of ['ごはん', 'なでる', 'あそぶ']) {
      await expect(page.getByRole('button', { name, exact: true })).toBeInViewport({ ratio: 1 });
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    await expect(page.locator('.character-selected:visible')).toHaveText('✓ 一緒にいる');
    await expect(page.getByRole('progressbar', { name: 'おなか' })).toHaveAttribute('aria-valuetext', 'おなかいっぱい、78%');
  }
});

for (const character of ['猫', 'ググガガ']) {
  test(`${character} settings preview responds to care and returns to rest`, async ({ page }) => {
    await settings(page);
    await page.getByRole('button', { name: character, exact: true }).click();
    const preview = page.locator('.cat-preview');
    await expect(preview).toHaveAttribute('data-state', 'sit');
    await page.clock.install();
    for (const [label, state, description] of [
      ['ごはん', 'eat', '食べている'], ['なでる', 'happy', '喜んでいる'], ['あそぶ', 'play', '遊んでいる'],
    ]) {
      const before = await preview.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
      await page.getByRole('button', { name: label, exact: true }).click();
      await page.clock.runFor(400);
      await expect(preview).toHaveAttribute('data-state', state!);
      await expect(preview).toHaveAttribute('aria-label', new RegExp(description!));
      expect(await preview.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).not.toBe(before);
      await page.clock.fastForward(4200);
      await page.clock.runFor(100);
      await expect(preview).toHaveAttribute('data-state', 'sit');
    }
  });
}

test('reduced motion shows a static care pose and switching clears the reaction', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await settings(page);
  const preview = page.locator('.cat-preview');
  await expect(preview).toHaveAttribute('data-state', 'sit');
  const idle = await preview.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  await page.getByRole('button', { name: 'なでる', exact: true }).click();
  await expect(preview).toHaveAttribute('data-state', 'happy');
  const happy = await preview.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  expect(happy).not.toBe(idle);
  await page.waitForTimeout(320);
  expect(await preview.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).toBe(happy);
  await page.getByRole('button', { name: 'ググガガ', exact: true }).click();
  await expect(preview).toHaveAttribute('data-character', 'gugugaga');
  await expect(preview).toHaveAttribute('data-state', 'sit');
  await expect(page.locator('.inline-status')).toBeEmpty();
  await expect(page.getByRole('button', { name: 'ググガガ', exact: true }).locator('.character-selected')).toBeVisible();
  await page.getByLabel('集中モード').check();
  await page.getByRole('button', { name: 'ごはん', exact: true }).click();
  await expect(page.locator('.inline-status')).toContainText('集中モード');
  await expect(preview).toHaveAttribute('data-state', 'sit');
});

test('discard exit appears only after a save error and asks before losing changes', async ({ page }) => {
  await page.goto('/?view=gallery');
  const result = await page.evaluate(async () => {
    const settingsUrl = '/src/ui/settings.ts';
    const typesUrl = '/src/core/types.ts';
    const [{ mountSettings }, { DEFAULT_SETTINGS, DEFAULT_NEEDS }] = await Promise.all([
      import(/* @vite-ignore */ settingsUrl) as Promise<typeof import('../src/ui/settings')>,
      import(/* @vite-ignore */ typesUrl) as Promise<typeof import('../src/core/types')>,
    ]);
    const value: Snapshot = {
      data: { schemaVersion: 2, settings: { ...DEFAULT_SETTINGS }, needs: { ...DEFAULT_NEEDS }, profiles: { cat: { name: 'こむぎ', needs: { ...DEFAULT_NEEDS } }, gugugaga: { name: 'ググガガ', needs: { ...DEFAULT_NEEDS } } }, position: null, savedAt: Date.now() },
      revision: 0, visible: true, saveError: null, warning: null,
    };
    const calls: boolean[] = [];
    let sendSnapshot: ((snapshot: Snapshot) => void) | undefined;
    const platform = {
      native: true,
      subscribeSnapshot: async (fn: (snapshot: Snapshot) => void) => { sendSnapshot = fn; return () => {}; },
      snapshot: async () => value,
      quit: async (discard?: boolean) => { calls.push(Boolean(discard)); },
    } as Platform;
    const host = document.createElement('div');
    document.body.append(host);
    const dispose = await mountSettings(host, platform);
    const absentBeforeError = host.querySelector('.discard-button') === null;
    sendSnapshot?.({ ...value, revision: 1, saveError: 'ディスクに書き込めません' });
    const button = host.querySelector<HTMLButtonElement>('.discard-button')!;
    const visibleOnError = button?.textContent === '保存せず終了';
    window.confirm = () => false;
    button.click();
    await Promise.resolve();
    const canceled = calls.length === 0;
    window.confirm = () => true;
    button.click();
    await Promise.resolve();
    const confirmed = calls.length === 1 && calls[0] === true;
    dispose();
    return { absentBeforeError, visibleOnError, canceled, confirmed };
  });
  expect(result).toEqual({ absentBeforeError: true, visibleOnError: true, canceled: true, confirmed: true });
});

test('click pets while drag moves the cat without a second care action', async ({ page }) => {
  await page.goto('/');
  const canvas = page.locator('.pet-canvas');
  await expect(canvas).toHaveAttribute('data-state', /\w+/);
  const point = await canvas.evaluate((node: HTMLCanvasElement) => {
    const bounds = node.getBoundingClientRect();
    const data = node.getContext('2d')!.getImageData(0, 0, node.width, node.height).data;
    for (let y = 70; y < 195; y += 4) for (let x = 70; x < 200; x += 4) {
      if (data[(y * 2 * node.width + x * 2) * 4 + 3]! > 220) return { x: bounds.left + x * bounds.width / 256, y: bounds.top + y * bounds.height / 224 };
    }
    throw new Error('opaque cat pixel was not found');
  });
  const before = 35;
  await page.mouse.click(point.x, point.y);
  await expect.poll(async () => Number((await stored(page)).needs?.affection)).toBeGreaterThan(before);
  const afterClick = Number((await stored(page)).needs?.affection);
  const xBefore = (await canvas.boundingBox())!.x;
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 70, point.y - 20, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await canvas.boundingBox())!.x).toBeGreaterThan(xBefore + 40);
  expect(Number((await stored(page)).needs?.affection)).toBe(afterClick);
});

test('right-click hides the cat without petting it and the cat can be recalled', async ({ page }) => {
  await page.goto('/');
  await rightClickCat(page);
  await expect(page.getByRole('menuitem', { name: 'まどねこを終了' })).toBeVisible();
  await page.getByRole('menuitem', { name: '猫を隠す' }).click();
  await expect(page.locator('.pet-canvas')).toBeHidden();
  await expect(page.getByRole('menu')).toHaveCount(0);
  expect((await stored(page)).needs?.affection).toBe(35);
  await page.getByRole('button', { name: '猫を呼ぶ' }).click();
  await expect(page.locator('.pet-canvas')).toBeVisible();
  await rightClickCat(page);
  await page.getByRole('menuitem', { name: 'まどねこを終了' }).click();
  await expect(page.locator('.pet-canvas')).toBeHidden();
});

test('menu pauses the cat, dismisses safely and stays within a small viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto('/');
  const canvas = page.locator('.pet-canvas');
  await rightClickCat(page);
  const menu = page.getByRole('menu');
  const menuBounds = (await menu.boundingBox())!;
  expect(menuBounds.x).toBeGreaterThanOrEqual(0);
  expect(menuBounds.y).toBeGreaterThanOrEqual(0);
  expect(menuBounds.x + menuBounds.width).toBeLessThanOrEqual(390);
  expect(menuBounds.y + menuBounds.height).toBeLessThanOrEqual(780);
  const frozen = await canvas.evaluate((node: HTMLCanvasElement) => ({ pixels: node.toDataURL(), style: node.style.transform }));
  await page.waitForTimeout(500);
  expect(await canvas.evaluate((node: HTMLCanvasElement) => ({ pixels: node.toDataURL(), style: node.style.transform }))).toEqual(frozen);
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(canvas).toBeVisible();
  await expect.poll(() => canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL())).not.toBe(frozen.pixels);
  await rightClickCat(page);
  await page.mouse.click(12, 12);
  await expect(menu).toHaveCount(0);
  await expect(canvas).toBeVisible();
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.click(bounds.x + 2, bounds.y + 2, { button: 'right' });
  await expect(menu).toHaveCount(0);
});

test('context menu still opens settings and supports keyboard selection', async ({ page }) => {
  await page.goto('/');
  await rightClickCat(page);
  await expect(page.getByRole('menuitem', { name: '猫を隠す' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'お世話と設定を開く' })).toBeFocused();
  const popupPromise = page.waitForEvent('popup');
  await page.keyboard.press('Enter');
  const popup = await popupPromise;
  await expect(popup.getByRole('heading', { name: 'お世話' })).toBeVisible();
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(page.locator('.pet-canvas')).toBeVisible();
  await popup.close();
});

test('all cat states draw visible, unclipped silhouettes and useful hit masks', async ({ page }) => {
  await page.goto('/?view=gallery');
  const samples = await page.evaluate(async () => {
    const catUrl = '/src/render/cat.ts';
    const typesUrl = '/src/core/types.ts';
    const [{ CatRenderer }, { CAT_STATES }] = await Promise.all([
      import(/* @vite-ignore */ catUrl) as Promise<typeof import('../src/render/cat')>,
      import(/* @vite-ignore */ typesUrl) as Promise<typeof import('../src/core/types')>,
    ]);
    return CAT_STATES.flatMap(state => [0, 0.35, 1.15, 2.3].flatMap(time => ([1, -1] as const).map(direction => {
      const canvas = document.createElement('canvas');
      const renderer = new CatRenderer(canvas);
      renderer.draw({ state, time, direction, speed: 52, lookX: 0.8, lookY: -0.6 });
      const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
      let count = 0, minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0, border = 0;
      for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
        if (pixels[(y * canvas.width + x) * 4 + 3]! < 80) continue;
        count++; minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        if (x === 0 || y === 0 || x === canvas.width - 1 || y === canvas.height - 1) border++;
      }
      const mask = renderer.hitMask();
      const result = { state, time, direction, count, minX, minY, maxX, maxY, border,
        margin: renderer.hitTest(2, 2), body: renderer.hitTest(125, state === 'dragged' ? 125 : 160),
        maskSolid: mask.cells.reduce((sum, cell) => sum + cell, 0), maskWidth: mask.width, maskHeight: mask.height };
      renderer.dispose();
      return result;
    })));
  });
  expect(samples).toHaveLength(120);
  for (const sample of samples) {
    expect(sample.count, JSON.stringify(sample)).toBeGreaterThan(4000);
    expect(sample.border, JSON.stringify(sample)).toBe(0);
    expect(sample.margin, JSON.stringify(sample)).toBe(false);
    expect(sample.body, JSON.stringify(sample)).toBe(true);
    expect(sample.maskSolid, JSON.stringify(sample)).toBeGreaterThan(100);
    expect([sample.maskWidth, sample.maskHeight]).toEqual([64, 56]);
    if (sample.state === 'dragged') expect(sample.maxY, JSON.stringify(sample)).toBeLessThan(390);
  }
});

test('gallery, settings and preview screenshots', async ({ page }) => {
  await mkdir(artifacts, { recursive: true });
  await page.setViewportSize({ width: 1450, height: 800 });
  await page.goto('/?view=gallery');
  await expect(page.locator('.gallery-grid canvas')).toHaveCount(15);
  await page.screenshot({ path: `${artifacts}/gallery.png`, fullPage: true });
  await page.setViewportSize({ width: 860, height: 1000 });
  await settings(page);
  await page.screenshot({ path: `${artifacts}/settings.png` });
  await page.screenshot({ path: `${artifacts}/settings-full.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 780 });
  await settings(page);
  await expect(page.getByRole('button', { name: '画面内に戻す' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: `${artifacts}/settings-mobile.png`, fullPage: true });
  await page.setViewportSize({ width: 1450, height: 800 });
  await page.goto('/');
  await expect(page.locator('.pet-canvas')).toHaveAttribute('data-state', /\w+/);
  await page.screenshot({ path: `${artifacts}/preview.png`, fullPage: true });
});

test('Gugugaga has independent profiles, switches live repeatedly and restores after reload', async ({ page, context }) => {
  await settings(page);
  await page.getByLabel('おなまえ').fill('みけ'); await page.getByLabel('おなまえ').press('Tab');
  await expect.poll(async () => (await stored(page)).settings?.name).toBe('みけ');
  const petPage = await context.newPage(); await petPage.goto('/');
  const pet = petPage.locator('.pet-canvas'); await expect(pet).toHaveAttribute('data-character', 'cat');
  const cdp = await context.newCDPSession(petPage);
  async function listeners() {
    const { result } = await cdp.send('Runtime.evaluate', { expression: 'document.querySelector(".pet-canvas")' });
    const events = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId! });
    return events.listeners.map(event => event.type).sort();
  }
  const before = await listeners();
  await page.getByRole('button', { name: 'ググガガ', exact: true }).click();
  await expect(pet).toHaveAttribute('data-character', 'gugugaga');
  await expect(page.getByLabel('おなまえ')).toHaveValue('ググガガ');
  await page.getByLabel('おなまえ').fill('ぐーちゃん'); await page.getByLabel('おなまえ').press('Tab');
  await page.getByRole('button', { name: 'ごはん', exact: true }).click();
  await expect(pet).toHaveAttribute('data-state', 'eat');
  const fed = Number((await stored(page)).needs?.fullness);
  for (let i = 0; i < 8; i++) {
    await page.getByRole('button', { name: '猫', exact: true }).click();
    await expect(pet).toHaveAttribute('data-character', 'cat');
    await expect(page.getByLabel('おなまえ')).toHaveValue('みけ');
    expect(Number((await stored(page)).needs?.fullness)).toBe(78);
    await page.getByRole('button', { name: 'ググガガ', exact: true }).click();
    await expect(pet).toHaveAttribute('data-character', 'gugugaga');
    await expect(page.getByLabel('おなまえ')).toHaveValue('ぐーちゃん');
    expect(Number((await stored(page)).needs?.fullness)).toBe(fed);
  }
  expect(await listeners()).toEqual(before);
  await expect(petPage.locator('.pet-canvas')).toHaveCount(1);
  await expect(petPage.locator('.app-error')).toBeHidden();
  await page.getByLabel('音量').fill('0'); await page.getByLabel('音量').dispatchEvent('change');
  await expect.poll(async () => (await stored(page)).settings?.volume).toBe(0);
  await page.reload(); await petPage.reload();
  await expect(pet).toHaveAttribute('data-character', 'gugugaga');
  await expect(page.getByLabel('おなまえ')).toHaveValue('ぐーちゃん');
  await expect(page.getByLabel('音量')).toHaveValue('0');
  await expect(page.locator('#pet-sound')).not.toBeChecked();
  await page.screenshot({ path: `${artifacts}/gugugaga-settings.png`, fullPage: true });
  await petPage.close();
});

test('Gugugaga reacts to direct touch, sulks, lands, clamps and supports focus/menu', async ({ page }) => {
  await settings(page);
  await page.getByRole('button', { name: 'ググガガ', exact: true }).click();
  await expect(page.getByRole('button', { name: 'ググガガ', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.goto('/');
  const pet = page.locator('.pet-canvas'); await expect(pet).toHaveAttribute('data-character', 'gugugaga');
  const point = async () => pet.evaluate((c: HTMLCanvasElement) => { const b = c.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height * .7 }; });
  await page.getByRole('button', { name: 'ご飯', exact: true }).click(); await expect(pet).toHaveAttribute('data-state', 'eat');
  const afterFood = (await stored(page)).needs?.affection;
  let p = await point(); await page.mouse.click(p.x, p.y);
  await expect(pet).toHaveAttribute('data-state', 'happy'); await expect(pet).toHaveAttribute('data-speech', 'ぐぐがが〜');
  expect((await stored(page)).needs?.affection).toBe(afterFood);
  await page.screenshot({ path: `${artifacts}/gugugaga-happy.png` });
  for (let i = 0; i < 3; i++) { p = await point(); await page.mouse.click(p.x, p.y); }
  await expect(pet).toHaveAttribute('data-state', 'sulk');
  await expect(pet).toHaveAttribute('data-speech', '');
  await page.screenshot({ path: `${artifacts}/gugugaga-sulk.png` });
  await expect(pet).toHaveAttribute('data-state', 'idle', { timeout: 3500 });
  p = await point(); const start = (await pet.boundingBox())!;
  await page.mouse.move(p.x, p.y); await page.mouse.down();
  await page.mouse.move(p.x - 130, p.y - 45, { steps: 8 });
  await expect(pet).toHaveAttribute('data-state', 'dragged');
  await page.mouse.up(); await expect(pet).toHaveAttribute('data-state', 'land');
  expect((await pet.boundingBox())!.x).toBeLessThan(start.x - 80);
  p = await point(); await page.mouse.move(p.x, p.y); await page.mouse.down();
  await page.mouse.move(1278, 718, { steps: 10 }); await page.mouse.up();
  await expect.poll(async () => { const b = (await pet.boundingBox())!; return b.y + b.height; }).toBeLessThanOrEqual(634);
  const bounds = (await pet.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(16); expect(bounds.x + bounds.width).toBeLessThanOrEqual(1264);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(634);
  await page.getByRole('button', { name: '集中モード切替' }).click(); await expect(pet).toHaveCSS('pointer-events', 'none');
  await page.getByRole('button', { name: '集中モード切替' }).click(); await expect(pet).toHaveCSS('pointer-events', 'auto');
  p = await point(); await page.mouse.click(p.x, p.y, { button: 'right' });
  await expect(page.getByRole('menu', { name: 'ググガガのメニュー' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'ググガガを隠す' }).click(); await expect(pet).toBeHidden();
  await page.getByRole('button', { name: 'ググガガを呼ぶ' }).click(); await expect(pet).toBeVisible();
  await expect(page.locator('.app-error')).toBeHidden();
});

test('all Gugugaga parts stay inside the canvas, animate and leave transparent hit margins', async ({ page }) => {
  await page.goto('/?view=gallery&character=gugugaga');
  await expect(page.locator('.gallery-grid canvas')).toHaveCount(19);
  const samples = await page.evaluate(async () => {
    const renderUrl = '/src/render/gugugaga.ts', typesUrl = '/src/core/types.ts';
    const [{ GugugagaRenderer, loadGugugaga }, { PET_STATES }] = await Promise.all([
      import(/* @vite-ignore */ renderUrl) as Promise<typeof import('../src/render/gugugaga')>,
      import(/* @vite-ignore */ typesUrl) as Promise<typeof import('../src/core/types')>,
    ]);
    await loadGugugaga();
    return PET_STATES.flatMap(state => ([1, -1] as const).flatMap(direction => {
      const canvas = document.createElement('canvas'), renderer = new GugugagaRenderer(canvas);
      const results = [0, .2, .4, .8, 1.2, 2.3].map(time => {
        renderer.draw({ state, time, direction, speed: 50, lookX: .8, lookY: -.5 });
        const pixels = canvas.getContext('2d')!.getImageData(0, 0, 512, 448).data;
        let count = 0, border = 0, minY = 448, maxY = 0;
        for (let y = 0; y < 448; y++) for (let x = 0; x < 512; x++) if (pixels[(y * 512 + x) * 4 + 3]! > 160) {
          count++; minY = Math.min(y, minY); maxY = Math.max(y, maxY);
          if (x < 2 || x > 509 || y < 2 || y > 445) border++;
        }
        return { state, time, direction, count, border, minY, maxY, body: renderer.hitTest(128, 164), margin: renderer.hitTest(4, 4), mask: renderer.hitMask().cells.reduce((a, b) => a + b, 0), image: canvas.toDataURL().slice(-1200) };
      });
      renderer.dispose(); return results;
    }));
  });
  for (const sample of samples) {
    expect(sample.count, `${sample.state}/${sample.time}`).toBeGreaterThan(20000);
    expect(sample.border, `${sample.state}/${sample.time}`).toBe(0);
    expect(sample.margin).toBe(false); expect(sample.body).toBe(true); expect(sample.mask).toBeGreaterThan(300);
  }
  const idle = samples.find(s => s.state === 'idle' && s.time === 0)!;
  expect((idle.maxY - idle.minY) / 2 * .875).toBeGreaterThan(130);
  expect((idle.maxY - idle.minY) / 2 * .875).toBeLessThan(150);
  for (const state of ['idle', 'walk', 'happy', 'sulk', 'eat', 'play', 'sleep', 'dragged', 'land', 'wake', 'stumble', 'observe', 'yawn', 'sniff', 'wave', 'hop']) {
    expect(new Set(samples.filter(s => s.state === state).map(s => s.image)).size, state).toBeGreaterThan(1);
  }
  await page.screenshot({ path: `${artifacts}/gugugaga-gallery.png`, fullPage: true });
});

test('breathing and walking keep a planted paw on the same ground line in both directions', async ({ page }) => {
  await page.goto('/?view=gallery');
  const rows = await page.evaluate(async () => {
    const url = '/src/render/characters.ts';
    const { createRenderer, prepareCharacters } = await import(/* @vite-ignore */ url) as typeof import('../src/render/characters');
    await prepareCharacters();
    const rows: { character: string; state: string; direction: number; minimum: number; maximum: number }[] = [];
    for (const character of ['cat', 'gugugaga'] as const) for (const state of ['idle', 'walk'] as const) for (const direction of [-1, 1] as const) {
      const renderer = createRenderer(document.createElement('canvas'), character);
      const ground: number[] = [];
      for (let i = 0; i < 60; i++) {
        renderer.draw({ state, direction, time: i / 30, speed: state === 'walk' ? 42 : 0, lookX: 0, lookY: 0 });
        const mask = renderer.hitMask();
        let bottom = 0;
        mask.cells.forEach((value, index) => { if (value) bottom = Math.max(bottom, Math.floor(index / mask.width)); });
        ground.push(bottom);
        if (renderer.hitTest(128, 218)) throw new Error('Ground shadow must not intercept input');
      }
      rows.push({ character, state, direction, minimum: Math.min(...ground), maximum: Math.max(...ground) });
      renderer.dispose();
    }
    return rows;
  });
  for (const row of rows) {
    expect(row.maximum - row.minimum, JSON.stringify(row)).toBeLessThanOrEqual(1);
    expect(row.minimum, JSON.stringify(row)).toBeGreaterThanOrEqual(50);
    expect(row.maximum, JSON.stringify(row)).toBeLessThanOrEqual(52);
  }
});

test('character turns, repeated reactions and pose transitions retain unclipped hit silhouettes', async ({ page }) => {
  await page.goto('/?view=gallery');
  const failures = await page.evaluate(async () => {
    const url = '/src/render/characters.ts';
    const { createRenderer, prepareCharacters } = await import(/* @vite-ignore */ url) as typeof import('../src/render/characters');
    await prepareCharacters();
    const failures: string[] = [];
    for (const character of ['cat', 'gugugaga'] as const) {
      const canvas = document.createElement('canvas'), renderer = createRenderer(canvas, character);
      for (const direction of [-1, 1] as const) {
        for (const state of ['idle', 'walk', 'happy', 'happy', 'observe', 'wave', 'hop', 'sleep', 'stretch', 'dragged', 'idle'] as const) {
          for (const time of [0, .1, .25, .6, 1.2]) {
            renderer.draw({ state, time, direction, speed: state === 'walk' ? 42 : 0, lookX: direction, lookY: -.6 });
            const mask = renderer.hitMask();
            const border = mask.cells.some((value, index) => value > 0 &&
              (index < mask.width || index >= mask.width * (mask.height - 1) || index % mask.width === 0 || index % mask.width === mask.width - 1));
            if (border || mask.cells.reduce((sum, value) => sum + value, 0) < 100 || renderer.hitTest(2, 2))
              failures.push(`${character}/${direction}/${state}/${time}`);
          }
        }
      }
      renderer.dispose();
    }
    return failures;
  });
  expect(failures).toEqual([]);
});
