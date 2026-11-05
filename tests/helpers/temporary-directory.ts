import { lstat, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative } from 'node:path';

// 不綁定 Vitest／Playwright hook；建立者須先關閉自己的連線／程序，再 dispose。
export async function createTemporaryDirectory(prefix: string, parent = tmpdir()) {
  if (!/^filehub-[a-z0-9-]+-$/.test(prefix)) throw new Error('Fixture prefix 必須是 filehub 開頭的安全名稱');
  const root = await realpath(parent);
  const directory = await mkdtemp(join(root, prefix));
  const identity = await lstat(directory, { bigint: true });
  let disposal: Promise<void> | undefined;
  return {
    directory,
    dispose(): Promise<void> {
      return disposal ??= (async () => {
        const current = await lstat(directory, { bigint: true });
        const target = await realpath(directory);
        const within = relative(root, target);
        if (current.isSymbolicLink() || current.dev !== identity.dev || current.ino !== identity.ino
          || target !== directory || isAbsolute(within) || within.startsWith('..') || !within.startsWith(prefix)) {
          throw new Error('拒絕清理不屬於本次 fixture 的目錄');
        }
        await rm(target, { recursive: true, force: true });
      })();
    },
  };
}
