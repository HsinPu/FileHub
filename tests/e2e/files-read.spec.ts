import { readFile } from 'node:fs/promises';
import { test, expect, fixturePassword } from './fixtures.js';
import { login, resourceAction, accountAction, fileAction } from './actions.js';

test('登出失敗可重試，實際登出後複製 Cookie 無法重播且拒絕無副作用', async ({ page, request, workspaceData }) => {
  await page.goto(`/?entry=${workspaceData.managed}`);
  await login(page);
  await expect(page.getByText('readme.txt', { exact: true })).toBeVisible();
  const cookie = (await page.context().cookies()).find((item) => item.name === 'filehub_session');
  if (!cookie) throw new Error('fixture session 缺少');
  await page.route('**/api/session', async (route) => {
    if (route.request().method() === 'DELETE') await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'SERVICE_UNAVAILABLE', message: 'private-log', requestId: 'logout-fixture' }) });
    else await route.continue();
  });
  await (await accountAction(page, '登出')).click();
  await expect(page.getByRole('alert')).toContainText('登出未完成');
  await expect((await accountAction(page, '登出'))).toBeEnabled();
  await expect(page.getByText('readme.txt', { exact: true })).toBeVisible();
  expect((await page.request.get('/api/session')).status()).toBe(200);
  await page.unrouteAll({ behavior: 'wait' });
  await (await accountAction(page, '登出')).click();
  await expect(page.getByText('已登出。', { exact: true })).toBeVisible();
  await expect(page.getByText('readme.txt', { exact: true })).toHaveCount(0);
  const before = await workspaceData.snapshot();
  const headers = { cookie: `${cookie.name}=${cookie.value}` };
  expect((await request.get('/api/session', { headers })).status()).toBe(401);
  expect((await request.get(`/api/entries/${workspaceData.managed}/download?path=readme.txt`, { headers })).status()).toBe(401);
  expect(await workspaceData.snapshot()).toEqual(before);
});

test('受限帳號的下載／越界／未知入口／寫入拒絕不改動 DB 與原檔', async ({ page, workspaceData }) => {
  await page.goto(`/?entry=${workspaceData.external}&path=team`);
  await login(page, 'member');
  await expect(page.getByText('shared.txt', { exact: true })).toBeVisible();
  const before = await workspaceData.snapshot();
  const base = `/api/entries/${workspaceData.external}`;
  const denied = [
    { path: `${base}/download?path=team/shared.txt`, status: 403 },
    { path: `${base}/files?path=`, status: 403 },
    { path: `${base}/metadata?path=private.txt`, status: 403 },
    { path: `${base}/files?path=${encodeURIComponent('../')}`, status: 400 },
    { path: `/api/entries/${workspaceData.managed}/files`, status: 404 },
  ];
  for (const item of denied) {
    const response = await page.request.get(item.path);
    expect(response.status()).toBe(item.status);
    expect(await response.text()).not.toMatch(/private canary|filehub-e2e-|[A-Z]:\\/);
  }
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) expect((await page.request.fetch(`${base}/files?path=team/new.txt`, { method, data: {} })).status()).toBe(404);
  expect(await workspaceData.snapshot()).toEqual(before);
});

test('CLI 調整 grant 後能下載，撤權即清除畫面並拒絕下一次讀取', async ({ page, workspaceData }, info) => {
  await page.goto(`/?entry=${workspaceData.external}&path=team`);
  await login(page, 'member');
  await expect((await resourceAction(page, 'shared.txt'))).toBeDisabled();
  await workspaceData.admin(['entry-grant', 'member', workspaceData.external, 'team', 'download']);
  await (await fileAction(page,'重新整理')).click();
  const [download] = await Promise.all([page.waitForEvent('download'), (await resourceAction(page, 'shared.txt')).click()]);
  const saved = info.outputPath('shared.txt'); await download.saveAs(saved);
  expect(await readFile(saved, 'utf8')).toBe('shared fixture');
  await workspaceData.admin(['entry-revoke', 'member', workspaceData.external, 'team']);
  const before = await workspaceData.snapshot();
  expect((await page.request.get(`/api/entries/${workspaceData.external}/download?path=team/shared.txt`)).status()).toBe(404);
  await (await fileAction(page,'重新整理')).click();
  await expect(page.getByText('目前沒有可存取的入口，請聯絡管理員。')).toBeVisible();
  await expect(page.getByText('shared.txt', { exact: true })).toHaveCount(0);
  expect(await workspaceData.snapshot()).toEqual(before);
  await workspaceData.admin(['entry-grant', 'member', workspaceData.external, 'team', 'browse']);
  await page.reload();
  await expect(page.getByText('shared.txt', { exact: true })).toBeVisible();
});

test('外部入口離線顯示錯誤，恢復同一 root 後可重試', async ({ page, workspaceData }, info) => {
  await page.goto(`/?entry=${workspaceData.external}`);
  await login(page);
  await expect(page.getByText('private.txt', { exact: true })).toBeVisible();
  await workspaceData.setExternalOnline(false);
  try {
    const before = await workspaceData.snapshot();
    await (await fileAction(page,'重新整理')).click();
    await expect(page.getByRole('alert')).toContainText('入口或服務暫時無法使用');
    await expect(page.getByText('private.txt', { exact: true })).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('filehub-e2e-');
    await page.screenshot({ path: info.outputPath('entry-offline.png'), fullPage: true, animations: 'disabled' });
    expect(await workspaceData.snapshot()).toEqual(before);
  } finally { await workspaceData.setExternalOnline(true); }
  await page.getByRole('button', { name: '重試', exact: true }).click();
  await expect(page.getByText('private.txt', { exact: true })).toBeVisible();
});

test('CLI 停用帳號使目前 session 失效，保留深連結並允許管理員重新登入', async ({ page, workspaceData }) => {
  await page.goto(`/?entry=${workspaceData.external}&path=team`);
  await login(page, 'member');
  await expect(page.getByText('shared.txt', { exact: true })).toBeVisible();
  await workspaceData.admin(['user-disable', 'member']);
  await (await fileAction(page,'重新整理')).click();
  await expect(page.getByRole('heading', { name: '登入 FileHub' })).toBeVisible();
  await expect(page.getByText('登入已到期，請重新登入。', { exact: true })).toBeVisible();
  await expect(page.getByText('shared.txt', { exact: true })).toHaveCount(0);
  await page.getByLabel('帳號', { exact: true }).fill('member');
  await page.getByLabel('密碼', { exact: true }).fill(fixturePassword);
  await page.getByRole('button', { name: '登入', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: '帳號或密碼不正確' })).toBeVisible();
  await login(page);
  await expect(page.getByText('shared.txt', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`entry=${workspaceData.external}&path=team`));
});
