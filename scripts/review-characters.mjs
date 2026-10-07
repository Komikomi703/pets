import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const out = 'artifacts/redesign';
await mkdir(`${out}/video`, {recursive:true});
const browser = await chromium.launch();
if (!process.argv.includes('--stills-only')) {
const context = await browser.newContext({ viewport:{width:1280,height:900},deviceScaleFactor:1,recordVideo:{dir:`${out}/video`,size:{width:1280,height:900}} });
const page = await context.newPage();
await page.goto('http://127.0.0.1:1420/?view=gallery');
await page.waitForSelector('.gallery-grid canvas');
await page.evaluate(async()=>{
 const {createRenderer,prepareCharacters} = await import('/src/render/characters.ts'); await prepareCharacters();
 document.body.innerHTML='<main><h1>Character motion · 65% / 100% / 150%</h1><p id="state"></p><div id="grid"></div></main>';
 const style=document.createElement('style'); style.textContent='body{margin:0;font:16px system-ui;background:#e8e5df;color:#393d48}main{padding:20px}h1{font-size:20px;margin:0}#grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.cell{height:375px;border-radius:12px;background:#fbf9f5;display:flex;flex-direction:column;align-items:center;justify-content:end}.cell.dark{background:#252b39;color:white}canvas{flex:none}.label{margin:6px}';document.head.append(style);
 const pets=[]; for(const character of ['gugugaga','cat']) for(const size of [.65,1,1.5]){
   const cell=document.createElement('div'); cell.className='cell'; const canvas=document.createElement('canvas');
   const scale=size*(character==='gugugaga'?.875:1);canvas.style.width=`${256*scale}px`;canvas.style.height=`${224*scale}px`;
   const label=document.createElement('p');label.className='label';label.textContent=`${character} · ${Math.round(size*100)}%`;
   cell.append(canvas,label);document.querySelector('#grid').append(cell);pets.push({character,renderer:createRenderer(canvas,character),cell});
 }
 const timeline=[['idle',6],['walk',3],['walk-left',3],['happy',2.2],['sleep',3],['stretch',2],['idle',2]];
 const start=performance.now(); let lastIndex=-1;
 function tick(now){let t=(now-start)/1000,i=0;while(i<timeline.length-1 && t>timeline[i][1]){t-=timeline[i][1];i++;}
  const state=timeline[i][0]==='walk-left'?'walk':timeline[i][0];
  document.querySelector('#state').textContent=`${state} · ${timeline[i][0]==='walk-left'?'←':'→'} · ${t.toFixed(1)}s`;
  for(const pet of pets){pet.cell.classList.toggle('dark',Math.floor(t/1.5)%2===1);pet.renderer.draw({state:pet.character==='gugugaga'&&state==='stretch'?'sulk':state,time:i===lastIndex?t:0,direction:timeline[i][0]==='walk-left'?-1:1,speed:state==='walk'?42:0,lookX:0,lookY:0});}
  lastIndex=i;if((now-start)/1000<21.6)requestAnimationFrame(tick);
 }
 requestAnimationFrame(tick);
});
await page.waitForTimeout(21000);
await page.screenshot({path:`${out}/sizes.png`});
const video=page.video();await context.close();await video.saveAs(`${out}/character-motion.webm`);
}
const compare=await browser.newPage({viewport:{width:1100,height:760},deviceScaleFactor:1});
await compare.goto('http://127.0.0.1:1420/?view=gallery');
for(const character of ['gugugaga','cat']){
 await compare.evaluate(async(character)=>{
  document.body.innerHTML=''; const style=document.createElement('style'); style.textContent='body{background:#f5f1e9;margin:0;color:#3e4150;font:14px system-ui}main{padding:22px;width:1056px}h1{font-size:21px;margin:0}h2{font-size:15px;margin:16px 0 6px}.row{display:flex;gap:8px}.cell{width:256px;background:#fffdf9;border-radius:12px;text-align:center}img{display:block;margin:auto}p{margin:8px}';document.head.append(style);
  const main=document.createElement('main');document.body.append(main);const h=document.createElement('h1');h.textContent=`${character} · before / after · desktop 100%`;main.append(h);
  for(const stage of ['before','after']){const title=document.createElement('h2');title.textContent=stage;main.append(title);const row=document.createElement('div');row.className='row';main.append(row);
   for(const state of ['idle','walk','happy','sleep']){const cell=document.createElement('div');cell.className='cell';const img=new Image();img.src=`/artifacts/redesign/${stage}/${character}-${state}.png`;const scale=character==='gugugaga'?.875:1;img.width=256*scale;img.height=224*scale;const p=document.createElement('p');p.textContent=state;cell.append(img,p);row.append(cell);await img.decode();}
  }
 },character);
 await compare.locator('main').screenshot({path:`${out}/${character}-before-after.png`});
}
await compare.evaluate(async()=>{
 document.body.innerHTML='<main><h1>Reference / rendered character</h1><div class="row" id="compare"></div><p>Left: stored reference (HitPaw) · Right: 100% desktop size, then 2× detail</p></main>';
 const holder=document.querySelector('#compare');
 for(const [src,width,height] of [['/artifacts/redesign/reference-verified.jpg',390,359],['/artifacts/redesign/after/gugugaga-idle.png',224,196],['/artifacts/redesign/after/gugugaga-happy.png',448,392]]){const img=new Image();img.src=src;img.width=width;img.height=height;holder.append(img);await img.decode();}
});
await compare.locator('main').screenshot({path:`${out}/reference-comparison.png`});
await compare.evaluate(async()=>{
 document.body.innerHTML='<main><h1>Motion samples · frames from character-motion.webm</h1><div id="film"></div></main>';
 const holder=document.querySelector('#film'); holder.style.cssText='display:grid;grid-template-columns:repeat(2,1fr);gap:6px';
 const video=document.createElement('video');video.src='/artifacts/redesign/character-motion.webm';video.muted=true;
 await new Promise(resolve=>video.onloadeddata=resolve);
 for(const time of [2,8,11,13.5,16.5,19.5]){
   video.currentTime=time;await new Promise(resolve=>video.onseeked=resolve);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   const canvas=document.createElement('canvas');canvas.width=640;canvas.height=450;canvas.style.width='528px';canvas.style.height='371px';canvas.getContext('2d').drawImage(video,0,0,640,450);holder.append(canvas);
 }
});
await compare.locator('main').screenshot({path:`${out}/motion-contact-sheet.png`});
await browser.close();
await writeFile(`${out}/capture-info.json`,JSON.stringify({date:new Date().toISOString(),deviceScaleFactor:1,renderer:'Chromium Canvas 2D, same code as the native WebView',comparisonTime:.8,comparisonSpeed:42,video:'65%, 100%, 150%; idle, walk both directions, happy, sleep, stretch/sulk; alternating light/dark'},null,2));
console.log('Comparison images and character-motion.webm saved.');
