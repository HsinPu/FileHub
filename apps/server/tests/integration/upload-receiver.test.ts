import { readFile, writeFile, stat, link, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { expect, test } from 'vitest';
import { UPLOAD_LIMITS } from '@filehub/contracts';
import { uploadFixture, digest } from '../helpers/uploads.js';
import { native } from '../../src/storage/native.js';
import { recoverWrites } from '../../src/storage/recovery.js';

test('串流兩段 fsync 後才前進 offset，finalize 驗 manifest／完整 hash 並原子發布一次', async () => {
  const f = await uploadFixture(), bytes = Buffer.alloc(UPLOAD_LIMITS.chunkBytes + 17, 0xa7);
  if (process.platform !== 'linux') { await expect(f.create(bytes)).rejects.toBeDefined(); return; }
  const session = await f.create(bytes); const target = join(f.root, 'team', session.name);
  await expect(stat(target)).rejects.toMatchObject({ code: 'ENOENT' });
  await f.all(session.id, bytes);
  expect(f.uploads.get(f.user, session.id)).toMatchObject({ offset: bytes.length, state: 'open', chunks: [{ offset: 0, length: UPLOAD_LIMITS.chunkBytes }, { offset: UPLOAD_LIMITS.chunkBytes, length: 17 }] });
  const before = await stat(join(f.root, '.filehub', 'staging', `u-${session.id}`));
  const result = await f.uploads.finalize(f.user, session.id);
  expect(result).toMatchObject({ offset: bytes.length, state: 'completed', sha256: digest(bytes), canResume: false });
  expect((await readFile(target)).equals(bytes)).toBe(true); expect((await stat(target)).ino).toBe(before.ino);
  expect(await f.uploads.finalize(f.user, session.id)).toEqual(result);
  expect(f.uploads.cancel(f.user, session.id).state).toBe('completed'); expect((await readFile(target)).equals(bytes)).toBe(true);
  expect(f.db.sqlite.prepare('SELECT count(*) AS n FROM write_intents').get()).toEqual({ n: 1 });
  expect(f.db.sqlite.prepare('SELECT cleaned,reserved_bytes FROM upload_sessions').get()).toEqual({ cleaned: 1, reserved_bytes: 0 });
});
test('空檔 finalize 仍有正式 bytes／SHA-256，未收齊不可發布', async () => {
  const f = await uploadFixture(); if (process.platform !== 'linux') return;
  const empty = await f.create(Buffer.alloc(0));
  expect((await f.uploads.finalize(f.user, empty.id)).sha256).toBe(digest(Buffer.alloc(0)));
  expect((await readFile(join(f.root, 'team', empty.name))).length).toBe(0);
  const partial = await f.create(Buffer.from('incomplete'), 'partial');
  await expect(f.uploads.finalize(f.user, partial.id)).rejects.toMatchObject({ code: 'CONFLICT' });
  expect(f.uploads.get(f.user, partial.id)).toMatchObject({ state: 'open', offset: 0 });
});
test('錯 offset／長度／checksum／斷線均不提交，僅回復本次未提交的尾端', async () => {
  const f = await uploadFixture(); if (process.platform !== 'linux') return;
  const bytes = Buffer.from([0, 255, 10, 8]), { id } = await f.create(bytes);
  await expect(f.send(id, bytes, 1)).rejects.toMatchObject({ code: 'CONFLICT' });
  await expect(f.send(id, bytes.subarray(0, 3))).rejects.toMatchObject({ code: 'CONFLICT' });
  await expect(f.uploads.receive(f.user, id, 0, bytes.length, digest(Buffer.from('wrong')), Readable.from([bytes]))).rejects.toMatchObject({ code: 'CONFLICT' });
  const disconnected = Readable.from((async function* () { yield bytes.subarray(0, 2); throw new Error('synthetic disconnect'); })());
  await expect(f.uploads.receive(f.user, id, 0, bytes.length, digest(bytes), disconnected)).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  await expect(f.uploads.receive(f.user, id, 0, bytes.length, digest(bytes), Readable.from([Buffer.alloc(5)]))).rejects.toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
  expect(f.uploads.get(f.user, id)).toMatchObject({ state: 'open', offset: 0, chunks: [] });
  expect((await readFile(join(f.root, '.filehub', 'staging', `u-${id}`))).length).toBe(0);
  await f.send(id, bytes); expect((await f.uploads.finalize(f.user, id)).sha256).toBe(digest(bytes));
});
test('已提交段重送會讀取驗 bytes，不能靠正確 header 送不同資料或覆寫 prefix', async () => {
  const f = await uploadFixture(); if (process.platform !== 'linux') return;
  const bytes = Buffer.alloc(UPLOAD_LIMITS.chunkBytes + 1, 0x41), { id } = await f.create(bytes), first = bytes.subarray(0, UPLOAD_LIMITS.chunkBytes);
  await f.send(id, first);
  await expect(f.uploads.receive(f.user, id, 0, first.length, digest(first), Readable.from([Buffer.alloc(first.length, 0x42)]))).rejects.toMatchObject({ code: 'CONFLICT' });
  expect((await f.send(id, first)).offset).toBe(first.length);
  expect(f.db.sqlite.prepare('SELECT count(*) AS n FROM upload_chunks').get()).toEqual({ n: 1 });
  await f.send(id, bytes.subarray(first.length), first.length); await f.uploads.finalize(f.user, id);
  expect((await readFile(join(f.root, 'team', '上傳 100%.bin'))).equals(bytes)).toBe(true);
});
test('同名檔案與外部目錄均不覆寫；失敗仍可查詢／取消，原檔不變', async () => {
  const f = await uploadFixture(); if (process.platform !== 'linux') return;
  const bytes = Buffer.from('new contents'), session = await f.create(bytes); await f.all(session.id, bytes);
  await writeFile(join(f.root, 'team', session.name), 'original canary');
  await expect(f.uploads.finalize(f.user, session.id)).rejects.toMatchObject({ code: 'CONFLICT' });
  expect(await readFile(join(f.root, 'team', session.name), 'utf8')).toBe('original canary');
  expect(f.uploads.get(f.user, session.id).state).toBe('open');
  expect(f.uploads.cancel(f.user, session.id)).toMatchObject({ state: 'cancelled', cleanupPending: true });
  expect(await readFile(join(f.root, 'team', session.name), 'utf8')).toBe('original canary');
});
test('接收結束及 finalize 發布前重新授權，撤銷寫入不留下已發布內容', async () => {
  let phase = ''; const actions = { revoke: () => {} };
  const f = await uploadFixture({ checkpoint: (current) => { if (current === phase) actions.revoke(); } }); if (process.platform !== 'linux') return;
  const bytes = Buffer.from('grant canary'), { id } = await f.create(bytes);
  actions.revoke = () => { f.db.sqlite.prepare('UPDATE entries SET writable=0').run(); }; phase = 'received';
  await expect(f.send(id, bytes)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(f.uploads.get(f.user, id)).toMatchObject({ offset: 0, state: 'open', canResume: false });
  await f.entries.setWritable(f.entry, true); phase = ''; await f.send(id, bytes); phase = 'verified';
  await expect(f.uploads.finalize(f.user, id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(f.uploads.get(f.user, id).state).toBe('open'); await expect(stat(join(f.root, 'team', '上傳 100%.bin'))).rejects.toBeDefined();
});
test('暫存內容損毀／替換／hardlink 不採用，不發布未知 bytes', async () => {
  const f = await uploadFixture(); if (process.platform !== 'linux') return;
  const bytes = Buffer.from('digest canary'), a = await f.create(bytes, 'a'); await f.all(a.id, bytes);
  await writeFile(join(f.root, '.filehub', 'staging', `u-${a.id}`), 'other contents');
  await expect(f.uploads.finalize(f.user, a.id)).rejects.toMatchObject({ code: 'MUTATION_UNCERTAIN' });
  expect(f.uploads.get(f.user, a.id).state).toBe('needs_review');
  const b = await f.create(bytes, 'b'); await f.all(b.id, bytes); const path = join(f.root, '.filehub', 'staging', `u-${b.id}`);
  await link(path, join(f.root, 'external-link'));
  await expect(f.uploads.finalize(f.user, b.id)).rejects.toMatchObject({ code: 'MUTATION_UNCERTAIN' });
  expect(await readFile(join(f.root, 'external-link'))).toEqual(bytes);
  const c = await f.create(bytes, 'c'); await writeFile(join(f.root, '.filehub', 'staging', `u-${c.id}`), 'foreign private canary');
  await expect(f.send(c.id, bytes)).rejects.toMatchObject({ code: 'MUTATION_UNCERTAIN' });
  expect(f.uploads.get(f.user, c.id).state).toBe('needs_review');
});
test('同 session 接收／取消／finalize 競爭拒絕，close 等待自己持有的串流', async () => {
  let release = () => {}, entered = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; }), claimed = new Promise<void>((resolve) => { entered = resolve; });
  const f = await uploadFixture({ checkpoint: async (phase) => { if (phase === 'claimed') { entered(); await gate; } } }); if (process.platform !== 'linux') return;
  const bytes = Buffer.from('race'), { id } = await f.create(bytes), first = f.send(id, bytes);
  try {
    await claimed; await expect(f.send(id, bytes)).rejects.toMatchObject({ code: 'MUTATION_BUSY' });
    await expect(f.uploads.finalize(f.user, id)).rejects.toMatchObject({ code: 'MUTATION_BUSY' });
    expect(() => f.uploads.cancel(f.user, id)).toThrow(expect.objectContaining({ code: 'MUTATION_BUSY' }));
    let closed = false; const closing = f.uploads.close().then(() => { closed = true; });
    await Promise.resolve(); expect(closed).toBe(false); release(); await first; await closing;
    await expect(f.send(id, bytes)).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  } finally { release(); await first.catch(() => {}); }
});
test('發布後回報不確定時保留連結意圖與 session；不重送或取消原檔', async () => {
  const f = await uploadFixture({}, { invoke: async (args, handles) => { await native(args, handles); return 70; } }); if (process.platform !== 'linux') return;
  const bytes = Buffer.from('effect canary'), { id } = await f.create(bytes); await f.all(id, bytes);
  await expect(f.uploads.finalize(f.user, id)).rejects.toMatchObject({ code: 'MUTATION_UNCERTAIN' });
  expect(f.uploads.get(f.user, id)).toMatchObject({ state: 'needs_review' });
  expect(await readFile(join(f.root, 'team', '上傳 100%.bin'))).toEqual(bytes);
  const row = f.db.sqlite.prepare('SELECT publication_id,reserved_bytes,cleaned FROM upload_sessions').get(); expect(row).toMatchObject({ publication_id: expect.any(String), reserved_bytes: bytes.length, cleaned: 0 });
  await expect(f.uploads.finalize(f.user, id)).rejects.toMatchObject({ code: 'MUTATION_UNCERTAIN' });
  expect(() => f.uploads.cancel(f.user, id)).toThrow();
  expect((await lstat(join(f.root, 'team', '上傳 100%.bin'))).isFile()).toBe(true);
  expect((await recoverWrites(f.db)).items[0]?.outcome).toBe('busy');
  await f.mutations.close();
  expect((await recoverWrites(f.db)).items[0]?.outcome).toBe('busy'); // upload owner 仍活著也不能接管。
  await f.uploads.close();
  expect((await recoverWrites(f.db)).items[0]?.outcome).toBe('succeeded');
  expect(f.uploads.get(f.user, id)).toMatchObject({ state: 'completed', sha256: digest(bytes) });
  expect(await readFile(join(f.root, 'team', '上傳 100%.bin'))).toEqual(bytes);
});
test('段 fsync 後 DB commit 失敗，回復尾端但保留 durable owner，不假裝提交 offset', async () => {
  let makeReadOnly = () => {};
  const f = await uploadFixture({ checkpoint: (phase) => { if (phase === 'received') makeReadOnly(); } }); if (process.platform !== 'linux') return;
  makeReadOnly = () => { f.db.sqlite.pragma('query_only = ON'); };
  const bytes = Buffer.from('database failure'), { id } = await f.create(bytes);
  try {
    await expect(f.send(id, bytes)).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(f.uploads.get(f.user, id)).toMatchObject({ state: 'writing', offset: 0, chunks: [] });
    expect((await readFile(join(f.root, '.filehub', 'staging', `u-${id}`))).length).toBe(0);
  } finally { f.db.sqlite.pragma('query_only = OFF'); }
});
