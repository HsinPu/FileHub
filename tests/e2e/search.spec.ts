import { test, expect } from './fixtures.js';
import { login, searchInput, clearSearch } from './actions.js';

test('目前目錄篩選與遞迴搜尋分開；取消舊查詢與部分結果狀態', async ({ page, workspaceData }, info) => {
  await page.goto(`/?entry=${workspaceData.managed}&path=${encodeURIComponent('文件')}`); await login(page);
  await (await searchInput(page)).fill('100%');
  await page.getByRole('button', { name: '搜尋', exact: true }).click();
  await expect(page.getByText('1 個項目', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '空資料夾', exact: true })).toHaveCount(0);
  await clearSearch(page);
  await searchInput(page);
  await searchInput(page); await page.getByLabel('搜尋範圍', { exact: true }).selectOption('recursive');
  await (await searchInput(page)).fill('報告');
  await page.getByRole('button', { name: '搜尋', exact: true }).click();
  await expect(page.getByRole('button', { name: '文件/報告 100%.bin', exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('search-results.png'), animations: 'disabled' });
  await clearSearch(page);
  let release: (() => void) | undefined;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/search?**', async (route) => {
    if (new URL(route.request().url()).searchParams.get('query') !== 'old') { await route.continue(); return; }
    await held;
    await route.fulfill({ json: { entryId: workspaceData.managed, path: '文件', query: 'old', items: [], partial: true, reasons: ['results'], scanned: 100, omitted: 0, elapsedMs: 12 } }).catch(() => undefined);
  });
  try {
    await (await searchInput(page)).fill('old'); await page.getByRole('button', { name: '搜尋', exact: true }).click();
    await expect(page.getByText('正在搜尋，可取消或送出新查詢。')).toBeVisible();
    await (await searchInput(page)).fill('報告'); await page.getByRole('button', { name: '搜尋', exact: true }).click();
    await expect(page.getByRole('button', { name: '文件/報告 100%.bin', exact: true })).toBeVisible();
  } finally { release?.(); }
  await expect(page.getByText(/部分結果/)).toHaveCount(0);
  await page.unroute('**/search?**');
  await page.route('**/search?**', (route) => route.fulfill({ json: { entryId: workspaceData.managed, path: '文件', query: 'limit', items: [], partial: true, reasons: ['results', 'unavailable'], scanned: 100, omitted: 1, elapsedMs: 12 } }));
  await (await searchInput(page)).fill('limit'); await page.getByRole('button', { name: '搜尋', exact: true }).click();
  await expect(page.getByText(/部分結果：結果數量上限、部分位置無法讀取/)).toBeVisible();
  expect(await page.locator('.search-panel').evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath('search.png'), fullPage: true, animations: 'disabled' });
});

test('一個名稱輸入切換範圍，清除與返回不混入遞迴舊結果', async ({ page, workspaceData }) => {
  await page.goto(`/?entry=${workspaceData.managed}`); await login(page);
  await (await searchInput(page)).fill('報告');
  await page.getByRole('button', { name: '搜尋', exact: true }).click();
  await expect(page).toHaveURL(/filter=/); await expect(page.getByText('0 個項目', { exact: true })).toBeVisible();
  await searchInput(page); await page.getByLabel('搜尋範圍', { exact: true }).selectOption('recursive');
  await expect(page.getByLabel('搜尋名稱', { exact: true })).toHaveValue('報告');
  await expect(page.locator('.file-table')).toHaveCount(0);
  await page.getByRole('button', { name: '搜尋', exact: true }).click();
  await expect(page.getByRole('button', { name: '文件/報告 100%.bin', exact: true })).toBeVisible();
  await searchInput(page); await page.getByLabel('搜尋範圍', { exact: true }).selectOption('directory');
  await expect(page.getByRole('region', { name: '遞迴搜尋結果', exact: true })).toHaveCount(0);
  await expect(page.getByText('0 個項目', { exact: true })).toBeVisible();
  await clearSearch(page);
  await expect(page.getByText('readme.txt', { exact: true })).toBeVisible();
  await page.goBack(); await expect(page.getByText('0 個項目', { exact: true })).toBeVisible();
  await expect(page.getByLabel('搜尋範圍', { exact: true })).toHaveValue('directory');
  await searchInput(page); await page.getByRole('button', { name: '搜尋說明', exact: true }).click();
  await expect(page.getByText(/10,000 項、100 筆結果、2 秒/)).toBeVisible();
});

test('遞迴搜尋失敗可重試，401 清除身份與搜尋結果', async ({ page, workspaceData }) => {
  await page.goto(`/?entry=${workspaceData.managed}`); await login(page);
  await searchInput(page);
  await searchInput(page); await page.getByLabel('搜尋範圍', { exact: true }).selectOption('recursive');
  await (await searchInput(page)).fill('報告');
  await page.route('**/search?**', route => route.fulfill({ status: 503, json: { code: 'SERVICE_UNAVAILABLE', message: 'private-error', requestId: 'search-unavailable' } }));
  await page.getByRole('button', { name: '搜尋', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('暫時無法');
  await expect(page.locator('body')).not.toContainText('private-error');
  await page.unrouteAll({ behavior: 'wait' }); await page.getByRole('button', { name: '重試搜尋', exact: true }).click();
  await expect(page.getByRole('button', { name: '文件/報告 100%.bin', exact: true })).toBeVisible();
  await page.route('**/search?**', route => route.fulfill({ status: 401, json: { code: 'UNAUTHORIZED', message: 'private-error', requestId: 'search-expired' } }));
  await searchInput(page); await page.getByRole('button', { name: '搜尋', exact: true }).click();
  await expect(page.getByRole('heading', { name: '登入 FileHub', exact: true })).toBeVisible();
  await expect(page.getByText('登入已到期，請重新登入。', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: '遞迴搜尋結果', exact: true })).toHaveCount(0);
});
