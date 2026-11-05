import { expect, test } from 'vitest';
import { ThumbnailQueue } from '../../src/features/previews/queue.js';
test('縮圖只跑一份，取消排隊項目不執行 I/O，下一份可繼續', async () => {
  const queue = new ThumbnailQueue(), calls: number[] = []; let release: (() => void) | undefined;
  const first = queue.run(async () => { calls.push(1); await new Promise<void>((resolve) => { release = resolve; }); return 1; }, new AbortController().signal);
  const controller = new AbortController(), second = queue.run(async () => { calls.push(2); return 2; }, controller.signal);
  const cancelled = expect(second).rejects.toMatchObject({ name: 'AbortError' });
  const third = queue.run(async () => { calls.push(3); return 3; }, new AbortController().signal);
  await Promise.resolve(); expect(calls).toEqual([1]); controller.abort(); await cancelled; release?.();
  expect(await first).toBe(1); expect(await third).toBe(3); expect(calls).toEqual([1, 3]);
});
test('等候上限及 clear 不影響已執行工作，清除後可重新使用', async () => {
  const queue = new ThumbnailQueue(); let release: (() => void) | undefined;
  const first = queue.run(() => new Promise<void>((resolve) => { release = resolve; }), new AbortController().signal);
  const pending = Array.from({ length: 64 }, () => queue.run(async () => 1, new AbortController().signal).catch(() => 0));
  await expect(queue.run(async () => 2, new AbortController().signal)).rejects.toThrow('縮圖等待數量超過上限');
  queue.clear(); await Promise.resolve(); release?.(); await first; expect(await Promise.all(pending)).toEqual(Array(64).fill(0));
  expect(await queue.run(async () => 3, new AbortController().signal)).toBe(3);
});
