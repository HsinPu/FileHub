import { test, expect } from './fixtures.js';
import { login, selectFile, enableSelection } from './actions.js';

test('同一組 66 項合成資料的工作區與長名稱版面', async ({ page, workspaceData }, info) => {
  const path = await workspaceData.prepareLayout();
  await page.goto(`/?entry=${workspaceData.managed}&path=${encodeURIComponent(path)}`);
  await expect(page.locator('.login-page')).toBeVisible();
  expect((await page.locator('.login-page').boundingBox())?.width).toBeLessThanOrEqual(440);
  await login(page);
  await expect(page.getByText('66 個項目', { exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('缺少視窗尺寸');
  const sidebarWidth = viewport.width >= 1200 ? 224 : viewport.width > 736 ? 192 : 0;
  const main = await page.locator('main').boundingBox(), topbar = await page.locator('.topbar').boundingBox();
  expect(main?.width).toBe(viewport.width - sidebarWidth); expect(main?.x).toBe(sidebarWidth);
  expect(topbar).toMatchObject({ x: 0, y: 0, width: viewport.width, height: sidebarWidth ? 64 : 112 });
  expect((await page.locator('.workspace-heading').boundingBox())?.y).toBe(sidebarWidth ? 88 : 128);
  if (sidebarWidth) {
    expect(await page.locator('.sidebar').boundingBox()).toMatchObject({ x: 0, y: 64, width: sidebarWidth });
    expect((await page.locator('.file-panel').boundingBox())?.x).toBe(sidebarWidth + 24);
    const search=await page.locator('.header-search').boundingBox();expect(search?.x).toBe(viewport.width>=1200?224:176);expect(search?.width).toBeLessThanOrEqual(400);expect(search?.width).toBeGreaterThanOrEqual(120);
  }
  const noOverflow = async () => expect(await page.locator('body, .sidebar, .topbar, main, .file-panel, .file-table').evaluateAll(elements => elements.filter(element => element.scrollWidth > element.clientWidth + 1).map(element => element.className || element.tagName))).toEqual([]);
  await noOverflow();
  const header = await page.locator('.ant-table-thead').boundingBox();
  const visibleRows = await page.locator('.ant-table-tbody > tr[data-row-key]').evaluateAll(rows => rows.filter(row => { const box = row.getBoundingClientRect(); return box.height > 0 && box.top >= 0 && box.bottom <= innerHeight; }).length);
  if (viewport.width >= 1440) { expect(header?.y).toBeLessThanOrEqual(224); expect(visibleRows).toBeGreaterThanOrEqual(13); }
  if (viewport.width === 390) { expect(header?.y).toBeLessThanOrEqual(320); expect(visibleRows).toBeGreaterThanOrEqual(6); }
  await page.screenshot({ path: info.outputPath('workspace-first-screen.png'), animations: 'disabled' });
  console.info(JSON.stringify({ header: header?.y, visibleRows }));
  await expect(page.getByRole('button', { name: '分享所選項目', exact: true })).toHaveCount(0);
  await enableSelection(page);
  if (viewport.width === 390) {
    const target = await page.getByLabel('選取 design', { exact: true }).evaluate(input => { const box = input.closest('label')?.getBoundingClientRect(); return { width: box?.width ?? 0, height: box?.height ?? 0 }; });
    expect(target.width).toBeGreaterThanOrEqual(44); expect(target.height).toBeGreaterThanOrEqual(44);
  }
  await selectFile(page,'design');
  await expect(page.getByText('已選取 1 項', { exact: true })).toBeVisible();
  const selectedHeader = await page.locator('.ant-table-thead').boundingBox();
  expect(Math.abs((selectedHeader?.y ?? 0) - (header?.y ?? 0))).toBeLessThanOrEqual(viewport.width <= 600 ? 64 : 4);
  await page.screenshot({ path: info.outputPath('workspace-selected.png'), animations: 'disabled' });
  await page.getByRole('button', { name: '清除選取', exact: true }).click();
  await page.screenshot({ path: info.outputPath('workspace-normal.png'), fullPage: true, animations: 'disabled' });
  console.info(JSON.stringify({ viewport: page.viewportSize(), main: await page.locator('main').boundingBox(), table: await page.locator('.file-table').boundingBox() }));
  await page.getByRole('button', { name: '長名稱', exact: true }).click();
  await expect(page.getByText('4 個項目', { exact: true })).toBeVisible();
  await noOverflow();
  await page.screenshot({ path: info.outputPath('workspace-long.png'), fullPage: true, animations: 'disabled' });
  if (info.project.name === 'chromium-desktop') {
    await page.setViewportSize({ width: 1920, height: 1080 });
    expect((await page.locator('main').boundingBox())?.width).toBe(1696);
    await noOverflow();
    await page.screenshot({ path: info.outputPath('workspace-wide.png'), fullPage: true, animations: 'disabled' });
    console.info(JSON.stringify({ wide: await page.locator('main').boundingBox() }));
  }
  await page.goto('/?view=status');
  await expect(page.getByRole('heading', { name: '服務已就緒', exact: true })).toBeVisible();
  expect((await page.locator('main').boundingBox())?.width).toBeLessThanOrEqual(1120);
});
