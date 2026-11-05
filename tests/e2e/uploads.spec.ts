import { test, expect } from './fixtures.js';
import { closeTasks, goPath, login, openTasks, fileAction } from './actions.js';
// v1 的公開段邊界；不藉 transitive package 解析載入未宣告的 root 依賴。
const chunkBytes = 4 * 1024 * 1024;

test('上傳跨頁仍保留佇列，分段確認、空檔與真實下載 bytes', async ({ page, workspaceData }, info) => {
  if (process.platform === 'linux') await workspaceData.admin(['entry-write', workspaceData.managed, 'on']);
  await page.goto(`/?entry=${workspaceData.managed}`); await login(page);
  if (process.platform !== 'linux') { await expect((await fileAction(page,'上傳'))).toBeDisabled(); await page.screenshot({ path: info.outputPath('upload-readonly.png'), fullPage: false }); return; }
  let release = () => {}, entered = () => {}, first = true;
  const gate = new Promise<void>((resolve) => { release = resolve; }), started = new Promise<void>((resolve) => { entered = resolve; });
  await page.route('**/api/uploads/*/content', async (route) => { if (first) { first = false; entered(); await gate; } await route.continue().catch(() => {}); });
  const bytes = Buffer.alloc(chunkBytes + 9, 0xa5), name = '跨頁 上傳.bin', panel = page.getByRole('region', { name: '上傳面板' });
  try {
    const chooser = page.waitForEvent('filechooser');
    await (await fileAction(page,'上傳')).click();
    await page.getByRole('menuitem', { name: '上傳檔案', exact: true }).click();
    await (await chooser).setFiles([{ name, mimeType: 'application/octet-stream', buffer: bytes }, { name: '零 bytes.txt', mimeType: 'text/plain', buffer: Buffer.alloc(0) }]);
    await started; await expect(panel).toContainText('已確認 0 B');
    const more = page.getByRole('button', { name: '更多檔案操作', exact: true }); if (await more.isVisible()) await expect(more).toHaveAttribute('aria-expanded', 'false');
    await goPath(page, '文件');
    await expect(page.getByText('報告 100%.bin', { exact: true })).toBeVisible(); await openTasks(page); await expect(panel.getByRole('listitem', { name, exact: true })).toBeVisible(); await closeTasks(page);
    await (await fileAction(page,'新建資料夾')).click(); await page.getByLabel('資料夾名稱', { exact: true }).fill('背景上傳期間保留輸入');
    release();
    await expect.poll(async () => Promise.all([name, '零 bytes.txt'].map(async path => (await page.request.head(`/api/entries/${workspaceData.managed}/download?${new URLSearchParams({ path })}`)).status()))).toEqual([200, 200]);
    await expect(page.getByRole('dialog', { name: '新建資料夾', exact: true })).toBeVisible(); await expect(page.getByLabel('資料夾名稱', { exact: true })).toHaveValue('背景上傳期間保留輸入');
    await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
    await openTasks(page); await expect(panel.getByText('已完成', { exact: true })).toHaveCount(2);
    const response = await page.request.get(`/api/entries/${workspaceData.managed}/download?${new URLSearchParams({ path: name })}`);
    expect(response.status()).toBe(200); expect((await response.body()).equals(bytes)).toBe(true);
    expect((await page.request.get(`/api/entries/${workspaceData.managed}/download?${new URLSearchParams({ path: '零 bytes.txt' })}`)).headers()['content-length']).toBe('0');
    await page.screenshot({ path: info.outputPath('upload-completed.png'), fullPage: false, animations: 'disabled' });
    expect(await page.locator('body, main, .upload-panel, .upload-item').evaluateAll((elements) => elements.filter((element) => element.scrollWidth > element.clientWidth + 1).map((element) => element.className))).toEqual([]);
  } finally { release(); }
});

test('資料夾階層、長中文名稱與逐項檔案／目錄衝突，不覆寫原檔', async ({ page, workspaceData }, info) => {
  if (process.platform === 'linux') await workspaceData.admin(['entry-write', workspaceData.managed, 'on']);
  await page.goto(`/?entry=${workspaceData.managed}`); await login(page);
  if (process.platform !== 'linux') { await expect((await fileAction(page,'上傳'))).toBeDisabled(); return; }
  const panel = page.getByRole('region', { name: '上傳面板' });
  const folderChooser = page.waitForEvent('filechooser');
  await (await fileAction(page,'上傳')).click();
  await page.getByRole('menuitem', { name: '上傳資料夾', exact: true }).click();
  await (await folderChooser).setFiles(workspaceData.uploadDirectory);
  await expect(panel.getByText('已完成', { exact: true })).toHaveCount(2);
  const downloaded = await page.request.get(`/api/entries/${workspaceData.managed}/download?${new URLSearchParams({ path: `批次 上傳/子資料夾/${workspaceData.uploadLongName}` })}`);
  expect(downloaded.status()).toBe(200); expect((await downloaded.body()).equals(workspaceData.bytes)).toBe(true);
  expect((await page.request.get(`/api/entries/${workspaceData.managed}/metadata?${new URLSearchParams({ path: '批次 上傳/空資料夾' })}`)).status()).toBe(404);
  await page.screenshot({ path: info.outputPath('upload-folders.png'), fullPage: false, animations: 'disabled' });
  await page.getByLabel('選擇上傳檔案', { exact: true }).setInputFiles(['文件', 'readme.txt', '同批正常.bin'].map((name) => ({ name, mimeType: 'application/octet-stream', buffer: Buffer.from('new canary') })));
  await expect(panel.getByText('尚未完成', { exact: true })).toHaveCount(2); await expect(panel.getByText('已完成', { exact: true })).toHaveCount(1);
  expect(await (await page.request.get(`/api/entries/${workspaceData.managed}/download?path=readme.txt`)).text()).toBe('FileHub fixture');
  expect((await page.request.get(`/api/entries/${workspaceData.managed}/files?${new URLSearchParams({ path: '文件' })}`)).status()).toBe(200);
  await page.screenshot({ path: info.outputPath('upload-conflicts.png'), fullPage: false, animations: 'disabled' });
  expect(await page.locator('body, main, .upload-panel, .upload-item').evaluateAll((elements) => elements.filter((element) => element.scrollWidth > element.clientWidth + 1).map((element) => element.className))).toEqual([]);
});

test('重新整理要求重新選檔並驗 prefix，錯誤檔案不送 bytes，正確檔案從 offset 續傳', async ({ page, workspaceData }) => {
  if (process.platform === 'linux') await workspaceData.admin(['entry-write', workspaceData.managed, 'on']);
  await page.goto(`/?entry=${workspaceData.managed}`); await login(page);
  if (process.platform !== 'linux') { await expect((await fileAction(page,'上傳'))).toBeDisabled(); return; }
  let chunks = 0, creates = 0, finalizes = 0;
  page.on('request', (request) => { if (request.method() === 'POST' && request.url().endsWith('/uploads')) creates++; if (request.url().endsWith('/finalize')) finalizes++; });
  await page.route('**/api/uploads/*/content', async (route) => { chunks++; if (chunks === 1) { const response = await route.fetch(); expect(response.status()).toBe(200); await route.abort('failed'); } else await route.continue(); });
  const bytes = Buffer.alloc(chunkBytes + 11, 0x42), file = { name: '續傳.bin', mimeType: 'application/octet-stream', buffer: bytes };
  await page.getByLabel('選擇上傳檔案', { exact: true }).setInputFiles(file);
  await expect(page.getByRole('region', { name: '上傳面板' }).getByText('尚未完成', { exact: true })).toBeVisible();
  await page.reload(); const panel = page.getByRole('region', { name: '上傳面板' });
  await expect(panel).toContainText('等待重新選檔');
  const wrong = Buffer.from(bytes); wrong[0] = 0;
  await panel.getByLabel('重新選檔 續傳.bin', { exact: true }).setInputFiles({ ...file, buffer: wrong });
  await expect(panel.getByRole('alert')).toContainText('已傳送內容與選取檔案不同'); expect(chunks).toBe(1);
  await panel.getByLabel('重新選檔 續傳.bin', { exact: true }).setInputFiles(file);
  await expect(panel.getByText('已完成', { exact: true })).toBeVisible(); expect(chunks).toBe(2); expect(creates).toBe(1); expect(finalizes).toBe(1);
  const result = await page.request.get(`/api/entries/${workspaceData.managed}/download?${new URLSearchParams({ path: file.name })}`); expect((await result.body()).equals(bytes)).toBe(true);
});

test('取消在途傳送不發布，finalize 成功回應遺失查詢原 session 而不重發', async ({ page, workspaceData }) => {
  if (process.platform === 'linux') await workspaceData.admin(['entry-write', workspaceData.managed, 'on']);
  await page.goto(`/?entry=${workspaceData.managed}`); await login(page);
  if (process.platform !== 'linux') { await expect((await fileAction(page,'上傳'))).toBeDisabled(); return; }
  let release = () => {}, entered = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; }), started = new Promise<void>((resolve) => { entered = resolve; });
  await page.route('**/api/uploads/*/content', async (route) => { entered(); await gate; await route.continue().catch(() => {}); });
  const panel = page.getByRole('region', { name: '上傳面板' });
  try {
    await page.getByLabel('選擇上傳檔案', { exact: true }).setInputFiles({ name: '取消.bin', mimeType: 'application/octet-stream', buffer: Buffer.alloc(128, 0x40) }); await started;
    await panel.getByRole('button', { name: '取消此項', exact: true }).click(); await expect(panel.getByText('已取消', { exact: true })).toBeVisible();
    expect((await page.request.get(`/api/entries/${workspaceData.managed}/metadata?${new URLSearchParams({ path: '取消.bin' })}`)).status()).toBe(404);
  } finally { release(); await page.unroute('**/api/uploads/*/content'); }
  let posted = 0;
  await page.route('**/api/uploads/*/finalize', async (route) => { posted++; const response = await route.fetch(); expect(response.status()).toBe(200); await route.abort('failed'); });
  await page.getByLabel('選擇上傳檔案', { exact: true }).setInputFiles({ name: '回應遺失.bin', mimeType: 'application/octet-stream', buffer: workspaceData.bytes });
  await expect(panel.getByText('已完成', { exact: true })).toBeVisible(); expect(posted).toBe(1);
  const bytes = await (await page.request.get(`/api/entries/${workspaceData.managed}/download?${new URLSearchParams({ path: '回應遺失.bin' })}`)).body(); expect(bytes.equals(workspaceData.bytes)).toBe(true);
});

test('取消遇到已發布的 finalize 結果，仍顯示完成並保留原檔；清單可鍵盤聚焦', async ({ page, workspaceData }) => {
  if (process.platform === 'linux') await workspaceData.admin(['entry-write', workspaceData.managed, 'on']);
  await page.goto(`/?entry=${workspaceData.managed}`); await login(page);
  if (process.platform !== 'linux') { await expect((await fileAction(page,'上傳'))).toBeDisabled(); return; }
  let release = () => {}, entered = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; }), effect = new Promise<void>((resolve) => { entered = resolve; });
  await page.route('**/api/uploads/*/finalize', async (route) => { const response = await route.fetch(); expect(response.status()).toBe(200); entered(); await gate; await route.fulfill({ response }).catch(() => {}); });
  const panel = page.getByRole('region', { name: '上傳面板' });
  try {
    await page.getByLabel('選擇上傳檔案', { exact: true }).setInputFiles({ name: '競爭完成.bin', mimeType: 'application/octet-stream', buffer: workspaceData.bytes }); await effect;
    await panel.getByRole('button', { name: '取消此項', exact: true }).click(); await expect(panel.getByText('已完成', { exact: true })).toBeVisible();
    const result = await page.request.get(`/api/entries/${workspaceData.managed}/download?${new URLSearchParams({ path: '競爭完成.bin' })}`); expect((await result.body()).equals(workspaceData.bytes)).toBe(true);
    const list = panel.getByRole('list', { name: '上傳項目' }); await list.focus(); await expect(list).toBeFocused();
  } finally { release(); }
});

test('上傳遇失效 session 立即清除面板與佇列，未開始的檔案不再送出', async ({ page, workspaceData }) => {
  if (process.platform === 'linux') await workspaceData.admin(['entry-write', workspaceData.managed, 'on']);
  await page.goto(`/?entry=${workspaceData.managed}`); await login(page);
  if (process.platform !== 'linux') { await expect((await fileAction(page,'上傳'))).toBeDisabled(); return; }
  let release = () => {}, entered = () => {}, creates = 0;
  const gate = new Promise<void>((resolve) => { release = resolve; }), started = new Promise<void>((resolve) => { entered = resolve; });
  page.on('request', (request) => { if (request.method() === 'POST' && request.url().endsWith('/uploads')) creates++; });
  await page.route('**/api/uploads/*/content', async (route) => { entered(); await gate; await route.continue().catch(() => {}); });
  try {
    await page.getByLabel('選擇上傳檔案', { exact: true }).setInputFiles(['失效.bin', '未開始.bin'].map((name) => ({ name, mimeType: 'application/octet-stream', buffer: workspaceData.bytes }))); await started;
    const session: unknown = await (await page.request.get('/api/session')).json();
    if (!session || typeof session !== 'object' || !('csrfToken' in session) || typeof session.csrfToken !== 'string') throw new Error('missing synthetic csrf');
    expect((await page.request.delete('/api/session', { headers: { origin: new URL(page.url()).origin, 'x-csrf-token': session.csrfToken } })).status()).toBe(204);
    release(); await expect(page.getByRole('heading', { name: '登入 FileHub' })).toBeVisible(); expect(creates).toBe(1); await expect(page.getByRole('region', { name: '上傳面板' })).toHaveCount(0);
    await login(page);
    for (const path of ['失效.bin', '未開始.bin']) expect((await page.request.get(`/api/entries/${workspaceData.managed}/metadata?${new URLSearchParams({ path })}`)).status()).toBe(404);
  } finally { release(); }
});
