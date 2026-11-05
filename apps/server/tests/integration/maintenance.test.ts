import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { main as maintain } from '../../src/db-maintenance.js';
import { checkHealth } from '../../src/healthcheck.js';
import { databaseFixture } from '../helpers/database.js';

test('DB 維護入口完成備份與新 state 還原，不覆寫已存在的目錄', async () => {
  const fixture = await databaseFixture();
  fixture.migrate();
  const environment = { FILEHUB_STATE_DIR: fixture.config.stateDirectory };
  const snapshot = join(fixture.directory, 'snapshot');
  await maintain(['backup', snapshot], environment);
  await expect(maintain(['backup', snapshot], environment)).rejects.toThrow();
  const restored = join(fixture.directory, 'restored');
  await maintain(['restore', join(snapshot, 'filehub.db')], { FILEHUB_STATE_DIR: restored });
  expect(fixture.open(restored).isReady()).toBe(true);
  await expect(maintain(['restore', join(snapshot, 'filehub.db')], { FILEHUB_STATE_DIR: restored })).rejects.toThrow();
});

test('維護參數錯誤與未啟用的 healthcheck 不建立 DB／檔案', async () => {
  const fixture = await databaseFixture();
  const environment = { FILEHUB_STATE_DIR: fixture.config.stateDirectory };
  for (const args of [[], ['backup', 'relative'], ['unknown', fixture.directory], ['backup', fixture.directory, 'extra']]) {
    await expect(maintain(args, environment)).rejects.toThrow();
  }
  expect(await checkHealth(undefined, environment)).toBe(false);
  expect(await checkHealth('worker', environment)).toBe(false);
  expect(await checkHealth('worker', { ...environment, FILEHUB_WORKER_HEARTBEAT_FILE: join(fixture.directory, 'missing.json') })).toBe(false);
  expect(await readdir(fixture.directory)).toEqual([]);
});
