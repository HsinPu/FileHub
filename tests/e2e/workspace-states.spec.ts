import { test, expect } from './fixtures.js';
import { login, openSettings, fileAction } from './actions.js';

test('空目錄與讀取失敗有清楚的狀態，重試成功且不變更資料', async ({page,workspaceData},info) => {
  if(process.platform==='linux')await workspaceData.admin(['entry-write',workspaceData.managed,'on']);
  await page.goto(`/?entry=${workspaceData.managed}&path=${encodeURIComponent('文件/空資料夾')}`);await login(page);
  await expect(page.getByText('這個資料夾目前是空的。',{exact:true})).toBeVisible();
  const before=await workspaceData.snapshot();
  await page.screenshot({path:info.outputPath('workspace-empty.png'),animations:'disabled'});
  await page.route('**/api/entries/*/files?*',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'SERVICE_UNAVAILABLE',message:'Synthetic fixture failure',requestId:'layout-state-fixture'})}));
  await (await fileAction(page,'重新整理')).click();
  await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByRole('button',{name:'重試',exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath('workspace-error.png'),animations:'disabled'});
  await page.unrouteAll({behavior:'wait'});await page.getByRole('button',{name:'重試',exact:true}).click();
  await expect(page.getByText('這個資料夾目前是空的。',{exact:true})).toBeVisible();await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await workspaceData.snapshot()).toBe(before);
  expect(await page.locator('body,main,.file-panel').evaluateAll(elements=>elements.filter(element=>element.scrollWidth>element.clientWidth+1).map(element=>element.className))).toEqual([]);
});

test('一般帳號唯讀工作區及個人設定維持一致導覽且不讀取管理資料', async ({page,workspaceData},info) => {
  const adminReads:string[]=[];page.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/api/admin'))adminReads.push(request.url());});
  await page.goto(`/?entry=${workspaceData.external}&path=team`);await login(page,'member');
  await expect(page.getByText('shared.txt',{exact:true})).toBeVisible();await expect((await fileAction(page,'上傳'))).toBeDisabled();
  await page.screenshot({path:info.outputPath('workspace-member.png'),animations:'disabled'});const before=await workspaceData.snapshot();
  await openSettings(page);await expect(page.getByRole('link',{name:'帳號管理',exact:true})).toHaveCount(0);await expect(page.getByRole('link',{name:'儲存與授權',exact:true})).toHaveCount(0);
  await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:info.outputPath('settings-member.png'),fullPage:true,animations:'disabled'});
  expect(adminReads).toEqual([]);await page.getByRole('button',{name:'返回檔案',exact:true}).click();await expect(page.getByText('shared.txt',{exact:true})).toBeVisible();expect(await workspaceData.snapshot()).toBe(before);
});
