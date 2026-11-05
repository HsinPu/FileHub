import { mkdir, writeFile, rename, unlink, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, onTestFinished, test } from 'vitest';
import { databaseFixture } from '../helpers/database.js';
import { IdentityService } from '../../src/modules/identity/service.js';
import { EntryService } from '../../src/modules/entries/service.js';
import { FileService } from '../../src/modules/files/service.js';
import { buildApp } from '../../src/app.js';
import { parseConfig } from '../../src/config/index.js';

async function fixture() {
  const f = await databaseFixture(); f.migrate(); const db = f.open();
  const identity = new IdentityService(db);
  const admin = await identity.bootstrap('admin', 'Synthetic-files-password-123!');
  await identity.createUser('reader', 'Synthetic-files-password-123!');
  const root = join(f.directory, 'files'); await mkdir(join(root, '子目錄'), { recursive: true });
  await writeFile(join(root, 'hello.txt'), 'hello world'); await writeFile(join(root, '空白.txt'), '');
  const entries = new EntryService(db); const entry = await entries.register('managed', '測試', root);
  const files = new FileService(entries);
  const app = buildApp({ config: parseConfig({ FILEHUB_LOG_LEVEL: 'silent' }), dependencies: { identity, entries, files } });
  onTestFinished(() => app.close());
  const login = await app.inject({ method: 'POST', url: '/api/session', headers: { origin: 'http://127.0.0.1:3000' }, payload: { username: 'admin', password: 'Synthetic-files-password-123!' } });
  const headers = { cookie: `filehub_session=${login.cookies[0]?.value}` };
  return { ...f, db, identity, admin, root, entries, entry, files, app, headers };
}

test('列表與 metadata 是真實 FS、directories first、穩定分頁，無主機路徑', async () => {
  const f = await fixture();
  const result = await f.files.list(f.admin.id, f.entry.id, '', { limit: 2 });
  expect(result.total).toBe(3); expect(result.items[0]?.kind).toBe('directory'); expect(result.hasMore).toBe(true);
  expect(JSON.stringify(result)).not.toContain(f.directory);
  const next = await f.files.list(f.admin.id, f.entry.id, '', { offset: 2, limit: 2, version: result.version });
  expect(next.items).toHaveLength(1); expect(next.hasMore).toBe(false);
  const metadata = await f.files.metadata(f.admin.id, f.entry.id, 'hello.txt');
  expect(metadata.resource).toMatchObject({ size: 11, kind: 'file', canDownload: true });
  expect(f.files.activeRequests).toBe(0);
});

test('外部程式改名／替換／刪除即重新辨識，舊 version 不混用分頁', async () => {
  const f = await fixture();
  const first = await f.files.list(f.admin.id, f.entry.id, '', {});
  await rename(join(f.root, 'hello.txt'), join(f.root, 'renamed.txt'));
  await writeFile(join(f.root, 'hello.txt'), 'new contents');
  await expect(f.files.list(f.admin.id, f.entry.id, '', { version: first.version })).rejects.toMatchObject({ code: 'CONFLICT' });
  expect((await f.files.metadata(f.admin.id, f.entry.id, 'hello.txt')).resource.size).toBe(12);
  await unlink(join(f.root, 'hello.txt'));
  await expect(f.files.metadata(f.admin.id, f.entry.id, 'hello.txt')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect(f.files.activeRequests).toBe(0);
});

test('HTTP 單檔與 Range／零 byte 下載正確，拒絕目錄／舊 version／未知 range', async () => {
  const f = await fixture();
  const url = `/api/entries/${f.entry.id}/download?path=hello.txt`;
  const full = await f.app.inject({ url, headers: f.headers });
  expect(full.statusCode).toBe(200); expect(full.body).toBe('hello world');
  expect(full.headers['content-disposition']).toContain('attachment');
  expect(full.headers['x-content-type-options']).toBe('nosniff');
  const range = await f.app.inject({ url, headers: { ...f.headers, range: 'bytes=1-4' } });
  expect(range.statusCode).toBe(206); expect(range.body).toBe('ello');
  expect(range.headers['content-range']).toBe('bytes 1-4/11');
  const conditional = await f.app.inject({ url, headers: { ...f.headers, range: 'bytes=1-4', 'if-range': String(full.headers.etag) } });
  expect(conditional.statusCode).toBe(200); expect(conditional.body).toBe('hello world');
  expect((await f.app.inject({ url, headers: { ...f.headers, range: 'bytes=100-' } })).statusCode).toBe(416);
  expect((await f.app.inject({ url: `${url}&version=${'0'.repeat(64)}`, headers: f.headers })).statusCode).toBe(409);
  const empty = await f.app.inject({ url: `/api/entries/${f.entry.id}/download?path=${encodeURIComponent('空白.txt')}`, headers: f.headers });
  expect(empty.statusCode).toBe(200); expect(empty.body).toBe('');
  expect((await f.app.inject({ url: `/api/entries/${f.entry.id}/download?path=`, headers: f.headers })).statusCode).toBe(400);
  expect(f.files.activeRequests).toBe(0);
});

test('大目錄有硬上限／分頁版本；超限、取消與 I/O admission 不留下 handle', async () => {
  const f = await fixture();
  const opened = [];
  try {
    for (let i = 0; i < 4; i++) opened.push(await f.files.openDownload(f.admin.id, f.entry.id, 'hello.txt'));
    expect(f.files.activeRequests).toBe(4);
    await expect(f.files.metadata(f.admin.id, f.entry.id, 'hello.txt')).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  } finally { await Promise.all(opened.map((item) => item.close())); }
  await expect(f.files.list(f.admin.id, f.entry.id, '', { offset: 1 })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  await expect(f.files.metadata(f.admin.id, f.entry.id, '', AbortSignal.abort())).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  for (let i = 0; i < 5000; i += 64) {
    await Promise.all(Array.from({ length: Math.min(64, 5000 - i) }, (_, index) => writeFile(join(f.root, `item-${i + index}.txt`), '')));
  }
  await expect(f.files.list(f.admin.id, f.entry.id, '', {})).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
  expect(f.files.activeRequests).toBe(0);
}, 30_000);

test('external 與 managed 同服務，Unicode／百分號可用；無法 UTF-8 往返的 Linux 名稱明確略過', async () => {
  const f = await fixture();
  const external = join(f.directory, 'external'); await mkdir(external);
  const entry = await f.entries.register('external', '外部', external);
  await writeFile(join(external, '資料%2f.txt'), 'external bytes');
  await writeFile(join(external, 'literal�.txt'), 'valid Unicode');
  if (process.platform === 'linux') await writeFile(Buffer.concat([Buffer.from(`${external}/`), Buffer.from([0xff])]), 'opaque name');
  const result = await f.files.list(f.admin.id, entry.id, '', {});
  expect(result.items.map((item) => item.name)).toEqual(['literal�.txt', '資料%2f.txt']);
  expect(result.omitted).toBe(process.platform === 'linux' ? 1 : 0);
  expect((await f.files.metadata(f.admin.id, entry.id, '資料%2f.txt')).resource.size).toBe(14);
});

test('拒絕下載／traversal／symlink 不寫 FS／業務 DB，撤權下一請求生效', async () => {
  const f = await fixture();
  await f.entries.grant('reader', f.entry.id, '', false);
  const login = await f.app.inject({ method: 'POST', url: '/api/session', headers: { origin: 'http://127.0.0.1:3000' }, payload: { username: 'reader', password: 'Synthetic-files-password-123!' } });
  const headers = { cookie: `filehub_session=${login.cookies[0]?.value}` };
  const before = f.db.sqlite.prepare('SELECT total_changes() AS n').get();
  expect((await f.app.inject({ url: `/api/entries/${f.entry.id}/download?path=hello.txt`, headers })).statusCode).toBe(403);
  expect((await f.app.inject({ url: `/api/entries/${f.entry.id}/files?path=..%2Fstate`, headers })).statusCode).toBe(400);
  expect(f.db.sqlite.prepare('SELECT total_changes() AS n').get()).toEqual(before);
  const external = join(f.directory, 'external'); await mkdir(external);
  await writeFile(join(external, 'secret.txt'), 'outside');
  await symlink(external, join(f.root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
  expect((await f.app.inject({ url: `/api/entries/${f.entry.id}/metadata?path=escape%2Fsecret.txt`, headers })).statusCode).toBe(403);
  await f.entries.revoke('reader', f.entry.id, '');
  expect((await f.app.inject({ url: `/api/entries/${f.entry.id}/files`, headers })).statusCode).toBe(404);
});
