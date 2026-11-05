import { test, expect } from './fixtures.js';
import { login, openSettings } from './actions.js';

test('管理分類可鍵盤切換、只在分類與表格內橫捲，卡片按視窗分欄且導覽不修改檔案', async ({ page, workspaceData }, info) => {
  await page.goto(`/?entry=${workspaceData.managed}&path=${encodeURIComponent('文件')}`); await login(page); await openSettings(page);
  await expect(page.getByLabel('預設檢視', { exact: true })).toBeVisible(); await page.evaluate(() => document.fonts.ready);
  const before = await workspaceData.snapshot(), viewport = page.viewportSize(); if (!viewport) throw Error('缺少視窗');
  const forms = page.locator('.settings-section-personal .settings-stack > form'), first = await forms.nth(0).boundingBox(), second = await forms.nth(1).boundingBox();
  if (!first || !second) throw Error('缺少設定卡片');
  if (viewport.width > 1200) { expect(Math.abs(first.y - second.y)).toBeLessThanOrEqual(1); expect(second.x).toBeGreaterThan(first.x + first.width); }
  else expect(second.y).toBeGreaterThanOrEqual(first.y + first.height);
  await page.screenshot({ path: info.outputPath('personal.png'), fullPage: true, animations: 'disabled' });
  const tabs = page.getByRole('navigation', { name: '管理分類', exact: true }); await expect(tabs.getByRole('link')).toHaveCount(5);
  for (const [label, heading, file] of [['帳號管理', '建立帳號', 'accounts'], ['儲存與授權', '新增儲存入口', 'storage'], ['分享管理', '分享管理', 'shares'], ['垃圾桶', '垃圾桶', 'trash']] as const) {
    const link = tabs.getByRole('link', { name: label, exact: true }); await link.focus(); await expect(link).toBeFocused(); await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible(); await expect(tabs.getByRole('link', { name: label, exact: true })).toHaveAttribute('aria-current', 'page');
    if(label==='儲存與授權'){
      const buttons=page.locator('.settings-section-storage .settings-stack > form').first().locator('.settings-form-footer .ant-btn');
      await expect(buttons).toHaveCount(2);
      const boxes=await buttons.evaluateAll(items=>items.map(item=>item.getBoundingClientRect().y));
      expect(Math.max(...boxes)-Math.min(...boxes)).toBeLessThanOrEqual(1);
    }
    if(viewport.width>=1440&&(label==='帳號管理'||label==='儲存與授權'))expect(await page.locator('.settings-stack .ant-table-content').evaluateAll(items=>items.filter(item=>item.scrollWidth>item.clientWidth+1).length)).toBe(0);
    const visible = await tabs.getByRole('link', { name: label, exact: true }).boundingBox(), container = await tabs.boundingBox(); if (!visible || !container) throw Error('缺少分類尺寸');
    expect(visible.x).toBeGreaterThanOrEqual(container.x - 1); expect(visible.x + visible.width).toBeLessThanOrEqual(container.x + container.width + 1);
    expect(await page.locator('body,main,.settings-page,.settings-fieldset,.settings-stack,.settings-form,.management-card,.trash-page,.share-management').evaluateAll(elements => elements.filter(element => element.scrollWidth > element.clientWidth + 1).map(element => element.className))).toEqual([]);
    await page.evaluate(() => { window.scrollTo(0, 0); document.querySelectorAll('.ant-table-content').forEach(element => { element.scrollLeft = 0; }); });
    await page.screenshot({ path: info.outputPath(`${file}.png`), fullPage: true, animations: 'disabled' });
  }
  expect(await workspaceData.snapshot()).toBe(before);
});
