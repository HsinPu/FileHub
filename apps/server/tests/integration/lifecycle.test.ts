import { createServer } from 'node:net';
import { expect, onTestFinished, test, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import { parseConfig } from '../../src/config/index.js';
import { closeApp, listenApp, ShutdownTimeoutError } from '../../src/runtime.js';

const config = () => parseConfig({ FILEHUB_LOG_LEVEL: 'silent', FILEHUB_PORT: '0' });

test('啟動 hook 失敗會關閉 application 自有資源', async () => {
  const app = buildApp({ config: config() });
  const closed = vi.fn();
  app.addHook('onReady', async () => { throw new Error('startup fixture'); });
  app.addHook('onClose', async () => { closed(); });
  await expect(listenApp(app, config())).rejects.toThrow('startup fixture');
  expect(closed).toHaveBeenCalledOnce();
  expect(app.server.listening).toBe(false);
});

test('埠被占用時清理失敗 app，不關閉呼叫端擁有的 listener', async () => {
  const occupied = createServer();
  onTestFinished(() => new Promise<void>((resolve, reject) => occupied.close((error) => error ? reject(error) : resolve())));
  await new Promise<void>((resolve, reject) => { occupied.once('error', reject); occupied.listen(0, '127.0.0.1', resolve); });
  const address = occupied.address();
  if (!address || typeof address === 'string') throw new Error('缺少測試埠');
  const app = buildApp({ config: config() });
  const closed = vi.fn();
  app.addHook('onClose', async () => { closed(); });
  await expect(listenApp(app, parseConfig({ FILEHUB_LOG_LEVEL: 'silent', FILEHUB_PORT: String(address.port) }))).rejects.toMatchObject({ code: 'EADDRINUSE' });
  expect(closed).toHaveBeenCalledOnce();
  expect(occupied.listening).toBe(true);
});

test('正常關閉可重複呼叫，hook 只執行一次', async () => {
  const app = buildApp({ config: config() });
  const closed = vi.fn();
  app.addHook('onClose', async () => { closed(); });
  const first = closeApp(app, 1000);
  const second = closeApp(app, 1);
  expect(first).toBe(second);
  await first;
  expect(closed).toHaveBeenCalledOnce();
});

test('關閉 callback 不完成時有明確 deadline，並關閉 HTTP connections', async () => {
  const app = buildApp({ config: config() });
  const forceClose = vi.spyOn(app.server, 'closeAllConnections');
  app.addHook('onClose', () => new Promise<void>(() => {}));
  await expect(closeApp(app, 15)).rejects.toBeInstanceOf(ShutdownTimeoutError);
  expect(forceClose).toHaveBeenCalledOnce();
});

test('啟動與清理同時失敗時保留兩個內部錯誤', async () => {
  const app = buildApp({ config: config() });
  app.addHook('onReady', async () => { throw new Error('startup fixture'); });
  app.addHook('onClose', async () => { throw new Error('cleanup fixture'); });
  try {
    await listenApp(app, config());
    expect.unreachable('應回報啟動失敗');
  } catch (error) {
    expect(error).toBeInstanceOf(AggregateError);
    if (!(error instanceof AggregateError)) throw error;
    expect(error.errors.map(String)).toEqual(['Error: startup fixture', 'Error: cleanup fixture']);
  }
});
