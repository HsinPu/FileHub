/* global console, process, URL, fetch, document, innerWidth, innerHeight, getComputedStyle */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { startPreview } from './serve.mjs';

const root=fileURLToPath(new URL('../../../',import.meta.url));
process.env.PLAYWRIGHT_BROWSERS_PATH??=path.join(root,'.tools/playwright-browsers');
const {chromium}=await import('@playwright/test');
await fs.mkdir(path.join(root,'.tools'),{recursive:true});
const out=await fs.mkdtemp(path.join(root,'.tools/p10-design-'));
const {server,url:base}=await startPreview();
const origin=new URL(base).origin;
const errors=[], requests=[], results=[], contrast=[];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const luminance=color=>{
  const channels=color.startsWith('#')?color.slice(1).match(/../g).map(x=>parseInt(x,16)):color.match(/[\d.]+/g).slice(0,3).map(Number);
  const c=channels.map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
  return .2126*c[0]+.7152*c[1]+.0722*c[2];
};
const ratio=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
let browser, completed=false, browserVersion;
try {
  for(const route of ['/.env','/AGENTS.md','/MEMORY.md','/apps/server/package.json','/api/auth/session']) assert.equal((await fetch(origin+route)).status,404);
  assert.equal((await fetch(base,{method:'POST'})).status,404);
  const response=await fetch(base);
  assert.match(response.headers.get('content-security-policy'),/connect-src 'none'/);
  assert.equal((await fetch(origin+'/docs/design/P10/assets/filehub-symbol.svg')).headers.get('content-type'),'image/svg+xml');
  browser=await chromium.launch({headless:true});
  browserVersion=browser.version();
  const capture=async(page,name,scene,palette='p10')=>{
    await page.goto(`${base}?scene=${scene}&palette=${palette}`);
    await page.evaluate(()=>document.fonts.ready);
    await page.locator('main h1').first().waitFor();
    const metrics=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scroll:document.documentElement.scrollWidth,scene:document.body.dataset.scene,palette:document.documentElement.dataset.palette,reviewHeight:document.querySelector('.review-bar').getBoundingClientRect().height,images:[...document.images].filter(image=>image.getBoundingClientRect().width>0).map(image=>({src:image.getAttribute('src'),loaded:image.complete&&image.naturalWidth>0,width:image.getBoundingClientRect().width,height:image.getBoundingClientRect().height}))}));
    assert.ok(metrics.scroll<=metrics.width,`${name}/${scene}: horizontal document overflow`);
    assert.equal(metrics.palette,palette);
    assert.ok(metrics.images.every(image=>image.loaded),`${name}/${scene}: image not loaded`);
    const colors=await page.evaluate(()=>[...document.querySelectorAll('main h1, main h2, .secondary, .file-size, .modified, .nav-link, .entry-link, .field label, .button.primary, .resource-name button')].filter(el=>el.getBoundingClientRect().width>0&&el.getBoundingClientRect().height>0).map(el=>{
      let ancestor=el, background='rgba(0, 0, 0, 0)';
      while(ancestor&&background==='rgba(0, 0, 0, 0)'){background=getComputedStyle(ancestor).backgroundColor;ancestor=ancestor.parentElement;}
      return {selector:el.tagName.toLowerCase()+'.'+[...el.classList].join('.'),foreground:getComputedStyle(el).color,background};
    }));
    for(const color of colors){const value=ratio(color.foreground,color.background);assert.ok(value>=4.5,`${name}/${scene}/${color.selector}: contrast ${value}`);contrast.push({name,scene,palette,...color,ratio:value});}
    const file=`${name}-${scene}-${palette}.png`;
    await page.screenshot({path:path.join(out,file),fullPage:scene==='brand',animations:'disabled'});
    results.push({file,...metrics});
  };
  for(const [name,width,height] of [['desktop',1440,1000],['tablet',800,1024],['mobile',390,844],['narrow',320,640]]){
    const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1,reducedMotion:'reduce'});
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    page.on('request',request=>requests.push(request.url()));
    const scenes=name==='tablet'?['brand','list','settings']:name==='narrow'?['brand','settings']:['brand','list','mosaic','gallery','selected','settings','login','public','tasks'];
    for(const scene of scenes) await capture(page,name,scene);
    if(name==='desktop') for(const scene of ['list','settings','login']) await capture(page,name,scene,'p9');
    if(name==='mobile'){
      await capture(page,name,'list','p9');
      for(const scene of ['empty','error','partial']) await capture(page,name,scene);
    }
    await page.goto(base);
    await page.getByLabel('配色',{exact:true}).selectOption('p9');
    assert.equal(await page.locator('tbody tr').count(),50);
    assert.equal(await page.locator('html').getAttribute('data-palette'),'p9');
    await page.getByLabel('配色',{exact:true}).selectOption('p10');
    assert.equal(await page.locator('tbody tr').count(),50);
    assert.equal(await page.locator('html').getAttribute('data-palette'),'p10');
    await page.getByRole('button',{name:'上傳',exact:true}).click();
    await page.getByRole('dialog',{name:'上傳檔案'}).waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('dialog',{name:'上傳檔案'}).waitFor({state:'hidden'});
    assert.equal(await page.getByRole('button',{name:'上傳',exact:true}).evaluate(el=>el===document.activeElement),true);
    await page.getByLabel('配色',{exact:true}).focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.getByLabel('檢視場景',{exact:true}).evaluate(el=>el===document.activeElement),true);
    await page.close();
  }
  assert.equal(errors.length,0,errors.join('\n'));
  assert.ok(requests.every(url=>url.startsWith(origin+'/')));
  assert.ok(!requests.some(url=>new URL(url).pathname.startsWith('/api/')));
  for(const [role,foreground,background,minimum] of [
    ['primary','#ffffff','#315f98',4.5],['primaryHover','#ffffff','#254b7a',4.5],
    ['text','#252b33','#ffffff',4.5],['secondary','#62676f','#ffffff',4.5],
    ['active','#315f98','#e9eef6',4.5],['selectedText','#252b33','#edf2f9',4.5],
    ['controlBorder','#8190a2','#ffffff',3],['folder','#9c7738','#ffffff',3],
    ['warning','#845300','#fff5df',4.5],['error','#b42318','#fff1ef',4.5],
    ['success','#267044','#edf7f0',4.5],['reverseLogo','#ffffff','#252b33',3],
  ]){const value=ratio(foreground,background);assert.ok(value>=minimum,role);contrast.push({role,foreground,background,ratio:value,minimum});}
  completed=true;
} finally {
  await browser?.close();
  await new Promise(resolve=>server.close(resolve));
  const images=[];
  for(const file of (await fs.readdir(out)).filter(file=>file.endsWith('.png')).sort()) images.push({file,sha256:sha(await fs.readFile(path.join(out,file)))});
  const source=[];
  for(const file of ['preview.html','preview.css','preview.js','serve.mjs','verify.mjs','assets/filehub-symbol.svg','assets/filehub-symbol-mono.svg','assets/filehub-symbol-reverse.svg']) source.push({file,sha256:sha(await fs.readFile(new URL(file,import.meta.url)))});
  await fs.writeFile(path.join(out,'checks.json'),JSON.stringify({date:'2026-10-31',scope:'Standalone color and SVG design prototype; not production acceptance',status:completed?'passed':'failed',browser:browserVersion,deviceScaleFactor:1,reducedMotion:'reduce',images,source,results,contrast,errors,apiRequests:requests.filter(url=>new URL(url).pathname.startsWith('/api/')),externalRequests:requests.filter(url=>!url.startsWith(origin+'/')),checks:['allowlisted GET-only loopback server','CSP connect-src none','real SVG image decoding at intended sizes','actual computed text colors and opaque ancestor backgrounds','no document horizontal overflow at 1440/800/390/320','palette switch retains synthetic listing','native dialog Escape and trigger focus','keyboard palette to scene order','no product API or external requests']},null,2)+'\n');
  console.log(JSON.stringify({output:out,status:completed?'passed':'failed',screenshots:images.length,errors:errors.length,browser:browserVersion}));
}
