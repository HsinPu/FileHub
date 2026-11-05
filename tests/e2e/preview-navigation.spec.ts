import { test, expect } from './fixtures.js';
import { login, searchInput, chooseStorage } from './actions.js';

test('長相對路徑預覽仍在視窗內；麵包屑與入口切換清除舊篩選', async ({ page, workspaceData }, info) => {
  const target = await workspaceData.prepareLongPreview();
  await page.goto(`/?entry=${workspaceData.managed}&path=${encodeURIComponent(target.path)}`); await login(page);
  await page.getByRole('button', { name: `預覽 ${target.name}`, exact: true }).click();
  const modal = page.getByRole('dialog'); await expect(modal.getByLabel('純文字預覽')).toHaveText('長相對路徑的安全純文字預覽');
  await modal.getByRole('button',{name:'預覽資訊',exact:true}).click();
  const path = modal.getByLabel('預覽相對路徑'); await path.focus();
  expect(await path.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  const bounds = await modal.evaluate((element) => { const box = element.getBoundingClientRect(); return { top: box.top, bottom: box.bottom, viewport: innerHeight }; });
  expect(bounds.top).toBeGreaterThanOrEqual(0); expect(bounds.bottom).toBeLessThanOrEqual(bounds.viewport);
  await page.screenshot({ path: info.outputPath('long-preview.png'), fullPage: false, animations: 'disabled' });
  await page.keyboard.press('Escape'); await expect(modal).toHaveCount(0);
  await (await searchInput(page)).fill('no-match'); await page.getByRole('button', { name: '搜尋', exact: true }).click();
  await expect(page.getByText('0 個項目', { exact: true })).toBeVisible();
  await page.getByRole('navigation', { name: '目錄層級' }).getByRole('link', { name: '入口根目錄', exact: true }).click();
  await expect(page.getByLabel('搜尋名稱', { exact: true })).toHaveValue('');
  await (await searchInput(page)).fill('readme'); await page.getByRole('button', { name: '搜尋', exact: true }).click();
  await expect(page.getByText('1 個項目', { exact: true })).toBeVisible();
  await chooseStorage(page, '團隊資料');
  await expect(page.getByRole('navigation', { name: '目錄層級' })).toHaveAttribute('aria-description', '目前入口：團隊資料');
  await expect(page.getByLabel('搜尋名稱', { exact: true })).toHaveValue(''); expect(new URL(page.url()).searchParams.has('filter')).toBe(false);
});
