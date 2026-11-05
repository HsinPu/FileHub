import { test, expect } from './fixtures.js';
import { login, openNavigation, openSettings, searchInput, fileAction } from './actions.js';

test('品牌返回目前授權根，搜尋 Escape 不改 filter；短視窗側欄可捲且設定沿用殼層', async ({ page, workspaceData }, info) => {
  const path = await workspaceData.prepareLayout();
  await page.goto(`/?entry=${workspaceData.managed}&path=${encodeURIComponent(path)}`); await login(page);
  await expect(page.getByText('66 個項目', { exact: true })).toBeVisible();
  const skip = page.getByRole('link', { name: '跳至主要內容', exact: true }); await skip.focus();
  expect(await skip.evaluate(element => { const box=element.getBoundingClientRect(); return document.elementFromPoint(box.left+box.width/2,box.top+box.height/2)===element; })).toBe(true);
  await page.keyboard.press('Enter'); await expect(page.getByRole('main')).toBeFocused();
  const url = page.url();
  await (await searchInput(page)).fill('尚未送出的搜尋'); await page.keyboard.press('Escape');
  expect(page.url()).toBe(url);
  await expect(page.getByRole('button', { name: '搜尋', exact: true })).not.toBeVisible();
  await page.getByRole('link', { name: 'FileHub 首頁', exact: true }).click();
  await expect(page.getByText('readme.txt', { exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get('path')).toBe('');
  const initialViewport = page.viewportSize(); if (!initialViewport) throw Error('缺少視窗');
  if (info.project.name === 'chromium-desktop') {
    for (const width of [320, 736, 737, 1199, 1200]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect(page.getByRole('button', { name: '開啟導覽', exact: true })).toBeVisible({ visible: width <= 736 });
      expect((await page.locator('main').boundingBox())?.x).toBe(width <= 736 ? 0 : width < 1200 ? 192 : 224);
      if (width <= 736) expect((await (await fileAction(page,'新建資料夾')).boundingBox())?.height).toBeGreaterThanOrEqual(44);
      if (width === 320) {
        expect(await page.locator('body,main,.local-toolbar').evaluateAll(elements=>elements.filter(element=>element.scrollWidth>element.clientWidth+1).map(element=>element.className))).toEqual([]);
        const sort=await page.getByRole('button',{name:'排序選項',exact:true}).boundingBox();
        if(!sort)throw Error('缺少窄版排序入口');
        expect(sort.x+sort.width).toBeLessThanOrEqual(width);
        expect(sort.width).toBeGreaterThanOrEqual(44);expect(sort.height).toBeGreaterThanOrEqual(44);
      }
    }
    await page.setViewportSize(initialViewport);
  }
  await openSettings(page); await expect(page.getByLabel('預設檢視', { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('settings-shell.png'), fullPage: true, animations: 'disabled' });
  const viewport = page.viewportSize(); if (!viewport) throw Error('缺少視窗');
  await page.setViewportSize({ ...viewport, height: 440 });
  await openNavigation(page);
  const navigation = page.getByRole('navigation', { name: '儲存入口', exact: true });
  const link = navigation.getByRole('link', { name: /^我的檔案/ });
  await link.scrollIntoViewIfNeeded(); await expect(link).toBeInViewport();
  expect(await page.locator('body').evaluate(element => element.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('short-navigation.png'), animations: 'disabled' });
  if (viewport.width <= 736) {
    const trigger = page.getByRole('button', { name: '開啟導覽', exact: true });
    await page.keyboard.press('Escape'); await expect(page.getByRole('dialog', { name: '工作空間導覽', exact: true })).toHaveCount(0); await expect(trigger).toBeFocused();
  }
});
