import { expect, test } from 'vitest';
import { resolve } from 'node:path';
import { ConfigError, parseConfig, parseDatabaseConfig, parseWorkerConfig } from '../../src/config/index.js';

test('設定只在明確呼叫時解析，預設 loopback 與有限期限', () => {
  expect(parseConfig({})).toEqual({
    host: '127.0.0.1', port: 3000, logLevel: 'info', readinessTimeoutMs: 1000, shutdownTimeoutMs: 5000,
    stateDirectory: resolve('state'), sqliteBusyTimeoutMs: 100,
  });
  expect(Object.isFrozen(parseConfig({}))).toBe(true);
});

test('DB 設定可單獨解析，不受 API port 影響且不建立 state', () => {
  expect(parseDatabaseConfig({ FILEHUB_PORT: 'invalid', FILEHUB_STATE_DIR: resolve('fixture-state'), FILEHUB_SQLITE_BUSY_TIMEOUT_MS: '0' }))
    .toEqual({ stateDirectory: resolve('fixture-state'), sqliteBusyTimeoutMs: 0 });
});

test('worker 使用共同 DB／log／關閉設定，忽略 API 的 host／port／readiness timeout', () => {
  const config = parseWorkerConfig({ FILEHUB_HOST: 'not-an-ip', FILEHUB_PORT: 'invalid', FILEHUB_READINESS_TIMEOUT_MS: '-1' });
  expect(config).toEqual({ stateDirectory: resolve('state'), sqliteBusyTimeoutMs: 100, logLevel: 'info', shutdownTimeoutMs: 5000, workerPollIntervalMs: 1000, uploadMaintenanceIntervalMs: 60000 });
  expect(Object.isFrozen(config)).toBe(true);
});

test('worker 可明確設定 poll interval 與共用關閉期限', () => {
  expect(parseWorkerConfig({ FILEHUB_WORKER_POLL_INTERVAL_MS: '50', FILEHUB_SHUTDOWN_TIMEOUT_MS: '100', FILEHUB_LOG_LEVEL: 'silent' }))
    .toMatchObject({ workerPollIntervalMs: 50, shutdownTimeoutMs: 100, logLevel: 'silent' });
});
test.each(['', '0', '999', '3600001', '1.5'])('upload maintenance interval 拒絕 %j', (value) => { expect(() => parseWorkerConfig({ FILEHUB_UPLOAD_MAINTENANCE_INTERVAL_MS: value })).toThrow(ConfigError); });
test('upload maintenance interval 可設 1 秒至 1 小時，不解析 API 設定', () => { for (const value of ['1000', '3600000']) expect(parseWorkerConfig({ FILEHUB_UPLOAD_MAINTENANCE_INTERVAL_MS: value, FILEHUB_PORT: 'invalid' }).uploadMaintenanceIntervalMs).toBe(Number(value)); });

test('worker heartbeat 必須明確啟用並使用本機絕對路徑', () => {
  expect(parseWorkerConfig({ FILEHUB_WORKER_HEARTBEAT_FILE: resolve('runtime/worker.json') }).workerHeartbeatFile).toBe(resolve('runtime/worker.json'));
  for (const value of ['', 'relative.json', '//private-server/worker.json', 123]) {
    expect(() => parseWorkerConfig({ FILEHUB_WORKER_HEARTBEAT_FILE: value })).toThrow(ConfigError);
  }
});

test.each(['', '0', '49', '60001', '1.5', 50])('拒絕無效 worker interval：%s', (value) => {
  expect(() => parseWorkerConfig({ FILEHUB_WORKER_POLL_INTERVAL_MS: value })).toThrow(ConfigError);
});

test.each([
  { FILEHUB_LOG_LEVEL: 'private-invalid' },
  { FILEHUB_SHUTDOWN_TIMEOUT_MS: '0' },
  { FILEHUB_SHUTDOWN_TIMEOUT_MS: '60001' },
])('worker 不忽略非法共用設定', (environment) => {
  expect(() => parseWorkerConfig(environment)).toThrow(ConfigError);
});

test.each([
  { FILEHUB_STATE_DIR: '' },
  { FILEHUB_STATE_DIR: 'relative/state' },
  { FILEHUB_STATE_DIR: '//private-server/share' },
  { FILEHUB_STATE_DIR: '\\\\private-server\\share' },
  { FILEHUB_STATE_DIR: 'invalid\0state' },
  { FILEHUB_SQLITE_BUSY_TIMEOUT_MS: '-1' },
  { FILEHUB_SQLITE_BUSY_TIMEOUT_MS: '1001' },
  { FILEHUB_SQLITE_BUSY_TIMEOUT_MS: '1.5' },
])('DB 設定拒絕不明路徑或超過同步等待上限：%j', (environment) => {
  expect(() => parseDatabaseConfig(environment)).toThrow(ConfigError);
});

test('接受明確 IPv6、測試用動態埠與 silent logger，不修改輸入', () => {
  const environment = Object.freeze({ FILEHUB_HOST: '::1', FILEHUB_PORT: '0', FILEHUB_LOG_LEVEL: 'silent' });
  expect(parseConfig(environment)).toMatchObject({ host: '::1', port: 0, logLevel: 'silent' });
});

test.each(['', '-1', '65536', '1.5', '1e3', '3000private-value', ' 3000', 3000])('拒絕無效 port：%s', (value) => {
  expect(() => parseConfig({ FILEHUB_PORT: value })).toThrow(ConfigError);
});

test.each([
  { FILEHUB_HOST: 'private-host-value' },
  { FILEHUB_LOG_LEVEL: 'private-level-value' },
  { FILEHUB_READINESS_TIMEOUT_MS: '0' },
  { FILEHUB_READINESS_TIMEOUT_MS: '60001' },
  { FILEHUB_SHUTDOWN_TIMEOUT_MS: '0' },
  { FILEHUB_SHUTDOWN_TIMEOUT_MS: '60001' },
])('拒絕無效設定，錯誤不回顯輸入值', (environment) => {
  try {
    parseConfig(environment);
    expect.unreachable('應拒絕無效設定');
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    expect(String(error)).not.toContain('private-');
  }
});
