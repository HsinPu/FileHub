import { mkdir, readFile, readdir, writeFile, cp } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer } from 'node:net';
import Database from 'better-sqlite3';
import { expect, onTestFinished, test, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import { parseConfig } from '../../src/config/index.js';
import { backupDatabase, restoreDatabaseBackup } from '../../src/persistence/backup.js';
import { migrateDatabase } from '../../src/persistence/migrate.js';
import { DEFAULT_MIGRATIONS_DIRECTORY } from '../../src/persistence/migrations.js';
import { SCHEMA_REVISION, schemaState } from '../../src/persistence/schema.js';
import { openDatabase } from '../../src/persistence/database.js';
import { main } from '../../src/server.js';
import { databaseFixture } from '../helpers/database.js';

test('runtime 不建立缺少的 state 或資料庫', async () => {
  const fixture = await databaseFixture();
  expect(() => fixture.open()).toThrow();
  expect(await readdir(fixture.directory)).toEqual([]);
});

test('程式呼叫不能繞過 busy 上限或在非法設定下建立 state', async () => {
  const fixture = await databaseFixture();
  const config = { ...fixture.config, sqliteBusyTimeoutMs: 1001 };
  expect(() => openDatabase(config)).toThrow();
  expect(() => migrateDatabase(config)).toThrow();
  expect(await readdir(fixture.directory)).toEqual([]);
});

test('空 DB migration 與重複執行保留單一 schema revision，正式 adapter 套用固定設定', async () => {
  const fixture = await databaseFixture();
  fixture.migrate();
  fixture.migrate();
  const database = fixture.open();
  expect(database.diagnostics()).toEqual({ sqliteVersion: '3.53.4', journalMode: 'wal', foreignKeys: 1, synchronous: 2, busyTimeoutMs: 50, walAutoCheckpoint: 1000 });
  expect(database.db.select().from(schemaState).all()).toEqual([{ id: 1, revision: SCHEMA_REVISION }]);
  expect(database.sqlite.prepare('SELECT hash FROM __drizzle_migrations').all()).toHaveLength(SCHEMA_REVISION);
  expect(database.isReady()).toBe(true);
  database.close();
  database.close();
  expect(database.isReady()).toBe(false);
});

test('正式連線執行短交易、rollback 及外鍵約束，重開後只留下已提交資料', async () => {
  const fixture = await databaseFixture();
  fixture.migrate();
  const database = fixture.open();
  database.sqlite.exec('CREATE TABLE fixture_parent (id INTEGER PRIMARY KEY); CREATE TABLE fixture_child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES fixture_parent(id))');
  database.db.transaction(() => database.sqlite.prepare('INSERT INTO fixture_parent VALUES (?)').run(1), { behavior: 'immediate' });
  expect(() => database.db.transaction(() => {
    database.sqlite.prepare('INSERT INTO fixture_parent VALUES (?)').run(2);
    throw new Error('rollback fixture');
  })).toThrow('rollback fixture');
  expect(() => database.sqlite.exec('INSERT INTO fixture_child VALUES (1, 999)')).toThrow();
  expect(() => database.db.transaction(() => {
    database.sqlite.exec('INSERT INTO fixture_parent VALUES (3)');
    return Promise.resolve('invalid async transaction');
  })).toThrow('Transaction function cannot return a promise');
  database.close();
  expect(fixture.open().sqlite.prepare('SELECT id FROM fixture_parent').all()).toEqual([{ id: 1 }]);
});

test('跨連線 writer busy 有界且 WAL reader 仍讀到已提交狀態', async () => {
  const fixture = await databaseFixture();
  fixture.migrate();
  const first = fixture.open();
  const second = fixture.open();
  first.sqlite.exec('BEGIN IMMEDIATE');
  try {
    expect(second.isReady()).toBe(true);
    const start = performance.now();
    expect(() => second.sqlite.exec('UPDATE schema_state SET revision = 1')).toThrow(expect.objectContaining({ code: 'SQLITE_BUSY' }));
    expect(performance.now() - start).toBeLessThan(1000);
  } finally { first.sqlite.exec('ROLLBACK'); }
  expect(() => second.sqlite.exec('UPDATE schema_state SET revision = 1')).not.toThrow();
});

test('連線設定偏離定案時 readiness 不會沿用過時快取', async () => {
  const fixture = await databaseFixture();
  fixture.migrate();
  const database = fixture.open();
  database.sqlite.pragma('foreign_keys = OFF');
  expect(database.isReady()).toBe(false);
  database.sqlite.pragma('foreign_keys = ON');
  expect(database.isReady()).toBe(true);
});

test('API 關閉時釋放自身 DB，保留 fixture 借用連線', async () => {
  const fixture = await databaseFixture();
  fixture.migrate();
  const borrowed = fixture.open();
  const closed = vi.spyOn(Database.prototype, 'close');
  onTestFinished(() => closed.mockRestore());
  const { app } = await main({ FILEHUB_STATE_DIR: fixture.config.stateDirectory, FILEHUB_PORT: '0', FILEHUB_LOG_LEVEL: 'silent' });
  try {
    expect((await app.inject('/health/ready')).statusCode).toBe(200);
  } finally { await app.close(); }
  expect(closed).toHaveBeenCalledOnce();
  expect(borrowed.sqlite.open).toBe(true);
});

test('API listen 失敗也釋放已建立的正式 DB 連線', async () => {
  const fixture = await databaseFixture();
  fixture.migrate();
  const occupied = createServer();
  onTestFinished(() => new Promise<void>((resolve, reject) => occupied.close((error) => error ? reject(error) : resolve())));
  await new Promise<void>((resolve, reject) => { occupied.once('error', reject); occupied.listen(0, '127.0.0.1', resolve); });
  const address = occupied.address();
  if (!address || typeof address === 'string') throw new Error('缺少 fixture port');
  const closed = vi.spyOn(Database.prototype, 'close');
  onTestFinished(() => closed.mockRestore());
  await expect(main({ FILEHUB_STATE_DIR: fixture.config.stateDirectory, FILEHUB_PORT: String(address.port), FILEHUB_LOG_LEVEL: 'silent' })).rejects.toMatchObject({ code: 'EADDRINUSE' });
  expect(closed).toHaveBeenCalledOnce();
  expect(occupied.listening).toBe(true);
});

test.each([0, SCHEMA_REVISION + 1])('schema revision %s 拒絕就緒；liveness 與錯誤內容不洩漏 DB', async (revision) => {
  const fixture = await databaseFixture();
  fixture.migrate();
  const database = fixture.open();
  database.sqlite.prepare('UPDATE schema_state SET revision = ?').run(revision);
  const app = buildApp({ config: parseConfig({ FILEHUB_LOG_LEVEL: 'silent' }), dependencies: { readiness: () => database.isReady() } });
  onTestFinished(() => app.close());
  expect((await app.inject('/health/live')).statusCode).toBe(200);
  const ready = await app.inject('/health/ready');
  expect(ready.statusCode).toBe(503);
  expect(ready.json()).toEqual({ status: 'not_ready' });
  expect(() => fixture.migrate()).toThrow();
});

test.each(['hash', 'future'])('migration history %s 不相容時拒絕 migration／就緒', async (scenario) => {
  const fixture = await databaseFixture();
  fixture.migrate();
  const database = fixture.open();
  if (scenario === 'hash') database.sqlite.exec("UPDATE __drizzle_migrations SET hash = 'unknown-release'");
  else database.sqlite.exec("INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('future-release', 9999999999999)");
  expect(database.isReady()).toBe(false);
  expect(() => fixture.migrate()).toThrow();
});

test.each(['table', 'sqlite_prefix', 'view'])('既有未知 schema %s 不會被 migration 接管或刪除', async (scenario) => {
  const fixture = await databaseFixture();
  await mkdir(fixture.config.stateDirectory);
  const legacy = new Database(join(fixture.config.stateDirectory, 'filehub.db'));
  const name = scenario === 'sqlite_prefix' ? 'sqliteLegacy' : 'legacy_data';
  if (scenario === 'view') legacy.exec("CREATE VIEW legacy_data AS SELECT 'keep' AS value");
  else legacy.exec(`CREATE TABLE "${name}" (value TEXT); INSERT INTO "${name}" VALUES ('keep')`);
  legacy.close();
  expect(() => fixture.migrate()).toThrow();
  const database = fixture.open();
  expect(database.sqlite.prepare(`SELECT value FROM "${name}"`).all()).toEqual([{ value: 'keep' }]);
  expect(database.diagnostics().journalMode).toBe('delete');
  expect(database.sqlite.prepare("SELECT name FROM sqlite_master WHERE name = '__drizzle_migrations'").all()).toEqual([]);
});

test('migration SQL 失敗會 rollback，修正後可從空 schema 重試', async () => {
  const fixture = await databaseFixture();
  const migrationsDirectory = join(fixture.directory, 'migrations');
  await cp(DEFAULT_MIGRATIONS_DIRECTORY, migrationsDirectory, { recursive: true });
  const journal: unknown = JSON.parse(await readFile(join(migrationsDirectory, 'meta/_journal.json'), 'utf8'));
  if (!journal || typeof journal !== 'object' || !('entries' in journal) || !Array.isArray(journal.entries)) throw new Error('fixture journal invalid');
  const entry: unknown = journal.entries[0];
  if (!entry || typeof entry !== 'object' || !('tag' in entry) || typeof entry.tag !== 'string') throw new Error('fixture entry invalid');
  const sqlPath = join(migrationsDirectory, `${entry.tag}.sql`);
  const sql = await readFile(sqlPath, 'utf8');
  await writeFile(sqlPath, `${sql}\n--> statement-breakpoint\nINVALID SQL FIXTURE;\n`);
  expect(() => migrateDatabase(fixture.config, migrationsDirectory)).toThrow();
  const database = fixture.open();
  expect(database.isReady()).toBe(false);
  expect(database.sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'schema_state'").all()).toEqual([]);
  database.close();
  await writeFile(sqlPath, sql);
  fixture.migrate();
  expect(fixture.open().isReady()).toBe(true);
});

test('online backup 包含未 checkpoint 的已提交 WAL 資料，還原至新目錄後可重開讀寫', async () => {
  const fixture = await databaseFixture();
  fixture.migrate();
  const database = fixture.open();
  database.sqlite.pragma('wal_autocheckpoint = 0');
  database.sqlite.exec("CREATE TABLE fixture_content (id INTEGER PRIMARY KEY, value TEXT); INSERT INTO fixture_content VALUES (1, 'committed WAL bytes')");
  database.sqlite.pragma('wal_autocheckpoint = 1000');
  expect((await readFile(join(fixture.config.stateDirectory, 'filehub.db-wal'))).length).toBeGreaterThan(0);
  const backup = await backupDatabase(database, join(fixture.directory, 'backup'));
  database.sqlite.exec("UPDATE fixture_content SET value = 'later live data'");
  const destination = { ...fixture.config, stateDirectory: join(fixture.directory, 'restored') };
  await restoreDatabaseBackup(backup, destination);
  const restored = fixture.open(destination.stateDirectory);
  expect(restored.isReady()).toBe(true);
  expect(restored.sqlite.pragma('integrity_check', { simple: true })).toBe('ok');
  expect(restored.sqlite.prepare('SELECT * FROM fixture_content').all()).toEqual([{ id: 1, value: 'committed WAL bytes' }]);
  restored.sqlite.exec("INSERT INTO fixture_content VALUES (2, 'restored write')");
  restored.close();
  expect(fixture.open(destination.stateDirectory).sqlite.prepare('SELECT id FROM fixture_content ORDER BY id').all()).toEqual([{ id: 1 }, { id: 2 }]);
  expect(database.sqlite.prepare('SELECT value FROM fixture_content').get()).toEqual({ value: 'later live data' });
  await expect(restoreDatabaseBackup(backup, destination)).rejects.toThrow();
  await expect(backupDatabase(database, fixture.config.stateDirectory)).rejects.toThrow();
});

test.each(['corrupt', 'revision'])('損毀或不相容備份 %s 不會建立還原目標', async (scenario) => {
  const fixture = await databaseFixture();
  let broken = join(fixture.directory, 'broken.db');
  if (scenario === 'corrupt') await writeFile(broken, 'not a database');
  else {
    fixture.migrate();
    broken = await backupDatabase(fixture.open(), join(fixture.directory, 'backup'));
    const invalid = new Database(broken);
    try { invalid.exec('UPDATE schema_state SET revision = 999'); }
    finally { invalid.close(); }
  }
  const destination = { ...fixture.config, stateDirectory: join(fixture.directory, 'restored') };
  await expect(restoreDatabaseBackup(broken, destination)).rejects.toThrow();
  expect(await readdir(fixture.directory)).not.toContain('restored');
});
