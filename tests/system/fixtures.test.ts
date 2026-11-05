import { mkdir, readFile, rename, symlink, unlink, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, onTestFinished, test } from 'vitest';
import { createTemporaryDirectory } from '../helpers/temporary-directory.js';
import { ManagedNode } from '../helpers/node-process.js';
import { childEnvironment } from '../helpers/environment.js';

test('暫存目錄只刪自己的根，重複清理共用結果', async () => {
  const temporary = await createTemporaryDirectory('filehub-helper-');
  await writeFile(join(temporary.directory, 'proof.txt'), 'fixture');
  const first = temporary.dispose();
  expect(temporary.dispose()).toBe(first);
  await first;
  await expect(access(temporary.directory)).rejects.toThrow();
});

test('拒絕清理被替換成 junction／symlink 的目錄，外部內容不變', async () => {
  const parent = await createTemporaryDirectory('filehub-helper-parent-');
  const external = await createTemporaryDirectory('filehub-helper-external-');
  onTestFinished(() => external.dispose());
  onTestFinished(() => parent.dispose());
  const owned = await createTemporaryDirectory('filehub-child-', parent.directory);
  await writeFile(join(external.directory, 'keep.txt'), 'keep');
  await rename(owned.directory, join(parent.directory, 'original'));
  await symlink(external.directory, owned.directory, process.platform === 'win32' ? 'junction' : 'dir');
  try {
    await expect(owned.dispose()).rejects.toThrow(/拒絕清理/);
    expect(await readFile(join(external.directory, 'keep.txt'), 'utf8')).toBe('keep');
  } finally { await unlink(owned.directory); }
});

test('同一路徑換成其他目錄亦拒絕清理，不只比對字串／realpath', async () => {
  const parent = await createTemporaryDirectory('filehub-helper-parent-');
  onTestFinished(() => parent.dispose());
  const owned = await createTemporaryDirectory('filehub-child-', parent.directory);
  await rename(owned.directory, join(parent.directory, 'original'));
  await mkdir(owned.directory);
  await writeFile(join(owned.directory, 'replacement.txt'), 'keep');
  await expect(owned.dispose()).rejects.toThrow(/拒絕清理/);
  expect(await readFile(join(owned.directory, 'replacement.txt'), 'utf8')).toBe('keep');
});

test('暫存 prefix 不接受相對越界，子程序環境清除繼承設定與互斥色彩', async () => {
  await expect(createTemporaryDirectory('../filehub-')).rejects.toThrow();
  await expect(createTemporaryDirectory('unowned-')).rejects.toThrow();
  const inherited = { PATH: 'keep', FILEHUB_STATE_DIR: 'private', NODE_OPTIONS: 'private', NO_COLOR: '1', FORCE_COLOR: '1' };
  const environment = childEnvironment({ FILEHUB_PORT: '0' }, inherited);
  expect(environment).toEqual({ PATH: 'keep', FILEHUB_PORT: '0', FORCE_COLOR: '0' });
  expect(inherited.FILEHUB_STATE_DIR).toBe('private');
});

test('程序已退出時 IPC 等待立即失敗，不留下 waiter 或終止其他程序', async () => {
  const temporary = await createTemporaryDirectory('filehub-process-');
  const child = new ManagedNode(['-e', 'process.exit(7)'], temporary.directory, {}, true);
  onTestFinished(async () => { await child.forceStop(); await temporary.dispose(); });
  expect(await child.waitForExit()).toEqual({ code: 7, signal: null });
  await expect(child.waitForMessage(() => true)).rejects.toThrow();
});

test('輸出超限會終止本物件建立的子程序，等退出後才允許移除 fixture', async () => {
  const temporary = await createTemporaryDirectory('filehub-process-');
  const child = new ManagedNode(['-e', 'console.log("x".repeat(70000)); setInterval(()=>{},1000)'], temporary.directory, {}, false);
  onTestFinished(async () => { await child.forceStop(); await temporary.dispose(); });
  await expect(child.waitForExit()).rejects.toThrow(/上限/);
  await child.forceStop();
  await temporary.dispose();
});
