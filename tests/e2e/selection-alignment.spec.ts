import { test, expect } from './fixtures.js';
import { login, enableSelection } from './actions.js';

test('勾選框對齊第一行檔名，換行與手機資訊不移動勾選框', async ({ page, workspaceData }, info) => {
  const path = await workspaceData.prepareSelectionAlignment();
  await page.goto(`/?entry=${workspaceData.managed}&path=${encodeURIComponent(path)}`);
  await login(page);
  await expect(page.getByText('4 個項目', { exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await enableSelection(page);
  const all = page.getByRole('checkbox', { name: '選取本頁可操作項目', exact: true });
  const measurements = [];
  for (const state of ['none', 'partial', 'all'] as const) {
    if (state === 'partial') await page.locator('.resource-check input:not(:disabled)').first().check();
    if (state === 'all') await all.check();
    const geometry = await page.locator('.file-table').evaluate(table => {
      const box = (element: Element | null | undefined) => {
        if (!element) throw new Error('找不到勾選框或檔名');
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x, y, width, height };
      };
      const firstLine = (element: Element | null) => {
        if (!element) throw new Error('找不到檔名第一行');
        const rect = box(element), lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight);
        return { ...rect, lineHeight, centerY: rect.y + lineHeight / 2 };
      };
      return {
        header: { checkbox: box(table.querySelector('.name-heading input')?.parentElement), text: firstLine(table.querySelector('.column-sort > span:not(.tool-icon)')) },
        rows: Array.from(table.querySelectorAll('.resource-name')).map(row => ({
          checkbox: box(row.querySelector('input')?.parentElement),
          text: firstLine(row.querySelector('.folder-link > span:first-child')),
          target: box(row.querySelector('label')),
        })),
      };
    });
    measurements.push({ state, ...geometry });
    await page.screenshot({ path: info.outputPath(`first-line-${state}.png`), animations: 'disabled' });
    expect.soft(Math.abs(geometry.header.checkbox.y + geometry.header.checkbox.height / 2 - geometry.header.text.centerY), `${state} 表頭文字置中`).toBeLessThanOrEqual(1);
    expect.soft(Math.max(...geometry.rows.map(row => Math.abs(row.text.x - geometry.header.text.x))), `${state} 實際文字左緣同欄`).toBeLessThanOrEqual(1);
    expect.soft(Math.max(...geometry.rows.map(row => Math.abs(row.checkbox.y + row.checkbox.height / 2 - row.text.centerY))), `${state} 勾選框與第一行檔名置中`).toBeLessThanOrEqual(1);
    expect(geometry.rows.some(row => row.text.height > row.text.lineHeight * 1.5), '包含實際換行長檔名').toBe(true);
    if ((page.viewportSize()?.width ?? 0) <= 736) {
      for (const row of geometry.rows) { expect(row.target.width).toBeGreaterThanOrEqual(44); expect(row.target.height).toBeGreaterThanOrEqual(44); }
    }
  }
  await info.attach('first-line-geometry', { body: JSON.stringify(measurements, null, 2), contentType: 'application/json' });
  await all.press('Space');
  await expect(all).not.toBeChecked();
  await expect(page.locator('.resource-check input:checked')).toHaveCount(0);
  await page.getByRole('button', { name: '預覽 image.png', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('列表全選與每列勾選框、名稱欄在三種選取狀態保持對齊', async ({ page, workspaceData }, info) => {
  const path = await workspaceData.prepareLayout();
  await page.goto(`/?entry=${workspaceData.managed}&path=${encodeURIComponent(path)}`);
  await login(page);
  await expect(page.getByText('66 個項目', { exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await enableSelection(page);
  const all = page.getByRole('checkbox', { name: '選取本頁可操作項目', exact: true });
  const rows = page.locator('.resource-check input[type=checkbox]');
  expect(await rows.count()).toBeGreaterThan(1);
  const eligibleCount = await page.locator('.resource-check input:not(:disabled)').count();
  const measurements = [];
  for (const state of ['none', 'partial', 'all'] as const) {
    if (state === 'partial') await rows.first().check();
    if (state === 'all') {
      await all.focus();
      await all.press('Space');
      await expect(all).toBeChecked();
      await expect(page.locator('.resource-check input:checked')).toHaveCount(eligibleCount);
    }
    const geometry = await page.locator('.file-table').evaluate(table => {
      const box = (element: Element | null | undefined) => {
        if (!element) throw new Error('找不到勾選框或名稱欄');
        return element.getBoundingClientRect();
      };
      const header = box(table.querySelector('.name-heading input[type=checkbox]')?.parentElement);
      const title = box(table.querySelector('.column-sort'));
      return {
        headerX: header.x, titleX: title.x,
        rows: Array.from(table.querySelectorAll('.resource-name')).map(row => ({
          checkboxX: box(row.querySelector('input[type=checkbox]')?.parentElement).x,
          nameX: box(row.querySelector('.resource-label')).x,
        })),
      };
    });
    measurements.push({ state, ...geometry });
    await page.screenshot({ path: info.outputPath(`selection-${state}.png`), animations: 'disabled' });
    expect.soft(Math.max(...geometry.rows.map(row => Math.abs(row.checkboxX - geometry.headerX))), `${state} 勾選框同欄`).toBeLessThanOrEqual(1);
    expect.soft(Math.max(...geometry.rows.map(row => Math.abs(row.nameX - geometry.titleX))), `${state} 名稱同欄`).toBeLessThanOrEqual(1);
    if (state === 'partial') await expect(all).toHaveJSProperty('indeterminate', true);
  }
  await info.attach('selection-geometry', { body: JSON.stringify(measurements, null, 2), contentType: 'application/json' });
  await all.press('Space');
  await expect(all).not.toBeChecked();
  await expect(page.locator('.resource-check input:checked')).toHaveCount(0);
  if ((page.viewportSize()?.width ?? 0) <= 736) {
    const targets = await page.locator('.file-table .ant-checkbox-wrapper').evaluateAll(labels => labels.map(label => {
      const box = label.getBoundingClientRect(); return { width: box.width, height: box.height };
    }));
    for (const target of targets) { expect(target.width).toBeGreaterThanOrEqual(44); expect(target.height).toBeGreaterThanOrEqual(44); }
  }
});
