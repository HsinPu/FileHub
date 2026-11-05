import { readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildApp, closeApp, listenApp, parseConfig } from '@filehub/server';
import { expect, onTestFinished, test } from 'vitest';
import { runNode, temporaryDirectory } from './fixtures.js';

const entry = fileURLToPath(new URL('../../apps/server/dist/server.js', import.meta.url));
const library = new URL('../../apps/server/dist/index.js', import.meta.url).href;
const baseEnvironment = { FILEHUB_LOG_LEVEL: 'silent', FILEHUB_HOST: '127.0.0.1', FILEHUB_PORT: '0' };

test('真實 loopback TCP 可請求與關閉，之後 listener 不再接受連線', async () => {
  const config = parseConfig(baseEnvironment);
  const app = buildApp({ config, dependencies: { readiness: () => true } });
  onTestFinished(() => closeApp(app, config.shutdownTimeoutMs));
  const address = await listenApp(app, config);
  const response = await fetch(`${address}/health/live`);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok' });
  expect(await (await fetch(`${address}/health/ready`)).json()).toEqual({ status: 'ready' });
  await closeApp(app, config.shutdownTimeoutMs);
  expect(app.server.listening).toBe(false);
  await expect(fetch(`${address}/health/live`)).rejects.toThrow();
});

test('真實 HTTP readiness failure 回 503 與公開狀態', async () => {
  const config = parseConfig(baseEnvironment);
  const app = buildApp({ config, dependencies: { readiness: () => false } });
  onTestFinished(() => closeApp(app, config.shutdownTimeoutMs));
  const address = await listenApp(app, config);
  const response = await fetch(`${address}/health/ready`);
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ status: 'not_ready' });
});

test('匯入正式產物不讀啟動設定、不監聽且不建立資料', async () => {
  const directory = await temporaryDirectory();
  const result = await runNode(['--input-type=module', '-e', `await import(${JSON.stringify(pathToFileURL(entry).href)}); console.log('IMPORT_OK');`], directory, { FILEHUB_PORT: 'private-invalid-value' });
  expect(result.code).toBe(0);
  expect(result.stdout.trim()).toBe('IMPORT_OK');
  expect(result.stderr).toBe('');
  expect(await readdir(directory)).toEqual([]);
});

test('直接執行 CLI 會拒絕無效設定，回非零且不洩漏設定值', async () => {
  const directory = await temporaryDirectory();
  const result = await runNode([entry], directory, { ...baseEnvironment, FILEHUB_PORT: 'private-invalid-value' });
  expect(result.code).toBe(1);
  expect(result.stderr).toContain('FileHub API 啟動失敗');
  expect(result.stderr).toContain('FILEHUB_PORT');
  expect(result.stderr).not.toContain('private-invalid-value');
  expect(await readdir(directory)).toEqual([]);
});

test('正式產物 main 可啟動 HTTP 並由 Node signal callback 正常關閉', async () => {
  const directory = await temporaryDirectory();
  const script = `
    const { migrateDatabase, parseDatabaseConfig } = await import(${JSON.stringify(library)});
    migrateDatabase(parseDatabaseConfig());
    const { main } = await import(${JSON.stringify(pathToFileURL(entry).href)});
    const { address } = await main();
    const response = await fetch(address + '/health/live');
    if (response.status !== 200) throw new Error('health fixture failed');
    await response.text();
    console.log('HTTP_AND_SIGNAL_OK');
    process.emit('SIGTERM');
  `;
  const result = await runNode(['--input-type=module', '-e', script], directory, baseEnvironment);
  expect(result.code).toBe(0);
  expect(result.stdout).toContain('HTTP_AND_SIGNAL_OK');
  expect(await readdir(directory)).toEqual(['state']);
});

test('預設日誌不回顯 URL、認證 headers 或內部 exception 內容', async () => {
  const directory = await temporaryDirectory();
  const script = `
    const { buildApp, parseConfig, listenApp, closeApp } = await import(${JSON.stringify(library)});
    const config = parseConfig();
    const app = buildApp({ config });
    app.get('/fixture-private-url', () => { throw new Error('/private/state.db fake-secret'); });
    try {
      const address = await listenApp(app, config);
      const response = await fetch(address + '/fixture-private-url?key=fake-secret', { headers: { authorization: 'fake-secret', cookie: 'fake-secret' } });
      if (response.status !== 500) throw new Error('error fixture failed');
      await response.text();
    } finally { await closeApp(app, config.shutdownTimeoutMs); }
  `;
  const result = await runNode(['--input-type=module', '-e', script], directory, { ...baseEnvironment, FILEHUB_LOG_LEVEL: 'info' });
  expect(result.code).toBe(0);
  expect(result.stdout).toContain('request_failed');
  expect(result.stdout + result.stderr).not.toContain('fake-secret');
  expect(result.stdout + result.stderr).not.toContain('fixture-private-url');
  expect(result.stderr).toBe('');
});
