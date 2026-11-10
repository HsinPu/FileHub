import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test as base, expect } from '@playwright/test';
import { migrateDatabase, openDatabase, IdentityService, EntryService, FileService, ShareService } from '@filehub/server';
import { createTemporaryDirectory } from '../helpers/temporary-directory.js';
import { ManagedNode } from '../helpers/node-process.js';
import { fixturePassword } from './workspace-data.js';

interface Pair {
  readonly url: string;
  readonly cUrl: string;
  readonly sourceId: string;
  readonly secret: string;
  stopC(): Promise<void>;
  restartC(): Promise<void>;
}

async function provision(directory: string, remote: boolean) {
  const config = { stateDirectory: join(directory, 'state'), sqliteBusyTimeoutMs: 100 };
  migrateDatabase(config);
  const database = openDatabase(config);
  try {
    const identity = new IdentityService(database), admin = await identity.bootstrap('admin', fixturePassword);
    const root = join(directory, 'files');
    await mkdir(root, { recursive: true });
    await writeFile(join(root, remote ? 'C-private.txt' : 'A-only.txt'), 'synthetic local file');
    const entries = new EntryService(database), entry = await entries.register('managed', remote ? 'C 本機資料' : 'A 的檔案', root);
    let share: { id: string; secret: string } | undefined;
    if (remote) {
      await mkdir(join(root, '共享文件', '子目錄'), { recursive: true });
      await mkdir(join(root, '共享文件', '空資料夾'));
      await mkdir(join(root, '共享文件', '大量檔案'));
      await writeFile(join(root, '共享文件', 'C-note.txt'), 'C shared fixture');
      await writeFile(join(root, '共享文件', '子目錄', '遠端報告.txt'), 'remote report');
      await Promise.all(Array.from({ length: 55 }, (_, index) => writeFile(join(root, '共享文件', '大量檔案', 'item-' + String(index).padStart(2, '0') + '.txt'), String(index))));
      const files = new FileService(entries), shares = new ShareService(database, entries, files);
      share = { id: randomUUID(), secret: randomBytes(32).toString('base64url') };
      await shares.create(admin.id, { ...share, entryId: entry.id, path: '共享文件',
        version: (await files.metadata(admin.id, entry.id, '共享文件')).resource.version,
        expiresAt: new Date(Date.now() + 86400000).toISOString() });
    }
    return { config, entry, share };
  } finally { database.close(); }
}

async function stop(child: ManagedNode) {
  if (!child.hasExited) expect((await child.request('stop')).databaseClosed).toBe(true);
  expect(await child.waitForExit()).toEqual({ code: 0, signal: null });
  expect(child.output()).toEqual({ stdout: '', stderr: '' });
}

export const test = base.extend<{ pair: Pair }>({
  pair: async ({ browserName }, use) => {
    if (browserName !== 'chromium') throw new Error('Remote browser fixture requires Chromium');
    const temporary = await createTemporaryDirectory('filehub-remote-e2e-');
    const children: ManagedNode[] = [];
    const wrapper = fileURLToPath(new URL('../system/fixtures/service.mjs', import.meta.url));
    const start = async (state: string, port = 0, sources?: string) => {
      const child = new ManagedNode([wrapper, 'api'], temporary.directory, {
        FILEHUB_STATE_DIR: state, FILEHUB_HOST: '127.0.0.1', FILEHUB_PORT: String(port),
        FILEHUB_LOG_LEVEL: 'silent', FILEHUB_SHUTDOWN_TIMEOUT_MS: '1000',
        ...(sources ? { FILEHUB_REMOTE_SOURCES_FILE: sources } : {}),
      }, true);
      children.push(child);
      const message = await child.waitForMessage(value => value.type === 'started');
      if (message.pid !== child.pid || typeof message.address !== 'string' || !/^http:\/\/127\.0\.0\.1:\d+$/.test(message.address)) throw new Error('Invalid remote fixture address');
      return { child, url: message.address };
    };
    try {
      const c = await provision(join(temporary.directory, 'c'), true);
      const a = await provision(join(temporary.directory, 'a'), false);
      if (!c.share) throw new Error('Missing C export');
      let cProcess = await start(c.config.stateDirectory);
      const cUrl = cProcess.url, sourceId = randomUUID();
      const filename = join(temporary.directory, 'remote-sources.json');
      await writeFile(filename, JSON.stringify({ version: 1, sources: [{
        id: sourceId, label: 'C 的檔案',
        url: cUrl + '/FileHub/?share=' + c.share.id + '#' + c.share.secret,
        address: '127.0.0.1', allowHttp: true, users: [],
      }] }), { mode: 0o600 });
      const aProcess = await start(a.config.stateDirectory, 0, filename);
      await use({
        url: aProcess.url, cUrl, sourceId, secret: c.share.secret,
        stopC: () => stop(cProcess.child),
        async restartC() { cProcess = await start(c.config.stateDirectory, Number(new URL(cUrl).port)); },
      });
    } finally {
      try { for (const child of children.toReversed()) await stop(child); }
      finally {
        for (const child of children.toReversed()) await child.forceStop();
        await temporary.dispose();
      }
    }
  },
});
export { expect };
