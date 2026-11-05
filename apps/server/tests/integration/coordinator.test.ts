import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import { databaseFixture } from '../helpers/database.js';
import { WriteCoordinator } from '../../src/storage/coordinator.js';

async function fixture() {
  const fixture = await databaseFixture(); fixture.migrate(); const db = fixture.open();
  const user = randomUUID(), entry = randomUUID(), second = randomUUID();
  db.sqlite.prepare("INSERT INTO users VALUES (?, 'fixture', 'not-a-login-hash', 'admin', 1, 1)").run(user);
  for (const id of [entry, second]) db.sqlite.prepare("INSERT INTO entries (id,label,kind,root_path,root_device,root_inode,root_ancestors,enabled) VALUES (?, 'fixture', 'managed', ?, '1', '1', '[]', 1)").run(id, `synthetic-${id}`);
  return { ...fixture, db, user, entry, second, a: new WriteCoordinator(db), b: new WriteCoordinator(fixture.open()) };
}
test('跨連線短交易保留來源／目的地及子樹，完成後釋放，鄰接／其他入口不衝突', async () => {
  const f = await fixture();
  let handle = f.a.begin(f.user, 'rename', [{ entryId: f.entry, path: 'a' }, { entryId: f.entry, path: 'b' }], { version: 'expected' });
  expect(f.db.sqlite.inTransaction).toBe(false);
  for (const path of ['', 'a', 'a/child', 'b/child']) expect(() => f.b.begin(f.user, 'mkdir', [{ entryId: f.entry, path }], {})).toThrow(expect.objectContaining({ code: 'MUTATION_BUSY' }));
  expect(() => f.b.begin(f.user, 'mkdir', [{ entryId: f.entry, path: 'ab' }], {})).not.toThrow();
  expect(() => f.b.begin(f.user, 'mkdir', [{ entryId: f.second, path: 'a' }], {})).not.toThrow();
  handle = f.a.transition(handle, 'prepared', 'applying', { sourceInode: 'private-evidence' });
  f.a.transition(handle, 'applying', 'succeeded');
  expect(() => f.b.begin(f.user, 'mkdir', [{ entryId: f.entry, path: 'a' }], {})).not.toThrow();
});
test('舊 generation、其他 owner、非法轉移都不能更新或先修改再拒絕', async () => {
  const f = await fixture(); const handle = f.a.begin(f.user, 'mkdir', [{ entryId: f.entry, path: '' }], {});
  const before = f.db.sqlite.prepare('SELECT * FROM write_intents').all();
  expect(() => f.b.transition(handle, 'prepared', 'failed')).toThrow();
  expect(f.db.sqlite.prepare('SELECT * FROM write_intents').all()).toEqual(before);
  const next = f.a.transition(handle, 'prepared', 'applying');
  expect(() => f.a.transition(handle, 'prepared', 'failed')).toThrow();
  expect(() => f.a.transition(next, 'applying', 'prepared')).toThrow();
  expect(f.a.get(f.user, handle.id).status).toBe('applying');
});
test('結果不確定保留 reservation 與私有 evidence，重新開啟亦不能偷取', async () => {
  const f = await fixture(); let handle = f.a.begin(f.user, 'rename', [{ entryId: f.entry, path: '' }], { host: 'private-host' });
  handle = f.a.transition(handle, 'prepared', 'applying', { inode: 'private-evidence' });
  f.a.transition(handle, 'applying', 'needs_review', { inode: 'private-evidence' }, 'MUTATION_UNCERTAIN');
  const reopened = new WriteCoordinator(f.open());
  expect(() => reopened.begin(f.user, 'mkdir', [{ entryId: f.entry, path: 'child' }], {})).toThrow();
  expect(JSON.stringify(reopened.get(f.user, handle.id))).not.toMatch(/private-|owner|generation/);
  expect(() => reopened.get(randomUUID(), handle.id)).toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
});
test('非法範圍／過大 payload／停用入口與帳號拒絕時不插入意圖', async () => {
  const f = await fixture();
  expect(() => f.a.begin(f.user, 'mkdir', [{ entryId: f.entry, path: '../x' }], {})).toThrow();
  expect(() => f.a.begin(f.user, 'mkdir', [{ entryId: f.entry, path: '' }], 'x'.repeat(17_000))).toThrow();
  f.db.sqlite.prepare('UPDATE entries SET enabled=0').run();
  expect(() => f.a.begin(f.user, 'mkdir', [{ entryId: f.entry, path: '' }], {})).toThrow();
  f.db.sqlite.prepare('UPDATE users SET enabled=0').run();
  expect(() => f.a.begin(f.user, 'mkdir', [{ entryId: f.entry, path: '' }], {})).toThrow();
  expect(f.db.sqlite.prepare('SELECT count(*) AS n FROM write_intents').get()).toEqual({ n: 0 });
});

test('活動 reservation 有 128 筆硬上限，不讀取無界 JSON 集合', async () => {
  const f = await fixture();
  const insert = f.db.sqlite.prepare("INSERT INTO write_intents (id,user_id,kind,status,owner,generation,resources,payload,created_at,updated_at) VALUES (?,?,'mkdir','prepared',?,1,?,'{}',1,1)");
  f.db.sqlite.transaction(() => { for (let i = 0; i < 128; i++) insert.run(randomUUID(), f.user, randomUUID(), JSON.stringify([{ entryId: f.entry, path: `item-${i}` }])); })();
  expect(() => f.a.begin(f.user, 'mkdir', [{ entryId: f.entry, path: 'other' }], {})).toThrow(expect.objectContaining({ code: 'RESOURCE_LIMIT' }));
  expect(f.db.sqlite.prepare('SELECT count(*) AS n FROM write_intents').get()).toEqual({ n: 128 });
});
