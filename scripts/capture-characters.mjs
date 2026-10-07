import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const stage = process.argv[2] ?? 'after';
const directory = `artifacts/redesign/${stage}`;
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 850 }, deviceScaleFactor: 1 });
await page.goto('http://127.0.0.1:1420/?view=gallery');
await page.waitForSelector('.gallery-grid canvas');
const assets = await page.evaluate(async () => {
  const { createRenderer, prepareCharacters } = await import('/src/render/characters.ts');
  await prepareCharacters();
  document.body.innerHTML = '<main id="sheet"></main>';
  const style = document.createElement('style');
  style.textContent = 'body{margin:0;background:#e9e5df;font:14px system-ui;color:#373b45}main{padding:22px;width:1056px}h1{font-size:21px;margin:0 0 8px}h2{font-size:15px;margin:18px 0 6px}.row{display:flex;gap:8px}.cell{width:256px;text-align:center;border-radius:12px;overflow:hidden;background:#fbf9f5}.dark{background:#252b39;color:#eee}canvas{display:block;margin:auto}p{margin:8px}';
  document.head.append(style);
  const sheet = document.querySelector('#sheet');
  const title = document.createElement('h1'); title.textContent = 'Desktop size · 100% · same animation time'; sheet.append(title);
  const results = {};
  for (const character of ['gugugaga','cat']) {
    const h2 = document.createElement('h2'); h2.textContent = character; sheet.append(h2);
    for (const theme of ['light','dark']) {
      const row = document.createElement('div'); row.className = 'row'; sheet.append(row);
      for (const state of ['idle','walk','happy','sleep']) {
        const cell = document.createElement('div'); cell.className = `cell ${theme}`;
        const canvas = document.createElement('canvas');
        const scale = character === 'gugugaga' ? .875 : 1;
        canvas.style.width = `${256 * scale}px`; canvas.style.height = `${224 * scale}px`;
        const renderer = createRenderer(canvas, character);
        for (let i=0;i<=24;i++) renderer.draw({state,time:i/30,direction:1,speed:state==='walk'?42:0,lookX:0,lookY:0});
        const label = document.createElement('p'); label.textContent = state;
        cell.append(canvas,label); row.append(cell);
        if (theme === 'light') results[`${character}-${state}`] = canvas.toDataURL();
      }
    }
  }
  return results;
});
for (const [name, data] of Object.entries(assets)) await writeFile(`${directory}/${name}.png`, Buffer.from(data.split(',')[1], 'base64'));
await page.locator('#sheet').screenshot({path:`${directory}/desktop-sheet.png`});
await browser.close();
console.log(`${directory}/desktop-sheet.png`);
