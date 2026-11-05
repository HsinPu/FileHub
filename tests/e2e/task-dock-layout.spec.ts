import { randomUUID } from 'node:crypto';
import { test, expect } from './fixtures.js';
import { login, openTasks, closeTasks, selectFile, fileAction } from './actions.js';

test('浮動工作非模態、搜尋返回不搶焦點，選取列與最後一筆皆可達', async ({ page, workspaceData }, info) => {
  const path = await workspaceData.prepareLayout(); await page.goto(`/?entry=${workspaceData.managed}&path=${encodeURIComponent(path)}`); await login(page);
  await expect(page.getByText('66 個項目', { exact: true })).toBeVisible(); await page.evaluate(() => document.fonts.ready);
  const viewport = page.viewportSize(); if (!viewport) throw Error('缺少視窗');
  const header = (await page.locator('.ant-table-thead').boundingBox())?.y;
  await openTasks(page); const dock = page.getByRole('dialog', { name: '工作', exact: true }); await expect(dock).toHaveAttribute('aria-modal', 'false');
  await expect(page.getByRole('main')).not.toHaveAttribute('inert', ''); expect((await page.locator('.ant-table-thead').boundingBox())?.y).toBe(header);
  let outside = false; for (let i = 0; i < 12; i++) { await page.keyboard.press('Tab'); outside = await page.evaluate(() => !document.activeElement?.closest('.task-dock')); if (outside) break; } expect(outside).toBe(true); await expect(dock).toBeVisible();
  await page.getByRole('button', { name: '搜尋檔案', exact: true }).click(); await expect(page.getByLabel('搜尋名稱', { exact: true })).toBeFocused(); await expect(dock).toHaveCount(0);
  await page.getByLabel('搜尋名稱', { exact: true }).fill('未送出的搜尋'); await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '搜尋檔案', exact: true })).toBeFocused(); await expect(dock).toBeVisible();
  const last = page.locator('tr[data-row-key]').last(); await selectFile(page, 'design'); await last.evaluate(element => element.scrollIntoView({ block: 'start' }));
  const panel = await dock.boundingBox(), row = await last.boundingBox(); if (!panel || !row) throw Error('缺少浮動幾何');
  expect(panel.x).toBe(viewport.width <= 736 ? 0 : viewport.width - 380 - 24); expect(panel.width).toBe(viewport.width <= 736 ? viewport.width : 380);
  const topbar = await page.locator('.topbar').boundingBox(); if (!topbar) throw Error('缺少頂列尺寸');
  expect(row.y).toBeGreaterThanOrEqual(topbar.height); expect(row.y + row.height).toBeLessThanOrEqual(panel.y);
  if (viewport.width <= 736) { const selection = await page.getByRole('group', { name: '選取操作', exact: true }).boundingBox(); if (!selection) throw Error('缺少選取列'); expect(selection.x + selection.width).toBeLessThanOrEqual(viewport.width); expect(panel.y + panel.height).toBeLessThanOrEqual(selection.y - 7); }
  expect(await page.locator('body,main,.task-dock,.task-dock-body').evaluateAll(elements => elements.filter(element => element.scrollWidth > element.clientWidth + 1).map(element => element.className))).toEqual([]);
  await page.screenshot({ path: info.outputPath('dock-selection-last-row.png'), animations: 'disabled' }); console.info(JSON.stringify({ viewport, panel, row }));
  if (info.project.name === 'chromium-desktop') {
    await page.setViewportSize({ width: 320, height: 440 }); await expect(dock.getByRole('button', { name: '關閉工作', exact: true })).toBeInViewport();
    const body = await page.locator('.task-dock-body').boundingBox(); expect(body?.height).toBeGreaterThan(0);
    await last.evaluate(element => element.scrollIntoView({ block: 'start' }));
    const shortPanel = await dock.boundingBox(), shortRow = await last.boundingBox(), shortHeader = await page.locator('.topbar').boundingBox(), shortSelection = await page.getByRole('group', { name: '選取操作', exact: true }).boundingBox();
    if (!shortPanel || !shortRow || !shortHeader || !shortSelection) throw Error('缺少短手機尺寸');
    expect(shortRow.y).toBeGreaterThanOrEqual(shortHeader.height); expect(shortRow.y + shortRow.height).toBeLessThanOrEqual(shortPanel.y);
    expect(shortPanel.y + shortPanel.height).toBeLessThanOrEqual(shortSelection.y - 7); expect(shortSelection.height).toBe(56);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('dock-short-phone.png'), animations: 'disabled' });
    await closeTasks(page); await page.setViewportSize(viewport); await openTasks(page);
  }
  await dock.focus(); await page.keyboard.press('Escape'); await expect(dock).toHaveCount(0); await expect(page.getByRole('button', { name: '工作', exact: true })).toBeFocused();
});

test('晚到的可續傳工作自動展開時保留正在編輯的 Modal 焦點與草稿', async ({ page, workspaceData }, info) => {
  if (process.platform === 'linux') await workspaceData.admin(['entry-write', workspaceData.managed, 'on']);
  await page.goto(`/?entry=${workspaceData.managed}`); await login(page);
  if (process.platform !== 'linux') { await expect((await fileAction(page, '新建資料夾'))).toBeDisabled(); return; }
  const session: unknown = await (await page.request.get('/api/session')).json();
  if (!session || typeof session !== 'object' || !('csrfToken' in session) || typeof session.csrfToken !== 'string') throw Error('缺少合成帳號 CSRF');
  const response = await page.request.post(`/api/entries/${workspaceData.managed}/uploads`, { headers: { origin: new URL(page.url()).origin, 'x-csrf-token': session.csrfToken }, data: { id: randomUUID(), parent: '', name: '晚到的續傳.bin', size: 1 } }); expect(response.status()).toBe(200);
  let release = () => {}, enter = () => {}, creates = 0; const gate = new Promise<void>(resolve => { release = resolve; }), entered = new Promise<void>(resolve => { enter = resolve; });
  page.on('request', request => { if (request.method() === 'POST' && request.url().endsWith('/uploads')) creates++; });
  await page.route(`**/api/entries/${workspaceData.managed}/uploads`, async route => { if (route.request().method() !== 'GET') { await route.continue(); return; } const result = await route.fetch(); enter(); await gate; await route.fulfill({ response: result }).catch(() => {}); });
  try {
    await page.reload(); await entered; await expect(page.getByText('readme.txt', { exact: true })).toBeVisible();
    await (await fileAction(page, '新建資料夾')).click(); const input = page.getByLabel('資料夾名稱', { exact: true }); await input.fill('仍在編輯的草稿'); await expect(input).toBeFocused(); release();
    await expect(page.getByRole('dialog', { name: '工作', exact: true })).toHaveAttribute('aria-modal', 'false'); await expect(input).toBeFocused(); await expect(input).toHaveValue('仍在編輯的草稿');
    await expect(page.getByRole('dialog', { name: '新建資料夾', exact: true })).not.toHaveClass(/ant-zoom-(appear|enter)/); await page.screenshot({ path: info.outputPath('late-task-modal.png'), animations: 'disabled' });
    await input.press('Escape'); await expect(page.getByRole('dialog', { name: '新建資料夾', exact: true })).toHaveCount(0);
    const panel = page.getByRole('region', { name: '上傳面板', exact: true }); await expect(panel.getByText('等待重新選檔', { exact: true })).toBeVisible(); await panel.getByRole('button', { name: '取消此項', exact: true }).click(); await expect(panel.getByText('已取消', { exact: true })).toBeVisible(); expect(creates).toBe(0);
    expect((await page.request.get(`/api/entries/${workspaceData.managed}/metadata?path=${encodeURIComponent('晚到的續傳.bin')}`)).status()).toBe(404);
  } finally { release(); }
});
