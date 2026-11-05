import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test as base, expect } from '@playwright/test';
import { migrateDatabase, openDatabase } from '@filehub/server';
import { ManagedNode } from '../helpers/node-process.js';
import { createTemporaryDirectory } from '../helpers/temporary-directory.js';
import { prepareWorkspace, type WorkspaceFixture } from './workspace-data.js';

interface FileHubFixture { readonly url: string; setRevision(revision: number): void; startWorker(): Promise<void> }
export { fixturePassword } from './workspace-data.js';

export const test = base.extend<{ filehub: FileHubFixture; workspaceData: WorkspaceFixture }>({
  workspaceData: async ({ filehub }, use) => {
    if (!filehub.url) throw new Error('fixture 尚未啟動');
    const prepare = seedWorkspace.get(filehub);
    if (!prepare) throw new Error('fixture 沒有 workspace 資料');
    await use(await prepare());
  },
  filehub: async ({ browserName }, use) => {
    if (browserName !== 'chromium') throw new Error('目前瀏覽器矩陣只驗證 Chromium');
    const temporary = await createTemporaryDirectory('filehub-e2e-');
    const config = { stateDirectory: join(temporary.directory, 'state'), sqliteBusyTimeoutMs: 100 };
    let child: ManagedNode | undefined;
    let worker: ManagedNode | undefined;
    const provisioning = new AbortController();
    let preparation: Promise<WorkspaceFixture> | undefined;
    try {
      migrateDatabase(config);
      // P0 的公開健康頁不需要登入資料；僅 workspace tests 啟用昂貴的 KDF。
      const prepare = () => preparation ??= prepareWorkspace(temporary.directory, config, provisioning.signal);
      child = new ManagedNode([fileURLToPath(new URL('../system/fixtures/service.mjs', import.meta.url)), 'api'], temporary.directory, {
        FILEHUB_STATE_DIR: config.stateDirectory, FILEHUB_HOST: '127.0.0.1', FILEHUB_PORT: '0', FILEHUB_LOG_LEVEL: 'silent', FILEHUB_SHUTDOWN_TIMEOUT_MS: '1000',
      }, true);
      const started = await child.waitForMessage((message) => message.type === 'started');
      if (typeof started.address !== 'string' || !/^http:\/\/127\.0\.0\.1:\d+$/.test(started.address) || started.pid !== child.pid) throw new Error('無效瀏覽器 fixture 位址／程序身分');
      expect(started.node).toBe('v24.22.1');
      expect(started.database).toMatchObject({ sqliteVersion: '3.53.4', journalMode: 'wal' });
      const fixture: FileHubFixture = {
        url: started.address,
        async startWorker() {
          if (worker) return;
          worker = new ManagedNode([fileURLToPath(new URL('../system/fixtures/service.mjs', import.meta.url)), 'worker'], temporary.directory, { FILEHUB_STATE_DIR: config.stateDirectory, FILEHUB_LOG_LEVEL: 'silent', FILEHUB_WORKER_POLL_INTERVAL_MS: '50', FILEHUB_SHUTDOWN_TIMEOUT_MS: '3000' }, true);
          const ready = await worker.waitForMessage(message => message.type === 'started');
          if (ready.pid !== worker.pid) throw new Error('worker fixture 身分不符');
        },
        setRevision(revision) {
          const connection = openDatabase(config);
          try { connection.sqlite.prepare('UPDATE schema_state SET revision = ?').run(revision); }
          finally { connection.close(); }
        },
      };
      seedWorkspace.set(fixture, prepare);
      await use(fixture);
    } finally {
      provisioning.abort();
      await preparation?.catch(() => undefined);
      try {
        if (worker) {
          if (!worker.hasExited) expect((await worker.request('stop')).databaseClosed).toBe(true);
          expect(await worker.waitForExit()).toEqual({ code: 0, signal: null });
          expect(worker.output()).toEqual({ stdout: '', stderr: '' });
        }
        if (child) {
          if (!child.hasExited) {
            const stopped = await child.request('stop');
            expect(stopped.databaseClosed).toBe(true);
            expect(stopped.signals).toEqual([0, 0]);
          }
          expect(await child.waitForExit()).toEqual({ code: 0, signal: null });
          expect(child.output()).toEqual({ stdout: '', stderr: '' });
        }
      } finally {
        await worker?.forceStop();
        await child?.forceStop();
        await temporary.dispose();
      }
    }
  },
  baseURL: async ({ filehub }, use) => { await use(filehub.url); },
});
export { expect };
const seedWorkspace = new WeakMap<FileHubFixture, () => Promise<WorkspaceFixture>>();
