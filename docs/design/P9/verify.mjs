/* global console, process, URL, fetch, document, innerWidth, innerHeight */
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
const out=await fs.mkdtemp(path.join(root,'.tools/p9-design-'));
const {server,url:base}=await startPreview();
const origin=new URL(base).origin;
let browser;
const errors=[],requests=[],results=[];
try{
  browser=await chromium.launch({headless:true});
  assert.equal((await fetch(`${origin}/.env`)).status,404);
  assert.equal((await fetch(`${origin}/AGENTS.md`)).status,404);
  for(const [name,width,height] of [['desktop',1440,1000],['tablet',800,1024],['mobile',390,844]]){
    const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
    page.on('pageerror',err=>errors.push(err.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    page.on('request',req=>requests.push(req.url()));
    for(const scene of ['list','mosaic','gallery','selected','long','empty','error','partial','settings','tasks','login','public']){
      await page.goto(`${base}?scene=${scene}`);await page.evaluate(()=>document.fonts.ready);
      await assert.doesNotReject(()=>page.locator('main h1').first().waitFor());
      const metrics=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth,tableTop:document.querySelector('.file-table')?.getBoundingClientRect().top??null,rows:[...document.querySelectorAll('.file-table tbody tr')].filter(row=>row.getBoundingClientRect().bottom<=innerHeight).length,reviewHeight:document.querySelector('.review-bar').getBoundingClientRect().height,body:document.body.dataset.scene}));
      assert.ok(metrics.scroll<=width,`${name}/${scene} overflow ${metrics.scroll}`);
      if(scene==='list')assert.equal(await page.locator('.file-table tbody tr').count(),50);
      if(scene==='selected')assert.equal(await page.locator('tr.selected').count(),2);
      await page.screenshot({path:`${out}/${name}-${scene}.png`,animations:'disabled'});
      results.push({name,scene,width,height,...metrics});
    }
    await page.goto(base);await page.getByRole('button',{name:'上傳',exact:true}).click();await page.getByRole('dialog',{name:'上傳檔案'}).waitFor();
    await page.keyboard.press('Escape');await page.getByRole('dialog',{name:'上傳檔案'}).waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>document.activeElement?.textContent?.trim()),'file_upload上傳');
    await page.getByRole('button',{name:'新建資料夾',exact:true}).click();await page.getByLabel('資料夾名稱').fill('只在預覽輸入');await page.keyboard.press('Escape');
    await page.getByLabel('篩選目前目錄',{exact:true}).fill('document-01');await page.locator('#search-form').getByRole('button',{name:'搜尋',exact:true}).click();assert.equal(await page.locator('tbody tr').count(),1);
    await page.goto(`${base}?scene=selected`);await page.getByRole('checkbox',{name:'選取 design',exact:true}).uncheck();assert.equal(await page.getByRole('checkbox',{name:'選取 design',exact:true}).evaluate(input=>input===document.activeElement),true);
    // 最後一項取消後整個 checkbox 模式卸載；直接操作並驗新的公開狀態，不等待舊 input 留在 DOM。
    await page.getByRole('checkbox',{name:'選取 document-01.txt',exact:true}).click();assert.equal(await page.getByRole('checkbox').count(),0);assert.equal(await page.getByRole('button',{name:'選取',exact:true}).evaluate(button=>button===document.activeElement),true);
    await page.goto(base);await page.getByRole('button',{name:'第 2 頁'}).click();assert.equal(await page.locator('tbody tr').count(),16);
    await page.getByRole('button',{name:'工作',exact:true}).click();await page.locator('#task-panel').waitFor();await page.getByRole('button',{name:'收合工作'}).click();await page.locator('#task-panel').waitFor({state:'hidden'});
    if(name==='mobile'){
      await page.getByRole('button',{name:'開啟導覽'}).click();await page.getByRole('dialog',{name:'工作空間導覽'}).waitFor();await page.keyboard.press('Escape');
      await page.goto(`${base}?scene=selected`);await page.getByRole('button',{name:'工作',exact:true}).click();
      const task=await page.locator('#task-panel').boundingBox(),selection=await page.locator('.selection-bar').boundingBox();assert.ok(task.y+task.height<=selection.y);
      await page.screenshot({path:`${out}/mobile-tasks-selected.png`,animations:'disabled'});await page.keyboard.press('Escape');await page.locator('#task-panel').waitFor({state:'hidden'});
    }
    await page.close();
  }
  const zoom=await browser.newPage({viewport:{width:640,height:500}});await zoom.goto(base);assert.equal(await zoom.evaluate(()=>document.documentElement.scrollWidth),640);await zoom.close();
  assert.equal(errors.length,0,errors.join('\n'));assert.ok(requests.every(url=>url.startsWith(`${origin}/`)));assert.ok(!requests.some(url=>url.includes('/api/')));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
const luminance=hex=>{const c=hex.replace('#','').match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2];};
const ratio=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
const contrast=[['P8 white selection','#ffffff','#2196f3'],['P8 primary link','#2196f3','#ffffff'],['P9 primary button','#ffffff','#245ea8'],['P9 main text','#202832','#ffffff'],['P9 secondary','#596673','#ffffff'],['P9 selected text','#202832','#eaf1fb'],['P9 active link','#245ea8','#e0e8f3'],['P9 warning','#845300','#fff5df'],['P9 error','#b42318','#fff1ef']].map(([label,foreground,background])=>({label,foreground,background,ratio:ratio(foreground,background)}));
for(const x of contrast.filter(x=>x.label.startsWith('P9')))assert.ok(x.ratio>=4.5);
const images=[];
for(const file of (await fs.readdir(out)).filter(file=>file.endsWith('.png')).sort())images.push({file,sha256:createHash('sha256').update(await fs.readFile(path.join(out,file))).digest('hex')});
await fs.writeFile(`${out}/checks.json`,JSON.stringify({date:'2026-10-30',sourceBase:'0a8bae1',scope:'Standalone design prototype; not production acceptance',browser:'Chromium 156.0.8078.4',images,results,contrast,errors,externalRequests:[],apiRequests:[],checks:['37 screenshots including combined task/selection state','36 scene/viewports render without horizontal document overflow','synthetic list pagination 50/16','selected two rows','selection changes retain focus','upload/new-folder native dialog and Escape','upload dialog returns focus','synthetic filter','task show/hide','mobile navigation and Escape','mobile tasks/selection do not overlap','640x500 reflow (not actual browser zoom)','only allowlisted static files served']},null,2)+'\n');
console.log(JSON.stringify({output:out,screenshots:images.length,errors:errors.length,metrics:results.filter(x=>x.scene==='list')},null,2));
