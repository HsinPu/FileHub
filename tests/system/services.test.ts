import { access, readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test } from 'vitest';
import { SCHEMA_REVISION } from '@filehub/server';
import { systemFixture, type ManagedNode } from './fixtures.js';

const workerEntry = fileURLToPath(new URL('../../apps/server/dist/worker.js', import.meta.url));
const expectedDatabase = { sqliteVersion: '3.53.4', journalMode: 'wal', foreignKeys: 1, synchronous: 2, busyTimeoutMs: 100, walAutoCheckpoint: 1000 };

async function started(child: ManagedNode) {
  const info = await child.waitForMessage((message) => message.type === 'started');
  expect(info.node).toBe('v24.22.1');
  expect(info.database).toEqual(expectedDatabase);
  expect(typeof info.pid).toBe('number');
  expect(info.pid).not.toBe(process.pid);
  return info;
}

async function stop(child: ManagedNode, signal: 'SIGINT' | 'SIGTERM') {
  const reply = await child.request('stop', signal);
  expect(reply.databaseClosed).toBe(true);
  expect(reply.signals).toEqual([0, 0]);
  expect(await child.waitForExit()).toEqual({ code: 0, signal: null });
  expect(child.output().stderr).toBe('');
  return reply;
}

test.each(['worker', 'healthcheck', 'db-maintenance'])('編譯 %s 匯入不解析設定、不開 DB 或啟動常駐循環', async (module) => {
  const fixture = await systemFixture();
  const entry = fileURLToPath(new URL(`../../apps/server/dist/${module}.js`, import.meta.url));
  const child = await fixture.startNode(['--input-type=module', '-e', `await import(${JSON.stringify(pathToFileURL(entry).href)}); console.log('WORKER_IMPORT_OK');`],
    { FILEHUB_STATE_DIR: 'private-invalid-path', FILEHUB_WORKER_POLL_INTERVAL_MS: 'private-invalid-interval' });
  expect(await child.waitForExit()).toEqual({ code: 0, signal: null });
  expect(child.output()).toEqual({ stdout: 'WORKER_IMPORT_OK\n', stderr: '' });
  expect(await readdir(child.cwd)).toEqual([]);
  await expect(access(fixture.config.stateDirectory)).rejects.toThrow();
});

test('worker CLI 非法設定非零退出且不回顯值，不建立 state', async () => {
  const fixture = await systemFixture();
  const child = await fixture.startNode([workerEntry], { FILEHUB_WORKER_POLL_INTERVAL_MS: 'private-invalid-interval' });
  expect((await child.waitForExit()).code).toBe(1);
  expect(child.output().stderr).toContain('FILEHUB_WORKER_POLL_INTERVAL_MS');
  expect(child.output().stderr).not.toContain('private-invalid-interval');
  await expect(access(fixture.config.stateDirectory)).rejects.toThrow();
});

test('worker CLI 缺少 migration 時失敗，不自建 DB', async () => {
  const fixture = await systemFixture();
  const child = await fixture.startNode([workerEntry]);
  expect((await child.waitForExit()).code).toBe(1);
  expect(child.output().stderr).toContain('資料庫 migration');
  expect(child.output().stderr).not.toContain(fixture.directory);
  await expect(access(fixture.config.stateDirectory)).rejects.toThrow();
});

test.each(['revision', 'history'])('worker CLI 對不相容 %s 拒絕啟動並釋放連線', async (scenario) => {
  const fixture = await systemFixture();
  fixture.migrate();
  const writer = fixture.open();
  if (scenario === 'revision') writer.sqlite.exec('UPDATE schema_state SET revision = 999');
  else writer.sqlite.exec("UPDATE __drizzle_migrations SET hash = 'private-fixture-hash'");
  const child = await fixture.startNode([workerEntry]);
  expect((await child.waitForExit()).code).toBe(1);
  expect(child.output().stderr).toContain('worker 啟動失敗');
  expect(child.output().stderr).not.toContain(fixture.directory);
  expect(child.output().stderr).not.toContain('private-fixture-hash');
  expect(fixture.open().isReady()).toBe(false);
});

test('獨立 API／worker 共用 DB、分開停止／重啟，狀態恢復後無殘留資源', async () => {
  const fixture = await systemFixture();
  fixture.migrate();
  const writer = fixture.open();
  const api = await fixture.startService('api');
  const apiInfo = await started(api);
  if (typeof apiInfo.address !== 'string') throw new Error('缺少 API address');
  const address = apiInfo.address;
  // worker 即使取得 API 正在使用的 port，仍不應建立 HTTP listener。
  const worker = await fixture.startService('worker', { FILEHUB_PORT: new URL(address).port });
  const workerInfo = await started(worker);
  expect(workerInfo.pid).not.toBe(apiInfo.pid);
  const health = async (url: string) => {
    const response = await fetch(`${url}/health/ready`, { signal: AbortSignal.timeout(1000) });
    await response.text();
    return response.status;
  };
  expect(await health(address)).toBe(200);
  await expect.poll(async () => (await worker.request('status')).status).toMatchObject({ ready: true, state: 'idle', checks: expect.any(Number) });

  writer.sqlite.exec('UPDATE schema_state SET revision = 999');
  expect(await health(address)).toBe(503);
  await expect.poll(async () => (await worker.request('status')).status).toMatchObject({ ready: false, state: 'unavailable' });
  writer.sqlite.prepare('UPDATE schema_state SET revision = ?').run(SCHEMA_REVISION);
  expect(await health(address)).toBe(200);
  await expect.poll(async () => (await worker.request('status')).status).toMatchObject({ ready: true, state: 'idle' });

  await stop(api, 'SIGINT');
  await expect(health(address)).rejects.toThrow();
  expect((await worker.request('status')).status).toMatchObject({ ready: true, state: 'idle' });
  const nextApi = await fixture.startService('api');
  const nextApiInfo = await started(nextApi);
  if (typeof nextApiInfo.address !== 'string') throw new Error('缺少重啟 API address');
  await stop(worker, 'SIGTERM');
  expect(await health(nextApiInfo.address)).toBe(200);

  const nextWorker = await fixture.startService('worker');
  const nextWorkerInfo = await started(nextWorker);
  expect(nextWorkerInfo.status).toMatchObject({ state: 'idle', ready: true, checks: 1 });
  const workerStop = await stop(nextWorker, 'SIGINT');
  expect(workerStop.status).toMatchObject({ state: 'stopped', ready: false });
  await stop(nextApi, 'SIGTERM');
  writer.close();
  expect(fixture.open().isReady()).toBe(true);
  console.info(`Service fixture verified: ${JSON.stringify({ api: { pid: apiInfo.pid, database: apiInfo.database }, worker: { pid: workerInfo.pid, database: workerInfo.database }, restartedApiPid: nextApiInfo.pid, restartedWorkerPid: nextWorkerInfo.pid, finalWorkerStatus: workerStop.status })}`);
  await fixture.dispose();
  await expect(access(fixture.directory)).rejects.toThrow();
});

test('沒有 IPC 的正式 worker CLI 維持 idle loop，debug 顯示多輪檢查，強制停止後 DB 可重開', async () => {
  const fixture = await systemFixture();
  fixture.migrate();
  const child = await fixture.startNode([workerEntry], { FILEHUB_LOG_LEVEL: 'debug', FILEHUB_WORKER_POLL_INTERVAL_MS: '50' });
  const ticks = await child.waitFor(() => {
    const entries: unknown[] = child.output().stdout.split('\n').slice(0, -1).map((line) => JSON.parse(line) as unknown);
    const result = entries.filter((entry) => entry && typeof entry === 'object' && 'event' in entry && entry.event === 'worker_tick');
    return result.length >= 2 ? result : undefined;
  });
  expect(ticks.length).toBeGreaterThanOrEqual(2);
  expect(child.output().stderr).toBe('');
  await child.forceStop(); // Windows 強制終止測試，與上例的正常 signal callback 關閉分開記錄。
  expect(await child.waitForExit()).not.toEqual({ code: 0, signal: null });
  expect(fixture.open().isReady()).toBe(true);
});
