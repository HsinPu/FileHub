import { test, expect } from './fixtures.js';
import { chooseStorage, closeTasks, login, openSettings, openTasks, selectFile, selectionAction, fileAction } from './actions.js';

test('空浮動工作面板可收合重開、Tab／Escape 返回焦點且不推移檔案列表', async ({page,workspaceData},info) => {
  await page.goto(`/?entry=${workspaceData.managed}`); await login(page); await expect(page.getByText('readme.txt',{exact:true})).toBeVisible();
  await expect(page.locator('.header-task-state')).toHaveText('沒有工作');
  expect(await page.evaluate(()=>document.documentElement.style.getPropertyValue('--fh-task-height'))).toBe('');
  const before=await workspaceData.snapshot(), y=(await page.locator('.ant-table-thead').boundingBox())?.y;
  const trigger=page.getByRole('button',{name:'工作',exact:true}); await trigger.focus(); await page.keyboard.press('Enter');
  const drawer=page.getByRole('dialog',{name:'工作',exact:true}); await expect(drawer).toBeVisible();await expect(drawer).toHaveAttribute('aria-modal','false');
  await expect.poll(()=>page.evaluate(()=>Boolean(document.activeElement?.closest('.task-drawer')))).toBe(true);
  await page.keyboard.press('Tab');expect(await page.evaluate(()=>Boolean(document.activeElement?.closest('.task-drawer')))).toBe(true);
  const update=drawer.getByRole('button',{name:'更新工作',exact:true});await expect(update).toHaveAttribute('aria-busy','false');await update.focus();
  await expect(update).toHaveCSS('outline-color','rgb(36, 94, 168)');await expect(update).toHaveCSS('outline-width','2px');
  let release=()=>{},enter=()=>{},reads=0;const gate=new Promise<void>(resolve=>{release=resolve;}),entered=new Promise<void>(resolve=>{enter=resolve;});
  await page.route('**/api/operations/capabilities',async route=>{const response=await route.fetch();reads++;enter();await gate;await route.fulfill({response}).catch(()=>{});});
  try{await entered;await expect(update).toBeFocused();await expect(update).toHaveAttribute('aria-disabled','true');await expect(update).toHaveAttribute('aria-busy','true');await page.keyboard.press('Enter');release();await expect(update).toHaveAttribute('aria-busy','false');await expect(update).toBeFocused();expect(reads).toBe(1);}finally{release();await page.unroute('**/api/operations/capabilities');}

  await expect(drawer.getByText('目前沒有工作。',{exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath('tasks-empty.png'),animations:'disabled'});
  await page.keyboard.press('Escape'); await expect(drawer).toHaveCount(0); await expect(trigger).toBeFocused();
  expect((await page.locator('.ant-table-thead').boundingBox())?.y).toBe(y);
  await openTasks(page);await closeTasks(page);expect(await workspaceData.snapshot()).toBe(before);
});

test('上傳與 ZIP 共用真實摘要，收合／跨設定仍持續且要求不重送', async ({page,workspaceData,filehub},info) => {
  if(process.platform==='linux')await workspaceData.admin(['entry-write',workspaceData.managed,'on']);
  await page.goto(`/?entry=${workspaceData.managed}`);await login(page);
  if(process.platform!=='linux'){await expect((await fileAction(page,'上傳'))).toBeDisabled();await openTasks(page);await expect(page.getByRole('dialog',{name:'工作',exact:true})).toContainText('進行中 0 項');return;}
  let release=()=>{},enter=()=>{},uploads=0,operations=0,chunks=0;
  const gate=new Promise<void>(resolve=>{release=resolve;}),entered=new Promise<void>(resolve=>{enter=resolve;});
  page.on('request',request=>{if(request.method()!=='POST')return;const path=new URL(request.url()).pathname;if(path.endsWith('/uploads'))uploads++;if(path==='/api/operations')operations++;});
  await page.route('**/api/uploads/*/content',async route=>{chunks++;enter();await gate;await route.continue().catch(()=>{});});
  try{
    await page.getByLabel('選擇上傳檔案',{exact:true}).setInputFiles({name:'混合工作.txt',mimeType:'text/plain',buffer:Buffer.from('combined task canary')});await entered;
    await openTasks(page);await expect(page.getByRole('progressbar',{name:'混合工作.txt 上傳進度',exact:true})).toHaveAttribute('aria-valuenow','0');
    await expect(page.getByRole('dialog',{name:'工作',exact:true})).toContainText('進行中 1 項'); await expect(page.locator('.header-task-state')).toHaveText('進行中 1');
    await closeTasks(page);await chooseStorage(page,'團隊資料');await selectFile(page,'private.txt');await (await selectionAction(page,'建立 ZIP')).click();
    await expect(page.getByRole('dialog',{name:'工作',exact:true})).toContainText('進行中 2 項');
    await page.screenshot({path:info.outputPath('tasks-running.png'),animations:'disabled'});
    await closeTasks(page);await openSettings(page);await openTasks(page);await expect(page.getByRole('dialog',{name:'工作',exact:true})).toContainText('進行中 2 項');
    await closeTasks(page);await page.getByRole('button',{name:'返回檔案',exact:true}).click();release();await openTasks(page);
    await expect(page.getByRole('region',{name:'上傳面板',exact:true}).getByText('已完成',{exact:true})).toBeVisible();
    await filehub.startWorker();
    await expect(page.getByRole('region',{name:'工作面板',exact:true}).locator('.operation-item-heading').getByText('已完成',{exact:true})).toBeVisible();
    expect(uploads).toBe(1);expect(operations).toBe(1);expect(chunks).toBe(1);
    expect(await(await page.request.get(`/api/entries/${workspaceData.managed}/download?path=${encodeURIComponent('混合工作.txt')}`)).text()).toBe('combined task canary');
    await page.screenshot({path:info.outputPath('tasks-completed.png'),animations:'disabled'});
    for(const title of ['驗證資訊','工作細節']){const summary=page.locator('.task-drawer summary').filter({hasText:title});await summary.focus();await page.keyboard.press('Enter');await expect(summary.locator('..')).toHaveAttribute('open','');}
    await expect(page.locator('.upload-checksum')).toBeVisible();await expect(page.locator('.operation-id')).toBeVisible();await page.screenshot({path:info.outputPath('tasks-details.png'),animations:'disabled'});
    expect(await page.locator('body,main,.task-dock-body,.upload-item,.operation-item').evaluateAll(elements=>elements.filter(element=>element.scrollWidth>element.clientWidth+1).map(element=>element.className))).toEqual([]);
  }finally{release();}
});
