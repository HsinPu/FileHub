import { test, expect } from './fixtures.js';
import { accountAction, login, navigationAction, openSettings, openTasks, fileAction } from './actions.js';

test('設定可刷新且保留版本分頁；取消返回、切分類與登出保留草稿，再接受返回不形成歷史循環', async ({ page, workspaceData }) => {
  await page.goto(`/?entry=${workspaceData.managed}&path=${encodeURIComponent('大量檔案')}&sort=name&direction=asc&filter=item`); await login(page);
  await expect(page.getByText('55 個項目', { exact: true })).toBeVisible();
  await page.getByRole('listitem', { name: '2', exact: true }).click();
  await expect(page.getByText('item-54.txt', { exact: true })).toBeVisible();
  const filesUrl = page.url();
  await openSettings(page); const settingsUrl = page.url();
  await page.reload(); await expect(page.getByLabel('預設檢視', { exact: true })).toBeVisible();
  await page.getByLabel('預設檢視', { exact: true }).selectOption('thumbnails');
  page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('link', { name: '帳號管理', exact: true }).click();
  await expect(page.getByLabel('預設檢視', { exact: true })).toHaveValue('thumbnails');
  page.once('dialog', dialog => dialog.dismiss()); await (await accountAction(page, '登出')).click();
  await expect(page.getByLabel('預設檢視', { exact: true })).toHaveValue('thumbnails');
  page.once('dialog', dialog => dialog.dismiss()); await page.goBack();
  await expect(page).toHaveURL(settingsUrl); await expect(page.getByLabel('預設檢視', { exact: true })).toHaveValue('thumbnails');
  page.once('dialog', dialog => dialog.accept()); await page.goBack();
  await expect(page).toHaveURL(filesUrl); await expect(page.getByText('item-54.txt', { exact: true })).toBeVisible();
  await page.goForward(); await expect(page).toHaveURL(settingsUrl);
  await expect(page.getByLabel('預設檢視', { exact: true })).toHaveValue('list');
});

test('儲存中阻擋側欄與登出，失敗保留草稿；整頁重新整理使用瀏覽器離開保護', async ({ page, workspaceData }) => {
  await page.goto(`/?entry=${workspaceData.managed}`); await login(page); await openSettings(page);
  await page.getByLabel('每頁筆數', { exact: true }).selectOption('25');
  let release = () => {}, enter = () => {}, deletes = 0;
  const gate = new Promise<void>(resolve => { release = resolve; }), entered = new Promise<void>(resolve => { enter = resolve; });
  page.on('request', request => { if (request.method() === 'DELETE' && request.url().endsWith('/api/session')) deletes++; });
  await page.route('**/api/settings', async route => { if (route.request().method() !== 'POST') { await route.continue(); return; } enter(); await gate; await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({code:'SERVICE_UNAVAILABLE',message:'fixture',requestId:'settings-busy'}) }).catch(() => {}); });
  try {
    await page.getByRole('button', { name: '儲存偏好', exact: true }).click(); await entered;
    await page.getByRole('navigation',{name:'管理分類',exact:true}).getByRole('link',{name:'分享管理',exact:true}).click();await expect(page).toHaveURL(/view=settings/);
    await (await navigationAction(page, '檔案')).click(); await expect(page).toHaveURL(/view=settings/);
    await (await accountAction(page, '登出')).click(); expect(deletes).toBe(0);
    await expect(page.getByText('正在儲存，完成後才能離開。', { exact: true })).toBeVisible();
    release(); await expect(page.getByRole('alert').filter({hasText:'服務暫時無法使用'})).toBeVisible();
    await expect(page.getByLabel('每頁筆數', { exact: true })).toHaveValue('25');
    await page.unrouteAll({behavior:'wait'});
    const dialogs: string[] = []; page.once('dialog', async dialog => { dialogs.push(dialog.type()); await dialog.accept(); });
    await page.reload(); expect(dialogs).toEqual(['beforeunload']);
    await expect(page.getByLabel('每頁筆數', { exact: true })).toHaveValue('50');
  } finally { release(); }
});

test('member 管理設定深連結拒絕且不讀管理資料；可返回個人設定及直接刷新', async ({page,workspaceData}) => {
  let administrativeReads = 0;
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/admin')) administrativeReads++; });
  await page.goto(`/?view=settings&section=storage&entry=${workspaceData.external}&path=team`); await login(page,'member');
  await expect(page.getByText('沒有權限開啟這個設定分類', {exact:true})).toBeVisible();
  await expect(page.getByRole('navigation',{name:'管理分類',exact:true}).getByRole('link')).toHaveCount(3);
  expect(administrativeReads).toBe(0); expect((await page.request.get('/api/admin')).status()).toBe(403);
  await page.getByRole('button',{name:'前往個人設定',exact:true}).click();
  await expect(page.getByLabel('預設檢視',{exact:true})).toBeVisible(); await page.reload();
  await expect(page.getByLabel('預設檢視',{exact:true})).toBeVisible(); expect(administrativeReads).toBe(0);
  await page.getByRole('button',{name:'返回檔案',exact:true}).click(); await expect(page.getByText('shared.txt',{exact:true})).toBeVisible();
});

test('跨設定分類與返回檔案不重建上傳控制器，也不重送建立或檔案段', async ({page,workspaceData}) => {
  if (process.platform === 'linux') await workspaceData.admin(['entry-write',workspaceData.managed,'on']);
  await page.goto(`/?entry=${workspaceData.managed}`); await login(page);
  if (process.platform !== 'linux') { await expect((await fileAction(page,'上傳'))).toBeDisabled(); return; }
  let release = () => {}, enter = () => {}, creates = 0, chunks = 0;
  const gate = new Promise<void>(resolve=>{release=resolve;}), entered = new Promise<void>(resolve=>{enter=resolve;});
  page.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname.endsWith('/uploads'))creates++;});
  await page.route('**/api/uploads/*/content',async route=>{chunks++;enter();await gate;await route.continue().catch(()=>{});});
  try {
    await page.getByLabel('選擇上傳檔案',{exact:true}).setInputFiles({name:'跨設定頁.txt',mimeType:'text/plain',buffer:Buffer.from('settings lifecycle canary')}); await entered;
    await openSettings(page); await page.getByRole('link',{name:'帳號管理',exact:true}).click(); await expect(page.getByLabel('新帳號',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'返回檔案',exact:true}).click(); release(); await openTasks(page);
    await expect(page.getByRole('region',{name:'上傳面板',exact:true}).getByText('已完成',{exact:true})).toBeVisible();
    expect(creates).toBe(1);expect(chunks).toBe(1);
    expect(await (await page.request.get(`/api/entries/${workspaceData.managed}/download?path=${encodeURIComponent('跨設定頁.txt')}`)).text()).toBe('settings lifecycle canary');
  } finally { release(); }
});
