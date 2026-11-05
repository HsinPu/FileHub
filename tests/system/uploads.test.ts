import { randomUUID, createHash } from 'node:crypto';
import { mkdir, stat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { expect, test, onTestFinished } from 'vitest';
import { EntryService, IdentityService, MutationService, UploadService, UploadMaintainer } from '@filehub/server';
import { systemFixture } from './fixtures.js';

const chunkBytes = 4 * 1024 * 1024;
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
async function fixture(login = false) {
  const f = await systemFixture(); f.migrate(); const db = f.open();
  const identity = new IdentityService(db); let user: string = randomUUID(), session: Awaited<ReturnType<IdentityService['login']>> | undefined;
  if (login) { await identity.bootstrap('fixture', 'Synthetic upload restart password 2026!'); session = await identity.login('fixture', 'Synthetic upload restart password 2026!', '127.0.0.1'); user = session.session.user.id; }
  else db.sqlite.prepare("INSERT INTO users VALUES (?, 'fixture', 'synthetic-hash', 'admin', 1, 1)").run(user);
  const root = join(f.directory, 'files'); await mkdir(join(root, 'team'), { recursive: true });
  const entries = new EntryService(db), entry = (await entries.register('managed', 'Upload restart', root)).id;
  if (process.platform === 'linux') await entries.setWritable(entry, true);
  const mutations = new MutationService(db, entries), uploads = new UploadService(db, entries, mutations), maintenance = new UploadMaintainer(db);
  onTestFinished(async () => { await maintenance.close(); await uploads.close(); await mutations.close(); });
  const create = (bytes: Buffer, name = 'restart.bin') => uploads.create(user, entry, { id: randomUUID(), parent: 'team', name, size: bytes.length, sha256: digest(bytes) });
  const send = (id: string, bytes: Buffer, offset = 0) => uploads.receive(user, id, offset, bytes.length, digest(bytes), Readable.from([bytes]));
  return { ...f, db, user, root, entries, entry, uploads, maintenance, create, send, session };
}
for (const phase of ['claimed', 'received', 'verified'] as const) {
  test(`真正 Node 在 upload ${phase} 被終止，先證明 owner 結束，再恢復 prefix 而不自動發布`, async () => {
    const f = await fixture(); if (process.platform !== 'linux') { await expect(f.maintenance.run()).rejects.toMatchObject({ code: 'WRITE_UNSUPPORTED' }); return; }
    const bytes = Buffer.alloc(chunkBytes + 11, 0x51), { id } = await f.create(bytes); await f.send(id, bytes.subarray(0, chunkBytes));
    if (phase === 'verified') await f.send(id, bytes.subarray(chunkBytes), chunkBytes);
    const child = await f.startNode([fileURLToPath(new URL('./fixtures/upload-crash.mjs', import.meta.url))], { P3_USER: f.user, P3_ID: id, P3_PHASE: phase, P3_OFFSET: String(chunkBytes), P3_BYTES: bytes.subarray(chunkBytes).toString('base64') }, true);
    await child.waitForMessage((message) => message.type === 'checkpoint');
    const before = f.db.sqlite.prepare('SELECT owner,generation,offset FROM upload_sessions WHERE id=?').get(id);
    expect((await f.maintenance.run()).items).toEqual([{ id, outcome: 'busy' }]); expect(f.db.sqlite.prepare('SELECT owner,generation,offset FROM upload_sessions WHERE id=?').get(id)).toEqual(before);
    await child.forceStop(); expect(child.output()).toEqual({ stdout: '', stderr: '' });
    expect((await f.maintenance.run()).items).toEqual([{ id, outcome: 'open' }]);
    const offset = phase === 'verified' ? bytes.length : chunkBytes;
    expect((await stat(join(f.root, '.filehub', 'staging', `u-${id}`))).size).toBe(offset); expect(f.uploads.get(f.user, id).offset).toBe(offset);
    await expect(stat(join(f.root, 'team', 'restart.bin'))).rejects.toMatchObject({ code: 'ENOENT' });
    if (offset < bytes.length) await f.send(id, bytes.subarray(offset), offset);
    expect((await f.uploads.finalize(f.user, id)).sha256).toBe(digest(bytes)); expect((await readFile(join(f.root, 'team', 'restart.bin'))).equals(bytes)).toBe(true);
  });
}
test('正式 API／worker 兩程序停止並重開，session／offset 可續傳，worker 自動清理到期內容', async () => {
  const f = await fixture(true); if (process.platform !== 'linux') return;
  const login = f.session; if (!login) throw new Error('missing synthetic session');
  const bytes = Buffer.alloc(chunkBytes + 7, 0x44), { id } = await f.create(bytes); await f.send(id, bytes.subarray(0, chunkBytes));
  const firstApi = await f.startService('api'), firstWorker = await f.startService('worker', { FILEHUB_UPLOAD_MAINTENANCE_INTERVAL_MS: '1000' });
  await firstApi.waitForMessage((message) => message.type === 'started'); await firstWorker.waitForMessage((message) => message.type === 'started');
  for (const service of [firstApi, firstWorker]) { expect((await service.request('stop')).databaseClosed).toBe(true); expect(await service.waitForExit()).toEqual({ code: 0, signal: null }); }
  const api = await f.startService('api'), worker = await f.startService('worker', { FILEHUB_UPLOAD_MAINTENANCE_INTERVAL_MS: '1000' });
  const started = await api.waitForMessage((message) => message.type === 'started'); await worker.waitForMessage((message) => message.type === 'started');
  expect(api.pid).not.toBe(firstApi.pid); expect(worker.pid).not.toBe(firstWorker.pid);
  const url = String(started.address), headers = { cookie: `filehub_session=${login.token}`, origin: url, 'x-csrf-token': login.session.csrfToken };
  expect(await (await fetch(`${url}/api/uploads/${id}`, { headers })).json()).toMatchObject({ state: 'open', offset: chunkBytes });
  const tail = bytes.subarray(chunkBytes);
  expect((await fetch(`${url}/api/uploads/${id}/content`, { method: 'PUT', headers: { ...headers, 'content-type': 'application/octet-stream', 'x-upload-offset': String(chunkBytes), 'x-upload-checksum': digest(tail) }, body: tail })).status).toBe(200);
  expect((await fetch(`${url}/api/uploads/${id}/finalize`, { method: 'POST', headers })).status).toBe(200);
  expect((await readFile(join(f.root, 'team', 'restart.bin'))).equals(bytes)).toBe(true);
  const expired = await f.create(Buffer.from('expiry bytes'), 'expired.bin'); await f.send(expired.id, Buffer.from('expiry bytes'));
  f.db.sqlite.prepare('UPDATE upload_sessions SET expires_at=0 WHERE id=?').run(expired.id);
  await expect.poll(() => f.db.sqlite.prepare('SELECT cleaned FROM upload_sessions WHERE id=?').get(expired.id), { timeout: 8000 }).toEqual({ cleaned: 1 });
  await expect(stat(join(f.root, '.filehub', 'staging', `u-${expired.id}`))).rejects.toBeDefined(); await expect(stat(join(f.root, 'team', 'expired.bin'))).rejects.toBeDefined();
  for (const service of [api, worker]) { expect((await service.request('stop')).databaseClosed).toBe(true); expect(await service.waitForExit()).toEqual({ code: 0, signal: null }); expect(service.output()).toEqual({ stdout: '', stderr: '' }); }
});
