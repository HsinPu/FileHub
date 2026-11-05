import { readdir } from 'node:fs/promises';
import { Server } from 'node:net';
import Database from 'better-sqlite3';
import { expect, onTestFinished, test, vi } from 'vitest';
import { SCHEMA_REVISION } from '../../src/persistence/schema.js';
import { main } from '../../src/worker.js';
import { WorkerNotReadyError } from '../../src/worker/idle.js';
import { databaseFixture } from '../helpers/database.js';

test('worker 不建立缺少的 DB 或自動 migration', async () => {
  const fixture = await databaseFixture();
  await expect(main({ FILEHUB_STATE_DIR: fixture.config.stateDirectory, FILEHUB_LOG_LEVEL: 'silent' })).rejects.toThrow();
  expect(await readdir(fixture.directory)).toEqual([]);
});

test('worker 的 schema 啟動門檻失敗時清理自身 DB，不關閉借用連線或留下 signal handlers', async () => {
  const fixture = await databaseFixture();
  fixture.migrate();
  const borrowed = fixture.open();
  borrowed.sqlite.exec('UPDATE schema_state SET revision = 999');
  const closed = vi.spyOn(Database.prototype, 'close');
  onTestFinished(() => { closed.mockRestore(); });
  const signals = [process.listenerCount('SIGINT'), process.listenerCount('SIGTERM')];
  await expect(main({ FILEHUB_STATE_DIR: fixture.config.stateDirectory, FILEHUB_LOG_LEVEL: 'silent' })).rejects.toThrow(WorkerNotReadyError);
  expect(closed).toHaveBeenCalledOnce();
  expect(borrowed.sqlite.open).toBe(true);
  expect([process.listenerCount('SIGINT'), process.listenerCount('SIGTERM')]).toEqual(signals);
});

test('worker 只建立自己的 DB 與 idle timer，重複 close 釋放一次且不建立 listener', async () => {
  const fixture = await databaseFixture();
  fixture.migrate();
  const borrowed = fixture.open();
  const closed = vi.spyOn(Database.prototype, 'close');
  const listen = vi.spyOn(Server.prototype, 'listen');
  onTestFinished(() => { closed.mockRestore(); listen.mockRestore(); });
  const signals = [process.listenerCount('SIGINT'), process.listenerCount('SIGTERM')];
  const service = await main({ FILEHUB_STATE_DIR: fixture.config.stateDirectory, FILEHUB_LOG_LEVEL: 'silent', FILEHUB_PORT: 'private-ignored-port', FILEHUB_WORKER_POLL_INTERVAL_MS: '60000' });
  onTestFinished(() => service.close());
  expect(service.worker.getStatus()).toMatchObject({ state: 'idle', ready: true });
  expect(service.databaseDiagnostics()).toMatchObject({ sqliteVersion: '3.53.4', journalMode: 'wal' });
  const first = service.close();
  expect(service.close()).toBe(first);
  await first;
  await service.done;
  expect(service.worker.getStatus()).toMatchObject({ state: 'stopped', ready: false });
  expect(closed).toHaveBeenCalledOnce();
  expect(borrowed.sqlite.open).toBe(true);
  expect(listen).not.toHaveBeenCalled();
  expect([process.listenerCount('SIGINT'), process.listenerCount('SIGTERM')]).toEqual(signals);
});

test('worker 正式 DB probe 觀察不相容狀態與恢復，不執行 migration 或寫入業務資料', async () => {
  const fixture = await databaseFixture();
  fixture.migrate();
  const writer = fixture.open();
  const service = await main({ FILEHUB_STATE_DIR: fixture.config.stateDirectory, FILEHUB_LOG_LEVEL: 'silent', FILEHUB_WORKER_POLL_INTERVAL_MS: '50' });
  onTestFinished(() => service.close());
  writer.sqlite.exec('UPDATE schema_state SET revision = 999');
  await expect.poll(() => service.worker.getStatus().state).toBe('unavailable');
  writer.sqlite.prepare('UPDATE schema_state SET revision = ?').run(SCHEMA_REVISION);
  await expect.poll(() => service.worker.getStatus().state).toBe('idle');
  expect(service.worker.getStatus().checks).toBeGreaterThanOrEqual(3);
  expect(writer.sqlite.prepare('SELECT revision FROM schema_state').get()).toEqual({ revision: SCHEMA_REVISION });
});
