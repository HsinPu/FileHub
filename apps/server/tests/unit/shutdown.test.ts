import { EventEmitter } from 'node:events';
import { expect, onTestFinished, test, vi } from 'vitest';
import { createShutdown, registerShutdownSignals, ShutdownTimeoutError } from '../../src/lifecycle/shutdown.js';

test('共用關閉只執行一次，重複呼叫回同一 Promise 並清除 timer', async () => {
  vi.useFakeTimers();
  onTestFinished(() => { vi.useRealTimers(); });
  const close = vi.fn();
  const shutdown = createShutdown(close, 1000);
  const first = shutdown();
  expect(shutdown()).toBe(first);
  await first;
  expect(close).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

test('關閉逾時有明確錯誤，不假裝終止仍在執行的借用工作', async () => {
  const task = Promise.withResolvers<undefined>();
  const force = vi.fn();
  const shutdown = createShutdown(() => task.promise, 15, force);
  await expect(shutdown()).rejects.toBeInstanceOf(ShutdownTimeoutError);
  expect(force).toHaveBeenCalledOnce();
  task.resolve(undefined);
});

test('關閉失敗保留原錯誤，強制清理失敗亦不產生未捕捉 timer 例外', async () => {
  const error = new Error('close fixture');
  await expect(createShutdown(() => { throw error; }, 1000)()).rejects.toBe(error);
  const pending = Promise.withResolvers<undefined>();
  const shutdown = createShutdown(() => pending.promise, 15, () => { throw error; });
  await expect(shutdown()).rejects.toBeInstanceOf(AggregateError);
  pending.resolve(undefined);
});

test('signal callbacks 在首次停止時移除，不能重複關閉或干擾其他 listener', async () => {
  const signals = new EventEmitter();
  const unrelated = vi.fn();
  signals.on('SIGTERM', unrelated);
  const close = vi.fn();
  const failed = vi.fn();
  const detach = registerShutdownSignals(createShutdown(close, 1000), failed, signals);
  signals.emit('SIGTERM');
  await Promise.resolve();
  await Promise.resolve();
  signals.emit('SIGINT');
  expect(close).toHaveBeenCalledOnce();
  expect(unrelated).toHaveBeenCalledOnce();
  expect(signals.listenerCount('SIGTERM')).toBe(1);
  expect(signals.listenerCount('SIGINT')).toBe(0);
  expect(failed).not.toHaveBeenCalled();
  detach();
});

test('signal 關閉錯誤交給呼叫端，不造成未處理 rejection', async () => {
  const signals = new EventEmitter();
  const delivered = Promise.withResolvers<unknown>();
  const error = new Error('private fixture');
  registerShutdownSignals(() => Promise.reject(error), delivered.resolve, signals);
  signals.emit('SIGINT');
  expect(await delivered.promise).toBe(error);
});
