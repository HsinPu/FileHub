import { test, expect } from './fixtures.js';
import { login, searchInput, selectFile, chooseView } from './actions.js';

test('列表／縮圖保留路徑與選取，失敗可重試、鍵盤開預覽與搜尋返回', async ({ page, workspaceData }, info) => {
  await workspaceData.preparePreviews(); await page.goto(`/?entry=${workspaceData.managed}&path=${encodeURIComponent('預覽')}`); await login(page);
  const before = await workspaceData.snapshot(), originalUrl = page.url(); let fail = true;
  await page.route('**/preview/thumbnail?**', async (route) => { if (fail) { fail = false; await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }); } else await route.continue(); });
  await selectFile(page,'圖片 100%.png');
  await chooseView(page,'thumbnails');
  const grid = page.getByRole('list', { name: '圖庫檢視' }); await expect(grid).toBeVisible();
  await expect(page.getByText('已選取 1 項', { exact: true })).toBeVisible(); await expect(grid.getByLabel('選取 圖片 100%.png', { exact: true })).toBeChecked();
  await grid.getByRole('button', { name: '預覽 圖片 100%.png', exact: true }).scrollIntoViewIfNeeded();
  await expect(grid.getByRole('button', { name: '重試縮圖 圖片 100%.png', exact: true })).toBeVisible();
  await grid.getByRole('button', { name: '重試縮圖 圖片 100%.png', exact: true }).click();
  await expect(grid.getByAltText('圖片 100%.png 縮圖')).toBeVisible(); expect(page.url()).toBe(originalUrl);
  const trigger = grid.getByRole('button', { name: '預覽 圖片 100%.png', exact: true }); await trigger.focus(); await page.keyboard.press('Enter');
  const modal = page.getByRole('dialog'); await expect(modal.getByAltText('圖片 100%.png')).toBeVisible();
  const bounds = await modal.evaluate((element) => { const box = element.getBoundingClientRect(); return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: innerWidth, height: innerHeight }; });
  expect(bounds.left).toBeGreaterThanOrEqual(0); expect(bounds.right).toBeLessThanOrEqual(bounds.width); expect(bounds.top).toBeGreaterThanOrEqual(0); expect(bounds.bottom).toBeLessThanOrEqual(bounds.height);
  await page.keyboard.press('Escape'); await expect(modal).toHaveCount(0); await expect(trigger).toBeFocused();
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({ path: info.outputPath('thumbnails.png'), fullPage: true, animations: 'disabled' });
  await chooseView(page,'list'); await expect(page.getByLabel('選取 圖片 100%.png', { exact: true })).toBeChecked();
  await (await searchInput(page)).fill('圖片'); await page.getByLabel('搜尋範圍', { exact: true }).selectOption('recursive'); await page.getByRole('button', { name: '搜尋', exact: true }).click();
  await page.getByRole('button', { name: '預覽/圖片 100%.png', exact: true }).click(); await expect(modal.getByAltText('圖片 100%.png')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(modal).toHaveCount(0); expect(page.url()).toBe(originalUrl);
  expect(await page.locator('.file-panel, .thumbnail-grid, main').evaluateAll((elements) => elements.filter((element) => element.scrollWidth > element.clientWidth + 1).length)).toBe(0);
  expect(await workspaceData.snapshot()).toBe(before);
});
