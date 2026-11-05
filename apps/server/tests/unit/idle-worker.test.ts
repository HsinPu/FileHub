import { expect, onTestFinished, test, vi } from 'vitest';
import { startIdleWorker, WorkerNotReadyError } from '../../src/worker/idle.js';

test('idle loop 只讀 probe，定期更新不可變狀態，不發布 HTTP 或關閉借用資源', async () => {
  const thirdCheck = Promise.withResolvers<undefined>();
  const borrowedClose = vi.fn();
  const readiness = Object.assign(vi.fn(() => true), { close: borrowedClose });
  const worker = startIdleWorker({ pollIntervalMs: 50, readiness, onCheck: (status) => { if (status.checks === 3) thirdCheck.resolve(undefined); } });
  onTestFinished(() => worker.stop());
  expect(worker.getStatus()).toMatchObject({ state: 'idle', ready: true, checks: 1 });
  expect(Object.isFrozen(worker.getStatus())).toBe(true);
  await thirdCheck.promise;
  expect(worker.getStatus().checks).toBe(3);
  const first = worker.stop();
  expect(worker.stop()).toBe(first);
  await first;
  expect(worker.getStatus()).toMatchObject({ state: 'stopped', ready: false, checks: 3 });
  expect(readiness).toHaveBeenCalledTimes(3);
  expect(borrowedClose).not.toHaveBeenCalled();
});

test('DB 變成未就緒或拋錯時停止表示 ready，恢復後再回 idle', async () => {
  let nextCheck = Promise.withResolvers<undefined>();
  const readiness = vi.fn(() => true);
  const worker = startIdleWorker({ pollIntervalMs: 50, readiness, onCheck: (status) => { if (status.checks > 1) nextCheck.resolve(undefined); } });
  onTestFinished(() => worker.stop());
  readiness.mockReturnValue(false);
  await nextCheck.promise;
  expect(worker.getStatus()).toMatchObject({ state: 'unavailable', ready: false });
  nextCheck = Promise.withResolvers<undefined>();
  readiness.mockImplementation(() => { throw new Error('private fixture'); });
  await nextCheck.promise;
  expect(worker.getStatus().ready).toBe(false);
  nextCheck = Promise.withResolvers<undefined>();
  readiness.mockReturnValue(true);
  await nextCheck.promise;
  expect(worker.getStatus()).toMatchObject({ state: 'idle', ready: true, checks: 4 });
  await worker.stop();
});

test('尚未就緒時不能啟動', () => {
  expect(() => startIdleWorker({ pollIntervalMs: 1000, readiness: () => false })).toThrow(WorkerNotReadyError);
});

test('停止不會等待長 poll interval', async () => {
  const worker = startIdleWorker({ pollIntervalMs: 60000, readiness: () => true });
  onTestFinished(() => worker.stop());
  const started = performance.now();
  await worker.stop();
  expect(performance.now() - started).toBeLessThan(1000);
  expect(worker.getStatus().state).toBe('stopped');
});

test('observer 錯誤由 done 傳給 owner，不再啟動下一輪', async () => {
  const worker = startIdleWorker({ pollIntervalMs: 50, readiness: () => true, onCheck: (status) => {
    if (status.checks === 2) throw new Error('observer fixture');
  } });
  const done = expect(worker.done).rejects.toThrow('observer fixture');
  onTestFinished(() => worker.stop().catch(() => {}));
  await done;
  expect(worker.getStatus().state).toBe('failed');
});
test('maintenance 接收 stop signal 並完成後才關閉，不在未就緒時開始下一次', async () => {
  const gate = Promise.withResolvers<undefined>(), entered = Promise.withResolvers<undefined>(); let signal: AbortSignal | undefined, calls = 0;
  const worker = startIdleWorker({ pollIntervalMs: 50, readiness: () => true, maintenance: async (current) => { signal = current; calls++; entered.resolve(undefined); await gate.promise; } });
  try {
    await entered.promise; let stopped = false; const closing = worker.stop().then(() => { stopped = true; });
    expect(signal?.aborted).toBe(true); await Promise.resolve(); expect(stopped).toBe(false); gate.resolve(undefined); await closing; expect(calls).toBe(1); expect(worker.getStatus().state).toBe('stopped');
  } finally { gate.resolve(undefined); await worker.stop(); }
});
test('maintenance 只在 readiness 通過時呼叫', async () => {
  let ready = true; const worked = Promise.withResolvers<undefined>(), unavailable = Promise.withResolvers<undefined>(), maintenance = vi.fn(async () => { ready = false; worked.resolve(undefined); });
  const worker = startIdleWorker({ pollIntervalMs: 50, readiness: () => ready, maintenance, onCheck: (status) => { if (status.state === 'unavailable') unavailable.resolve(undefined); } });
  try { await worked.promise; await unavailable.promise; expect(maintenance).toHaveBeenCalledOnce(); expect(worker.getStatus().ready).toBe(false); } finally { await worker.stop(); }
});
