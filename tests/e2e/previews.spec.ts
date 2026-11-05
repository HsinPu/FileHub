import { test, expect } from './fixtures.js';
import { login, accountAction } from './actions.js';

test('安全預覽圖片／文字／PDF，Escape 返回焦點；HTML／PDF 腳本不執行', async ({ page, workspaceData }, info) => {
  await workspaceData.preparePreviews();
  let dialogs = 0, canary = 0;
  page.on('dialog', (dialog) => { dialogs++; void dialog.dismiss(); });
  await page.route('**/canary', (route) => { canary++; return route.abort(); });
  await page.goto(`/?entry=${workspaceData.managed}&path=${encodeURIComponent('預覽')}`); await login(page);
  await page.getByRole('button', { name: '預覽 圖片 100%.png', exact: true }).click();
  const modal = page.getByRole('dialog');
  await expect(modal).not.toHaveClass(/ant-zoom-(appear|enter)/);
  expect(await modal.boundingBox()).toMatchObject({x:0,y:0,width:page.viewportSize()?.width,height:page.viewportSize()?.height});
  await expect(modal.getByAltText('圖片 100%.png')).toBeVisible();
  await expect(modal.getByAltText('圖片 100%.png')).toHaveJSProperty('naturalWidth', 12);
  await page.screenshot({ path: info.outputPath('image-preview.png'), fullPage: false, animations: 'disabled' });
  await page.keyboard.press('Escape'); await expect(modal).toHaveCount(0);
  await expect(page.getByRole('button', { name: '預覽 圖片 100%.png', exact: true })).toBeFocused();
  await page.getByRole('button', { name: '預覽 attack.html', exact: true }).click();
  await expect(modal.getByLabel('純文字預覽')).toContainText('<script>fetch("/canary")</script>');
  await page.screenshot({path:info.outputPath('text-preview.png'),animations:'disabled'});
  expect(await modal.locator('script, iframe, object, embed').count()).toBe(0);
  await page.keyboard.press('Escape'); await expect(modal).toHaveCount(0);
  await page.getByRole('button', { name: '預覽 document.pdf', exact: true }).click();
  const canvas = modal.getByRole('img', { name: 'PDF 第一頁預覽' }); await expect(canvas).toBeVisible();
  // canvas 預設寬 300 不代表 render 已完成；直接等候實際圖形，不以 metadata 載入前的空狀態判定。
  await expect.poll(() => canvas.evaluate((element) => {
    if (!(element instanceof HTMLCanvasElement)) return false;
    const context = element.getContext('2d'); if (!context) return false;
    const bytes = context.getImageData(0, 0, element.width, element.height).data;
    for (let i = 0; i < bytes.length; i += 4) if ((bytes[i + 2] ?? 0) > (bytes[i] ?? 0) + 50) return true;
    return false;
  })).toBe(true);
  await expect(modal.getByText('正在載入預覽。', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('pdf-preview.png'), fullPage: false, animations: 'disabled' });
  await page.keyboard.press('Escape'); await expect(modal).toHaveCount(0);
  expect(dialogs).toBe(0); expect(canary).toBe(0);
});

test('損壞／不支援與內容載入失敗可重試或下載；browse-only 無預覽', async ({ page, workspaceData }) => {
  await workspaceData.preparePreviews(); await page.goto(`/?entry=${workspaceData.managed}&path=${encodeURIComponent('預覽')}`); await login(page);
  await page.getByRole('button', { name: '預覽 unknown.bin', exact: true }).click();
  const modal = page.getByRole('dialog');
  await expect(modal.getByText('目前無法預覽此格式或內容，請下載原檔。')).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), modal.getByRole('link', { name: '下載原檔' }).click()]); expect(download.suggestedFilename()).toBe('unknown.bin');
  await page.keyboard.press('Escape'); await expect(modal).toHaveCount(0);
  await page.getByRole('button', { name: '預覽 broken.pdf', exact: true }).click();
  await expect(modal.getByText('預覽載入失敗或內容不支援。可重試預覽或下載原檔。')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(modal).toHaveCount(0);
  let fail = true;
  await page.route('**/preview/content?**', async (route) => { if (fail) { fail = false; await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }); } else await route.continue(); });
  await page.getByRole('button', { name: '預覽 圖片 100%.png', exact: true }).click();
  await expect(modal.getByText('預覽載入失敗或內容不支援。可重試預覽或下載原檔。')).toBeVisible();
  await modal.getByRole('button', { name: '重試預覽' }).click(); await expect(modal.getByAltText('圖片 100%.png')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(modal).toHaveCount(0);
  await (await accountAction(page, '登出')).click(); await page.goto(`/?entry=${workspaceData.external}&path=team`); await login(page, 'member');
  await expect(page.getByRole('button', { name: '預覽 shared.txt', exact: true })).toBeDisabled();
});
