import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { chmod, mkdir, open, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { databaseFixture } from '../helpers/database.js';
import { createTemporaryDirectory } from '../../../../tests/helpers/temporary-directory.js';
import { EntryService } from '../../src/modules/entries/service.js';
import { FileService } from '../../src/modules/files/service.js';
import { MutationService } from '../../src/modules/files/mutations.js';
import { TrashService } from '../../src/modules/trash/service.js';
import { createOwner, native, witness } from '../../src/storage/native.js';
import { recoverWrites } from '../../src/storage/recovery.js';

async function fixture() {
  const f = await databaseFixture(); f.migrate(); const db = f.open(), user = randomUUID();
  db.sqlite.prepare("INSERT INTO users VALUES (?, 'fixture', 'synthetic-hash', 'admin', 1, 1)").run(user);
  const root = join(f.directory, 'files'); await mkdir(root); await writeFile(join(root, 'source.bin'), Buffer.from([0, 255, 10]));
  const entries = new EntryService(db), files = new FileService(entries), entry = (await entries.register('managed', 'Fault fixture', root)).id;
  if (process.platform === 'linux') await entries.setWritable(entry, true);
  const input = { id: randomUUID(), path: 'source.bin', version: (await files.metadata(user, entry, 'source.bin')).resource.version, parent: '', parentVersion: (await files.metadata(user, entry, '')).resource.version, name: 'target.bin' };
  return { ...f, db, user, root, entries, files, entry, input };
}
test('ENOSPC 注入在副作用前明確失敗；未知 EIO 在副作用後保留不確定，重開後只判讀不重播', async () => {
  const f = await fixture();
  if (process.platform !== 'linux') { await expect(recoverWrites(f.db)).rejects.toMatchObject({ code: 'WRITE_UNSUPPORTED' }); return; }
  const full = new MutationService(f.db, f.entries, { invoke: async () => 15 });
  try { await expect(full.rename(f.user, f.entry, f.input)).rejects.toMatchObject({ code: 'STORAGE_FULL' }); }
  finally { await full.close(); }
  expect(await readFile(join(f.root, 'source.bin'))).toEqual(Buffer.from([0, 255, 10]));
  expect(f.db.sqlite.prepare('SELECT status,error_code FROM write_intents WHERE id=?').get(f.input.id)).toEqual({ status: 'failed', error_code: 'STORAGE_FULL' });
  const uncertain = new MutationService(f.db, f.entries, { invoke: async (args, fds) => { const result = await native(args, fds); return result === 0 ? 70 : result; } });
  const request = { ...f.input, id: randomUUID() };
  try { await expect(uncertain.rename(f.user, f.entry, request)).rejects.toMatchObject({ code: 'MUTATION_UNCERTAIN' }); }
  finally { await uncertain.close(); }
  expect(f.db.sqlite.prepare('SELECT status FROM write_intents WHERE id=?').get(request.id)).toEqual({ status: 'needs_review' });
  expect(await readFile(join(f.root, 'target.bin'))).toEqual(Buffer.from([0, 255, 10]));
  expect((await recoverWrites(f.db)).items).toContainEqual({ id: request.id, outcome: 'succeeded' });
  expect((await recoverWrites(f.db)).items).toEqual([]);
  expect(await readFile(join(f.root, 'target.bin'))).toEqual(Buffer.from([0, 255, 10]));
  const ownerDirectory = join(f.config.stateDirectory, 'write-owners');
  await chmod(ownerDirectory, 0o500);
  const deniedOwner = new MutationService(f.db, f.entries);
  try {
    await expect(deniedOwner.mkdir(f.user, f.entry, { id: randomUUID(), parent: '', parentVersion: (await f.files.metadata(f.user, f.entry, '')).resource.version, name: 'not-created' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    // A rejected initialization owns no live handle; shutdown must still finish.
    await expect(deniedOwner.close()).resolves.toBeUndefined();
    expect(f.db.sqlite.prepare('SELECT count(*) AS n FROM write_intents').get()).toEqual({ n: 2 });
  } finally { await chmod(ownerDirectory, 0o700); }
});
test('原生實際 EACCES 與不同 device 的 EXDEV 保留來源與目的，沒有複製 fallback', async () => {
  const f = await fixture(); if (process.platform !== 'linux') return;
  const other = await createTemporaryDirectory('filehub-cross-device-', '/dev/shm');
  const locked = join(f.root, 'locked'); await mkdir(locked); await chmod(locked, 0o500);
  const guard = await createOwner(f.db.sqlite.name, randomUUID()), source = await open(f.root, constants.O_RDONLY | constants.O_DIRECTORY), target = await open(other.directory, constants.O_RDONLY | constants.O_DIRECTORY), denied = await open(locked, constants.O_RDONLY | constants.O_DIRECTORY);
  try {
    expect((await source.stat({ bigint: true })).dev).not.toBe((await target.stat({ bigint: true })).dev);
    const file = await open(join(f.root, 'source.bin')); let expected: string;
    try { expected = witness(await file.stat({ bigint: true })); } finally { await file.close(); }
    const args = ['rename', Buffer.from('source.bin').toString('hex'), Buffer.from('target.bin').toString('hex'), expected];
    expect(await native(args, [guard.fd, source.fd, target.fd])).toBe(13);
    expect(await native(args, [guard.fd, source.fd, denied.fd])).toBe(12);
    expect(await readFile(join(f.root, 'source.bin'))).toEqual(Buffer.from([0, 255, 10]));
    await expect(readFile(join(other.directory, 'target.bin'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(join(locked, 'target.bin'))).rejects.toMatchObject({ code: 'ENOENT' });
  } finally { await Promise.all([guard.close(), source.close(), target.close(), denied.close()]); await chmod(locked, 0o700); await other.dispose(); }
});
test('垃圾桶副作用後失去成功回應，管理記錄與意圖一併恢復為 available', async () => {
  const f = await fixture(); if (process.platform !== 'linux') return;
  const mutation = new MutationService(f.db, f.entries, { invoke: async (args, fds) => { const result = await native(args, fds); return result === 0 ? 70 : result; } });
  const trash = new TrashService(f.db, f.entries, mutation), id = randomUUID();
  try { await expect(trash.put(f.user, f.entry, { id, path: f.input.path, version: f.input.version })).rejects.toMatchObject({ code: 'MUTATION_UNCERTAIN' }); }
  finally { await mutation.close(); }
  expect(f.db.sqlite.prepare('SELECT status FROM trash_items WHERE id=?').get(id)).toEqual({ status: 'needs_review' });
  const original = f.db.sqlite.prepare<[string], { witness: string }>('SELECT witness FROM trash_items WHERE id=?').get(id);
  if (!original) throw new Error('missing fixture journal');
  f.db.sqlite.prepare('UPDATE trash_items SET witness=? WHERE id=?').run('inconsistent fixture evidence', id);
  expect((await recoverWrites(f.db)).items).toContainEqual({ id, outcome: 'needs_review' });
  expect(await readFile(join(f.root, '.filehub', 'trash', id))).toEqual(Buffer.from([0, 255, 10]));
  // Only this isolated fixture restores its known original evidence.
  f.db.sqlite.prepare('UPDATE trash_items SET witness=? WHERE id=?').run(original.witness, id);
  expect((await recoverWrites(f.db)).items).toContainEqual({ id, outcome: 'succeeded' });
  expect((await trash.list(f.user, f.entry)).items[0]).toMatchObject({ id, status: 'available', canRestore: true });
  expect(await readFile(join(f.root, '.filehub', 'trash', id))).toEqual(Buffer.from([0, 255, 10]));
});
