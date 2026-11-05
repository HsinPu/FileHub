import { test, expect } from './fixtures.js';
import { selectionAction, login, selectFile, fileAction } from './actions.js';

test('寫入能力與新建／改名對話框、Escape、選取清除及拒絕覆寫', async ({ page, workspaceData }, info) => {
  if (process.platform === 'linux') await workspaceData.admin(['entry-write', workspaceData.managed, 'on']);
  await page.goto(`/?entry=${workspaceData.managed}&path=${encodeURIComponent('文件')}`);
  await login(page);
  await expect(page.getByText('報告 100%.bin', { exact: true })).toBeVisible();
  if (process.platform !== 'linux') {
    const before = await workspaceData.snapshot();
    await expect((await fileAction(page,'新建資料夾'))).toBeDisabled();
    await selectFile(page,'報告 100%.bin');
    await expect((await selectionAction(page, '重新命名'))).toBeDisabled();
    expect(await workspaceData.snapshot()).toBe(before); return;
  }
  const create = await fileAction(page, '新建資料夾');
  await create.click();
  await expect(page.getByRole('dialog', { name: '新建資料夾' })).toBeVisible();
  await expect(page.getByLabel('資料夾名稱', { exact: true })).toBeFocused();
  await page.getByLabel('資料夾名稱', { exact: true }).fill('測試資料夾');
  await expect(page.getByRole('dialog', { name: '新建資料夾', exact: true })).not.toHaveClass(/ant-zoom-(appear|enter)/);
  await page.screenshot({ path: info.outputPath('mkdir.png'), fullPage: true, animations: 'disabled' });
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[role=dialog]')))).toBe(true);
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
  const more = page.getByRole('button', { name: '更多檔案操作', exact: true });
  if (await more.isVisible()) { await expect(more).toHaveAttribute('aria-expanded', 'false'); await expect(more).toBeFocused(); } else await expect(create).toBeFocused();
  await (await fileAction(page, '新建資料夾')).click(); await page.getByLabel('資料夾名稱', { exact: true }).fill('測試資料夾');
  await page.getByRole('button', { name: '確認新建資料夾', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '測試資料夾', exact: true })).toBeVisible();
  await selectFile(page,'報告 100%.bin');
  await (await selectionAction(page, '重新命名')).click();
  await expect(page.getByLabel('新名稱', { exact: true })).toBeFocused();
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '更多所選操作', exact: true })).toBeFocused();
  await (await selectionAction(page, '重新命名')).click();
  await page.getByLabel('新名稱', { exact: true }).fill('更新報告 100%.bin');
  await page.getByRole('button', { name: '確認重新命名', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('更新報告 100%.bin', { exact: true })).toBeVisible();
  await expect(page.getByRole('group',{name:'選取操作',exact:true})).toHaveCount(0);
  await page.reload(); await expect(page.getByText('更新報告 100%.bin', { exact: true })).toBeVisible();
  await selectFile(page,'更新報告 100%.bin');
  await (await selectionAction(page, '重新命名')).click();
  await page.getByLabel('新名稱', { exact: true }).fill('測試資料夾');
  await page.getByRole('button', { name: '確認重新命名', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('已變更');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByText('更新報告 100%.bin', { exact: true })).toBeVisible();
  const overflow = await page.locator('body, main, .file-panel, .write-actions').evaluateAll((elements) => elements.filter((element) => element.scrollWidth > element.clientWidth + 1).map((element) => element.className || element.tagName));
  expect(overflow).toEqual([]);
});

test('寫入成功回應遺失後查詢同一 UUID，不重複發布或顯示假成功', async ({ page, workspaceData }) => {
  if (process.platform === 'linux') await workspaceData.admin(['entry-write', workspaceData.managed, 'on']);
  await page.goto(`/?entry=${workspaceData.managed}&path=${encodeURIComponent('文件')}`); await login(page);
  await expect(page.getByText('報告 100%.bin', { exact: true })).toBeVisible();
  if (process.platform !== 'linux') { await expect((await fileAction(page,'新建資料夾'))).toBeDisabled(); return; }
  let posted = 0;
  await page.route('**/directories', async (route) => {
    posted++; const response = await route.fetch(); expect(response.status()).toBe(200); await route.abort('failed');
  });
  await (await fileAction(page,'新建資料夾')).click(); await page.getByLabel('資料夾名稱', { exact: true }).fill('回應遺失的資料夾');
  await page.getByRole('button', { name: '確認新建資料夾', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible(); await expect(page.getByRole('alert')).toContainText('請勿重複送出');
  await page.getByRole('button', { name: '查詢操作結果', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '回應遺失的資料夾', exact: true })).toBeVisible(); expect(posted).toBe(1);
  await page.reload(); await expect(page.getByRole('button', { name: '回應遺失的資料夾', exact: true })).toBeVisible();
});
