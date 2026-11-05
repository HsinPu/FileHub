import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, rename, utimes, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { EntryService, IdentityService, openDatabase } from '@filehub/server';
import { childEnvironment } from '../helpers/environment.js';
import { png, pdf } from '../helpers/preview-data.js';

const execute = promisify(execFile);
const cli = fileURLToPath(new URL('../../apps/server/dist/cli.js', import.meta.url));
export const fixturePassword = 'FileHub testing password 2026!';
export interface WorkspaceFixture {
  readonly managed: string;
  readonly external: string;
  readonly bytes: Buffer;
  readonly uploadDirectory: string;
  readonly uploadLongName: string;
  admin(args: string[]): Promise<void>;
  snapshot(): Promise<string>;
  setExternalOnline(online: boolean): Promise<void>;
  preparePreviews(): Promise<void>;
  preparePreviewScene(): Promise<string>;
  prepareLongPreview(): Promise<{ path: string; name: string }>;
  prepareOperations(): Promise<void>;
  prepareSettings(): Promise<void>;
  prepareLayout(): Promise<string>;
  prepareSelectionAlignment(): Promise<string>;
}

export async function prepareWorkspace(directory: string, config: { stateDirectory: string; sqliteBusyTimeoutMs: number }, signal: AbortSignal): Promise<WorkspaceFixture> {
  const managedRoot = join(directory, 'managed'), externalRoot = join(directory, 'external'), offlineRoot = join(directory, 'external-offline');
  // 故障注入只可移動本 fixture 的兩個固定 sibling，不能接受任意 host 路徑。
  for (const path of [managedRoot, externalRoot, offlineRoot]) if (dirname(resolve(path)) !== resolve(directory)) throw new Error('fixture 路徑越界');
  await mkdir(join(managedRoot, '文件', '空資料夾'), { recursive: true });
  await mkdir(join(managedRoot, '大量檔案'));
  await mkdir(join(externalRoot, 'team'), { recursive: true });
  const bytes = Buffer.from([0, 1, 128, 255, 10]);
  await writeFile(join(managedRoot, '文件', '報告 100%.bin'), bytes);
  await writeFile(join(managedRoot, '文件', '一份具有較長中文名稱且需要在手機畫面完整閱讀的檔案說明.txt'), 'long filename');
  await Promise.all(Array.from({ length: 55 }, (_, index) => writeFile(join(managedRoot, '大量檔案', `item-${String(index).padStart(2, '0')}.txt`), String(index))));
  await writeFile(join(managedRoot, 'readme.txt'), 'FileHub fixture');
  await writeFile(join(externalRoot, 'team', 'shared.txt'), 'shared fixture');
  await writeFile(join(externalRoot, 'private.txt'), 'private canary');
  const uploadDirectory = join(directory, '批次 上傳'), uploadLongName = '中'.repeat(60) + ' 100%.bin';
  await mkdir(join(uploadDirectory, '子資料夾'), { recursive: true }); await mkdir(join(uploadDirectory, '空資料夾'));
  await writeFile(join(uploadDirectory, '空檔.txt'), Buffer.alloc(0)); await writeFile(join(uploadDirectory, '子資料夾', uploadLongName), bytes);

  const admin = async (args: string[], password?: string): Promise<string> => {
    signal.throwIfAborted();
    const running = execute(process.execPath, [cli, ...args], { cwd: directory, env: childEnvironment({ FILEHUB_STATE_DIR: config.stateDirectory }), windowsHide: true, timeout: 8000, maxBuffer: 65_536, signal });
    const closed = new Promise<void>((resolve) => { running.child.once('close', () => { resolve(); }); });
    running.child.stdin?.end(password === undefined ? undefined : JSON.stringify({ password }));
    const output = await running.catch(() => { throw new Error('隔離 fixture CLI 失敗'); }).finally(() => closed);
    if (output.stderr || (password && output.stdout.includes(password))) throw new Error('fixture CLI 非預期輸出');
    return output.stdout;
  };
  // 瀏覽器 fixture 直接使用正式服務，避免每案為相同 seed 重開五次 CLI。
  // CLI 邊界另由 system 測試覆蓋；KDF、root identity 及 grant 規則不替換。
  const { managed, external } = await (async () => {
    const database = openDatabase(config);
    try {
      signal.throwIfAborted();
      const identity = new IdentityService(database), entries = new EntryService(database);
      await identity.bootstrap('admin', fixturePassword); signal.throwIfAborted();
      await identity.createUser('member', fixturePassword); signal.throwIfAborted();
      const a = await entries.register('managed', '我的檔案', managedRoot); signal.throwIfAborted();
      const b = await entries.register('external', '團隊資料', externalRoot); signal.throwIfAborted();
      await entries.grant('member', b.id, 'team', false); signal.throwIfAborted();
      return { managed: a.id, external: b.id };
    } finally { database.close(); }
  })();

  const identity = await lstat(externalRoot, { bigint: true });
  let online = true;
  return {
    managed, external, bytes, uploadDirectory, uploadLongName,
    admin: async (args) => { await admin(args); },
    async prepareLayout() {
      const path = '版面驗收', root = join(managedRoot, path), fixed = new Date('2026-01-01T00:00:00Z');
      await mkdir(root);
      for (let index = 1; index <= 60; index++) {
        const file = join(root, `document-${String(index).padStart(2, '0')}.txt`);
        await writeFile(file, `Synthetic layout document ${index}\n`); await utimes(file, fixed, fixed);
      }
      for (const name of ['design', 'images', 'notes', 'reports', 'source', '長名稱']) {
        await mkdir(join(root, name)); await utimes(join(root, name), fixed, fixed);
      }
      await writeFile(join(root, '長名稱', '一份具有完整中文說明且需要在小螢幕自然換行的長名稱驗收文件 100%.txt'), 'Synthetic long name');
      await writeFile(join(root, '長名稱', 'image.png'), png());
      await writeFile(join(root, '長名稱', 'document.pdf'), pdf());
      await mkdir(join(root, '長名稱', '空資料夾'));
      return path;
    },
    async prepareSelectionAlignment() {
      const path = '勾選對齊', root = join(managedRoot, path), fixed = new Date('2026-01-01T00:00:00Z');
      await mkdir(join(root, '空資料夾'), { recursive: true });
      for (const name of ['FileHub-開始使用.txt', `${'需要在窄畫面完整顯示的檔案名稱'.repeat(4)}.txt`]) {
        const file = join(root, name);
        await writeFile(file, 'Synthetic selection alignment'); await utimes(file, fixed, fixed);
      }
      await writeFile(join(root, 'image.png'), png()); await utimes(join(root, 'image.png'), fixed, fixed);
      return path;
    },
    async prepareSettings(){const offered=join(directory,'settings-source');await mkdir(join(offered,'team'),{recursive:true});await writeFile(join(offered,'team','content.txt'),'settings source');await admin(['entry-offer','external','已登記測試目錄',offered]);},
    async prepareOperations() { await mkdir(join(managedRoot, '工作目的地')); await writeFile(join(managedRoot, '工作目的地', 'readme.txt'), 'existing destination canary'); },
    async preparePreviewScene(){const path='視窗預覽';await mkdir(join(managedRoot,path));await writeFile(join(managedRoot,path,'viewport.png'),png(960,540));return path;},
    async preparePreviews() {
      const preview = join(managedRoot, '預覽'); await mkdir(preview);
      await writeFile(join(preview, '圖片 100%.png'), png()); await writeFile(join(preview, 'document.pdf'), pdf());
      await writeFile(join(preview, 'attack.html'), '<script>fetch("/canary")</script><img src=x onerror="alert(1)">');
      await writeFile(join(preview, 'broken.pdf'), '%PDF-1.7\ninvalid'); await writeFile(join(preview, 'unknown.bin'), 'unknown');
    },
    async prepareLongPreview() {
      const path = ['長路徑', ...Array.from({ length: 4 }, (_, index) => `${index}-${'中'.repeat(68)}`)].join('/'), name = '深層預覽.txt';
      await mkdir(join(managedRoot, ...path.split('/')), { recursive: true });
      await writeFile(join(managedRoot, ...path.split('/'), name), '長相對路徑的安全純文字預覽');
      return { path, name };
    },
    async setExternalOnline(next) {
      if (next === online) return;
      const source = online ? externalRoot : offlineRoot, target = online ? offlineRoot : externalRoot;
      const current = await lstat(source, { bigint: true });
      if (!current.isDirectory() || current.isSymbolicLink() || current.dev !== identity.dev || current.ino !== identity.ino) throw new Error('fixture root 已被替換');
      try { await lstat(target); throw new Error('fixture 目標已存在'); }
      catch (error) { if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') throw error; }
      await rename(source, target); online = next;
    },
    async snapshot() {
      const database = openDatabase(config);
      const tables = ['schema_state', '__drizzle_migrations', 'users', 'sessions', 'login_throttle', 'entries', 'grants', 'write_intents', 'trash_items', 'upload_sessions', 'upload_chunks', 'operations', 'operation_items', 'operation_nodes','operation_artifacts','shares','share_sessions','share_throttle','preferences','entry_candidates'];
      const digest = createHash('sha256');
      try {
        const rows = database.sqlite.transaction(() => tables.map((table) => database.sqlite.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all()))();
        digest.update(JSON.stringify(rows));
      } finally { database.close(); }
      const visit = async (root: string, relative: string): Promise<void> => {
        const path = relative ? join(root, relative) : root;
        const stat = await lstat(path, { bigint: true });
        digest.update(JSON.stringify([relative, String(stat.dev), String(stat.ino), String(stat.size), String(stat.mode), String(stat.mtimeNs), String(stat.ctimeNs)]));
        if (stat.isSymbolicLink()) throw new Error('fixture snapshot 不跟隨連結');
        if (stat.isDirectory()) for (const name of (await readdir(path)).sort()) await visit(root, relative ? `${relative}/${name}` : name);
        else if (stat.isFile()) digest.update(await readFile(path));
        else throw new Error('fixture 不是普通檔案或目錄');
      };
      await visit(managedRoot, ''); await visit(online ? externalRoot : offlineRoot, '');
      return digest.digest('hex');
    },
  };
}
