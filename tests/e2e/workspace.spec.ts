import { readFile } from 'node:fs/promises';
import { test, expect } from './fixtures.js';
import { goPath, login, resourceAction, accountAction, chooseStorage, selectFile, fileAction, enableSelection } from './actions.js';

test('登入後恢復深連結，瀏覽／排序／選取／原生下載與登出', async ({ page, workspaceData }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const deepLink = `/?entry=${workspaceData.managed}&path=${encodeURIComponent('文件')}`;
  await page.goto(deepLink);
  await page.screenshot({ path: info.outputPath('login.png'), fullPage: true, animations: 'disabled' });
  await login(page);
  await expect(page.getByRole('navigation', { name: '目錄層級' })).toHaveAttribute('aria-description', '目前入口：我的檔案');
  await expect(page.getByText('報告 100%.bin', { exact: true })).toBeVisible();
  await selectFile(page,'報告 100%.bin');
  await expect(page.getByText('已選取 1 項')).toBeVisible();
  await page.screenshot({ path: info.outputPath('workspace.png'), fullPage: true, animations: 'disabled' });
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '下載所選檔案', exact: true }).click()]);
  expect(download.suggestedFilename()).toBe('報告 100%.bin');
  const saved = info.outputPath('download.bin');
  await download.saveAs(saved);
  expect(await readFile(saved)).toEqual(workspaceData.bytes);
  await expect(page.getByRole('status').filter({ hasText: '已交給瀏覽器下載' })).toBeVisible();
  await (await fileAction(page,'排序選項')).click(); await page.getByRole('menuitem',{name:'排序：大小',exact:true}).click();
  await expect(page).toHaveURL(/sort=size/);
  await expect(page.getByRole('group',{name:'選取操作',exact:true})).toHaveCount(0);
  await page.getByRole('button', { name: '空資料夾', exact: true }).click();
  await expect(page.getByText('這個資料夾目前是空的。')).toBeVisible();
  await page.goBack();
  await expect(page.getByText('報告 100%.bin', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('報告 100%.bin', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage) }))).toEqual({ local: [], session: [] });
  await (await accountAction(page, '登出')).click();
  await expect(page.getByRole('heading', { name: '登入 FileHub' })).toBeVisible();
  await expect(page.getByText('已登出。', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('受限帳號只見授權入口，唯讀能力、麵包屑及鍵盤／手機版面', async ({ page, workspaceData }) => {
  await page.goto(`/?entry=${workspaceData.external}&path=team`);
  await login(page, 'member');
  await expect(page.getByText('shared.txt', { exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: '目錄層級' })).toHaveAttribute('aria-description', '目前入口：團隊資料');
  await expect((await resourceAction(page, 'shared.txt'))).toBeDisabled();
  await page.keyboard.press('Escape'); await enableSelection(page);
  await expect(page.getByLabel('選取 shared.txt', { exact: true })).toBeDisabled();
  await expect(page.getByRole('navigation', { name: '目錄層級' }).getByRole('link')).toHaveCount(1);
  await expect(page.getByRole('link', { name: '授權範圍：team', exact: true })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('private.txt');
  await expect(page.locator('body')).not.toContainText('我的檔案');
  await page.reload();
  await expect(page.getByText('shared.txt', { exact: true })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: '跳至主要內容' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
  const overflowing = await page.locator('body, .sidebar, .topbar, main, .file-panel, .file-table, .path-form, .file-toolbar').evaluateAll((elements) => elements.filter((element) => element.scrollWidth > element.clientWidth + 1).map((element) => element.className || element.tagName));
  expect(overflowing).toEqual([]);
});

test('入口切換與版本分頁可重新整理還原，切換後清除舊選取', async ({ page, workspaceData }) => {
  await page.goto(`/?entry=${workspaceData.managed}&path=${encodeURIComponent('大量檔案')}`);
  await login(page);
  await expect(page.getByText('55 個項目', { exact: true })).toBeVisible();
  await selectFile(page,'item-00.txt');
  await page.getByRole('listitem', { name: '2', exact: true }).click();
  await expect(page).toHaveURL(/page=2&version=[a-f0-9]{64}/);
  await expect(page.getByText('item-54.txt', { exact: true })).toBeVisible();
  await expect(page.getByRole('group',{name:'選取操作',exact:true})).toHaveCount(0);
  await selectFile(page,'item-50.txt');
  await selectFile(page,'item-54.txt');
  await expect(page.getByText('已選取 2 項')).toBeVisible();
  await page.reload();
  await expect(page.getByText('item-54.txt', { exact: true })).toBeVisible();
  await expect(page.getByRole('group',{name:'選取操作',exact:true})).toHaveCount(0);
  await chooseStorage(page, '團隊資料');
  await expect(page.getByRole('navigation', { name: '目錄層級' })).toHaveAttribute('aria-description', '目前入口：團隊資料');
  await expect(page.getByText('private.txt', { exact: true })).toBeVisible();
  await expect(page).not.toHaveURL(/page=2/);
  await expect(page.getByText('item-54.txt', { exact: true })).toHaveCount(0);
});

test('取消舊目錄結果，載入／錯誤可辨識並能重試', async ({ page, workspaceData }) => {
  await page.goto(`/?entry=${workspaceData.managed}`);
  await login(page);
  await expect(page.getByText('readme.txt', { exact: true })).toBeVisible();
  let release = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let intercepted = () => {};
  const waiting = new Promise<void>((resolve) => { intercepted = resolve; });
  await page.route('**/files?*', async (route) => {
    if (new URL(route.request().url()).searchParams.get('path') !== '文件') { await route.continue(); return; }
    const response = await route.fetch(); intercepted(); await gate;
    // 舊頁面已取消請求，Chromium 可能拒絕 fulfill；結果仍不能進入新頁面。
    await route.fulfill({ response }).catch(() => {});
  });
  try {
    await page.getByRole('button', { name: '文件', exact: true }).click();
    await waiting;
    await expect(page.getByRole('status').filter({ hasText: '正在載入目錄' })).toBeVisible();
    await goPath(page, '');
    await expect(page.getByText('readme.txt', { exact: true })).toBeVisible();
    release();
    await page.unrouteAll({ behavior: 'wait' });
    await expect(page.getByText('報告 100%.bin', { exact: true })).toHaveCount(0);
    await page.route('**/files?*', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'SERVICE_UNAVAILABLE', message: 'private-path-do-not-show', requestId: 'fixture-error' }) }));
    await (await fileAction(page,'重新整理')).click();
    await expect(page.getByRole('alert')).toContainText('入口或服務暫時無法使用');
    await expect(page.locator('body')).not.toContainText('private-path-do-not-show');
    await page.unrouteAll({ behavior: 'wait' });
    await page.getByRole('button', { name: '重試', exact: true }).click();
    await expect(page.getByText('readme.txt', { exact: true })).toBeVisible();
  } finally { release(); }
});

test('路徑輸入按需展開，Escape 返回焦點並能鍵盤前往長路徑', async ({ page, workspaceData }) => {
  const deep = await workspaceData.prepareLongPreview();
  await page.goto(`/?entry=${workspaceData.managed}`); await login(page);
  const trigger = page.getByRole('button', { name: '前往路徑', exact: true });
  await expect(page.getByLabel('相對路徑', { exact: true })).toHaveCount(0);
  await trigger.click(); await expect(page.getByLabel('相對路徑', { exact: true })).toBeFocused();
  await page.getByLabel('相對路徑', { exact: true }).fill('未送出路徑');
  await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await goPath(page, deep.path);
  await expect(page.getByText(deep.name, { exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: '目錄層級' }).getByRole('link')).toHaveCount(6);
  await expect(page.getByLabel('相對路徑', { exact: true })).toHaveCount(0);
  expect(await page.locator('body,.path-navigation,.path-heading').evaluateAll(elements => elements.filter(element => element.scrollWidth > element.clientWidth + 1).map(element => element.className))).toEqual([]);
});


test('登入錯誤保留帳號、清除密碼，窄版表單仍可重試',async({page,workspaceData},info)=>{
  await page.goto('/?entry='+workspaceData.managed);await expect(page.getByRole('heading',{name:'登入 FileHub',exact:true})).toBeVisible();await page.getByLabel('帳號',{exact:true}).fill('admin');await page.getByLabel('密碼',{exact:true}).fill('synthetic-wrong-password');await page.getByRole('button',{name:'登入',exact:true}).click();await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByLabel('密碼',{exact:true})).toHaveValue('');await expect(page.getByLabel('帳號',{exact:true})).toHaveValue('admin');const panel=await page.locator('.login-page').boundingBox();if(!panel)throw Error('缺少登入表單');expect(panel.width).toBe(Math.min(380,(page.viewportSize()?.width??0)-32));expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('login-error.png'),fullPage:true,animations:'disabled'});await login(page);
});
