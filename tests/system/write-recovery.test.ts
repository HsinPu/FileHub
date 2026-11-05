import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { EntryService, FileService, MutationService, TrashService, WriteCoordinator, recoverWrites } from '@filehub/server';
import { systemFixture } from './fixtures.js';
import { ManagedNode } from '../helpers/node-process.js';
import { createOwner } from '../../apps/server/src/storage/native.js';

async function fixture() {
  const f = await systemFixture(); f.migrate(); const db = f.open(), user = randomUUID();
  db.sqlite.prepare("INSERT INTO users VALUES (?, 'fixture', 'synthetic-hash', 'admin', 1, 1)").run(user);
  const root = join(f.directory, 'files'); await mkdir(join(root, 'team'), { recursive: true });
  await writeFile(join(root, 'team', 'source.bin'), Buffer.from([0, 255, 1, 10]));
  const entries = new EntryService(db), files = new FileService(entries), entry = (await entries.register('external', 'Crash fixture', root)).id;
  if (process.platform === 'linux') await entries.setWritable(entry, true);
  const start = (kind: string, phase: string, target?: string) => f.startNode([fileURLToPath(new URL('./fixtures/write-crash.mjs', import.meta.url))], { P2_USER: user, P2_ENTRY: entry, P2_KIND: kind, P2_PHASE: phase, ...(target ? { P2_TARGET: target } : {}) }, true);
  return { ...f, db, user, root, entries, files, entry, start };
}
for (const [kind, phase, expected] of [['mkdir', 'prepared', 'failed'], ['mkdir', 'effect', 'succeeded'], ['rename', 'applying', 'failed'], ['rename', 'effect', 'succeeded'], ['trash', 'effect', 'succeeded'], ['restore', 'effect', 'succeeded']] as const) {
  test(`真實程序 ${kind} 在 ${phase} 中斷，owner 活著不接管，退出後只判讀為 ${expected}`, async () => {
    const f = await fixture();
    if (process.platform !== 'linux') { await expect(recoverWrites(f.db)).rejects.toMatchObject({ code: 'WRITE_UNSUPPORTED' }); return; }
    if (kind === 'restore') {
      const mutations = new MutationService(f.db, f.entries);
      try { await new TrashService(f.db, f.entries, mutations).put(f.user, f.entry, { id: randomUUID(), path: 'team/source.bin', version: (await f.files.metadata(f.user, f.entry, 'team/source.bin')).resource.version }); }
      finally { await mutations.close(); }
    }
    const child = await f.start(kind, phase);
    const checkpoint = await child.waitForMessage((message) => message.type === 'checkpoint');
    const before = f.db.sqlite.prepare('SELECT * FROM write_intents WHERE id=?').get(String(checkpoint.id));
    expect((await recoverWrites(f.db)).items).toContainEqual({ id: checkpoint.id, outcome: 'busy' });
    expect(f.db.sqlite.prepare('SELECT * FROM write_intents WHERE id=?').get(String(checkpoint.id))).toEqual(before);
    await child.forceStop();
    expect((await recoverWrites(f.db)).items).toContainEqual({ id: checkpoint.id, outcome: expected });
    expect((await recoverWrites(f.db)).items).toEqual([]);
    const stale = new WriteCoordinator(f.db, String(checkpoint.owner));
    expect(() => stale.transition({ id: String(checkpoint.id), owner: String(checkpoint.owner), generation: Number(checkpoint.generation) }, phase === 'prepared' ? 'prepared' : 'applying', 'failed')).toThrow();
    if (kind === 'mkdir' && expected === 'succeeded') expect((await lstat(join(f.root, 'team', 'created'))).isDirectory()).toBe(true);
    if (kind === 'mkdir' && expected === 'failed') await expect(lstat(join(f.root, 'team', 'created'))).rejects.toMatchObject({ code: 'ENOENT' });
    if (kind === 'rename' && expected === 'failed') expect(await readFile(join(f.root, 'team', 'source.bin'))).toEqual(Buffer.from([0, 255, 1, 10]));
    if (kind === 'rename' && expected === 'succeeded') expect(await readFile(join(f.root, 'team', 'target.bin'))).toEqual(Buffer.from([0, 255, 1, 10]));
    if (kind === 'trash') {
      expect(f.db.sqlite.prepare('SELECT status FROM trash_items WHERE id=?').get(String(checkpoint.id))).toEqual({ status: 'available' });
      expect(await readFile(join(f.root, '.filehub', 'trash', String(checkpoint.id)))).toEqual(Buffer.from([0, 255, 1, 10]));
    }
    if (kind === 'restore') { expect(await readFile(join(f.root, 'team', 'restored.bin'))).toEqual(Buffer.from([0, 255, 1, 10])); expect(f.db.sqlite.prepare('SELECT status FROM trash_items').get()).toEqual({ status: 'restored' }); }
    expect(child.output()).toEqual({ stdout: '', stderr: '' });
  });
}
test('外部建立另一份來源時保留兩邊，needs_review 不釋放 reservation；缺少 guard 不推測 owner 已死', async () => {
  const f = await fixture(); if (process.platform !== 'linux') return;
  const child = await f.start('rename', 'effect'); const checkpoint = await child.waitForMessage((message) => message.type === 'checkpoint');
  await child.forceStop(); await writeFile(join(f.root, 'team', 'source.bin'), 'external replacement');
  expect((await recoverWrites(f.db)).items).toContainEqual({ id: checkpoint.id, outcome: 'needs_review' });
  expect(await readFile(join(f.root, 'team', 'source.bin'), 'utf8')).toBe('external replacement');
  expect(await readFile(join(f.root, 'team', 'target.bin'))).toEqual(Buffer.from([0, 255, 1, 10]));
  expect(() => new WriteCoordinator(f.db).begin(f.user, 'mkdir', [{ entryId: f.entry, path: 'team' }], {})).toThrow();
  const unknown = new WriteCoordinator(f.db).begin(f.user, 'mkdir', [{ entryId: f.entry, path: 'elsewhere' }], {});
  expect((await recoverWrites(f.db)).items).toContainEqual({ id: unknown.id, outcome: 'owner_unknown' });
  expect(f.db.sqlite.prepare('SELECT status FROM write_intents WHERE id=?').get(unknown.id)).toEqual({ status: 'prepared' });
});
test('兩個真正 Node 程序爭同一來源，最多一個成功，不覆寫或重複發布 bytes', async () => {
  const f = await fixture(); if (process.platform !== 'linux') return;
  const a = await f.start('rename', 'applying', 'a.bin'); await a.waitForMessage((message) => message.type === 'checkpoint');
  const b = await f.start('rename', '', 'b.bin');
  expect(await b.waitForMessage((message) => message.type === 'finished')).toMatchObject({ error: 'MUTATION_BUSY' });
  await a.request('status'); expect(await a.waitForMessage((message) => message.type === 'finished')).toMatchObject({ result: { status: 'succeeded' } });
  expect(await readFile(join(f.root, 'team', 'a.bin'))).toEqual(Buffer.from([0, 255, 1, 10]));
  await expect(lstat(join(f.root, 'team', 'source.bin'))).rejects.toMatchObject({ code: 'ENOENT' }); await expect(lstat(join(f.root, 'team', 'b.bin'))).rejects.toMatchObject({ code: 'ENOENT' });
  for (const child of [a, b]) { await child.request('stop'); expect(await child.waitForExit()).toEqual({ code: 0, signal: null }); expect(child.output()).toEqual({ stdout: '', stderr: '' }); }
});

test('owner 結束但繼承 descriptor 的 helper 仍活著時，OFD proof 持續阻擋接管', async () => {
  const f = await fixture(); if (process.platform !== 'linux') return;
  const owner = randomUUID(), id = randomUUID(), guard = await createOwner(f.db.sqlite.name, owner);
  const script = fileURLToPath(new URL('./fixtures/inherited-fd.mjs', import.meta.url));
  const parent = new ManagedNode([script], f.directory, {}, true, [guard.fd]);
  const helper = new ManagedNode([script], f.directory, {}, true, [guard.fd]);
  try {
    await parent.waitForMessage((message) => message.type === 'started'); await helper.waitForMessage((message) => message.type === 'started');
    new WriteCoordinator(f.db, owner).begin(f.user, 'mkdir', [{ entryId: f.entry, path: 'team' }], { entryId: f.entry, source: `.filehub/staging/${id}`, target: 'team/created', request: {} }, id);
    await guard.close(); await parent.forceStop();
    expect((await recoverWrites(f.db)).items).toContainEqual({ id, outcome: 'busy' });
    await helper.request('stop'); expect(await helper.waitForExit()).toEqual({ code: 0, signal: null });
    expect((await recoverWrites(f.db)).items).toContainEqual({ id, outcome: 'failed' });
    expect(parent.output()).toEqual({ stdout: '', stderr: '' }); expect(helper.output()).toEqual({ stdout: '', stderr: '' });
  } finally { await parent.forceStop(); await helper.forceStop(); await guard.close(); }
});

test('真正管理 CLI 以逐項結果與 exit 2 表示未解決，owner 停止後 exit 0 且不重做檔案操作', async () => {
  const f = await fixture();
  const script = fileURLToPath(new URL('../../apps/server/dist/cli.js', import.meta.url));
  if (process.platform !== 'linux') {
    const cli = await f.startNode([script, 'write-recover']); expect((await cli.waitForExit()).code).toBe(1); expect(cli.output().stdout).toBe(''); return;
  }
  const owner = await f.start('rename', 'applying'); const checkpoint = await owner.waitForMessage((message) => message.type === 'checkpoint');
  const busy = await f.startNode([script, 'write-recover']); expect((await busy.waitForExit()).code).toBe(2);
  expect(JSON.parse(busy.output().stdout)).toMatchObject({ items: [{ id: checkpoint.id, outcome: 'busy' }] });
  expect(busy.output().stderr).toBe(''); expect(busy.output().stdout).not.toContain(f.directory); expect(busy.output().stdout).not.toContain(String(checkpoint.owner));
  await owner.forceStop();
  const done = await f.startNode([script, 'write-recover']); expect((await done.waitForExit()).code).toBe(0);
  expect(JSON.parse(done.output().stdout)).toEqual({ items: [{ id: checkpoint.id, outcome: 'failed' }] }); expect(done.output().stderr).toBe('');
  expect(await readFile(join(f.root, 'team', 'source.bin'))).toEqual(Buffer.from([0, 255, 1, 10]));
});
