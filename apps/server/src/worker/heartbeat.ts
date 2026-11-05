import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { WorkerStatus } from './idle.js';

export interface ProcessIdentity {
  readonly pid: number;
  readonly startTime: string;
}

interface Heartbeat extends WorkerStatus, ProcessIdentity {
  readonly version: 1;
  readonly instanceId: string;
}

function isHeartbeat(value: unknown): value is Heartbeat {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return record.version === 1 && typeof record.instanceId === 'string'
    && /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(record.instanceId)
    && Number.isSafeInteger(record.pid) && (record.pid as number) > 0
    && typeof record.startTime === 'string' && /^\d+$/.test(record.startTime)
    && typeof record.state === 'string' && ['idle', 'unavailable', 'stopping', 'stopped', 'failed'].includes(record.state)
    && typeof record.ready === 'boolean'
    && Number.isSafeInteger(record.checks) && (record.checks as number) > 0
    && Number.isSafeInteger(record.lastCheckedAt) && (record.lastCheckedAt as number) > 0;
}

// /proc starttime 是程序啟動 tick，可避免舊檔與重複使用的 PID 誤配。
export async function readProcessIdentity(pid: number): Promise<ProcessIdentity | undefined> {
  if (process.platform !== 'linux' || !Number.isSafeInteger(pid) || pid < 1) return undefined;
  try {
    const stat = await readFile(`/proc/${pid}/stat`, 'utf8');
    const fields = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/);
    const startTime = fields[19];
    if (!startTime || !/^\d+$/.test(startTime) || ['Z', 'X', 'x'].includes(fields[0] ?? '')) return undefined;
    return { pid, startTime };
  } catch { return undefined; }
}

export async function readHeartbeat(filename: string): Promise<Heartbeat | undefined> {
  try {
    const stat = await lstat(filename);
    if (!stat.isFile() || stat.size > 4096) return undefined;
    const value: unknown = JSON.parse(await readFile(filename, 'utf8'));
    return isHeartbeat(value) ? value : undefined;
  } catch { return undefined; }
}

export function isHeartbeatReady(value: unknown, identity: ProcessIdentity | undefined, now: number, maxAgeMs: number): boolean {
  return isHeartbeat(value) && identity !== undefined
    && value.pid === identity.pid && value.startTime === identity.startTime
    && value.state === 'idle' && value.ready
    && Number.isFinite(now) && Number.isFinite(maxAgeMs) && maxAgeMs > 0
    && now >= value.lastCheckedAt && now - value.lastCheckedAt <= maxAgeMs;
}

export function createHeartbeatPublisher(filename: string, identity: ProcessIdentity) {
  const instanceId = randomUUID();
  let latest: Heartbeat | undefined;
  let running: Promise<void> | undefined;
  let failure: Error | undefined;
  const pump = async () => {
    await mkdir(dirname(filename), { recursive: true, mode: 0o700 });
    while (latest) {
      const snapshot = latest;
      latest = undefined;
      const temporary = `${filename}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, JSON.stringify(snapshot), { flag: 'wx', mode: 0o600 });
        await rename(temporary, filename);
      } finally { await rm(temporary, { force: true }); }
    }
  };
  const start = () => {
    running = pump().catch(() => {
      failure = new Error('Worker heartbeat 寫入失敗。');
    }).finally(() => {
      running = undefined;
      if (latest && !failure) start();
    });
  };
  return {
    publish(status: WorkerStatus) {
      if (failure) throw failure;
      latest = { ...status, ...identity, version: 1, instanceId };
      if (!running) start();
    },
    async flush() {
      while (running) await running;
      if (failure) throw failure;
    },
  };
}
