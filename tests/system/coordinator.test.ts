import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { WriteCoordinator } from '@filehub/server';
import { systemFixture } from './fixtures.js';

test('實際雙程序爭用同一 WAL；owner 強制退出後 reservation 持續阻擋重播', async () => {
  const f = await systemFixture(); f.migrate(); const db = f.open();
  const user = randomUUID(), entry = randomUUID();
  db.sqlite.prepare("INSERT INTO users VALUES (?, 'fixture', 'not-a-login-hash', 'admin', 1, 1)").run(user);
  db.sqlite.prepare("INSERT INTO entries (id,label,kind,root_path,root_device,root_inode,root_ancestors,enabled) VALUES (?, 'fixture', 'managed', 'synthetic-root', '1', '1', '[]', 1)").run(entry);
  const script = fileURLToPath(new URL('./fixtures/coordinator.mjs', import.meta.url));
  const env = { P2_USER: user, P2_ENTRY: entry, P2_PATH: 'folder' };
  const first = await f.startNode([script], env, true);
  const acquired = await first.waitForMessage((message) => message.type === 'started');
  expect(acquired.error).toBeUndefined(); expect(acquired.handle).toMatchObject({ generation: 1 });
  const second = await f.startNode([script], { ...env, P2_PATH: 'folder/child' }, true);
  expect(await second.waitForMessage((message) => message.type === 'started')).toMatchObject({ error: 'MUTATION_BUSY' });
  await first.forceStop();
  const restarted = new WriteCoordinator(db);
  expect(() => restarted.begin(user, 'rename', [{ entryId: entry, path: 'folder' }], {})).toThrow(expect.objectContaining({ code: 'MUTATION_BUSY' }));
  expect(db.sqlite.prepare('SELECT status FROM write_intents').all()).toEqual([{ status: 'prepared' }]);
  await second.request('stop'); expect(await second.waitForExit()).toEqual({ code: 0, signal: null });
  expect(first.output()).toEqual({ stdout: '', stderr: '' }); expect(second.output()).toEqual({ stdout: '', stderr: '' });
});
