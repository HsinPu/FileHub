import { isIP } from 'node:net';
import { isAbsolute, normalize, parse, resolve } from 'node:path';

const logLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
export type Environment = Readonly<Record<string, unknown>>;
export interface DatabaseConfig {
  readonly stateDirectory: string;
  readonly sqliteBusyTimeoutMs: number;
}

export interface ServiceConfig extends DatabaseConfig {
  readonly logLevel: typeof logLevels[number];
  readonly shutdownTimeoutMs: number;
}

export interface AppConfig extends ServiceConfig {
  readonly publicOrigin?: string;
  readonly host: string;
  readonly port: number;
  readonly readinessTimeoutMs: number;
}

export interface WorkerConfig extends ServiceConfig {
  readonly workerPollIntervalMs: number;
  readonly uploadMaintenanceIntervalMs: number;
  readonly workerHeartbeatFile?: string;
}

export class ConfigError extends Error {
  constructor(key: string, requirement: string) {
    super(`${key} ${requirement}`);
    this.name = 'ConfigError';
  }
}

function text(environment: Environment, key: string, fallback: string): string {
  const value = environment[key];
  if (value === undefined) return fallback;
  if (typeof value !== 'string') throw new ConfigError(key, '必須是字串。');
  return value;
}

function integer(environment: Environment, key: string, fallback: string, minimum: number, maximum: number): number {
  const value = text(environment, key, fallback);
  const parsed = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new ConfigError(key, `必須是 ${minimum} 到 ${maximum} 的十進位整數。`);
  }
  return parsed;
}

function localPath(value: string, key: string): string {
  if (!isAbsolute(value) || value.includes('\0') || /^[\\/]{2}/.test(value)
    || (process.platform === 'win32' && !/^[A-Za-z]:[\\/]$/.test(parse(value).root))) {
    throw new ConfigError(key, '必須是本機檔案系統的絕對路徑，不能是 UNC 或裝置路徑。');
  }
  return normalize(value);
}

export function parseDatabaseConfig(environment: Environment = process.env): DatabaseConfig {
  return Object.freeze({
    stateDirectory: localPath(text(environment, 'FILEHUB_STATE_DIR', resolve('state')), 'FILEHUB_STATE_DIR'),
    sqliteBusyTimeoutMs: integer(environment, 'FILEHUB_SQLITE_BUSY_TIMEOUT_MS', '100', 0, 1000),
  });
}

// 程式化 adapter／migration 呼叫也必須遵守同一條設定邊界。
export function validateDatabaseConfig(config: DatabaseConfig): DatabaseConfig {
  if (typeof config.stateDirectory !== 'string') throw new ConfigError('FILEHUB_STATE_DIR', '必須是絕對路徑字串。');
  if (!Number.isSafeInteger(config.sqliteBusyTimeoutMs) || config.sqliteBusyTimeoutMs < 0 || config.sqliteBusyTimeoutMs > 1000) {
    throw new ConfigError('FILEHUB_SQLITE_BUSY_TIMEOUT_MS', '必須是 0 到 1000 的整數。');
  }
  return parseDatabaseConfig({ FILEHUB_STATE_DIR: config.stateDirectory, FILEHUB_SQLITE_BUSY_TIMEOUT_MS: String(config.sqliteBusyTimeoutMs) });
}

function parseServiceConfig(environment: Environment): ServiceConfig {
  const level = text(environment, 'FILEHUB_LOG_LEVEL', 'info');
  const logLevel = logLevels.find((candidate) => candidate === level);
  if (!logLevel) throw new ConfigError('FILEHUB_LOG_LEVEL', '不是支援的 log level。');
  return Object.freeze({
    ...parseDatabaseConfig(environment),
    logLevel,
    shutdownTimeoutMs: integer(environment, 'FILEHUB_SHUTDOWN_TIMEOUT_MS', '5000', 1, 60_000),
  });
}

export function parseWorkerConfig(environment: Environment = process.env): WorkerConfig {
  return Object.freeze({
    ...parseServiceConfig(environment),
    workerPollIntervalMs: integer(environment, 'FILEHUB_WORKER_POLL_INTERVAL_MS', '1000', 50, 60_000),
    uploadMaintenanceIntervalMs: integer(environment, 'FILEHUB_UPLOAD_MAINTENANCE_INTERVAL_MS', '60000', 1000, 3_600_000),
    ...(environment.FILEHUB_WORKER_HEARTBEAT_FILE === undefined ? {} : {
      workerHeartbeatFile: localPath(text(environment, 'FILEHUB_WORKER_HEARTBEAT_FILE', ''), 'FILEHUB_WORKER_HEARTBEAT_FILE'),
    }),
  });
}

export function parseConfig(environment: Environment = process.env): AppConfig {
  const host = text(environment, 'FILEHUB_HOST', '127.0.0.1');
  if (isIP(host) === 0) throw new ConfigError('FILEHUB_HOST', '必須是 IPv4 或 IPv6 位址。');
  const allowLanHttp = text(environment, 'FILEHUB_ALLOW_LAN_HTTP', 'false');
  if (allowLanHttp !== 'true' && allowLanHttp !== 'false') throw new ConfigError('FILEHUB_ALLOW_LAN_HTTP', '必須是 true 或 false。');
  let publicOrigin: string | undefined;
  if (environment.FILEHUB_PUBLIC_ORIGIN !== undefined) {
    const value = text(environment, 'FILEHUB_PUBLIC_ORIGIN', '');
    try {
      const url = new URL(value);
      const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
      const allowedHttp = url.protocol === 'http:' && (loopback || allowLanHttp === 'true');
      if (url.origin !== value || url.username || url.password || (url.protocol !== 'https:' && !allowedHttp)) throw new Error();
      publicOrigin = url.origin;
    } catch { throw new ConfigError('FILEHUB_PUBLIC_ORIGIN', '必須是無路徑的 HTTPS 來源。HTTP 可用於本機或明確啟用的內網部署。'); }
  }
  return Object.freeze({
    ...parseServiceConfig(environment),
    host,
    port: integer(environment, 'FILEHUB_PORT', '3000', 0, 65_535),
    readinessTimeoutMs: integer(environment, 'FILEHUB_READINESS_TIMEOUT_MS', '1000', 1, 60_000),
    ...(publicOrigin ? { publicOrigin } : {}),
  });
}
