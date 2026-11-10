import { test, expect } from './remote-fixtures.js';
import { chooseStorage, goPath, login, searchInput } from './actions.js';

test('B 只登入 A，在同一介面切換 A／C、巢狀目錄、三檢視及名稱篩選', async ({ page, pair }, info) => {
  const origins = new Set<string>(), errors: string[] = [];
  page.on('request', request => origins.add(new URL(request.url()).origin));
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(pair.url + '/FileHub/');
  await login(page);
  await expect(page.getByText('A-only.txt', { exact: true })).toBeVisible();
  await chooseStorage(page, 'C 的檔案');
  await expect(page.getByText('C-note.txt', { exact: true })).toBeVisible();
  await expect(page.getByText('C-private.txt', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '選取項目', exact: true })).toBeDisabled();
  await page.screenshot({ path: info.outputPath('remote-list.png'), animations: 'disabled', fullPage: true });
  for (const [view, name] of [['mosaic', 'remote-mosaic.png'], ['thumbnails', 'remote-gallery.png']] as const) {
    await page.getByRole('button', { name: '切換檢視', exact: true }).click();
    await expect(page.getByRole('button', { name: '切換檢視', exact: true })).toHaveAttribute('data-view', view);
    await expect(page.getByText('C-note.txt', { exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath(name), animations: 'disabled', fullPage: true });
  }
  await page.getByRole('button', { name: '開啟 子目錄', exact: true }).click();
  await expect(page.getByText('遠端報告.txt', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('遠端報告.txt', { exact: true })).toBeVisible();
  await chooseStorage(page, 'C 的檔案');
  await goPath(page, '大量檔案');
  await expect(page.getByText('55 個項目', { exact: true })).toBeVisible();
  await page.getByRole('listitem', { name: '2', exact: true }).click();
  await expect(page).toHaveURL(/page=2&version=[a-f0-9]{64}/);
  await expect(page.getByText('item-54.txt', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('item-54.txt', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '排序選項', exact: true }).click();
  await page.getByRole('menuitem', { name: '改為遞減', exact: true }).click();
  await expect(page.getByText('item-05.txt', { exact: true })).toBeVisible();
  await expect(page.getByText('item-00.txt', { exact: true })).toHaveCount(0);
  await chooseStorage(page, 'C 的檔案');
  await (await searchInput(page)).fill('C-note');
  await expect(page.getByRole('option', { name: '包含子目錄', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '搜尋', exact: true }).click();
  await expect(page.getByText('C-note.txt', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '子目錄', exact: true })).toHaveCount(0);
  await chooseStorage(page, 'A 的檔案');
  await expect(page.getByText('A-only.txt', { exact: true })).toBeVisible();
  expect([...origins]).toEqual([pair.url]);
  expect((await page.content()).includes(pair.secret)).toBe(false);
  expect((await page.context().cookies()).some(cookie => cookie.name.startsWith('filehub_public_'))).toBe(false);
  expect(errors).toEqual([]);
});

test('C 斷線時保留 A 操作，C 原埠恢復後可重新瀏覽，遠端清單無水平溢位', async ({ page, pair }, info) => {
  await page.goto(pair.url + '/FileHub/');
  await login(page);
  await chooseStorage(page, 'C 的檔案');
  await expect(page.getByText('C-note.txt', { exact: true })).toBeVisible();
  await pair.stopC();
  await page.getByRole('button', { name: '重新整理', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('遠端來源暫時無法使用');
  await page.screenshot({ path: info.outputPath('remote-offline.png'), animations: 'disabled', fullPage: true });
  await chooseStorage(page, 'A 的檔案');
  await expect(page.getByText('A-only.txt', { exact: true })).toBeVisible();
  await pair.restartC();
  await chooseStorage(page, 'C 的檔案');
  await expect(page.getByText('C-note.txt', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '空資料夾', exact: true }).click();
  await expect(page.getByText('這個資料夾目前是空的。', { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('remote-empty.png'), animations: 'disabled', fullPage: true });
  expect(await page.locator('body,main,.entry-nav,.file-panel').evaluateAll(elements =>
    elements.filter(element => element.scrollWidth > element.clientWidth + 1).map(element => element.className))).toEqual([]);
});
