import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const root = JSON.parse(await read('package.json'));
if (!/^\d+\.\d+\.\d+$/.test(root.version) || process.version !== `v${root.engines.node}`) throw new Error('Node／應用程式版本不符合專案設定');
if ((await read('.node-version')).trim() !== root.engines.node || root.packageManager !== `pnpm@${root.engines.pnpm}`) throw new Error('工具鏈設定不同步');
for (const name of ['package.json', 'apps/server/package.json', 'apps/web/package.json', 'packages/contracts/package.json']) {
  const value = JSON.parse(await read(name));
  if (!value.private || value.version !== root.version) throw new Error('Workspace 版本不同步');
  for (const version of Object.values({ ...value.dependencies, ...value.devDependencies })) {
    if (version !== 'workspace:*' && !/^\d+\.\d+\.\d+$/.test(version)) throw new Error('直接依賴未精確鎖版');
  }
}
for (const path of ['compose.yaml', '.env.example']) {
  if (!(await read(path)).includes(`filehub:${root.version}`)) throw new Error('預設 image tag 與版本不同步');
}
if (!(await read('Dockerfile')).includes(`org.opencontainers.image.version="${root.version}"`)) throw new Error('Image label 與版本不同步');
if (!(await read('docker/nfs-fixture.Dockerfile')).includes(`ARG FILEHUB_CI_IMAGE=filehub-ci:${root.version}`)) throw new Error('NFS fixture 預設 image 與版本不同步');
console.info(`FileHub ${root.version}／Node ${root.engines.node}／pnpm ${root.engines.pnpm} 設定一致。`);
