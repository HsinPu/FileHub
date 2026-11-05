import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { URL } from 'node:url';
import process from 'node:process';
if (process.platform === 'linux') {
  const directory = fileURLToPath(new URL('../apps/server/native/', import.meta.url));
  const result = spawnSync('cc', ['-std=c11', '-Wall', '-Wextra', '-Werror', '-O2', '-D_FORTIFY_SOURCE=2', '-fstack-protector-strong', '-Wl,-z,relro,-z,now', `${directory}filehub-fs.c`, '-o', `${directory}filehub-fs`], { stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error('Linux 檔案操作 helper 建置失敗');
}
