import { mkdir, writeFile, rename, truncate } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, onTestFinished, test } from 'vitest';
import { databaseFixture } from '../helpers/database.js';
import { png, pdf } from '../../../../tests/helpers/preview-data.js';
import { IdentityService } from '../../src/modules/identity/service.js';
import { EntryService } from '../../src/modules/entries/service.js';
import { FileService } from '../../src/modules/files/service.js';
import { PreviewService } from '../../src/modules/previews/service.js';
import { buildApp } from '../../src/app.js';
import { parseConfig } from '../../src/config/index.js';

async function fixture() {
  const f = await databaseFixture(); f.migrate(); const db = f.open(), identity = new IdentityService(db);
  const admin = await identity.bootstrap('admin', 'Synthetic-preview-password-123!'), member = await identity.createUser('member', 'Synthetic-preview-password-123!');
  const root = join(f.directory, 'files'); await mkdir(root);
  await writeFile(join(root, '圖片 100%.png'), png()); await writeFile(join(root, 'document.pdf'), pdf());
  await writeFile(join(root, 'attack.html'), '<img src=x onerror="alert(1)"><script>fetch("/canary")</script>');
  await writeFile(join(root, 'attack.svg'), '<svg onload="alert(1)"/>'); await writeFile(join(root, 'broken.png'), Buffer.from([137,80,78,71,13,10,26,10]));
  const entries = new EntryService(db), entry = await entries.register('external', '預覽', root); await entries.grant('member', entry.id, '', false);
  const files = new FileService(entries), previews = new PreviewService(files);
  const app = buildApp({ config: parseConfig({ FILEHUB_LOG_LEVEL: 'silent' }), dependencies: { identity, entries, files } }); onTestFinished(() => app.close());
  const login = await app.inject({ method: 'POST', url: '/api/session', headers: { origin: 'http://127.0.0.1:3000' }, payload: { username: 'admin', password: 'Synthetic-preview-password-123!' } });
  const headers = { cookie: `filehub_session=${login.cookies[0]?.value}` }, url = (path: string) => `/api/entries/${entry.id}/preview/content?${new URLSearchParams({ path })}`;
  return { ...f, db, identity, admin, member, root, entries, entry, files, previews, app, headers, url };
}
test('圖片在隔離子程序轉 JPEG，PDF／文字內容安全政策、Range／HEAD 與下載名', async () => {
  const f = await fixture();
  const image = await f.app.inject({ url: f.url('圖片 100%.png'), headers: f.headers });
  expect(image.statusCode).toBe(200); expect(image.rawPayload.subarray(0, 3)).toEqual(Buffer.from([255,216,255])); expect(image.headers['content-type']).toBe('image/jpeg');
  expect(image.headers['content-disposition']).toContain(encodeURIComponent('圖片 100%.png')); expect(image.headers['cache-control']).toBe('no-store');
  expect((await f.app.inject({ url: f.url('圖片 100%.png').replace('/content?', '/thumbnail?'), headers: f.headers })).statusCode).toBe(200);
  const html = await f.app.inject({ url: f.url('attack.html'), headers: f.headers });
  expect(html.headers['content-type']).toContain('text/plain'); expect(html.headers['content-security-policy']).toBe("default-src 'none'; sandbox"); expect(html.headers['x-content-type-options']).toBe('nosniff');
  const pdfResponse = await f.app.inject({ url: f.url('document.pdf'), headers: { ...f.headers, range: 'bytes=0-4' } });
  expect(pdfResponse.statusCode).toBe(206); expect(pdfResponse.body).toBe('%PDF-');
  expect((await f.app.inject({ url: f.url('document.pdf'), method: 'HEAD', headers: f.headers })).body).toBe('');
  expect((await f.app.inject({ url: f.url('document.pdf'), headers: { ...f.headers, range: 'bytes=99999-' } })).statusCode).toBe(416);
  expect(f.files.activeRequests).toBe(0);
});
test('browse-only／撤權不能取得原檔或預覽，舊 version／同路徑換檔拒絕', async () => {
  const f = await fixture();
  await expect(f.previews.info(f.member.id, f.entry.id, '圖片 100%.png')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await f.entries.grant('member', f.entry.id, '', true);
  const prior = await f.previews.info(f.member.id, f.entry.id, '圖片 100%.png');
  await writeFile(join(f.root, 'replacement'), png(8, 12)); await rename(join(f.root, 'replacement'), join(f.root, '圖片 100%.png'));
  await expect(f.previews.content(f.member.id, f.entry.id, '圖片 100%.png', prior.resource.version)).rejects.toMatchObject({ code: 'CONFLICT' });
  const pending = f.previews.content(f.member.id, f.entry.id, '圖片 100%.png'); await f.entries.revoke('member', f.entry.id, '');
  await expect(pending).rejects.toMatchObject({ code: 'NOT_FOUND' }); expect(f.previews.activeRequests).toBe(0);
});
test('超大／損壞／不支援與 pixel bomb 有界降級；文字必須完整合法 UTF-8', async () => {
  const f = await fixture();
  await writeFile(join(f.root, 'large.txt'), ''); await truncate(join(f.root, 'large.txt'), 262145);
  expect(await f.previews.info(f.admin.id, f.entry.id, 'large.txt')).toMatchObject({ kind: 'unsupported', reason: 'size' });
  await expect(f.previews.content(f.admin.id, f.entry.id, 'large.txt')).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
  await expect(f.previews.content(f.admin.id, f.entry.id, 'broken.png')).rejects.toMatchObject({ code: 'UNSUPPORTED_MEDIA_TYPE' });
  await writeFile(join(f.root, 'bomb.png'), png(20000, 20000, true));
  await expect(f.previews.content(f.admin.id, f.entry.id, 'bomb.png')).rejects.toMatchObject({ code: 'UNSUPPORTED_MEDIA_TYPE' });
  await writeFile(join(f.root, 'invalid.txt'), Buffer.from([255,0]));
  await expect(f.previews.content(f.admin.id, f.entry.id, 'invalid.txt')).rejects.toMatchObject({ code: 'UNSUPPORTED_MEDIA_TYPE' });
  await writeFile(join(f.root, 'unknown.bin'), '<script>alert(1)</script>');
  expect(await f.previews.info(f.admin.id, f.entry.id, 'unknown.bin')).toMatchObject({ kind: 'unsupported', reason: 'type' });
  expect(f.files.activeRequests).toBe(0);
});
test('取消與並行 admission 釋放子程序及 fd，後續仍可載入', async () => {
  const f = await fixture();
  await expect(f.previews.content(f.admin.id, f.entry.id, '圖片 100%.png', undefined, AbortSignal.abort())).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  const abort = new AbortController(), pending = f.previews.content(f.admin.id, f.entry.id, '圖片 100%.png', undefined, abort.signal); abort.abort();
  await expect(pending).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  const one = f.previews.content(f.admin.id, f.entry.id, '圖片 100%.png'), two = f.previews.content(f.admin.id, f.entry.id, 'document.pdf');
  await expect(f.previews.content(f.admin.id, f.entry.id, 'attack.svg')).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' }); await Promise.all([one, two]);
  expect(f.files.activeRequests).toBe(0); expect(f.previews.activeRequests).toBe(0);
});
