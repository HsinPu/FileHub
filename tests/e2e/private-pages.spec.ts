import { test, expect } from './fixtures.js';
import { closeTasks, login, navigationAction, openTasks, fileAction } from './actions.js';

test('分享與垃圾桶的根 query 可刷新／返回，保留檔案上下文且純導覽沒有資料副作用', async ({page,workspaceData},info) => {
  await page.goto(`/?entry=${workspaceData.managed}&path=${encodeURIComponent('文件')}&sort=size&direction=desc&filter=${encodeURIComponent('報告')}`);await login(page);
  await expect(page.getByText('報告 100%.bin',{exact:true})).toBeVisible();
  const before=await workspaceData.snapshot(), fileUrl=page.url();
  const context=()=>{const query=new URL(page.url()).searchParams;return ['entry','path','sort','direction','filter'].map(key=>query.get(key));};const fileContext=context();
  await (await navigationAction(page,'分享管理')).click();await expect(page.getByRole('heading',{name:'分享管理',exact:true})).toBeVisible();
  await expect(page).toHaveURL(/view=shares/);expect(context()).toEqual(fileContext);await page.reload();
  await expect(page.getByText('尚無公開分享',{exact:true})).toBeVisible();await page.screenshot({path:info.outputPath('shares-empty.png'),animations:'disabled'});
  await (await navigationAction(page,'垃圾桶')).click();await expect(page.getByRole('heading',{name:'垃圾桶',exact:true})).toBeVisible();
  await expect(page).toHaveURL(/view=trash/);expect(context()).toEqual(fileContext);await page.reload();
  await expect(page.getByText('垃圾桶目前沒有可見項目。',{exact:true})).toBeVisible();await page.screenshot({path:info.outputPath('trash-empty.png'),animations:'disabled'});
  await page.goBack();await expect(page.getByRole('heading',{name:'分享管理',exact:true})).toBeVisible();
  await page.goBack();await expect(page).toHaveURL(fileUrl);await expect(page.getByText('報告 100%.bin',{exact:true})).toBeVisible();
  expect(await workspaceData.snapshot()).toBe(before);
  expect(await page.locator('body,main,.share-management,.trash-page').evaluateAll(elements=>elements.filter(element=>element.scrollWidth>element.clientWidth+1).map(element=>element.className))).toEqual([]);
});

test('上傳跨分享及垃圾桶頁仍持續，原 File 與佇列不重建或重送', async ({page,workspaceData}) => {
  if(process.platform==='linux')await workspaceData.admin(['entry-write',workspaceData.managed,'on']);
  await page.goto(`/?entry=${workspaceData.managed}`);await login(page);
  if(process.platform!=='linux'){await expect((await fileAction(page,'上傳'))).toBeDisabled();return;}
  let release=()=>{},enter=()=>{},creates=0,chunks=0;
  const gate=new Promise<void>(resolve=>{release=resolve;}),entered=new Promise<void>(resolve=>{enter=resolve;});
  page.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname.endsWith('/uploads'))creates++;});
  await page.route('**/api/uploads/*/content',async route=>{chunks++;enter();await gate;await route.continue().catch(()=>{});});
  try{
    await page.getByLabel('選擇上傳檔案',{exact:true}).setInputFiles({name:'跨管理頁.txt',mimeType:'text/plain',buffer:Buffer.from('private page lifecycle canary')});await entered;await closeTasks(page);
    await (await navigationAction(page,'分享管理')).click();await expect(page.getByRole('heading',{name:'分享管理',exact:true})).toBeVisible();await openTasks(page);
    await expect(page.getByRole('region',{name:'上傳面板',exact:true}).getByText('傳送中',{exact:true})).toBeVisible();await closeTasks(page);
    await (await navigationAction(page,'垃圾桶')).click();await expect(page.getByRole('heading',{name:'垃圾桶',exact:true})).toBeVisible();release();await openTasks(page);
    await expect(page.getByRole('region',{name:'上傳面板',exact:true}).getByText('已完成',{exact:true})).toBeVisible();expect(creates).toBe(1);expect(chunks).toBe(1);
    expect(await(await page.request.get(`/api/entries/${workspaceData.managed}/download?path=${encodeURIComponent('跨管理頁.txt')}`)).text()).toBe('private page lifecycle canary');
    await closeTasks(page);await page.getByRole('button',{name:'返回檔案列表',exact:true}).click();await expect(page.getByRole('region',{name:'檔案列表',exact:true}).getByText('跨管理頁.txt',{exact:true})).toBeVisible();
  }finally{release();}
});
