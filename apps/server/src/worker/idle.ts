import { setTimeout as delay } from 'node:timers/promises';

export interface WorkerStatus {
  readonly state: 'idle' | 'unavailable' | 'stopping' | 'stopped' | 'failed';
  readonly ready: boolean;
  readonly checks: number;
  readonly lastCheckedAt: number;
}

export interface IdleWorker {
  readonly done: Promise<void>;
  getStatus(): WorkerStatus;
  stop(): Promise<void>;
}

interface IdleWorkerOptions {
  readonly pollIntervalMs: number;
  readonly readiness: () => boolean;
  readonly onCheck?: (status: WorkerStatus) => void;
  readonly maintenance?: (signal: AbortSignal) => Promise<void>;
}

export class WorkerNotReadyError extends Error {
  constructor() {
    super('Worker 的資料庫尚未就緒。');
    this.name = 'WorkerNotReadyError';
  }
}

export function startIdleWorker(options: IdleWorkerOptions): IdleWorker {
  if (!Number.isSafeInteger(options.pollIntervalMs) || options.pollIntervalMs < 50 || options.pollIntervalMs > 60_000) throw new RangeError('Worker poll interval 必須是 50 到 60000 的整數。');
  let status: WorkerStatus = Object.freeze({ state: 'unavailable', ready: false, checks: 0, lastCheckedAt: 0 });
  const check = () => {
    let ready = false;
    try { ready = options.readiness() === true; } catch { /* probe 錯誤僅表示未就緒。 */ }
    status = Object.freeze({ state: ready ? 'idle' : 'unavailable', ready, checks: status.checks + 1, lastCheckedAt: Date.now() });
    options.onCheck?.(status);
    return ready;
  };
  if (!check()) throw new WorkerNotReadyError();
  const stopping = new AbortController();
  const done = (async () => {
    try {
      while (!stopping.signal.aborted) {
        try { await delay(options.pollIntervalMs, undefined, { signal: stopping.signal }); }
        catch (error) { if (stopping.signal.aborted) break; throw error; }
        if (!stopping.signal.aborted && check() && options.maintenance) {
          await options.maintenance(stopping.signal);
          if (!stopping.signal.aborted) check();
        }
      }
      status = Object.freeze({ ...status, state: 'stopped', ready: false });
    } catch (error) {
      status = Object.freeze({ ...status, state: 'failed', ready: false });
      throw error;
    }
  })();
  return {
    done,
    getStatus: () => status,
    stop: () => {
      if (!stopping.signal.aborted && status.state !== 'failed') status = Object.freeze({ ...status, state: 'stopping', ready: false });
      stopping.abort();
      return done;
    },
  };
}
