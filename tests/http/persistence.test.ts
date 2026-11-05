import { fileURLToPath, pathToFileURL } from 'node:url';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { migrateDatabase, openDatabase, parseDatabaseConfig, SCHEMA_REVISION } from '@filehub/server';
import { expect, onTestFinished, test } from 'vitest';
import { runNode, temporaryDirectory } from './fixtures.js';

const library = new URL('../../apps/server/dist/index.js', import.meta.url).href;
const migrationEntry = fileURLToPath(new URL('../../apps/server/dist/migrate.js', import.meta.url));
const apiEntry = fileURLToPath(new URL('../../apps/server/dist/server.js', import.meta.url));
const apiModule = pathToFileURL(apiEntry).href;
const baseEnvironment = { FILEHUB_LOG_LEVEL: 'silent', FILEHUB_HOST: '127.0.0.1', FILEHUB_PORT: '0' };

test('匯入編譯 migration 入口不解析設定或建立 state', async () => {
  const directory = await temporaryDirectory();
  const result = await runNode(['--input-type=module', '-e', `await import(${JSON.stringify(pathToFileURL(migrationEntry).href)}); console.log('MIGRATION_IMPORT_OK');`], directory, { FILEHUB_STATE_DIR: 'invalid-relative-fixture' });
  expect(result.code).toBe(0);
  expect(result.stdout.trim()).toBe('MIGRATION_IMPORT_OK');
  expect(result.stderr).toBe('');
  expect(await readdir(directory)).toEqual([]);
});

test('正式 migration CLI 不依賴 cwd 或 API 設定，執行後關閉連線且可重複執行', async () => {
  const directory = await temporaryDirectory();
  const stateDirectory = join(directory, 'state');
  const environment = { FILEHUB_STATE_DIR: stateDirectory, FILEHUB_PORT: 'irrelevant-api-setting' };
  const first = await runNode([migrationEntry], directory, environment);
  expect(first.code).toBe(0);
  expect(first.stderr).toBe('');
  expect(first.stdout).toContain('migration 完成');
  expect((await runNode([migrationEntry], directory, environment)).code).toBe(0);
  const database = openDatabase(parseDatabaseConfig(environment));
  onTestFinished(() => database.close());
  expect(database.isReady()).toBe(true);
  expect(database.sqlite.prepare('SELECT hash FROM __drizzle_migrations').all()).toHaveLength(SCHEMA_REVISION);
});

test('未執行 migration 的 API CLI 非零退出且不建立資料庫', async () => {
  const directory = await temporaryDirectory();
  const result = await runNode([apiEntry], directory, baseEnvironment);
  expect(result.code).toBe(1);
  expect(result.stderr).toContain('資料庫 migration');
  expect(result.stderr).not.toContain(directory);
  expect(await readdir(directory)).toEqual([]);
});

test('正式產物以真實 HTTP 檢查 DB revision，schema 改變後 readiness 立即變 503', async () => {
  const directory = await temporaryDirectory();
  const script = `
    const { migrateDatabase, parseDatabaseConfig, openDatabase, closeApp } = await import(${JSON.stringify(library)});
    const { main } = await import(${JSON.stringify(apiModule)});
    const config = parseDatabaseConfig();
    migrateDatabase(config);
    const writer = openDatabase(config);
    const { app, address } = await main();
    try {
      let response = await fetch(address + '/health/ready');
      if (response.status !== 200) throw new Error('expected ready');
      await response.text();
      writer.sqlite.exec('UPDATE schema_state SET revision = 999');
      response = await fetch(address + '/health/ready');
      if (response.status !== 503 || JSON.stringify(await response.json()) !== JSON.stringify({ status: 'not_ready' })) throw new Error('expected not ready');
      response = await fetch(address + '/health/live');
      if (response.status !== 200) throw new Error('expected live');
      await response.text();
      console.log('DB_HTTP_READINESS_OK');
    } finally { await closeApp(app, 1000); writer.close(); }
  `;
  const result = await runNode(['--input-type=module', '-e', script], directory, baseEnvironment);
  expect(result.code).toBe(0);
  expect(result.stdout.trim()).toBe('DB_HTTP_READINESS_OK');
  expect(result.stderr).toBe('');
});

test('不相容 migration CLI 拒絕套用且不回顯內部路徑', async () => {
  const directory = await temporaryDirectory();
  const config = parseDatabaseConfig({ FILEHUB_STATE_DIR: join(directory, 'state') });
  migrateDatabase(config);
  const database = openDatabase(config);
  onTestFinished(() => database.close());
  database.sqlite.exec("UPDATE __drizzle_migrations SET hash = 'private-fixture-hash'");
  const result = await runNode([migrationEntry], directory, { FILEHUB_STATE_DIR: config.stateDirectory });
  expect(result.code).toBe(1);
  expect(result.stderr).toContain('migration 失敗');
  expect(result.stderr).not.toContain('private-fixture-hash');
  expect(result.stderr).not.toContain(directory);
  expect(database.isReady()).toBe(false);
});

test('兩個 OS 程序共用 file-backed WAL，writer busy 有界且量測同步阻塞', async () => {
  const directory = await temporaryDirectory();
  const config = parseDatabaseConfig({ FILEHUB_STATE_DIR: join(directory, 'state'), FILEHUB_SQLITE_BUSY_TIMEOUT_MS: '100' });
  migrateDatabase(config);
  const database = openDatabase(config);
  onTestFinished(() => database.close());
  database.sqlite.exec('CREATE TABLE fixture_values (id INTEGER PRIMARY KEY); BEGIN IMMEDIATE');
  const script = `
    const { openDatabase, buildApp, parseConfig, listenApp, closeApp } = await import(${JSON.stringify(library)});
    const database = openDatabase(${JSON.stringify(config)});
    const apiConfig = parseConfig(${JSON.stringify({ ...baseEnvironment, FILEHUB_STATE_DIR: config.stateDirectory })});
    const app = buildApp({ config: apiConfig, dependencies: { readiness: () => database.isReady() } });
    try {
      const address = await listenApp(app, apiConfig);
      if (!database.isReady()) throw new Error('WAL reader unavailable');
      const baselineStart = performance.now();
      await (await fetch(address + '/health/live')).text();
      const baselineHttpMs = performance.now() - baselineStart;
      const started = performance.now();
      const pendingHttp = fetch(address + '/health/live');
      const timer = new Promise(resolve => setTimeout(() => resolve(performance.now() - started), 0));
      let code = 'none';
      const writeStarted = performance.now();
      try { database.sqlite.exec('INSERT INTO fixture_values VALUES (1)'); }
      catch (error) { code = error.code; }
      const elapsedMs = performance.now() - writeStarted;
      const eventLoopDelayMs = await timer;
      const response = await pendingHttp;
      if (response.status !== 200) throw new Error('health unavailable after busy wait');
      await response.text();
      const queuedHttpMs = performance.now() - started;
      console.log(JSON.stringify({ code, elapsedMs, eventLoopDelayMs, baselineHttpMs, queuedHttpMs, settings: database.diagnostics() }));
    } finally { await closeApp(app, 1000); database.close(); }
  `;
  let result;
  try {
    // 只有鎖競爭 fixture 刻意跨 await 持鎖；正式交易 callback 禁止 async／檔案 I/O。
    result = await runNode(['--input-type=module', '-e', script], directory);
  } finally { database.sqlite.exec('ROLLBACK'); }
  expect(result.code).toBe(0);
  expect(result.stderr).toBe('');
  const measurement: unknown = JSON.parse(result.stdout);
  expect(measurement).toMatchObject({ code: 'SQLITE_BUSY', settings: { sqliteVersion: '3.53.4', journalMode: 'wal', busyTimeoutMs: 100 } });
  if (!measurement || typeof measurement !== 'object' || !('elapsedMs' in measurement) || !('eventLoopDelayMs' in measurement) || !('queuedHttpMs' in measurement)
    || typeof measurement.elapsedMs !== 'number' || typeof measurement.eventLoopDelayMs !== 'number' || typeof measurement.queuedHttpMs !== 'number') throw new Error('invalid measurement');
  expect(measurement.elapsedMs).toBeGreaterThanOrEqual(50);
  expect(measurement.elapsedMs).toBeLessThan(1500);
  expect(measurement.eventLoopDelayMs).toBeGreaterThanOrEqual(50);
  expect(measurement.queuedHttpMs).toBeGreaterThanOrEqual(measurement.elapsedMs);
  console.info(`SQLite busy fixture: ${JSON.stringify(measurement)}`);
  const retry = await runNode(['--input-type=module', '-e', `
    const { openDatabase } = await import(${JSON.stringify(library)});
    const database = openDatabase(${JSON.stringify(config)});
    try { database.sqlite.exec('INSERT INTO fixture_values VALUES (2)'); }
    finally { database.close(); }
  `], directory);
  expect(retry.code).toBe(0);
  database.close();
  const reopened = openDatabase(config);
  try { expect(reopened.sqlite.prepare('SELECT id FROM fixture_values').all()).toEqual([{ id: 2 }]); }
  finally { reopened.close(); }
});
