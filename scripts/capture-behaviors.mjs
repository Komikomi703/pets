import { chromium } from '@playwright/test';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1360, height: 640 }, deviceScaleFactor: 1 });
  await page.goto('http://127.0.0.1:1420/?view=gallery');
  await page.waitForSelector('.gallery-grid canvas');
  await page.evaluate(async () => {
    const { createRenderer, prepareCharacters } = await import('/src/render/characters.ts');
    await prepareCharacters();
    document.body.innerHTML = '<main id="sheet"><h1>まどねこの、新しいしぐさ</h1></main>';
    const style = document.createElement('style');
    style.textContent = 'body{margin:0;background:#faf7f1;color:#604739;font:16px system-ui}main{box-sizing:border-box;padding:24px;width:1360px}h1{font-size:24px;margin:0 0 20px}.row{display:flex;gap:8px;margin-top:12px}.cell{box-sizing:border-box;flex:0 0 256px;text-align:center;background:#fffdf9;border:1px solid #e6dacf;border-radius:16px}canvas{display:block;width:256px;height:224px}p{margin:0 0 14px}';
    document.head.append(style);
    const sheet = document.querySelector('#sheet');
    const states = [['observe', 'きょろきょろ', .7], ['yawn', 'あくび', 1.2], ['sniff', 'くんくん', .8], ['wave', '手を振る', .7], ['hop', 'ジャンプ', .65]];
    for (const character of ['cat', 'gugugaga']) {
      const row = document.createElement('div'); row.className = 'row'; sheet.append(row);
      for (const [state, label, time] of states) {
        const cell = document.createElement('div'); cell.className = 'cell';
        const canvas = document.createElement('canvas');
        const renderer = createRenderer(canvas, character);
        renderer.draw({ state, time, direction: 1, speed: 0, lookX: state === 'observe' ? .8 : 0, lookY: 0 });
        const caption = document.createElement('p'); caption.textContent = label;
        cell.append(canvas, caption); row.append(cell);
      }
    }
  });
  await page.locator('#sheet').screenshot({ path: 'docs/images/new-behaviors.png' });
} finally {
  await browser.close();
}
