import { randomUUID } from 'node:crypto';
import { appendFile, readFile, writeFile, rename, stat, link, symlink, open } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test, onTestFinished } from 'vitest';
import { UPLOAD_LIMITS } from '@filehub/contracts';
import { uploadFixture } from '../helpers/uploads.js';
import { UploadMaintainer, type MaintenanceDependencies } from '../../src/modules/uploads/maintenance.js';
import { runAdmin } from '../../src/cli.js';

function maintainer(database: ConstructorParameters<typeof UploadMaintainer>[0], dependencies: MaintenanceDependencies = {}, now = Date.now) {
  const m = new UploadMaintainer(database, dependencies, now); onTestFinished(() => m.close()); return m;
}
test('取消只清自己的 payload，撤權／停用後仍能清理，保留外來 staging 與原檔', async () => {
  const f = await uploadFixture(); if (process.platform !== 'linux') return;
  const bytes = Buffer.from('owned bytes'), { id } = await f.create(bytes); await f.all(id, bytes);
  const candidate = join(f.root, '.filehub', 'staging', `u-${id}`), other = join(f.root, '.filehub', 'staging', `u-${randomUUID()}`);
  await writeFile(other, 'foreign staging canary'); await writeFile(join(f.root, 'team', 'original'), 'original canary');
  expect(f.uploads.cancel(f.user, id).cleanupPending).toBe(true);
  f.db.sqlite.prepare('UPDATE users SET enabled=0').run(); f.db.sqlite.prepare('UPDATE entries SET enabled=0,writable=0').run();
  expect((await maintainer(f.db).run()).items).toEqual([{ id, outcome: 'cleaned' }]);
  await expect(stat(candidate)).rejects.toMatchObject({ code: 'ENOENT' }); expect(await readFile(other, 'utf8')).toBe('foreign staging canary'); expect(await readFile(join(f.root, 'team', 'original'), 'utf8')).toBe('original canary');
  expect(f.db.sqlite.prepare('SELECT cleaned,reserved_bytes FROM upload_sessions').get()).toEqual({ cleaned: 1, reserved_bytes: 0 });
});
test('到期不能偷活 owner；每批四個並輪轉，接收釋放後才清理及釋放 quota', async () => {
  let clock = Date.now(), release = () => {}, entered = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; }), claimed = new Promise<void>((resolve) => { entered = resolve; });
  const f = await uploadFixture({ checkpoint: async (phase) => { if (phase === 'claimed') { entered(); await gate; } } }, {}, () => clock); if (process.platform !== 'linux') return;
  const bytes = Buffer.from('live guard'), { id } = await f.create(bytes), running = f.send(id, bytes); void running.catch(() => {});
  try {
    await claimed; for (let i = 0; i < 4; i++) await f.create(Buffer.alloc(0), `empty-${i}`);
    const before = f.db.sqlite.prepare('SELECT owner,generation FROM upload_sessions WHERE id=?').get(id);
    clock += UPLOAD_LIMITS.lifetimeMs; const m = maintainer(f.db, {}, () => clock);
    const results = [...(await m.run()).items, ...(await m.run()).items];
    expect(results.some((item) => item.id === id && item.outcome === 'busy')).toBe(true);
    expect(f.db.sqlite.prepare('SELECT owner,generation FROM upload_sessions WHERE id=?').get(id)).toEqual(before);
    expect(f.db.sqlite.prepare('SELECT count(*) AS n FROM upload_sessions WHERE cleaned=1').get()).toEqual({ n: 4 });
    release(); await expect(running).rejects.toMatchObject({ code: 'CONFLICT' });
    expect((await m.run()).items).toEqual([{ id, outcome: 'cleaned' }]);
  } finally { release(); await running.catch(() => {}); }
});
test('外來同名、換 inode、hardlink 與 symlink 都不清除或採用', async () => {
  const f = await uploadFixture(); if (process.platform !== 'linux') return;
  const bytes = Buffer.from('private canary'), unknown = await f.create(bytes, 'unknown');
  await writeFile(join(f.root, '.filehub', 'staging', `u-${unknown.id}`), 'foreign unknown'); f.db.sqlite.prepare('UPDATE upload_sessions SET expires_at=0 WHERE id=?').run(unknown.id);
  const swapped = await f.create(bytes, 'swapped'); await f.all(swapped.id, bytes); f.uploads.cancel(f.user, swapped.id);
  const path = join(f.root, '.filehub', 'staging', `u-${swapped.id}`); await rename(path, `${path}-preserved`); await writeFile(path, 'replacement canary');
  const hard = await f.create(bytes, 'hard'); await f.all(hard.id, bytes); f.uploads.cancel(f.user, hard.id); await link(join(f.root, '.filehub', 'staging', `u-${hard.id}`), join(f.root, 'hardlink-canary'));
  const linked = await f.create(bytes, 'linked'); await symlink(join(f.root, 'hardlink-canary'), join(f.root, '.filehub', 'staging', `u-${linked.id}`)); f.db.sqlite.prepare('UPDATE upload_sessions SET expires_at=0 WHERE id=?').run(linked.id);
  const results = (await maintainer(f.db).run()).items; expect(results).toHaveLength(4); expect(results.every((item) => item.outcome === 'needs_review')).toBe(true);
  expect(await readFile(path, 'utf8')).toBe('replacement canary'); expect((await readFile(`${path}-preserved`)).equals(bytes)).toBe(true); expect((await readFile(join(f.root, 'hardlink-canary'))).equals(bytes)).toBe(true);
  expect(f.db.sqlite.prepare('SELECT count(*) AS n FROM upload_sessions WHERE cleaned=1').get()).toEqual({ n: 0 });
});
test('unlink 後 DB commit 失敗保留 reservation，owner 關閉後以缺失及 parent fsync 確認清理', async () => {
  const f = await uploadFixture(); if (process.platform !== 'linux') return;
  const bytes = Buffer.from('cleanup database failure'), { id } = await f.create(bytes); await f.all(id, bytes); f.uploads.cancel(f.user, id);
  const first = maintainer(f.db, { checkpoint: (phase) => { if (phase === 'unlinked') f.db.sqlite.pragma('query_only=ON'); } });
  try { expect((await first.run()).items).toEqual([{ id, outcome: 'needs_review' }]); }
  finally { f.db.sqlite.pragma('query_only=OFF'); }
  expect(f.db.sqlite.prepare('SELECT state,cleaned,reserved_bytes FROM upload_sessions').get()).toEqual({ state: 'cancelled', cleaned: 0, reserved_bytes: bytes.length });
  const second = maintainer(f.db); expect((await second.run()).items[0]?.outcome).toBe('busy');
  await first.close(); expect((await second.run()).items).toEqual([{ id, outcome: 'cleaned' }]);
  expect((await second.run()).items).toEqual([]);
});
test('finalize 與取消先後競爭只會發布或清理一種結果，已發布原檔不可刪', async () => {
  let release = () => {}, entered = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; }), verified = new Promise<void>((resolve) => { entered = resolve; });
  const f = await uploadFixture({ checkpoint: async (phase) => { if (phase === 'verified') { entered(); await gate; } } }); if (process.platform !== 'linux') return;
  const bytes = Buffer.from('published once'), { id } = await f.create(bytes); await f.all(id, bytes); const running = f.uploads.finalize(f.user, id);
  try { await verified; expect(() => f.uploads.cancel(f.user, id)).toThrow(expect.objectContaining({ code: 'MUTATION_BUSY' })); expect((await maintainer(f.db).run()).items[0]?.outcome).toBe('busy'); }
  finally { release(); }
  expect((await running).state).toBe('completed'); expect(f.uploads.cancel(f.user, id).state).toBe('completed');
  const cancelled = await f.create(bytes, 'cancelled-first'); await f.all(cancelled.id, bytes); f.uploads.cancel(f.user, cancelled.id);
  await expect(f.uploads.finalize(f.user, cancelled.id)).rejects.toBeDefined(); await maintainer(f.db).run();
  expect((await readFile(join(f.root, 'team', '上傳 100%.bin'))).equals(bytes)).toBe(true); await expect(stat(join(f.root, 'team', 'cancelled-first'))).rejects.toBeDefined();
});
test('已提交 prefix 被改壞，舊 owner 結束也不 truncate 尾端或自動發布', async () => {
  const f = await uploadFixture(); if (process.platform !== 'linux') return;
  const bytes = Buffer.alloc(UPLOAD_LIMITS.chunkBytes + 9, 0x51), { id } = await f.create(bytes); await f.send(id, bytes.subarray(0, UPLOAD_LIMITS.chunkBytes)); await f.uploads.close();
  const path = join(f.root, '.filehub', 'staging', `u-${id}`); await appendFile(path, bytes.subarray(UPLOAD_LIMITS.chunkBytes));
  const handle = await open(path, 'r+'); try { await handle.write(Buffer.from([0]), 0, 1, 0); } finally { await handle.close(); }
  f.db.sqlite.prepare("UPDATE upload_sessions SET state='writing',owner=? WHERE id=?").run(f.uploads.owner, id);
  expect((await maintainer(f.db).run()).items).toEqual([{ id, outcome: 'needs_review' }]);
  expect((await stat(path)).size).toBe(bytes.length); expect(f.uploads.get(f.user, id).state).toBe('needs_review');
  await expect(stat(join(f.root, 'team', '上傳 100%.bin'))).rejects.toBeDefined();
});
test('缺少 owner guard 不依 TTL 清理；平台／設定錯誤不假裝完成', async () => {
  const f = await uploadFixture();
  if (process.platform !== 'linux') { await expect(runAdmin(['upload-maintain'], { FILEHUB_STATE_DIR: f.config.stateDirectory })).rejects.toMatchObject({ code: 'WRITE_UNSUPPORTED' }); return; }
  const { id } = await f.create(Buffer.alloc(0)); f.db.sqlite.prepare("UPDATE upload_sessions SET state='writing',owner=?,expires_at=0 WHERE id=?").run(randomUUID(), id);
  const before = f.db.sqlite.prepare('SELECT * FROM upload_sessions').all();
  expect((await maintainer(f.db).run()).items).toEqual([{ id, outcome: 'owner_unknown' }]); expect(f.db.sqlite.prepare('SELECT * FROM upload_sessions').all()).toEqual(before);
});
