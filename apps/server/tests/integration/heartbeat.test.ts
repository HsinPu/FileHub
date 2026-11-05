import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { createHeartbeatPublisher, readHeartbeat, isHeartbeatReady } from '../../src/worker/heartbeat.js';
import { databaseFixture } from '../helpers/database.js';

const identity = { pid: 123, startTime: '42' };
const status = { state: 'idle', ready: true, checks: 1, lastCheckedAt: 10000 } as const;

test('原子 heartbeat 發布會合併等待中的狀態，最後停止快照不可被舊 ready 蓋回', async () => {
  const fixture = await databaseFixture();
  const filename = join(fixture.directory, 'runtime', 'worker.json');
  const publisher = createHeartbeatPublisher(filename, identity);
  publisher.publish(status);
  publisher.publish({ ...status, checks: 2 });
  publisher.publish({ ...status, state: 'stopped', ready: false, checks: 3 });
  await publisher.flush();
  const snapshot = await readHeartbeat(filename);
  expect(snapshot).toMatchObject({ ...identity, state: 'stopped', ready: false, checks: 3, version: 1 });
  expect(await readdir(join(fixture.directory, 'runtime'))).toEqual(['worker.json']);
  expect(JSON.parse(await readFile(filename, 'utf8'))).not.toHaveProperty('stateDirectory');
});

test('heartbeat 寫入失敗會回報 owner，後續 publish 不可假裝成功', async () => {
  const fixture = await databaseFixture();
  const blocked = join(fixture.directory, 'blocked');
  await writeFile(blocked, 'keep');
  const publisher = createHeartbeatPublisher(join(blocked, 'worker.json'), identity);
  publisher.publish(status);
  await expect(publisher.flush()).rejects.toThrow();
  expect(() => publisher.publish(status)).toThrow();
  expect(await readFile(blocked, 'utf8')).toBe('keep');
});

test.each([
  { patch: {}, now: 11000, process: identity, ready: true },
  { patch: {}, now: 16000, process: identity, ready: false },
  { patch: {}, now: 9000, process: identity, ready: false },
  { patch: {}, now: 11000, process: { ...identity, startTime: '43' }, ready: false },
  { patch: {}, now: 11000, process: undefined, ready: false },
  { patch: { state: 'unavailable', ready: false }, now: 11000, process: identity, ready: false },
])('heartbeat 驗證同時要求 fresh、ready 與同一程序：%j', ({ patch, now, process, ready }) => {
  const snapshot = { ...status, ...identity, version: 1, instanceId: '550e8400-e29b-41d4-a716-446655440000', ...patch };
  expect(isHeartbeatReady(snapshot, process, now, 5000)).toBe(ready);
});

test('不完整 JSON 或超過上限的 heartbeat 檔案一律未就緒', async () => {
  const fixture = await databaseFixture();
  const filename = join(fixture.directory, 'worker.json');
  await writeFile(filename, '{"ready":');
  expect(await readHeartbeat(filename)).toBeUndefined();
  await writeFile(filename, 'x'.repeat(4097));
  expect(await readHeartbeat(filename)).toBeUndefined();
});
