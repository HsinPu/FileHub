import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { onTestFinished } from 'vitest';
import { childEnvironment } from '../helpers/environment.js';
import { createTemporaryDirectory } from '../helpers/temporary-directory.js';

const exec = promisify(execFile);
const repository = resolve(import.meta.dirname, '../..');
const metadata: unknown = JSON.parse(await readFile(join(repository, 'package.json'), 'utf8'));
if (!metadata || typeof metadata !== 'object' || !('version' in metadata) || typeof metadata.version !== 'string') throw new Error('缺少 image 版本');
export const image = `filehub:${metadata.version}`;

export async function docker(args: string[], environment: NodeJS.ProcessEnv = childEnvironment({}), timeout = 60_000): Promise<string> {
  const result = await exec('docker', args, { cwd: repository, env: environment, windowsHide: true, timeout, maxBuffer: 2 * 1024 * 1024 });
  return result.stdout.trim();
}

export interface Container {
  Id: string;
  Image: string;
  Config: { User: string; Labels: Record<string, string>; Image: string };
  State: { Status: string; Running: boolean; ExitCode: number; OOMKilled: boolean; StartedAt: string; Health?: { Status: string } };
  HostConfig: { ReadonlyRootfs: boolean; CapDrop: string[]; SecurityOpt: string[]; Memory: number; PidsLimit: number };
  Mounts: { Type: string; Name?: string; Source: string; Destination: string; RW: boolean }[];
  NetworkSettings: { Ports: Record<string, { HostIp: string; HostPort: string }[] | null> };
}

export async function inspect(id: string): Promise<Container> {
  const container = (JSON.parse(await docker(['inspect', id])) as Container[])[0];
  if (!container) throw new Error('找不到測試容器');
  return container;
}

export async function eventually<T>(read: () => Promise<T>, accept: (value: T) => boolean, timeout = 40_000): Promise<T> {
  const deadline = Date.now() + timeout;
  let value = await read();
  while (!accept(value)) {
    if (Date.now() >= deadline) throw new Error(`Docker 狀態等待逾時：${JSON.stringify(value)}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
    value = await read();
  }
  return value;
}

export async function composeFixture() {
  const temporary = await createTemporaryDirectory('filehub-p05-');
  const { directory } = temporary;
  const token = randomUUID();
  const projects: { name: string; compose: (args: string[]) => Promise<string> }[] = [];
  const auxiliary: string[] = [];
  let disposed=false;
  const dispose=async () => {
    if(disposed)return;
    for (const project of projects.toReversed()) {
      const ids = (await docker(['ps', '-aq', '--filter', `label=com.docker.compose.project=${project.name}`])).split(/\s+/).filter(Boolean);
      for (const id of ids) {
        const container = await inspect(id);
        if (container.Config.Labels['filehub.test-run'] !== token) throw new Error('拒絕清理非本次測試的容器');
        // SIGSTOP 案例失敗時也必須先恢復自己擁有的 Node PID 1。
        if (container.State.Running) await docker(['kill', '--signal=SIGCONT', id]);
      }
      const volumes = (await docker(['volume', 'ls', '-q', '--filter', `label=com.docker.compose.project=${project.name}`])).split(/\s+/).filter(Boolean);
      for (const name of volumes) {
        const data = JSON.parse(await docker(['volume', 'inspect', name])) as { Labels: Record<string, string> }[];
        if (data[0]?.Labels['filehub.test-run'] !== token) throw new Error('拒絕清理非本次測試的 volume');
      }
      await project.compose(['down', '--volumes', '--remove-orphans']);
    }
    const helpers = (await docker(['ps', '-aq', '--filter', `label=filehub.test-run=${token}`])).split(/\s+/).filter(Boolean);
    for (const id of helpers) {
      if ((await inspect(id)).Config.Labels['filehub.test-run'] !== token) throw new Error('拒絕清理非本次測試的 helper');
      await docker(['rm', '--force', id]);
    }
    for (const name of auxiliary.toReversed()) {
      const data = JSON.parse(await docker(['volume', 'inspect', name])) as { Labels: Record<string, string> }[];
      if (!name.startsWith('filehub-p05-') || data[0]?.Labels['filehub.test-run'] !== token) throw new Error('拒絕清理非本次測試的輔助 volume');
      await docker(['volume', 'rm', name]);
    }
    if (await docker(['ps', '-aq', '--filter', `label=filehub.test-run=${token}`])
      || await docker(['volume', 'ls', '-q', '--filter', `label=filehub.test-run=${token}`])) throw new Error('本次 Docker fixture 尚有殘留');
    await temporary.dispose();
    disposed=true;
  };
  onTestFinished(dispose);
  return {
    dispose,
    async prepareVolume(volume: string, script: string) {
      if (!auxiliary.includes(volume)) throw new Error('只允許準備本次 fixture volume');
      return docker(['run', '--rm', '--name', `filehub-p05-helper-${randomUUID().slice(0, 8)}`,
        '--label', `filehub.test-run=${token}`, '--user', '0:0', '-v', `${volume}:/fixture`,
        image, '--input-type=module', '-e', script]);
    },
    async volume() {
      const name = `filehub-p05-${randomUUID().slice(0, 8)}`;
      await docker(['volume', 'create', '--label', `filehub.test-run=${token}`, name]);
      auxiliary.push(name);
      return name;
    },
    async project(options: { stateDirectory?: string; externalSource?: string; externalReadOnly?: boolean; recoveryVolume?: string; image?:string; mounts?:readonly {volume:string;target:'/data/backups'|'/deployment'|'/mounts/external';readOnly?:boolean}[] } = {}) {
      if(options.recoveryVolume&&!auxiliary.includes(options.recoveryVolume))throw new Error('只允許掛載本次 fixture 的 recovery volume');
      if(options.mounts?.some(mount=>!auxiliary.includes(mount.volume))||new Set(options.mounts?.map(mount=>mount.target)).size!==(options.mounts?.length??0))throw new Error('只允許掛載本次 fixture 的唯一 volume target');
      if(options.recoveryVolume&&options.mounts?.some(mount=>mount.target==='/data/backups'))throw new Error('拒絕重疊 recovery target');
      const name = `filehub-p05-${randomUUID().slice(0, 8)}`;
      const envFile = join(directory, `${name}.env`);
      const override = join(directory, `${name}.json`);
      const labels = { 'filehub.test-run': token };
      await writeFile(envFile, '');
      await writeFile(override, JSON.stringify({
        services: Object.fromEntries(['migrate', 'api', 'worker'].map((role) => [role, { labels,volumes:[...(options.recoveryVolume?[{type:'volume',source:options.recoveryVolume,target:'/data/backups'}]:[]),...(options.mounts??[]).map(mount=>({type:'volume',source:mount.volume,target:mount.target,read_only:mount.readOnly??false}))] }])),
        volumes: {...Object.fromEntries(['state', 'files', 'cache'].map((volume) => [volume, { labels }])),...Object.fromEntries([...(options.recoveryVolume?[options.recoveryVolume]:[]),...(options.mounts??[]).map(mount=>mount.volume)].map(volume=>[volume,{external:true,name:volume}]))},
      }));
      const environment = childEnvironment({
        FILEHUB_IMAGE: options.image??image, FILEHUB_HTTP_PORT: '0', FILEHUB_BIND_ADDRESS: '127.0.0.1',
        // HTTP 測試用固定的合成 Origin，與 Docker 分配的主機埠分開。
        FILEHUB_PUBLIC_ORIGIN: 'http://127.0.0.1:8080',
        FILEHUB_STATE_DIR: options.stateDirectory ?? '/data/state',
        FILEHUB_LOG_LEVEL: 'info', COMPOSE_CONVERT_WINDOWS_PATHS: '0',
        FILEHUB_UPLOAD_MAINTENANCE_INTERVAL_MS: '1000',
        ...(options.externalSource ? { FILEHUB_EXTERNAL_SOURCE: options.externalSource, FILEHUB_EXTERNAL_READ_ONLY: String(options.externalReadOnly ?? true) } : {}),
      });
      const base = ['compose', '--project-name', name, '--env-file', envFile, '-f', join(repository, 'compose.yaml')];
      if (options.externalSource) base.push('-f', join(repository, 'compose.mounts.example.yaml'));
      base.push('-f', override);
      const compose = (args: string[]) => docker([...base, ...args], environment, 90_000);
      projects.push({ name, compose });
      const container = async (role: string) => inspect(await compose(['ps', '-aq', role]));
      const node = (role: string, script: string) => compose(['exec', '-T', role, 'node', '--input-type=module', '-e', script]);
      return {
        name, compose, container, node,
        setImage:(value:string)=>{environment.FILEHUB_IMAGE=value;},
        up: () => compose(['up', '-d', '--wait', '--wait-timeout', '45', 'api', 'worker']),
        stateVolume: `${name}_state`,
      };
    },
  };
}
