import { test, expect } from './fixtures.js';
import { openNavigation } from './actions.js';
import { SCHEMA_REVISION } from '@filehub/server';

test('正式 SPA 同源載入真實健康狀態，誠實標示開發範圍且沒有瀏覽器錯誤', async ({ page, request, browser }, info) => {
  const errors: string[] = [];
  const privateRequests:string[]=[];page.on('request',request=>{const path=new URL(request.url()).pathname;if(path.startsWith('/api/'))privateRequests.push(path);});
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (['error', 'warning'].includes(message.type())) errors.push(message.text()); });
  const html = await request.get('/');
  expect(html.status()).toBe(200);
  expect(html.headers()['content-type']).toContain('text/html');
  expect(html.headers()['cache-control']).toBe('no-store');
  const status = await request.get('/health/ready');
  expect(await status.json()).toEqual({ status: 'ready' });
  await page.goto('/?view=status');
  await expect(page).toHaveTitle('FileHub｜檔案工作空間');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hant');
  await expect(page.getByRole('heading', { name: '系統概覽', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '服務已就緒', exact: true })).toBeVisible();
  await expect(page.getByText('登入後可依權限瀏覽、下載與管理檔案；分享連結提供獨立存取。')).toBeVisible();
  await expect(page.locator('#scope .scope-row').last().getByText('已建立',{exact:true})).toBeVisible();
  await expect(page.locator('#scope').getByText('規劃中',{exact:true})).toHaveCount(0);
  expect(await page.locator('script[src]').evaluateAll((scripts) => scripts.every((script) => new URL((script as HTMLScriptElement).src).pathname.startsWith('/assets/')))).toBe(true);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByRole('contentinfo')).toHaveCount(1);
  const heading=await page.getByRole('heading',{name:'系統概覽',exact:true}).boundingBox(),eyebrow=await page.locator('.page-heading .eyebrow').boundingBox(),description=await page.locator('.page-heading > p:last-child').boundingBox();if(!heading||!eyebrow||!description)throw new Error('公開頁標題缺少尺寸');expect(eyebrow.y+eyebrow.height).toBeLessThanOrEqual(heading.y);expect(heading.y+heading.height).toBeLessThanOrEqual(description.y);
  if((page.viewportSize()?.width??0)<=600){for(const box of await page.locator('.nav-item,.connection-body .ant-btn').evaluateAll(elements=>elements.filter(element=>element.getClientRects().length).map(element=>{const rect=element.getBoundingClientRect();return{width:rect.width,height:rect.height};}))){expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);}}
  await page.screenshot({ path: info.outputPath('overview.png'), fullPage: true, animations: 'disabled' });
  console.info(JSON.stringify({ project: info.project.name, browser: browser.version(), viewport: page.viewportSize() }));
  expect(errors).toEqual([]);
  expect(privateRequests).toEqual([]);
});

test('實際 DB 未就緒呈現 503 狀態，修復後可重新檢查', async ({ page, filehub }) => {
  filehub.setRevision(999);
  try {
    await page.goto('/?view=status');
    await expect(page.getByRole('heading', { name: '服務尚未就緒', exact: true })).toBeVisible();
    filehub.setRevision(SCHEMA_REVISION);
    await page.getByRole('button', { name: '重新檢查' }).click();
    await expect(page.getByRole('heading', { name: '服務已就緒', exact: true })).toBeVisible();
  } finally { filehub.setRevision(SCHEMA_REVISION); }
});

test('等待中有清楚提示且不能重複提交', async ({ page }) => {
  let release = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/health/ready', async (route) => { await gate; await route.continue(); });
  try {
    await page.goto('/?view=status');
    await expect(page.getByRole('heading', { name: '正在檢查服務', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '重新檢查' })).toBeDisabled();
    release();
    await expect(page.getByRole('heading', { name: '服務已就緒', exact: true })).toBeVisible();
  } finally { release(); }
});

test('HTTP 錯誤可理解且不回顯任意訊息，重新檢查可恢復', async ({ page }, info) => {
  await page.route('**/health/ready', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 'INTERNAL_ERROR', message: 'private-secret-do-not-show', requestId: 'fixture-case' }) }));
  await page.goto('/?view=status');
  await expect(page.getByRole('alert')).toContainText('服務暫時無法回應');
  await expect(page.getByRole('alert')).toContainText('fixture-case');
  await expect(page.locator('body')).not.toContainText('private-secret-do-not-show');
  await page.screenshot({path:info.outputPath('status-error.png'),fullPage:true,animations:'disabled'});
  await page.unroute('**/health/ready');
  await page.getByRole('button', { name: '重新檢查' }).click();
  await expect(page.getByRole('heading', { name: '服務已就緒', exact: true })).toBeVisible();
});

test('網路錯誤有重試提示，沒有沿用舊的成功狀態', async ({ page }) => {
  await page.goto('/?view=status');
  await expect(page.getByRole('heading', { name: '服務已就緒', exact: true })).toBeVisible();
  await page.route('**/health/ready', (route) => route.abort('failed'));
  await page.getByRole('button', { name: '重新檢查' }).click();
  await expect(page.getByRole('alert')).toContainText('無法連線到服務');
  await expect(page.getByRole('heading', { name: '服務已就緒', exact: true })).toHaveCount(0);
});

test('鍵盤可跳至主內容／啟動檢查，所有主要容器沒有水平溢位', async ({ page }) => {
  await page.goto('/?view=status');
  await expect(page.getByRole('heading', { name: '服務已就緒', exact: true })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: '跳至主要內容' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: '重新檢查' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: '服務已就緒', exact: true })).toBeVisible();
  await openNavigation(page);
  await page.getByRole('link', { name: '開發進度', exact: true }).click();
  await expect(page).toHaveURL(/#scope$/);
  const overflowing = await page.locator('body, .sidebar, nav, .topbar, main, .status-panel, .scope-list, .scope-row').evaluateAll((elements) => elements.filter((element) => element.scrollWidth > element.clientWidth + 1).map((element) => element.className || element.tagName));
  expect(overflowing).toEqual([]);
});
