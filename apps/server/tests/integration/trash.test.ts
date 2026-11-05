import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile, lstat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test, onTestFinished } from 'vitest';
import { databaseFixture } from '../helpers/database.js';
import { EntryService } from '../../src/modules/entries/service.js';
import { FileService } from '../../src/modules/files/service.js';
import { MutationService } from '../../src/modules/files/mutations.js';
import { TrashService } from '../../src/modules/trash/service.js';

async function fixture() {
  const f = await databaseFixture(); f.migrate(); const db = f.open();
  const admin = randomUUID(), member = randomUUID(), other = randomUUID();
  for (const [id, name, role] of [[admin, 'admin', 'admin'], [member, 'member', 'member'], [other, 'other', 'member']]) db.sqlite.prepare('INSERT INTO users VALUES (?, ?, ?, ?, 1, 1)').run(id, name, 'synthetic-no-login', role);
  const root = join(f.directory, 'files'); await mkdir(join(root, 'team', 'folder'), { recursive: true });
  await writeFile(join(root, 'team', 'file.bin'), Buffer.from([0, 255, 10]));
  await writeFile(join(root, 'team', 'folder', 'child.txt'), 'nested canary');
  const entries = new EntryService(db), files = new FileService(entries), mutations = new MutationService(db, entries), trash = new TrashService(db, entries, mutations);
  const entry = (await entries.register('external', 'Trash fixture', root)).id;
  onTestFinished(() => mutations.close());
  await entries.grant('member', entry, 'team', true, true); await entries.grant('other', entry, 'team', true, true);
  const version = async (path: string) => (await files.metadata(admin, entry, path)).resource.version;
  const put = async (path: string, user = member) => trash.put(user, entry, { id: randomUUID(), path, version: await version(path) });
  return { ...f, db, admin, member, other, root, entry, entries, files, mutations, trash, version, put };
}
test('垃圾桶預設拒絕；同 FS 移入與還原保留 inode／bytes，UUID 重試不重做', async () => {
  const f = await fixture();
  await expect(f.put('team/file.bin')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(await f.trash.list(f.member, f.entry)).toMatchObject({ total: 0 });
  if (process.platform !== 'linux') { await expect(f.entries.setWritable(f.entry, true)).rejects.toMatchObject({ code: 'WRITE_UNSUPPORTED' }); return; }
  await f.entries.setWritable(f.entry, true);
  const before = await lstat(join(f.root, 'team', 'file.bin'), { bigint: true });
  const input = { id: randomUUID(), path: 'team/file.bin', version: await f.version('team/file.bin') };
  expect((await f.trash.put(f.member, f.entry, input)).status).toBe('succeeded');
  expect((await f.trash.put(f.member, f.entry, input)).status).toBe('succeeded');
  await expect(lstat(join(f.root, input.path))).rejects.toMatchObject({ code: 'ENOENT' });
  const item = (await f.trash.list(f.member, f.entry)).items[0]; expect(item).toMatchObject({ id: input.id, status: 'available', canRestore: true });
  if (!item) throw new Error('missing trash item');
  const restore = { id: randomUUID(), parent: 'team', parentVersion: await f.version('team'), name: '還原 100%.bin', version: item.version };
  expect((await f.trash.restore(f.member, f.entry, item.id, restore)).status).toBe('succeeded');
  expect((await f.trash.restore(f.member, f.entry, item.id, restore)).status).toBe('succeeded');
  const after = await lstat(join(f.root, 'team', restore.name), { bigint: true }); expect(after.ino).toBe(before.ino); expect(after.dev).toBe(before.dev);
  expect(await readFile(join(f.root, 'team', restore.name))).toEqual(Buffer.from([0, 255, 10]));
  expect((await f.trash.list(f.member, f.entry)).total).toBe(0);
});
test('不同 owner 不見內容，還原逐次授權且拒絕越界，管理員可見回收紀錄', async () => {
  const f = await fixture();
  if (process.platform !== 'linux') { expect((await f.trash.list(f.other, f.entry)).total).toBe(0); return; }
  await f.entries.setWritable(f.entry, true); await f.put('team/file.bin');
  expect((await f.trash.list(f.other, f.entry)).total).toBe(0);
  const item = (await f.trash.list(f.admin, f.entry)).items[0]; if (!item) throw new Error('missing item');
  const request = { id: randomUUID(), parent: '', parentVersion: await f.version(''), name: 'escape.bin', version: item.version };
  await expect(f.trash.restore(f.other, f.entry, item.id, request)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(f.trash.restore(f.member, f.entry, item.id, request)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await f.entries.grant('member', f.entry, 'team', true, false);
  expect((await f.trash.list(f.member, f.entry)).items[0]?.canRestore).toBe(false);
  await expect(f.trash.restore(f.member, f.entry, item.id, { ...request, parent: 'team' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await f.entries.revoke('member', f.entry, 'team');
  await expect(f.trash.list(f.member, f.entry)).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
test('還原同名不覆寫，原 payload 保留可換名稱再還原，停用寫入即拒絕', async () => {
  const f = await fixture(); if (process.platform !== 'linux') return;
  await f.entries.setWritable(f.entry, true); await f.put('team/file.bin');
  await writeFile(join(f.root, 'team', 'file.bin'), 'external replacement');
  const item = (await f.trash.list(f.member, f.entry)).items[0]; if (!item) throw new Error('missing item');
  const input = { id: randomUUID(), parent: 'team', parentVersion: await f.version('team'), name: 'file.bin', version: item.version };
  await expect(f.trash.restore(f.member, f.entry, item.id, input)).rejects.toMatchObject({ code: 'CONFLICT' });
  expect(await readFile(join(f.root, 'team', 'file.bin'), 'utf8')).toBe('external replacement');
  expect((await f.trash.list(f.member, f.entry)).items[0]?.canRestore).toBe(true);
  await f.entries.setWritable(f.entry, false);
  await expect(f.trash.restore(f.member, f.entry, item.id, { ...input, id: randomUUID(), name: 'safe.bin' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await f.entries.setWritable(f.entry, true);
  expect((await f.trash.restore(f.member, f.entry, item.id, { ...input, id: randomUUID(), name: 'safe.bin' })).status).toBe('succeeded');
  expect(await readFile(join(f.root, 'team', 'safe.bin'))).toEqual(Buffer.from([0, 255, 10]));
});
test('目錄子內容保留，payload 遺失／替換呈 needs_review 而非可還原或全成功', async () => {
  const f = await fixture(); if (process.platform !== 'linux') return;
  await f.entries.setWritable(f.entry, true); await f.put('team/folder');
  const item = (await f.trash.list(f.member, f.entry)).items[0]; if (!item) throw new Error('missing item');
  expect(await readFile(join(f.root, '.filehub', 'trash', item.id, 'child.txt'), 'utf8')).toBe('nested canary');
  expect((await f.trash.restore(f.member, f.entry, item.id, { id: randomUUID(), parent: 'team', parentVersion: await f.version('team'), name: 'restored-folder', version: item.version })).status).toBe('succeeded');
  expect(await readFile(join(f.root, 'team', 'restored-folder', 'child.txt'), 'utf8')).toBe('nested canary');
  await f.put('team/file.bin');
  const missing = (await f.trash.list(f.member, f.entry)).items[0]; if (!missing) throw new Error('missing item');
  await unlink(join(f.root, '.filehub', 'trash', missing.id));
  expect((await f.trash.list(f.member, f.entry)).items[0]).toMatchObject({ status: 'needs_review', canRestore: false });
  await writeFile(join(f.root, '.filehub', 'trash', missing.id), 'external unknown payload');
  const changed = (await f.trash.list(f.member, f.entry)).items[0];
  expect(changed).toMatchObject({ status: 'needs_review', canRestore: false });
  await expect(f.trash.restore(f.member, f.entry, missing.id, { id: randomUUID(), parent: 'team', parentVersion: await f.version('team'), name: 'unknown', version: changed?.version ?? missing.version })).rejects.toMatchObject({ code: 'MUTATION_UNCERTAIN' });
});
test('根／scope 根與未授權來源不能移入，不產生 trash／intent row', async () => {
  const f = await fixture(); if (process.platform === 'linux') await f.entries.setWritable(f.entry, true);
  for (const path of ['', 'team']) await expect(f.put(path)).rejects.toBeDefined();
  expect(f.db.sqlite.prepare('SELECT count(*) AS n FROM trash_items').get()).toEqual({ n: 0 });
  expect(f.db.sqlite.prepare('SELECT count(*) AS n FROM write_intents').get()).toEqual({ n: 0 });
  expect(await readFile(join(f.root, 'team', 'file.bin'))).toEqual(Buffer.from([0, 255, 10]));
});
