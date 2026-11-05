import { mkdir, writeFile, symlink } from 'node:fs/promises';
import { renameSync } from 'node:fs';
import { join } from 'node:path';
import { expect, onTestFinished, test, vi } from 'vitest';
import { databaseFixture } from '../helpers/database.js';
import { IdentityService } from '../../src/modules/identity/service.js';
import { EntryService } from '../../src/modules/entries/service.js';
import { FileService } from '../../src/modules/files/service.js';
import { SearchService } from '../../src/modules/search/service.js';
import { buildApp } from '../../src/app.js';
import { parseConfig } from '../../src/config/index.js';

async function fixture() {
  const f = await databaseFixture(); f.migrate(); const db = f.open(), identity = new IdentityService(db);
  const admin = await identity.bootstrap('admin', 'Synthetic-search-password-123!');
  const member = await identity.createUser('member', 'Synthetic-search-password-123!');
  const root = join(f.directory, 'files'); await mkdir(join(root, 'team'), { recursive: true }); await mkdir(join(root, 'private'));
  await writeFile(join(root, 'team', '報告 100%.TXT'), 'authorized'); await writeFile(join(root, 'private', '報告-secret.txt'), 'secret');
  const entries = new EntryService(db), entry = await entries.register('external', '搜尋', root);
  await entries.grant('member', entry.id, 'team', false);
  const files = new FileService(entries), search = new SearchService(entries);
  const app = buildApp({ config: parseConfig({ FILEHUB_LOG_LEVEL: 'silent' }), dependencies: { identity, entries, files } }); onTestFinished(() => app.close());
  return { ...f, db, identity, admin, member, root, entries, entry, files, search, app };
}
test('搜尋只在目前授權 scope；名稱大小寫／百分號／Unicode、browse-only 不取得內容權限', async () => {
  const f = await fixture();
  const result = await f.search.search(f.member.id, f.entry.id, 'team', '.txt');
  expect(result).toMatchObject({ partial: false, scanned: 1, reasons: [] });
  expect(result.items.map((item) => [item.path, item.canDownload])).toEqual([['team/報告 100%.TXT', false]]);
  expect(JSON.stringify(result)).not.toContain(f.directory);
  await expect(f.search.search(f.member.id, f.entry.id, '', '報告')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await f.entries.revoke('member', f.entry.id, 'team');
  await expect(f.search.search(f.member.id, f.entry.id, 'team', '報告')).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
test('目前目錄篩選在排序／分頁前執行，filter 屬 snapshot identity；不遞迴子目錄', async () => {
  const f = await fixture(); await writeFile(join(f.root, 'ROOT.TXT'), 'root');
  const listing = await f.files.list(f.admin.id, f.entry.id, '', { filter: '.txt' });
  expect(listing.items.map((item) => item.name)).toEqual(['ROOT.TXT']);
  await expect(f.files.list(f.admin.id, f.entry.id, '', { filter: 'team', version: listing.version })).rejects.toMatchObject({ code: 'CONFLICT' });
  expect((await f.search.search(f.admin.id, f.entry.id, '', '.txt')).items).toHaveLength(3);
});
test('結果／深度限制與私有 namespace／symlink 不外洩，清楚標示部分結果', async () => {
  const f = await fixture();
  await mkdir(join(f.root, '.filehub')); await writeFile(join(f.root, '.filehub', 'needle-private'), 'private');
  await symlink(join(f.root, 'private'), join(f.root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
  let path = f.root;
  for (let i = 0; i < 10; i++) { path = join(path, 'deep'); await mkdir(path); }
  await writeFile(join(path, 'needle-too-deep'), 'deep');
  const deep = await f.search.search(f.admin.id, f.entry.id, '', 'needle');
  expect(deep.partial).toBe(true); expect(deep.reasons).toContain('depth'); expect(deep.items).toEqual([]);
  await Promise.all(Array.from({ length: 110 }, (_, i) => writeFile(join(f.root, 'team', `needle-${i}`), '')));
  const capped = await f.search.search(f.admin.id, f.entry.id, 'team', 'needle');
  expect(capped.items).toHaveLength(100); expect(capped.reasons).toContain('results'); expect(f.search.activeRequests).toBe(0);
});
test('取消及並行 admission 釋放資源；遍歷中撤權不回傳已收集結果', async () => {
  const f = await fixture();
  await expect(f.search.search(f.admin.id, f.entry.id, '', '報告', AbortSignal.abort())).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  const one = f.search.search(f.admin.id, f.entry.id, '', '報告'), two = f.search.search(f.admin.id, f.entry.id, '', '報告');
  await expect(f.search.search(f.admin.id, f.entry.id, '', '報告')).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  await Promise.all([one, two]);
  const pending = f.search.search(f.member.id, f.entry.id, 'team', '報告');
  await f.entries.revoke('member', f.entry.id, 'team');
  await expect(pending).rejects.toMatchObject({ code: 'NOT_FOUND' }); expect(f.search.activeRequests).toBe(0);
});
test('遍歷期間外部子目錄消失回報部分結果，入口消失則拒絕', async () => {
  const f = await fixture(), authorize = f.entries.authorize.bind(f.entries);
  const spy = vi.spyOn(f.entries, 'authorize').mockImplementation((...args) => {
    const access = authorize(...args);
    if (args[2] === 'team') { spy.mockRestore(); renameSync(join(f.root, 'team'), join(f.root, 'moved')); }
    return access;
  });
  const result = await f.search.search(f.admin.id, f.entry.id, '', '報告');
  expect(result.partial).toBe(true); expect(result.reasons).toContain('unavailable');
  renameSync(f.root, `${f.root}-gone`);
  await expect(f.search.search(f.admin.id, f.entry.id, '', '報告')).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
});
test('10,050 檔案實測有界掃描，HTTP schema／登入檢查', async () => {
  const f = await fixture();
  for (let i = 0; i < 10050; i += 64) await Promise.all(Array.from({ length: Math.min(64, 10050 - i) }, (_, k) => writeFile(join(f.root, 'team', `item-${i + k}`), '')));
  const before = process.memoryUsage().rss, started = performance.now();
  const result = await f.search.search(f.admin.id, f.entry.id, 'team', 'no-match');
  process.stdout.write(`${JSON.stringify({ measurement: 'search-10050', platform: process.platform, files: 10050, elapsedMs: Math.ceil(performance.now() - started), rssDeltaBytes: process.memoryUsage().rss - before, scanned: result.scanned, reasons: result.reasons })}\n`);
  expect(result.partial).toBe(true); expect(result.scanned).toBeLessThanOrEqual(10000); expect(result.reasons.some((reason) => reason === 'scan' || reason === 'time')).toBe(true);
  const login = await f.app.inject({ method: 'POST', url: '/api/session', headers: { origin: 'http://127.0.0.1:3000' }, payload: { username: 'admin', password: 'Synthetic-search-password-123!' } });
  const headers = { cookie: `filehub_session=${login.cookies[0]?.value}` }, url = `/api/entries/${f.entry.id}/search?path=private&query=secret`;
  expect((await f.app.inject({ url })).statusCode).toBe(401);
  expect((await f.app.inject({ url, headers })).json()).toMatchObject({ query: 'secret', items: [{ path: 'private/報告-secret.txt' }] });
  expect((await f.app.inject({ url: url.replace('query=secret', 'query='), headers })).statusCode).toBe(400);
}, 40_000);
