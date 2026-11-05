import { mkdir, writeFile, symlink, rename, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test, onTestFinished } from 'vitest';
import { databaseFixture } from '../helpers/database.js';
import { IdentityService } from '../../src/modules/identity/service.js';
import { EntryService } from '../../src/modules/entries/service.js';
import { openScoped } from '../../src/storage/scoped.js';
import { buildApp } from '../../src/app.js';
import { parseConfig } from '../../src/config/index.js';
import { runAdmin } from '../../src/cli.js';

async function fixture() {
  const f = await databaseFixture();
  f.migrate();
  const db = f.open();
  const identity = new IdentityService(db);
  const admin = await identity.bootstrap('admin', 'Synthetic-entry-password-123!');
  const member = await identity.createUser('reader', 'Synthetic-entry-password-123!');
  const root = join(f.directory, 'files');
  const external = join(f.directory, 'external');
  await mkdir(join(root, 'team'), { recursive: true });
  await mkdir(external);
  await writeFile(join(root, 'team', 'inside.txt'), 'inside');
  await writeFile(join(external, 'outside.txt'), 'outside');
  const entries = new EntryService(db);
  const entry = await entries.register('managed', '內建資料', root);
  return { ...f, db, identity, admin, member, root, external, entries, entry };
}

test('入口只回授權內容，admin 可讀兩類入口，根與子 scope 撤權即生效', async () => {
  const f = await fixture();
  await f.entries.register('external', '外部資料', f.external);
  expect(f.entries.list(f.admin.id)).toHaveLength(2);
  expect(f.entries.list(f.member.id)).toEqual([]);
  await f.entries.grant('reader', f.entry.id, 'team', false);
  const visible = f.entries.list(f.member.id);
  expect(visible).toHaveLength(1);
  expect(visible[0]?.scopes).toEqual([{ path: 'team', canDownload: false }]);
  expect(JSON.stringify(visible)).not.toContain(f.directory);
  expect(() => f.entries.authorize(f.member.id, f.entry.id, '', 'browse')).toThrow();
  expect(() => f.entries.authorize(f.member.id, f.entry.id, 'team/inside.txt', 'download')).toThrow();
  const access = f.entries.authorize(f.member.id, f.entry.id, 'team', 'browse');
  expect(access.scope).toBe('team');
  expect(() => f.entries.authorize(f.admin.id, f.entry.id, 'team', 'write' as never)).toThrow();
  await f.entries.revoke('reader', f.entry.id, 'team');
  expect(f.entries.list(f.member.id)).toEqual([]);
  expect(() => f.entries.authorize(f.member.id, f.entry.id, 'team', 'browse')).toThrow();
});

test('重疊入口、state 暴露及符號連結 root 不允許，原內容不變', async () => {
  const f = await fixture();
  for (const path of [f.root, join(f.root, 'team'), f.directory, f.config.stateDirectory]) {
    await expect(f.entries.register('external', '不得重疊', path)).rejects.toThrow();
  }
  const link = join(f.directory, 'linked-root');
  await symlink(f.external, link, process.platform === 'win32' ? 'junction' : 'dir');
  await expect(f.entries.register('external', '不得連結', link)).rejects.toThrow();
});

test('scope traversal、絕對路徑、分隔符及 symlink／junction 不可越界', async () => {
  const f = await fixture();
  await f.entries.grant('reader', f.entry.id, '', true);
  for (const path of ['../external/outside.txt', '/absolute', 'C:\\outside', 'team/../inside.txt', 'team//inside.txt', 'team/inside.txt\0']) {
    expect(() => f.entries.authorize(f.member.id, f.entry.id, path, 'browse')).toThrow();
  }
  await symlink(f.external, join(f.root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
  const access = f.entries.authorize(f.member.id, f.entry.id, 'escape/outside.txt', 'download');
  await expect(openScoped(access.root, 'escape/outside.txt')).rejects.toThrow();
  const safe = await openScoped(access.root, 'team/inside.txt');
  try { expect(await safe.handle.readFile('utf8')).toBe('inside'); }
  finally { await safe.close(); }
});

test('root 被正常目錄替換也不會接管新內容；離線及 entry 停用皆拒絕', async () => {
  const f = await fixture();
  const access = f.entries.authorize(f.admin.id, f.entry.id, '', 'browse');
  await rename(f.root, join(f.directory, 'original-files'));
  await mkdir(f.root);
  await writeFile(join(f.root, 'new.txt'), 'replacement');
  await expect(openScoped(access.root, 'new.txt')).rejects.toThrow();
  await f.entries.disable(f.entry.id);
  expect(f.entries.list(f.admin.id)).toEqual([]);
});

test('HTTP 契約需要 session，CLI 可註冊／授權／撤權，回應不含主機路徑', async () => {
  const f = await fixture();
  const app = buildApp({ config: parseConfig({ FILEHUB_LOG_LEVEL: 'silent' }), dependencies: { identity: f.identity, entries: f.entries } });
  onTestFinished(() => app.close());
  expect((await app.inject('/api/entries')).statusCode).toBe(401);
  const loggedIn = await app.inject({ method: 'POST', url: '/api/session', headers: { origin: 'http://127.0.0.1:3000' }, payload: { username: 'reader', password: 'Synthetic-entry-password-123!' } });
  const headers = { cookie: `filehub_session=${loggedIn.cookies[0]?.value}` };
  expect((await app.inject({ url: '/api/entries', headers })).json()).toEqual({ entries: [] });
  await runAdmin(['entry-grant', 'reader', f.entry.id, 'team', 'browse'], { FILEHUB_STATE_DIR: f.config.stateDirectory });
  const visible = await app.inject({ url: '/api/entries', headers });
  expect(visible.statusCode).toBe(200);
  expect(visible.json<{ entries: { readOnly: boolean }[] }>().entries[0]?.readOnly).toBe(true);
  expect(visible.body).not.toContain(f.directory);
  await runAdmin(['entry-revoke', 'reader', f.entry.id, 'team'], { FILEHUB_STATE_DIR: f.config.stateDirectory });
  expect((await app.inject({ url: '/api/entries', headers })).json()).toEqual({ entries: [] });
  expect(() => buildApp({ config: parseConfig({}), dependencies: { entries: f.entries } })).toThrow();
});

test('重疊 scope 以聯集授權，停用帳號／缺失 grant 不因舊 DTO 放寬', async () => {
  const f = await fixture();
  await f.entries.grant('reader', f.entry.id, '', false);
  await f.entries.grant('reader', f.entry.id, 'team', true);
  expect(f.entries.authorize(f.member.id, f.entry.id, 'team/inside.txt', 'download').scope).toBe('team');
  expect(() => f.entries.authorize(f.member.id, f.entry.id, 'other.txt', 'download')).toThrow();
  await f.identity.disableUser('reader');
  expect(() => f.entries.list(f.member.id)).toThrow();
});

test('已開啟目錄被改名並置換為外部連結，Linux fd 仍指原物件，Windows verify 拒絕', async () => {
  const f = await fixture();
  const access = f.entries.authorize(f.admin.id, f.entry.id, 'team', 'browse');
  const opened = await openScoped(access.root, 'team');
  try {
    await writeFile(join(f.external, 'inside.txt'), 'outside-canary');
    await rename(join(f.root, 'team'), join(f.root, 'moved-team'));
    await symlink(f.external, join(f.root, 'team'), process.platform === 'win32' ? 'junction' : 'dir');
    if (process.platform === 'linux') {
      expect(await readFile(join(opened.ioPath, 'inside.txt'), 'utf8')).toBe('inside');
    } else {
      await expect(opened.verify()).rejects.toThrow();
    }
  } finally { await opened.close(); }
});
