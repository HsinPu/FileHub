import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile, readdir, lstat, unlink, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test, onTestFinished } from 'vitest';
import { databaseFixture } from '../helpers/database.js';
import { EntryService } from '../../src/modules/entries/service.js';
import { FileService } from '../../src/modules/files/service.js';
import { MutationService } from '../../src/modules/files/mutations.js';
import { buildApp } from '../../src/app.js';
import { IdentityService } from '../../src/modules/identity/service.js';
import { parseConfig } from '../../src/config/index.js';

async function fixture() {
  const f = await databaseFixture(); f.migrate(); const db = f.open();
  const user = randomUUID(), member = randomUUID();
  for (const [id, role] of [[user, 'admin'], [member, 'member']]) db.sqlite.prepare('INSERT INTO users VALUES (?, ?, ?, ?, 1, 1)').run(id, role, 'synthetic-no-login', role);
  const root = join(f.directory, 'files'); await mkdir(join(root, 'team'), { recursive: true });
  await writeFile(join(root, 'team', 'source.txt'), Buffer.from([0, 255, 13, 10]));
  await writeFile(join(root, 'team', 'occupied.txt'), 'canary');
  const entries = new EntryService(db), files = new FileService(entries), mutations = new MutationService(db, entries);
  const entry = (await entries.register('external', 'Write fixture', root)).id;
  onTestFinished(() => mutations.close());
  const version = async (path: string) => (await files.metadata(user, entry, path)).resource.version;
  return { ...f, db, user, member, root, entries, files, mutations, entry, version };
}
test('入口寫入明確開啟，Windows 拒絕且無 intent／FS 副作用，Linux 建立後保留 inode 與 bytes', async () => {
  const f = await fixture();
  const request = { id: randomUUID(), parent: 'team', parentVersion: await f.version('team'), name: '新資料夾' };
  await expect(f.mutations.mkdir(f.user, f.entry, request)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  if (process.platform !== 'linux') {
    await expect(f.entries.setWritable(f.entry, true)).rejects.toMatchObject({ code: 'WRITE_UNSUPPORTED' });
    f.db.sqlite.prepare('UPDATE entries SET writable=1').run();
    await expect(f.mutations.mkdir(f.user, f.entry, request)).rejects.toMatchObject({ code: 'WRITE_UNSUPPORTED' });
    expect(await readdir(f.root)).toEqual(['team']);
    expect(f.db.sqlite.prepare('SELECT count(*) AS n FROM write_intents').get()).toEqual({ n: 0 }); return;
  }
  await f.entries.setWritable(f.entry, true);
  expect((await f.mutations.mkdir(f.user, f.entry, request)).status).toBe('succeeded');
  expect((await lstat(join(f.root, 'team', request.name))).isDirectory()).toBe(true);
  expect((await f.mutations.mkdir(f.user, f.entry, request)).status).toBe('succeeded');
  expect(f.db.sqlite.prepare('SELECT count(*) AS n FROM write_intents').get()).toEqual({ n: 1 });
  const before = await lstat(join(f.root, 'team', 'source.txt'), { bigint: true });
  const rename = { id: randomUUID(), path: 'team/source.txt', version: await f.version('team/source.txt'), parent: 'team', parentVersion: await f.version('team'), name: '報告 100%.txt' };
  expect((await f.mutations.rename(f.user, f.entry, rename)).status).toBe('succeeded');
  const after = await lstat(join(f.root, 'team', rename.name), { bigint: true });
  expect(after.ino).toBe(before.ino); expect(after.dev).toBe(before.dev);
  expect(await readFile(join(f.root, 'team', rename.name))).toEqual(Buffer.from([0, 255, 13, 10]));
  expect((await f.files.list(f.user, f.entry, '')).items.map((item) => item.name)).toEqual(['team']);
  await expect(f.files.list(f.user, f.entry, '.filehub')).rejects.toMatchObject({ code: 'BAD_REQUEST' });
});
test('同名目的地、不相同預期版本、消失來源、根與私人 namespace 都拒絕', async () => {
  const f = await fixture();
  for (const name of ['../escape', '.filehub', 'bad/name', 'CON', 'trailing.']) await expect(f.mutations.mkdir(f.user, f.entry, { id: randomUUID(), parent: 'team', parentVersion: await f.version('team'), name })).rejects.toBeDefined();
  if (process.platform !== 'linux') return;
  await f.entries.setWritable(f.entry, true);
  const request = { id: randomUUID(), path: 'team/source.txt', version: await f.version('team/source.txt'), parent: 'team', parentVersion: await f.version('team'), name: 'occupied.txt' };
  await expect(f.mutations.rename(f.user, f.entry, request)).rejects.toMatchObject({ code: 'CONFLICT' });
  expect(await readFile(join(f.root, 'team', 'occupied.txt'), 'utf8')).toBe('canary');
  expect(await readFile(join(f.root, 'team', 'source.txt'))).toEqual(Buffer.from([0, 255, 13, 10]));
  await writeFile(join(f.root, 'team', 'source.txt'), 'external change');
  await expect(f.mutations.rename(f.user, f.entry, { ...request, id: randomUUID(), name: 'new.txt' })).rejects.toMatchObject({ code: 'CONFLICT' });
  await unlink(join(f.root, 'team', 'source.txt'));
  await expect(f.mutations.rename(f.user, f.entry, { ...request, id: randomUUID() })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(f.mutations.rename(f.user, f.entry, { ...request, id: randomUUID(), path: '', name: 'root' })).rejects.toBeDefined();
});
test('Unicode 不正規化、大小寫更名與目錄改名，來源目的地逐次授權', async () => {
  const f = await fixture();
  await f.entries.grant('member', f.entry, 'team', true, true);
  if (process.platform !== 'linux') return;
  await f.entries.setWritable(f.entry, true);
  for (const name of ['Source.txt', 'e\u0301.txt', 'é.txt']) {
    await writeFile(join(f.root, 'team', 'source.txt'), 'Unicode canary');
    const request = { id: randomUUID(), path: 'team/source.txt', version: await f.version('team/source.txt'), parent: 'team', parentVersion: await f.version('team'), name };
    expect((await f.mutations.rename(f.member, f.entry, request)).status).toBe('succeeded');
  }
  expect(await readdir(join(f.root, 'team'))).toEqual(expect.arrayContaining(['e\u0301.txt', 'é.txt']));
  await expect(f.mutations.mkdir(f.member, f.entry, { id: randomUUID(), parent: '', parentVersion: await f.version(''), name: 'escape' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await f.entries.revoke('member', f.entry, 'team');
  await expect(f.mutations.mkdir(f.member, f.entry, { id: randomUUID(), parent: 'team', parentVersion: await f.version('team'), name: 'denied' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect((await f.mutations.rename(f.user, f.entry, { id: randomUUID(), path: 'team', version: await f.version('team'), parent: '', parentVersion: await f.version(''), name: 'renamed' })).status).toBe('succeeded');
  expect(await readFile(join(f.root, 'renamed', 'occupied.txt'), 'utf8')).toBe('canary');
});
test('Origin／CSRF／session 拒絕寫入，不插入意圖或建立檔案', async () => {
  const f = await fixture();
  const identity = new IdentityService(f.db);
  await identity.createUser('httpuser', 'Synthetic mutation password 2026!');
  const login = await identity.login('httpuser', 'Synthetic mutation password 2026!', '127.0.0.1');
  const app = buildApp({ config: parseConfig({ FILEHUB_PORT: '3000', FILEHUB_LOG_LEVEL: 'silent' }), dependencies: { identity, entries: f.entries, mutations: f.mutations } });
  try {
    const payload = { id: randomUUID(), parent: 'team', parentVersion: await f.version('team'), name: 'denied' };
    for (const headers of [{}, { cookie: `filehub_session=${login.token}`, origin: 'http://127.0.0.1:3000' }, { cookie: `filehub_session=${login.token}`, origin: 'https://foreign.invalid', 'x-csrf-token': login.session.csrfToken }]) {
      expect((await app.inject({ method: 'POST', url: `/api/entries/${f.entry}/directories`, headers, payload })).statusCode).toBeGreaterThanOrEqual(401);
    }
    expect(f.db.sqlite.prepare('SELECT count(*) AS n FROM write_intents').get()).toEqual({ n: 0 });
    expect(await readdir(f.root)).toEqual(['team']);
  } finally { await app.close(); }
});
test('不接管外來控制目錄，symlink 來源不移動', async () => {
  const f = await fixture();
  await mkdir(join(f.root, '.filehub'));
  await expect(f.entries.setWritable(f.entry, true)).rejects.toBeDefined();
  expect(f.entries.list(f.user)[0]?.readOnly).toBe(true);
  if (process.platform !== 'linux') return;
  const otherRoot = join(f.directory, 'other'); await mkdir(otherRoot);
  const entry = (await f.entries.register('managed', 'other', otherRoot)).id;
  await f.entries.setWritable(entry, true); await symlink(join(f.root, 'team', 'occupied.txt'), join(otherRoot, 'link'));
  await expect(f.mutations.rename(f.user, entry, { id: randomUUID(), path: 'link', version: 'a'.repeat(64), parent: '', parentVersion: (await f.files.metadata(f.user, entry, '')).resource.version, name: 'moved' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(await readFile(join(f.root, 'team', 'occupied.txt'), 'utf8')).toBe('canary');
});
