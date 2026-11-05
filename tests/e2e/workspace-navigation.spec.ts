import { test, expect } from './fixtures.js';
import { accountAction, chooseStorage, login, navigationAction, openNavigation, openSettings } from './actions.js';

test('全域導覽與手機 Drawer 的 Tab／Escape／返回焦點，切換入口與垃圾桶沒有資料副作用', async ({ page, workspaceData }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`/?entry=${workspaceData.managed}`); await login(page);
  await expect(page.getByText('readme.txt', { exact: true })).toBeVisible();
  const before = await workspaceData.snapshot();
  const mobile = (page.viewportSize()?.width ?? 0) <= 736;
  if (mobile) {
    const trigger = page.getByRole('button', { name: '開啟導覽', exact: true });
    await trigger.focus(); await page.keyboard.press('Enter');
    const drawer = page.getByRole('dialog', { name: '工作空間導覽', exact: true });
    await expect(drawer).toBeVisible();
    expect((await page.locator('.workspace-drawer .ant-drawer-content-wrapper').boundingBox())?.width).toBe(256);
    await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('.workspace-drawer')))).toBe(true);
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('.workspace-drawer')))).toBe(true);
    await page.screenshot({ path: info.outputPath('navigation.png'), animations: 'disabled' });
    await page.keyboard.press('Escape'); await expect(drawer).toHaveCount(0); await expect(trigger).toBeFocused();
  } else await page.screenshot({ path: info.outputPath('navigation.png'), animations: 'disabled' });
  await chooseStorage(page, '團隊資料');
  await expect(page.getByText('private.txt', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`entry=${workspaceData.external}`));
  await (await navigationAction(page, '垃圾桶')).click();
  await expect(page.getByText('垃圾桶目前沒有可見項目。', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '返回檔案列表', exact: true }).click();
  await expect(page.getByText('private.txt', { exact: true })).toBeVisible();
  if (mobile) { await openNavigation(page); await page.setViewportSize({ width: 1440, height: 1000 }); await expect(page.getByRole('dialog', { name: '工作空間導覽', exact: true })).toHaveCount(0); }
  expect(await page.locator('body,main,.topbar,.workspace-navigation').evaluateAll(elements => elements.filter(element => element.scrollWidth > element.clientWidth + 1).map(element => element.className))).toEqual([]);
  expect(await workspaceData.snapshot()).toBe(before); expect(errors).toEqual([]);
});

test('帳號選單的狀態另開分頁、設定及分享頁往返，保留目前檔案與資料', async ({ page, workspaceData }) => {
  await page.goto(`/?entry=${workspaceData.managed}`); await login(page);
  await expect(page.getByText('readme.txt', { exact: true })).toBeVisible();
  const before = await workspaceData.snapshot();
  const currentUrl = page.url();
  await accountAction(page, '服務狀態');
  const link = page.getByRole('link', { name: '服務狀態', exact: true });
  await expect(link).toHaveAttribute('target', '_blank');
  const popupPromise = page.waitForEvent('popup'); await link.click(); const popup = await popupPromise;
  try { await expect(popup.getByRole('heading', { name: '服務已就緒', exact: true })).toBeVisible(); }
  finally { await popup.close(); }
  expect(page.url()).toBe(currentUrl);
  await page.keyboard.press('Escape');
  await openSettings(page); await expect(page.getByLabel('預設檢視', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '返回檔案', exact: true }).click();
  await expect(page.getByRole('region', { name: '檔案列表', exact: true })).toBeVisible();
  await (await navigationAction(page, '分享管理')).click();
  await expect(page.getByRole('heading', { name: '分享管理', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '返回檔案', exact: true }).click();
  await expect(page.getByText('readme.txt', { exact: true })).toBeVisible();
  expect(await workspaceData.snapshot()).toBe(before);
});
