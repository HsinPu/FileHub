import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, type BrowserContext } from '@playwright/test';
import type { OperationResponse } from '@filehub/contracts';
import { expectReadable } from './visual-contrast.js';
import { test, expect } from './fixtures.js';
import { login, openSettings, selectFile, selectionAction, openTasks } from './actions.js';
import { createTemporaryDirectory } from '../helpers/temporary-directory.js';

interface ZoomChrome { tabs: { query(options: { url: string }): Promise<{ id?: number }[]>; setZoomSettings(id: number, settings: { mode: string; scope: string }): Promise<void>; setZoom(id: number, factor: number): Promise<void>; getZoom(id: number): Promise<number> } }

test('真正 200% 瀏覽器縮放可登入、選取與設定；保留原始 DPR 與 CSS viewport 證據', async ({ filehub, workspaceData }, info) => {
  const temporary = await createTemporaryDirectory('filehub-zoom-'); let context: BrowserContext | undefined;
  try {
    const extension = join(temporary.directory, 'extension'); await mkdir(extension);
    await writeFile(join(extension, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'FileHub synthetic zoom fixture', version: '1.0.0', permissions: ['tabs'], background: { service_worker: 'background.js' } }));
    await writeFile(join(extension, 'background.js'), 'chrome.runtime.onInstalled.addListener(() => {});\n');
    context = await chromium.launchPersistentContext(join(temporary.directory, 'profile'), { channel: 'chromium', headless: true, viewport: { width: 1280, height: 960 }, deviceScaleFactor: 1, locale: 'zh-TW', timezoneId: 'Asia/Taipei', colorScheme: 'light', reducedMotion: 'reduce', args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--window-size=1280,960'] });
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker'), page = context.pages()[0] ?? await context.newPage();
    // Remove Playwright's DPR/viewport emulation before applying native tab zoom.
    const metrics = await context.newCDPSession(page); await metrics.send('Emulation.clearDeviceMetricsOverride'); await metrics.detach();
    const path = await workspaceData.prepareLayout(); await page.goto(`${filehub.url}/?entry=${workspaceData.managed}&path=${encodeURIComponent(path)}`);
    await expect(page.getByLabel('帳號', { exact: true })).toBeVisible();
    const before = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio }));
    const factor = await worker.evaluate(async ({ origin }) => {
      const tabs = (globalThis as unknown as { chrome: ZoomChrome }).chrome.tabs, [tab] = await tabs.query({ url: origin + '/*' });
      if (tab?.id === undefined) throw Error('缺少合成分頁');
      await tabs.setZoomSettings(tab.id, { mode: 'automatic', scope: 'per-tab' }); await tabs.setZoom(tab.id, 2); return tabs.getZoom(tab.id);
    }, { origin: filehub.url });
    await expect.poll(() => page.evaluate(() => devicePixelRatio)).toBe(2);
    const after = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio, zoom: getComputedStyle(document.body).zoom }));
    expect(factor).toBe(2); expect(before.dpr).toBe(1); expect(Math.abs(after.width * 2 - before.width)).toBeLessThanOrEqual(1); expect(after.zoom).toBe('1');
    await page.evaluate(() => document.fonts.ready); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    // Native zoom needs an unclipped compositor capture after scrolling, not CSS clip bounds.
    const captureNativeViewport = async (name: string) => {
      await expect(page.locator('.ant-dropdown:visible')).toHaveCount(0);
      await page.evaluate(async () => {
        const finite = document.getAnimations().filter(animation => {
          const end = animation.effect?.getComputedTiming().endTime;
          return typeof end === 'number' && Number.isFinite(end);
        });
        await Promise.allSettled(finite.map(animation => animation.finished));
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      });
      const session = await page.context().newCDPSession(page);
      try {
        const shot = await session.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
        await writeFile(info.outputPath(name), Buffer.from(shot.data, 'base64'));
      } finally { await session.detach(); }
    };
    await captureNativeViewport('zoom-login.png');
    await page.getByRole('button', { name: '登入', exact: true }).scrollIntoViewIfNeeded(); await expect(page.getByRole('button', { name: '登入', exact: true })).toBeInViewport();
    await captureNativeViewport('zoom-login-controls.png');
    await login(page); await expect(page.getByText('66 個項目', { exact: true })).toBeVisible();
    await selectFile(page, 'design'); await expect(page.getByText('已選取 1 項', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await captureNativeViewport('zoom-selection.png');
    await openSettings(page); await expect(page.getByRole('heading', { name: '檔案偏好', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await captureNativeViewport('zoom-settings.png');
    await page.getByRole('button', { name: '更新我的密碼', exact: true }).scrollIntoViewIfNeeded(); await expect(page.getByRole('button', { name: '更新我的密碼', exact: true })).toBeInViewport();
    await captureNativeViewport('zoom-settings-footer.png');
    const footer = await page.getByRole('button', { name: '更新我的密碼', exact: true }).evaluate(element => ({ top: element.getBoundingClientRect().top, bottom: element.getBoundingClientRect().bottom, viewportHeight: innerHeight, scrollY }));
    const receipt = { method: 'chrome.tabs.setZoom/getZoom', capture: 'Page.captureScreenshot without clip', factor, before, after, footer, browser: context.browser()?.version(), reducedMotion: await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches) };
    await writeFile(info.outputPath('zoom.json'), JSON.stringify(receipt, null, 2)); console.info(JSON.stringify(receipt));
  } finally { await context?.close(); await temporary.dispose(); }
});

test('320px 短手機可用鍵盤導覽與設定，公開狀態保留單一頁尾與可讀控制', async ({ page, filehub, workspaceData }, info) => {
  await page.setViewportSize({ width: 320, height: 440 }); await page.goto(`/?entry=${workspaceData.managed}`);
  await expect(page.getByLabel('帳號', { exact: true })).toBeVisible(); expect((await page.locator('.login-page').boundingBox())?.width).toBe(288);
  await login(page); const navigation = page.getByRole('button', { name: '開啟導覽', exact: true }); await navigation.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: '工作空間導覽', exact: true })).toBeVisible(); await page.keyboard.press('Escape'); await expect(navigation).toBeFocused();
  await openSettings(page); await expect(page.getByRole('heading', { name: '檔案偏好', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: info.outputPath('narrow-settings.png'), fullPage: true, animations: 'disabled' });
  await page.goto(filehub.url + '/?view=status'); await expect(page.getByRole('heading', { name: '服務已就緒', exact: true })).toBeVisible(); await expect(page.locator('footer')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); expect(await page.getByRole('button', { name: '重新檢查', exact: true }).evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  await expectReadable(page.locator('.connection-summary h3')); await expectReadable(page.getByRole('button', { name: '重新檢查', exact: true }));
  await page.screenshot({ path: info.outputPath('narrow-status.png'), fullPage: true, animations: 'disabled' });
});

test('未知建立結果與 needs_review 呈現保留編號、逐項警告及待確認摘要', async ({ page, workspaceData }, info) => {
  await page.goto(`/?entry=${workspaceData.managed}`); await login(page); await selectFile(page, 'readme.txt');
  if (process.platform !== 'linux') { await expect((await selectionAction(page, '建立 ZIP'))).toBeDisabled(); return; }
  let queued: OperationResponse | undefined, review = false, posted = 0;
  await page.route('**/api/operations**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/operations' && route.request().method() === 'POST') {
      posted++; const response = await route.fetch(); expect(response.status()).toBe(200);
      queued = await response.json() as OperationResponse; expect(queued).toMatchObject({ state: 'queued', kind: 'archive', id: expect.any(String) });
      await route.abort('failed'); return;
    }
    if (route.request().method() === 'GET' && path === '/api/operations') {
      // Only rare presentation is synthetic: the actual API job remains queued, with no worker.
      const items = review && queued ? [{ ...queued, state: 'needs_review', canRetry: false, items: queued.items.map(item => ({ ...item, state: 'needs_review' })) }] : [];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items }) }); return;
    }
    if (path.startsWith('/api/operations/') && path !== '/api/operations/capabilities' && route.request().method() === 'GET') { await route.abort('failed'); return; }
    await route.continue();
  });
  await (await selectionAction(page, '建立 ZIP')).click(); await openTasks(page);
  const dock = page.getByRole('dialog', { name: '工作', exact: true }); await expect(dock.getByText('結果待確認', { exact: true })).toBeVisible();
  await expect(page.locator('.header-task-state')).toHaveText('待確認 1'); await expect(dock.getByText('尚未取得結果，請保留編號並回查，勿重複送出。', { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('tasks-unknown.png'), animations: 'disabled' });
  review = true; await dock.getByRole('button', { name: '更新工作', exact: true }).click();
  await expect(dock.locator('.operation-item-heading').getByText('需要處置', { exact: true })).toBeVisible(); await expect(dock.getByText('檔案可能已有部分變更，請先確認結果或聯絡管理員，勿重複送出。', { exact: true })).toBeVisible();
  await expect(dock.getByRole('button', { name: '重試未開始工作', exact: true })).toHaveCount(0); await expect(page.locator('.header-task-state')).toHaveText('待確認 1'); expect(posted).toBe(1);
  await expectReadable(dock.locator('.operation-warning')); await expectReadable(page.locator('.header-task-state'));
  await page.screenshot({ path: info.outputPath('tasks-needs-review.png'), animations: 'disabled' });
});
