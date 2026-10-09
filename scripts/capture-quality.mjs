import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

await mkdir('artifacts/quality-video', { recursive: true });
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1100, height: 580 }, deviceScaleFactor: 1,
    recordVideo: { dir: 'artifacts/quality-video', size: { width: 1100, height: 580 } } });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:1420/?view=gallery');
  await page.waitForSelector('.gallery-grid canvas');
  await page.evaluate(async () => {
    const { createRenderer, prepareCharacters } = await import('/src/render/characters.ts');
    await prepareCharacters();
    document.body.innerHTML = '<main><h1>まどねこ · しぐさと表情</h1><p id="label"></p><div id="pets"></div></main>';
    const style = document.createElement('style');
    style.textContent = 'body{margin:0;background:#faf7f1;color:#604739;font:16px system-ui}main{padding:24px}h1{font-size:23px;margin:0}#pets{display:flex;gap:8px}.cell{width:256px;flex:none;border-radius:14px;background:#fffdf9;text-align:center}.dark{background:#242937;color:#eee}canvas{width:256px;height:224px;display:block}p{margin:12px}';
    document.head.append(style);
    const pets = [];
    for (const character of ['cat', 'gugugaga']) for (const theme of ['light', 'dark']) {
      const cell = document.createElement('div'); cell.className = `cell ${theme}`;
      const canvas = document.createElement('canvas');
      const label = document.createElement('p'); label.textContent = character === 'cat' ? 'こむぎ' : 'ググガガ';
      const scale = character === 'gugugaga' ? .875 : 1;
      canvas.style.width = `${256 * scale}px`; canvas.style.height = `${224 * scale}px`;
      canvas.style.margin = `${224 * (1 - scale)}px auto 0`;
      cell.append(canvas, label); document.querySelector('#pets').append(cell);
      pets.push({ renderer: createRenderer(canvas, character), character });
    }
    const states = ['idle', 'walk', 'happy', 'observe', 'wave', 'hop', 'play', 'sleep'];
    const labels = ['待機・視線', '歩き出す・体重移動', 'なでられて喜ぶ', '気づく・首をかしげる', '手を振る', '構える・跳ぶ・着地', '構えてじゃれる', '眠る'];
    const start = performance.now();
    function tick(now) {
      const elapsed = (now - start) / 1000, index = Math.min(states.length - 1, Math.floor(elapsed / 2.4));
      const t = elapsed - index * 2.4, state = states[index];
      document.querySelector('#label').textContent = labels[index];
      for (const pet of pets) pet.renderer.draw({ state, time: t, direction: 1,
        speed: state === 'walk' ? 42 * Math.min(1, Math.max(0, (t - .18) / .28)) : 0,
        lookX: state === 'happy' ? -.8 : Math.sin(t * 2), lookY: state === 'happy' ? -.5 : 0,
        motionRate: pet.character === 'cat' ? .96 : 1.04, variation: .7 });
      if (elapsed < 19.1) requestAnimationFrame(tick);
      else document.body.dataset.done = 'true';
    }
    requestAnimationFrame(tick);
  });
  await page.waitForFunction(() => document.body.dataset.done === 'true', { timeout: 25_000 });
  const video = page.video();
  await context.close(); await video.saveAs('docs/images/quality-motion.webm');

  const still = await browser.newPage({ viewport: { width: 1100, height: 1300 }, deviceScaleFactor: 1 });
  await still.goto('http://127.0.0.1:1420/?view=gallery');
  await still.waitForSelector('.gallery-grid canvas');
  await still.evaluate(async () => {
    const { createRenderer, prepareCharacters } = await import('/src/render/characters.ts'); await prepareCharacters();
    document.body.innerHTML = '<main id="sheet"><h1>まどねこ · 体の動きと表情</h1></main>';
    const style = document.createElement('style');
    style.textContent = 'body{margin:0;background:#faf7f1;color:#604739;font:15px system-ui}main{padding:24px;width:1100px;box-sizing:border-box}h1{font-size:23px;margin:0 0 20px}.row{display:flex;gap:8px;margin-bottom:10px}.cell{width:256px;flex:none;background:#fffdf9;border-radius:14px;text-align:center}.dark{background:#242937;color:#eee}canvas{width:256px;height:224px;display:block;margin:auto}p{margin:8px 0 14px}'; document.head.append(style);
    for (const character of ['cat', 'gugugaga']) for (const theme of ['light', 'dark']) {
      const row = document.createElement('div'); row.className = 'row'; document.querySelector('#sheet').append(row);
      for (const [state, label, lookX] of [['idle', '待機', 0], ['walk', '歩く', 1], ['happy', 'なでられる', -.8], ['observe', '気づいて振り向く', -1]]) {
        const cell = document.createElement('div'); cell.className = `cell ${theme}`;
        const canvas = document.createElement('canvas'); const renderer = createRenderer(canvas, character);
        for (let i = 0; i <= 24; i++) renderer.draw({ state, time: i / 30, direction: 1, speed: state === 'walk' ? 42 : 0, lookX, lookY: -.2 });
        const caption = document.createElement('p'); caption.textContent = label;
        cell.append(canvas, caption); row.append(cell);
      }
    }
  });
  await still.locator('#sheet').screenshot({ path: 'docs/images/quality-sheet.png' });
} finally { await browser.close(); }
