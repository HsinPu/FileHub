import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrateDatabase, openDatabase, parseDatabaseConfig, type FileHubDatabase } from '@filehub/server';
import { onTestFinished } from 'vitest';
import { ManagedNode } from '../helpers/node-process.js';
import { createTemporaryDirectory } from '../helpers/temporary-directory.js';
export { ManagedNode };

export async function systemFixture() {
  const temporary = await createTemporaryDirectory('filehub-p04-');
  const { directory } = temporary;
  const config = parseDatabaseConfig({ FILEHUB_STATE_DIR: join(directory, 'state') });
  const children: ManagedNode[] = [];
  const connections: FileHubDatabase[] = [];
  let nextChild = 0;
  let disposed = false;
  const dispose = async () => {
    if (disposed) return;
    for (const child of children) await child.forceStop();
    for (const connection of connections) connection.close();
    await temporary.dispose();
    disposed = true;
  };
  onTestFinished(dispose);
  const startNode = async (args: string[], overrides: NodeJS.ProcessEnv = {}, ipc = false) => {
    const cwd = join(directory, `process-${++nextChild}`);
    await mkdir(cwd);
    const child = new ManagedNode(args, cwd, {
      FILEHUB_STATE_DIR: config.stateDirectory, FILEHUB_LOG_LEVEL: 'silent', FILEHUB_HOST: '127.0.0.1', FILEHUB_PORT: '0',
      FILEHUB_WORKER_POLL_INTERVAL_MS: '50', FILEHUB_SHUTDOWN_TIMEOUT_MS: '1000', ...overrides,
    }, ipc);
    children.push(child);
    return child;
  };
  return {
    directory, config, dispose, startNode,
    migrate: () => migrateDatabase(config),
    open: () => { const connection = openDatabase(config); connections.push(connection); return connection; },
    startService: (role: 'api' | 'worker', overrides: NodeJS.ProcessEnv = {}) =>
      startNode([fileURLToPath(new URL('./fixtures/service.mjs', import.meta.url)), role], overrides, true),
  };
}
