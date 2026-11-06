import { readFile } from 'node:fs/promises';
import { chromium, type BrowserContext } from '@playwright/test';
import { test, expect } from './fixtures.js';
import { accountAction, login, selectFile } from './actions.js';

const lanOrigin = 'http://filehub.test';
test.use({ lanHttpOrigin: lanOrigin });

function watchPaths(context: BrowserContext, outsidePrefix: string[]): void {
  context.on('request', request => {
    const { origin, pathname } = new URL(request.url());
    if (origin === lanOrigin && pathname !== '/FileHub' && !pathname.startsWith('/FileHub/')) outsidePrefix.push(pathname);
  });
}

test('內網 HTTP 下以 /FileHub 登入並建立可下載的公開分享', async ({ viewport, filehub, workspaceData }) => {
  const port = new URL(filehub.url).port;
  // 只將合成的 HTTP 主機指向本次 fixture，讓 Chromium 自己處理轉址與 Cookie。
  const browser = await chromium.launch({ args: [
    '--no-proxy-server',
    '--host-resolver-rules=MAP filehub.test 127.0.0.1:' + port + ', MAP * ~NOTFOUND',
  ] });
  const outsidePrefix: string[] = [];
  try {
    const owner = await browser.newContext({ viewport, reducedMotion: 'reduce' });
    watchPaths(owner, outsidePrefix);
    const page = await owner.newPage();
    await page.goto(lanOrigin + '/FileHub?entry=' + workspaceData.managed);
    expect(new URL(page.url()).pathname).toBe('/FileHub/');
    expect(new URL(page.url()).searchParams.get('entry')).toBe(workspaceData.managed);
    expect(await page.evaluate(() => ({ secure: window.isSecureContext, subtle: Boolean(crypto.subtle), uuid: Boolean(crypto.randomUUID) })))
      .toEqual({ secure: false, subtle: false, uuid: false });
    await expect(page.getByRole('link', { name: '服務狀態', exact: true })).toHaveAttribute('href', '/FileHub/?view=status');

    await login(page);
    expect((await owner.cookies()).find(cookie => cookie.name === 'filehub_session_filehub')).toMatchObject({
      path: '/FileHub/', httpOnly: true, secure: false,
    });
    await selectFile(page, '文件');
    await page.getByRole('button', { name: '分享所選項目', exact: true }).click();
    await page.getByRole('button', { name: '建立分享', exact: true }).click();
    const shareInput = page.getByLabel('分享連結', { exact: true });
    await expect(shareInput).toBeVisible();
    const share = new URL(await shareInput.inputValue());
    expect(share.pathname).toBe('/FileHub/');
    expect(share.hash.length).toBe(44);
    const shareDialog = page.getByRole('dialog', { name: '建立公開分享', exact: true });
    await shareDialog.locator('.ant-modal-footer').getByRole('button', { name: '關閉', exact: true }).click();
    await expect(shareDialog).toHaveCount(0);

    const visitor = await browser.newContext({ viewport, reducedMotion: 'reduce' });
    watchPaths(visitor, outsidePrefix);
    const publicPage = await visitor.newPage();
    await publicPage.goto(share.href);
    await publicPage.getByRole('button', { name: '開啟分享', exact: true }).click();
    await expect(publicPage.getByRole('heading', { name: '文件', exact: true })).toBeVisible();
    expect((await visitor.cookies()).find(cookie => cookie.name.startsWith('filehub_public_'))).toMatchObject({
      path: '/FileHub/public/shares/' + share.searchParams.get('share'), httpOnly: true, secure: false,
    });
    const downloaded = publicPage.waitForEvent('download');
    await publicPage.getByRole('button', { name: '下載 報告 100%.bin', exact: true }).click();
    const download = await downloaded;
    expect(download.suggestedFilename()).toBe('報告 100%.bin');
    expect(await readFile(await download.path())).toEqual(workspaceData.bytes);

    await (await accountAction(page, '登出')).click();
    await expect(page.getByText('已登出。', { exact: true })).toBeVisible();
    expect((await owner.cookies()).some(cookie => cookie.name === 'filehub_session_filehub')).toBe(false);
    expect(outsidePrefix).toEqual([]);
  } finally {
    await browser.close();
  }
});
