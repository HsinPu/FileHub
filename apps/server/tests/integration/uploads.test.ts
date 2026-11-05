import { randomUUID } from 'node:crypto';
import { mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { Value } from 'typebox/value';
import { UPLOAD_LIMITS, UploadResponseSchema } from '@filehub/contracts';
import { databaseFixture } from '../helpers/database.js';
import { EntryService } from '../../src/modules/entries/service.js';
import { UploadCatalog } from '../../src/modules/uploads/catalog.js';
import { IdentityService } from '../../src/modules/identity/service.js';
import { buildApp } from '../../src/app.js';
import { parseConfig } from '../../src/config/index.js';
import { UploadService } from '../../src/modules/uploads/service.js';
import { MutationService } from '../../src/modules/files/mutations.js';

async function fixture() {
  const f = await databaseFixture(); f.migrate(); const db = f.open(), user = randomUUID(), other = randomUUID();
  db.sqlite.prepare("INSERT INTO users VALUES (?, 'fixture', 'synthetic-hash', 'member', 1, 1)").run(user);
  db.sqlite.prepare("INSERT INTO users VALUES (?, 'other', 'synthetic-hash', 'member', 1, 1)").run(other);
  const root = join(f.directory, 'files'); await mkdir(join(root, 'team'), { recursive: true });
  const entries = new EntryService(db), entry = (await entries.register('external', 'upload fixture', root)).id;
  await entries.grant('fixture', entry, 'team', true, true); await entries.grant('other', entry, 'team', true, true);
  let clock = 1_800_000_000_000; const uploads = new UploadCatalog(db, entries, () => clock);
  const input = (size = 7) => ({ id: randomUUID(), parent: 'team', name: '測試 100%.bin', size });
  return { ...f, db, user, other, root, entries, entry, uploads, input, advance: () => { clock += UPLOAD_LIMITS.lifetimeMs; } };
}
test('upload 預設 opt-in 拒絕；公開 catalog 契約與重新開啟的 offset／到期一致', async () => {
  const f = await fixture(), input = f.input();
  await expect(f.uploads.create(f.user, f.entry, input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  if (process.platform !== 'linux') { await expect(f.entries.setWritable(f.entry, true)).rejects.toMatchObject({ code: 'WRITE_UNSUPPORTED' }); return; }
  await f.entries.setWritable(f.entry, true);
  const result = await f.uploads.create(f.user, f.entry, input);
  expect(Value.Check(UploadResponseSchema, result)).toBe(true);
  expect(result).toMatchObject({ id: input.id, state: 'open', offset: 0, canResume: true, chunks: [] });
  expect(JSON.stringify(result)).not.toMatch(/synthetic|owner|generation|staging|payload|rootPath/);
  expect(await f.uploads.create(f.user, f.entry, input)).toEqual(result);
  await expect(f.uploads.create(f.user, f.entry, { ...input, size: 8 })).rejects.toMatchObject({ code: 'CONFLICT' });
  const reopened = f.open(), again = new UploadCatalog(reopened, new EntryService(reopened), f.uploads.now);
  expect(again.get(f.user, input.id)).toEqual(result);
  f.advance(); expect(again.get(f.user, input.id)).toMatchObject({ state: 'expired', canResume: false, cleanupPending: true });
  expect(f.uploads.cancel(f.user, input.id)).toMatchObject({ state: 'expired', cleanupPending: false });
  expect(await readdir(join(f.root, '.filehub', 'staging'))).toEqual([]);
});
test('session UUID owner、範圍與當下 grant；撤權後僅可取消自己的內容', async () => {
  const f = await fixture(); if (process.platform !== 'linux') return;
  await f.entries.setWritable(f.entry, true); const input = f.input(); await f.uploads.create(f.user, f.entry, input);
  expect(() => f.uploads.get(f.other, input.id)).toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
  expect(() => f.uploads.cancel(f.other, input.id)).toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
  for (const change of [{ parent: '' }, { parent: '../team' }, { name: '../x' }, { name: '.filehub' }, { size: UPLOAD_LIMITS.fileBytes + 1 }, { size: -1 }, { sha256: 'invalid' }]) await expect(f.uploads.create(f.user, f.entry, { ...f.input(), ...change })).rejects.toBeDefined();
  await f.entries.revoke('fixture', f.entry, 'team');
  expect(() => f.uploads.get(f.user, input.id)).toThrow();
  expect(f.uploads.cancel(f.user, input.id)).toMatchObject({ state: 'cancelled', cleanupPending: false });
  expect(f.uploads.cancel(f.user, input.id).state).toBe('cancelled');
  f.db.sqlite.prepare('UPDATE users SET enabled=0 WHERE id=?').run(f.user);
  expect(() => f.uploads.cancel(f.user, input.id)).toThrow(expect.objectContaining({ code: 'UNAUTHORIZED' }));
});
test('空檔合法，容量與 session 上限跨連線計算，不因重開或過期自動釋放', async () => {
  const f = await fixture(); if (process.platform !== 'linux') return;
  await f.entries.setWritable(f.entry, true);
  const second = f.open(), uploads = new UploadCatalog(second, new EntryService(second), f.uploads.now);
  const ids: string[] = [];
  for (let i = 0; i < 4; i++) { const input = f.input(UPLOAD_LIMITS.fileBytes); ids.push(input.id); await (i % 2 ? uploads : f.uploads).create(f.user, f.entry, input); }
  await expect(uploads.create(f.user, f.entry, f.input())).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
  f.advance(); await expect(uploads.create(f.user, f.entry, f.input())).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
  for (const id of ids) uploads.cancel(f.user, id);
  for (let i = 0; i < 16; i++) expect((await uploads.create(f.user, f.entry, f.input(0))).size).toBe(0);
  await expect(uploads.create(f.user, f.entry, f.input(0))).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
  expect(uploads.list(f.user, f.entry).items.length).toBe(20);
});
test('取消不介入在途 owner 或不確定結果，既有 payload 保留清理 reservation', async () => {
  const f = await fixture(); if (process.platform !== 'linux') return;
  await f.entries.setWritable(f.entry, true); const { id } = await f.uploads.create(f.user, f.entry, f.input());
  f.db.sqlite.prepare("UPDATE upload_sessions SET state='writing', owner=? WHERE id=?").run(randomUUID(), id);
  expect(() => f.uploads.cancel(f.user, id)).toThrow(expect.objectContaining({ code: 'MUTATION_BUSY' }));
  f.db.sqlite.prepare("UPDATE upload_sessions SET state='open', owner=NULL, payload_identity='synthetic-identity' WHERE id=?").run(id);
  expect(f.uploads.cancel(f.user, id)).toMatchObject({ state: 'cancelled', cleanupPending: true });
  expect(f.db.sqlite.prepare('SELECT reserved_bytes,cleaned FROM upload_sessions WHERE id=?').get(id)).toEqual({ reserved_bytes: 7, cleaned: 0 });
});
test('catalog HTTP 使用現有 session／Origin／CSRF 邊界，拒絕不產生 session', async () => {
  const f = await fixture(), identity = new IdentityService(f.db);
  f.db.sqlite.prepare("UPDATE users SET role='admin' WHERE id=?").run(f.user);
  await identity.createUser('httpuser', 'Synthetic upload password 2026!');
  const login = await identity.login('httpuser', 'Synthetic upload password 2026!', '127.0.0.1');
  const receiver = new UploadService(f.db, f.entries, new MutationService(f.db, f.entries));
  const app = buildApp({ config: parseConfig({ FILEHUB_PORT: '3000', FILEHUB_LOG_LEVEL: 'silent' }), dependencies: { identity, entries: f.entries, uploads: receiver } });
  try {
    for (const headers of [{}, { cookie: `filehub_session=${login.token}`, origin: 'http://127.0.0.1:3000' }, { cookie: `filehub_session=${login.token}`, origin: 'https://foreign.invalid', 'x-csrf-token': login.session.csrfToken }]) {
      expect((await app.inject({ method: 'POST', url: `/api/entries/${f.entry}/uploads`, headers, payload: f.input() })).statusCode).toBeGreaterThanOrEqual(401);
    }
    expect((await app.inject({ method: 'GET', url: `/api/uploads/${randomUUID()}` })).statusCode).toBe(401);
    expect(f.db.sqlite.prepare('SELECT count(*) AS n FROM upload_sessions').get()).toEqual({ n: 0 });
  } finally { await app.close(); }
});
test('重新整理列表優先保留較舊的未清理 session，不被近期完成紀錄擠出', async () => {
  const f = await fixture(); if (process.platform !== 'linux') return;
  await f.entries.setWritable(f.entry, true); const pending = await f.uploads.create(f.user, f.entry, f.input());
  f.db.sqlite.prepare('UPDATE upload_sessions SET created_at=1 WHERE id=?').run(pending.id);
  const insert = f.db.sqlite.prepare("INSERT INTO upload_sessions (id,user_id,entry_id,parent,name,size,offset,state,reserved_bytes,cleaned,created_at,updated_at,expires_at) VALUES (?,?,?,'team','history',0,0,'completed',0,1,2,2,3)");
  f.db.sqlite.transaction(() => { for (let i = 0; i < 55; i++) insert.run(randomUUID(), f.user, f.entry); })();
  expect(f.uploads.list(f.user, f.entry).items).toHaveLength(50); expect(f.uploads.list(f.user, f.entry).items[0]?.id).toBe(pending.id);
});
