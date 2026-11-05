import { test, expect } from './fixtures.js';
import { selectionAction, login, resourceAction, navigationAction, selectFile } from './actions.js';

test('移至垃圾桶、同名拒絕、改名還原及內容可再次下載', async ({ page, workspaceData }, info) => {
  if (process.platform === 'linux') await workspaceData.admin(['entry-write', workspaceData.managed, 'on']);
  await page.goto(`/?entry=${workspaceData.managed}&path=${encodeURIComponent('文件')}`); await login(page);
  await expect(page.getByText('報告 100%.bin', { exact: true })).toBeVisible();
  if (process.platform !== 'linux') {
    const before = await workspaceData.snapshot();
    await selectFile(page,'報告 100%.bin');
    await expect((await selectionAction(page, '移至垃圾桶'))).toBeDisabled();
    await page.keyboard.press('Escape');
    await (await navigationAction(page, '垃圾桶')).click();
    await expect(page.getByText('垃圾桶目前沒有可見項目。')).toBeVisible();
    expect(await workspaceData.snapshot()).toBe(before); return;
  }
  await selectFile(page,'報告 100%.bin');
  await (await selectionAction(page, '移至垃圾桶')).click();
  await expect(page.getByRole('dialog', { name: '移至垃圾桶' })).toContainText('可於垃圾桶還原');
  await page.getByRole('button', { name: '確認移至垃圾桶', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('報告 100%.bin', { exact: true })).toHaveCount(0);
  await (await navigationAction(page, '垃圾桶')).click();
  await expect(page.getByText('文件/報告 100%.bin', { exact: false })).toBeVisible();
  await page.screenshot({ path: info.outputPath('trash.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: '還原 文件/報告 100%.bin', exact: true }).click();
  await expect(page.getByLabel('還原至相對資料夾', { exact: true })).toBeFocused();
  await page.getByLabel('還原名稱', { exact: true }).fill('空資料夾');
  await page.getByRole('button', { name: '確認還原項目', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('已變更');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '還原 文件/報告 100%.bin', exact: true }).click();
  await page.getByLabel('還原名稱', { exact: true }).fill('還原報告.bin');
  await page.screenshot({ path: info.outputPath('restore.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: '確認還原項目', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0); await expect(page.getByText('垃圾桶目前沒有可見項目。')).toBeVisible();
  await page.getByRole('button', { name: '返回檔案列表', exact: true }).click();
  await expect(page.getByText('還原報告.bin', { exact: true })).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), (await resourceAction(page, '還原報告.bin')).click()]);
  expect(download.suggestedFilename()).toBe('還原報告.bin');
  const stream = await download.createReadStream(); const chunks: Buffer[] = []; for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks)).toEqual(workspaceData.bytes);
  expect(await page.locator('body, main, .trash-panel').evaluateAll((items) => items.filter((item) => item.scrollWidth > item.clientWidth + 1).length)).toBe(0);
});
