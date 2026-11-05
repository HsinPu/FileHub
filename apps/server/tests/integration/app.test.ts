import { Type } from 'typebox';
import { expect, onTestFinished, test } from 'vitest';
import { buildApp } from '../../src/app.js';
import { parseConfig } from '../../src/config/index.js';

const config = (environment = {}) => parseConfig({ FILEHUB_LOG_LEVEL: 'silent', ...environment });

test('liveness、readiness 僅回公開狀態，request ID 不信任呼叫端', async () => {
  const app = buildApp({ config: config(), dependencies: { readiness: () => true } });
  onTestFinished(() => app.close());
  const live = await app.inject({ url: '/health/live', headers: { 'x-request-id': 'caller-private-value' } });
  expect(live.statusCode).toBe(200);
  expect(live.json()).toEqual({ status: 'ok' });
  expect(live.headers['cache-control']).toBe('no-store');
  expect(live.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  expect((await app.inject('/health/ready')).json()).toEqual({ status: 'ready' });
});

test('未注入正式依賴檢查的 factory 預設拒絕 readiness', async () => {
  const app = buildApp({ config: config() });
  onTestFinished(() => app.close());
  expect((await app.inject('/health/ready')).statusCode).toBe(503);
});

test('每個 application 的 dependency 與狀態獨立', async () => {
  const ready = buildApp({ config: config(), dependencies: { readiness: () => true } });
  const unavailable = buildApp({ config: config(), dependencies: { readiness: () => false } });
  onTestFinished(async () => { await ready.close(); await unavailable.close(); });
  expect((await ready.inject('/health/ready')).statusCode).toBe(200);
  const response = await unavailable.inject('/health/ready');
  expect(response.statusCode).toBe(503);
  expect(response.json()).toEqual({ status: 'not_ready' });
});

test('readiness exception 不洩漏內部內容', async () => {
  const app = buildApp({ config: config(), dependencies: { readiness: () => { throw new Error('C:\\private\\state.db fake-secret'); } } });
  onTestFinished(() => app.close());
  const response = await app.inject('/health/ready');
  expect(response.statusCode).toBe(503);
  expect(response.json()).toEqual({ status: 'not_ready' });
});

test('readiness 逾時回未就緒，通知借用的 probe 結束此次檢查', async () => {
  let probeSignal: AbortSignal | undefined;
  const app = buildApp({
    config: config({ FILEHUB_READINESS_TIMEOUT_MS: '15' }),
    dependencies: { readiness: (signal) => { probeSignal = signal; return new Promise<boolean>(() => {}); } },
  });
  onTestFinished(() => app.close());
  expect((await app.inject('/health/ready')).statusCode).toBe(503);
  expect(probeSignal?.aborted).toBe(true);
});

test('關閉會停止在途 readiness 等待，不負責關閉借用的相依資源', async () => {
  const entered = Promise.withResolvers<undefined>();
  let probeSignal: AbortSignal | undefined;
  let borrowedClosed = false;
  const probe = Object.assign((signal: AbortSignal) => {
    probeSignal = signal;
    entered.resolve(undefined);
    return new Promise<boolean>(() => {});
  }, { close: () => { borrowedClosed = true; } });
  const app = buildApp({ config: config(), dependencies: { readiness: probe } });
  onTestFinished(() => app.close());
  const response = app.inject('/health/ready');
  await entered.promise;
  await app.close();
  expect((await response).statusCode).toBe(503);
  expect(probeSignal?.aborted).toBe(true);
  expect(borrowedClosed).toBe(false);
});

test('未知路由使用穩定錯誤格式，不回顯 URL 或 query', async () => {
  const app = buildApp({ config: config() });
  onTestFinished(() => app.close());
  const response = await app.inject('/unknown/private-value?key=fake-secret');
  expect(response.statusCode).toBe(404);
  expect(response.json()).toEqual({ code: 'NOT_FOUND', message: '找不到此 API。', requestId: response.headers['x-request-id'] });
});

test('未預期錯誤不序列化 stack、私有路徑或自訂欄位', async () => {
  const app = buildApp({ config: config() });
  onTestFinished(() => app.close());
  app.get('/failure', () => { throw Object.assign(new Error('C:\\private\\state.db fake-secret'), { privateField: 'fake-secret', statusCode: 418 }); });
  const response = await app.inject('/failure');
  expect(response.statusCode).toBe(500);
  expect(response.json()).toEqual({ code: 'INTERNAL_ERROR', message: '伺服器發生錯誤。', requestId: response.headers['x-request-id'] });
});

test('封裝 plugin 的 schema 驗證錯誤也使用共用格式', async () => {
  const app = buildApp({ config: config() });
  onTestFinished(() => app.close());
  app.register(async (scope) => {
    scope.post('/validation', { schema: { body: Type.Object({ sequence: Type.Integer() }) } }, () => ({ accepted: true }));
  });
  const response = await app.inject({ method: 'POST', url: '/validation', payload: { sequence: 'fake-secret' } });
  expect(response.statusCode).toBe(400);
  expect(response.json()).toEqual({ code: 'BAD_REQUEST', message: '請求格式不正確。', requestId: response.headers['x-request-id'], details: { location: 'body' } });
});

test.each([
  { contentType: 'application/json', payload: '{"private":"fake-secret"', status: 400, code: 'BAD_REQUEST' },
  { contentType: 'unknown/private-format', payload: 'fake-secret', status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' },
  { contentType: 'application/json', payload: 'x'.repeat(1_048_577), status: 413, code: 'PAYLOAD_TOO_LARGE' },
])('parser 錯誤 $status 維持安全且可辨識', async ({ contentType, payload, status, code }) => {
  const app = buildApp({ config: config() });
  onTestFinished(() => app.close());
  app.post('/parser-fixture', () => ({ accepted: true }));
  const response = await app.inject({ method: 'POST', url: '/parser-fixture', headers: { 'content-type': contentType }, payload });
  expect(response.statusCode).toBe(status);
  expect(response.json()).toMatchObject({ code, requestId: response.headers['x-request-id'] });
  expect(response.body).not.toContain('fake-secret');
});
