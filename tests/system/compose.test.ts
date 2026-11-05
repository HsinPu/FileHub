import { afterAll, beforeAll, expect, test } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { composeFixture, docker, eventually, image, inspect, type Container } from './compose-fixtures.js';

test('正式 image 在專屬 8 MiB tmpfs 實際 ENOSPC，prefix／原檔保留，清理後可再次發布', async () => {
  const token = randomUUID(), name = `filehub-capacity-${token.slice(0, 8)}`;
  const source = await readFile(new URL('./fixtures/upload-capacity.mjs', import.meta.url), 'utf8');
  const cleanup = async () => {
    const current = await inspect(name);
    if (current.Config.Labels['filehub.test-run'] !== token || current.State.Running || current.Mounts.some((item) => item.Type !== 'tmpfs')) throw new Error('拒絕清理非本次容量測試容器');
    if (current.State.ExitCode === 0 && !current.State.OOMKilled) await docker(['rm', name]);
    else console.info(`保留失敗容量容器 ${name}，token ${token}`);
  };
  try {
    const output = await docker(['run', '--name', name, '--label', `filehub.test-run=${token}`, '--user', '1000:1000', '--read-only', '--cap-drop=ALL', '--security-opt', 'no-new-privileges', '--cpus', '1', '--memory', '512m', '--pids-limit', '128', '--network', 'none', '--shm-size', '8m', '--tmpfs', '/data/state:rw,size=16m,uid=1000,gid=1000,mode=0700', '--tmpfs', '/tmp:rw,size=16m,uid=1000,gid=1000,mode=0700', image, '--input-type=module', '-e', source]);
    expect(JSON.parse(output)).toEqual({ capacityBytes: 8 * 1024 * 1024, committedBytes: 4 * 1024 * 1024, storageFull: true, prefixIntact: true, cleanupReleased: true, retryPublished: true });
    const current = await inspect(name); expect(current.Image).toBe(JSON.parse(await docker(['image', 'inspect', image, '--format', '{{json .Id}}'])));
    expect(current.State).toMatchObject({ Running: false, ExitCode: 0, OOMKilled: false }); expect(current.Mounts.every((item) => item.Type === 'tmpfs')).toBe(true);
  } finally { await cleanup(); }
});

let existing: { id: string; startedAt: string }[] = [];
beforeAll(async () => {
  expect(JSON.parse(await docker(['version', '--format', '{{json .Server}}']))).toMatchObject({ Os: 'linux', Arch: 'amd64' });
  await docker(['image', 'inspect', image]); // 缺少 Docker／預建 image 時明確失敗，不 skip。
  // 只守護原有服務；其他具 ownership label 的隔離驗收可獨立完成／退出。
  const ids = (await docker(['ps', '-q'])).split(/\s+/).filter(Boolean);
  existing = [];
  for (const id of ids) {
    const container = await inspect(id);
    if (!Object.hasOwn(container.Config.Labels ?? {}, 'filehub.test-run')) existing.push({ id, startedAt: container.State.StartedAt });
  }
});
afterAll(async () => {
  for (const prior of existing) {
    expect((await inspect(prior.id)).State).toMatchObject({ Running: true, StartedAt: prior.startedAt });
  }
});

function mount(container: Container, destination: string) {
  const found = container.Mounts.find((entry) => entry.Destination === destination);
  if (!found) throw new Error(`缺少 ${destination} 掛載`);
  return found;
}

const diagnostics = `import {openDatabase,parseDatabaseConfig} from './apps/server/dist/index.js';
const db=openDatabase(parseDatabaseConfig());try{console.log(JSON.stringify({node:process.version,uid:process.getuid(),gid:process.getgid(),...db.diagnostics()}));}finally{db.close();}`;
const readProof = `import {openDatabase,parseDatabaseConfig} from './apps/server/dist/index.js';
const db=openDatabase(parseDatabaseConfig());try{console.log(JSON.stringify(db.sqlite.prepare('SELECT value FROM p05_proof').all()));}finally{db.close();}`;

test('Linux 同 image migration→雙服務，權限／健康／持久卷符合契約；SIGTERM、重建與完整還原後可讀檔', async () => {
  const fixture = await composeFixture();
  const project = await fixture.project();
  await project.up();
  const api = await project.container('api');
  const worker = await project.container('worker');
  const migrate = await project.container('migrate');
  expect(migrate.State).toMatchObject({ Status: 'exited', ExitCode: 0, OOMKilled: false });
  expect(new Set([api.Image, worker.Image, migrate.Image]).size).toBe(1);
  expect((await project.compose(['ps', '--status', 'running', '--services'])).split(/\s+/).sort()).toEqual(['api', 'worker']);
  for (const service of [api, worker]) {
    expect(service.Config.User).toBe('1000:1000');
    expect(service.State.Health?.Status).toBe('healthy');
    expect(service.HostConfig).toMatchObject({ ReadonlyRootfs: true, CapDrop: ['ALL'], SecurityOpt: ['no-new-privileges:true'], Memory: 536870912, PidsLimit: 128 });
  }
  for (const destination of ['/data/state', '/data/files', '/data/cache']) {
    expect(mount(api, destination).Name).toBe(mount(worker, destination).Name);
    expect(mount(api, destination)).toMatchObject({ Type: 'volume', RW: true });
  }
  const volume = JSON.parse(await docker(['volume', 'inspect', project.stateVolume])) as { Driver: string; Options: unknown }[];
  expect(volume[0]).toMatchObject({ Driver: 'local', Options: null });
  const mountinfo = await project.node('api', `import {readFileSync} from 'node:fs';console.log(readFileSync('/proc/self/mountinfo','utf8').split(String.fromCharCode(10)).find(l=>l.split(' ')[4]==='/data/state'));`);
  expect(mountinfo.split(' - ')[1]?.split(' ')[0]).toBe('ext4');
  expect(worker.NetworkSettings.Ports['3000/tcp']).toBeNull();
  const published = api.NetworkSettings.Ports['3000/tcp'];
  expect(published).toHaveLength(1);
  expect(published?.[0]?.HostIp).toBe('127.0.0.1');
  const response = await fetch(`http://127.0.0.1:${published?.[0]?.HostPort}/health/ready`);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: 'ready' });
  let baseUrl = `http://127.0.0.1:${published?.[0]?.HostPort}`;
  await project.node('api', `import{openDatabase,parseDatabaseConfig,IdentityService}from'./apps/server/dist/index.js';const db=openDatabase(parseDatabaseConfig());try{await new IdentityService(db).bootstrap('admin','Synthetic-container-password-123!')}finally{db.close()}`);
  const login = await fetch(`${baseUrl}/api/session`, { method: 'POST', headers: { origin: 'http://127.0.0.1:8080', 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'Synthetic-container-password-123!' }) });
  expect(login.status).toBe(200);
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  const session = await login.json() as { csrfToken: string };
  if (!cookie) throw new Error('正式 image 缺少 session Cookie');
  const entry = JSON.parse(await project.node('api', `import{writeFileSync}from'node:fs';import{openDatabase,parseDatabaseConfig,EntryService}from'./apps/server/dist/index.js';writeFileSync('/data/files/linux-proof.bin',Buffer.from([0,1,128,255]));const db=openDatabase(parseDatabaseConfig());try{console.log(JSON.stringify(await new EntryService(db).register('managed','Linux proof','/data/files')))}finally{db.close()}`)) as { id: string };
  const listing = await fetch(`${baseUrl}/api/entries/${entry.id}/files`, { headers: { cookie } });
  expect(listing.status).toBe(200);
  expect(await listing.json()).toMatchObject({ items: [{ name: 'linux-proof.bin', kind: 'file', size: 4 }] });
  const downloaded = await fetch(`${baseUrl}/api/entries/${entry.id}/download?path=linux-proof.bin`, { headers: { cookie } });
  expect(downloaded.status).toBe(200);
  expect(Buffer.from(await downloaded.arrayBuffer())).toEqual(Buffer.from([0, 1, 128, 255]));
  // Actual runtime image, UID 1000, read-only rootfs and shared local volumes.
  await project.node('api', `import{openDatabase,parseDatabaseConfig,EntryService}from'./apps/server/dist/index.js';const db=openDatabase(parseDatabaseConfig());try{await new EntryService(db).setWritable('${entry.id}',true)}finally{db.close()}`);
  const metadata = async (path: string) => {
    const response = await fetch(`${baseUrl}/api/entries/${entry.id}/metadata?${new URLSearchParams({ path }).toString()}`, { headers: { cookie } });
    expect(response.status).toBe(200); return (await response.json() as { resource: { version: string } }).resource;
  };
  const post = async (path: string, body: unknown) => {
    const response = await fetch(`${baseUrl}/api/entries/${entry.id}/${path}`, { method: 'POST', headers: { cookie, origin: 'http://127.0.0.1:8080', 'x-csrf-token': session.csrfToken, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ status: 'succeeded' });
  };
  await post('directories', { id: randomUUID(), parent: '', parentVersion: (await metadata('')).version, name: 'created' });
  await post('rename', { id: randomUUID(), path: 'linux-proof.bin', version: (await metadata('linux-proof.bin')).version, parent: '', parentVersion: (await metadata('')).version, name: 'renamed.bin' });
  const trashId = randomUUID();
  await post('trash', { id: trashId, path: 'renamed.bin', version: (await metadata('renamed.bin')).version });
  const trashResponse = await fetch(`${baseUrl}/api/entries/${entry.id}/trash`, { headers: { cookie } });
  expect(trashResponse.status).toBe(200);
  const trashed = (await trashResponse.json() as { items: { id: string; version: string; canRestore: boolean }[] }).items[0];
  expect(trashed).toMatchObject({ id: trashId, canRestore: true });
  await post(`trash/${trashId}/restore`, { id: randomUUID(), parent: '', parentVersion: (await metadata('')).version, name: 'restored.bin', version: trashed?.version });
  const restoredDownload = await fetch(`${baseUrl}/api/entries/${entry.id}/download?path=restored.bin`, { headers: { cookie } });
  expect(restoredDownload.status).toBe(200); expect(Buffer.from(await restoredDownload.arrayBuffer())).toEqual(Buffer.from([0, 1, 128, 255]));
  const uploadBytes = Buffer.from([0, 255, 7]), uploadHash = createHash('sha256').update(uploadBytes).digest('hex');
  const uploadHeaders = { cookie, origin: 'http://127.0.0.1:8080', 'x-csrf-token': session.csrfToken };
  const stageUpload = async (name: string) => {
    const id = randomUUID();
    expect((await fetch(`${baseUrl}/api/entries/${entry.id}/uploads`, { method: 'POST', headers: { ...uploadHeaders, 'content-type': 'application/json' }, body: JSON.stringify({ id, parent: '', name, size: uploadBytes.length, sha256: uploadHash }) })).status).toBe(200);
    expect((await fetch(`${baseUrl}/api/uploads/${id}/content`, { method: 'PUT', headers: { ...uploadHeaders, 'content-type': 'application/octet-stream', 'x-upload-offset': '0', 'x-upload-checksum': uploadHash }, body: uploadBytes })).status).toBe(200);
    return id;
  };
  const pendingUpload = await stageUpload('upload-restart.bin');
  // API and worker have different PID namespaces; the API keeps its OFD guard.
  const interruptedId = randomUUID();
  await project.node('api', `import{openDatabase,parseDatabaseConfig,WriteCoordinator}from'./apps/server/dist/index.js';const db=openDatabase(parseDatabaseConfig());try{const row=db.sqlite.prepare("SELECT owner,user_id FROM write_intents WHERE kind='mkdir' AND status='succeeded' LIMIT 1").get();new WriteCoordinator(db,row.owner).begin(row.user_id,'mkdir',[{entryId:'${entry.id}',path:''}],{entryId:'${entry.id}',source:'.filehub/staging/${interruptedId}',target:'never-published',request:{}},'${interruptedId}')}finally{db.close()}`);
  const recoverInWorker = async () => JSON.parse(await project.node('worker', `import{openDatabase,parseDatabaseConfig,recoverWrites}from'./apps/server/dist/index.js';const db=openDatabase(parseDatabaseConfig());try{console.log(JSON.stringify(await recoverWrites(db)))}finally{db.close()}`)) as { items: { id: string; outcome: string }[] };
  expect((await recoverInWorker()).items).toContainEqual({ id: interruptedId, outcome: 'busy' });
  await project.compose(['stop', 'api']);
  expect((await recoverInWorker()).items).toContainEqual({ id: interruptedId, outcome: 'failed' });
  await project.compose(['stop', 'worker']);
  await project.compose(['up', '-d', '--wait', '--wait-timeout', '45', 'api', 'worker']);
  const restartedPorts = (await project.container('api')).NetworkSettings.Ports['3000/tcp'];
  expect(restartedPorts).toHaveLength(1); expect(restartedPorts?.[0]?.HostIp).toBe('127.0.0.1');
  baseUrl = `http://127.0.0.1:${restartedPorts?.[0]?.HostPort}`;
  console.info(`Compose restart ports: ${JSON.stringify({ before: published?.[0]?.HostPort, after: restartedPorts?.[0]?.HostPort })}`);
  expect(await (await fetch(`${baseUrl}/api/uploads/${pendingUpload}`, { headers: { cookie } })).json()).toMatchObject({ state: 'open', offset: uploadBytes.length });
  const finalized = await fetch(`${baseUrl}/api/uploads/${pendingUpload}/finalize`, { method: 'POST', headers: uploadHeaders });
  expect(finalized.status).toBe(200); expect(await finalized.json()).toMatchObject({ state: 'completed', sha256: uploadHash });
  expect(Buffer.from(await (await fetch(`${baseUrl}/api/entries/${entry.id}/download?path=upload-restart.bin`, { headers: { cookie } })).arrayBuffer()).equals(uploadBytes)).toBe(true);
  const operationId=randomUUID();
  const operationInput={id:operationId,kind:'copy',sources:[{entryId:entry.id,path:'restored.bin',version:(await metadata('restored.bin')).version,name:'worker-copy.bin'}],destination:{entryId:entry.id,path:'created',version:(await metadata('created')).version},conflict:'stop'};
  const operationResponse=await fetch(`${baseUrl}/api/operations`,{method:'POST',headers:{...uploadHeaders,'content-type':'application/json'},body:JSON.stringify(operationInput)});expect(operationResponse.status).toBe(200);expect(await operationResponse.json()).toMatchObject({id:operationId,state:'queued'});
  await eventually(async()=>JSON.stringify(await(await fetch(`${baseUrl}/api/operations/${operationId}`,{headers:{cookie}})).json()),value=>JSON.parse(value).state==='succeeded',15000);
  const operationDownload=await fetch(`${baseUrl}/api/entries/${entry.id}/download?path=created%2Fworker-copy.bin`,{headers:{cookie}});expect(operationDownload.status).toBe(200);expect(Buffer.from(await operationDownload.arrayBuffer()).equals(Buffer.from([0,1,128,255]))).toBe(true);
  const repeatedOperation=await fetch(`${baseUrl}/api/operations`,{method:'POST',headers:{...uploadHeaders,'content-type':'application/json'},body:JSON.stringify(operationInput)});expect(repeatedOperation.status).toBe(200);expect(await repeatedOperation.json()).toMatchObject({id:operationId,state:'succeeded'});
  const expiredUpload = await stageUpload('upload-expired.bin');
  const archiveId=randomUUID(),archiveInput={id:archiveId,kind:'archive',sources:[{entryId:entry.id,path:'restored.bin',version:(await metadata('restored.bin')).version}],conflict:'stop'};
  expect((await fetch(`${baseUrl}/api/operations`,{method:'POST',headers:{...uploadHeaders,'content-type':'application/json'},body:JSON.stringify(archiveInput)})).status).toBe(200);
  await eventually(async()=>JSON.stringify(await(await fetch(`${baseUrl}/api/operations/${archiveId}`,{headers:{cookie}})).json()),value=>JSON.parse(value).state==='succeeded',15000);
  const archiveDownload=await fetch(`${baseUrl}/api/operations/${archiveId}/artifact`,{headers:{cookie}});expect(archiveDownload.status).toBe(200);expect(archiveDownload.headers.get('content-type')).toContain('application/zip');expect(Buffer.from(await archiveDownload.arrayBuffer()).subarray(0,4).equals(Buffer.from([0x50,0x4b,3,4]))).toBe(true);
  await project.node('worker',`import{openDatabase,parseDatabaseConfig}from'./apps/server/dist/index.js';const db=openDatabase(parseDatabaseConfig());try{db.sqlite.prepare('UPDATE operation_artifacts SET expires_at=0 WHERE operation_id=?').run('${archiveId}')}finally{db.close()}`);
  await eventually(()=>project.node('worker',`import{openDatabase,parseDatabaseConfig}from'./apps/server/dist/index.js';const db=openDatabase(parseDatabaseConfig());try{console.log(db.sqlite.prepare('SELECT cleaned FROM operation_artifacts WHERE operation_id=?').get('${archiveId}').cleaned)}finally{db.close()}`),value=>value==='1',15000);expect((await fetch(`${baseUrl}/api/operations/${archiveId}/artifact`,{headers:{cookie}})).status).toBe(404);
  await project.node('worker', `import{openDatabase,parseDatabaseConfig}from'./apps/server/dist/index.js';const db=openDatabase(parseDatabaseConfig());try{db.sqlite.prepare('UPDATE upload_sessions SET expires_at=0 WHERE id=?').run('${expiredUpload}')}finally{db.close()}`);
  await eventually(() => project.node('worker', `import{openDatabase,parseDatabaseConfig}from'./apps/server/dist/index.js';const db=openDatabase(parseDatabaseConfig());try{console.log(db.sqlite.prepare('SELECT cleaned FROM upload_sessions WHERE id=?').get('${expiredUpload}').cleaned)}finally{db.close()}`), (value) => value === '1', 15000);
  expect((await fetch(`${baseUrl}/api/entries/${entry.id}/metadata?path=upload-expired.bin`, { headers: { cookie } })).status).toBe(404);
  const logout = await fetch(`${baseUrl}/api/session`, { method: 'DELETE', headers: { cookie, origin: 'http://127.0.0.1:8080', 'x-csrf-token': session.csrfToken } });
  expect(logout.status).toBe(204);
  const replay = await fetch(`${baseUrl}/api/session`, { headers: { cookie } });
  expect(replay.status).toBe(401);
  await replay.body?.cancel();
  const home = await fetch(baseUrl);
  expect(home.status).toBe(200);
  expect(home.headers.get('content-type')).toContain('text/html');
  expect(home.headers.get('cache-control')).toBe('no-store');
  const markup = await home.text();
  const script = markup.match(/src="(\/assets\/[^"/]+\.js)"/)?.[1];
  if (!script) throw new Error('正式 image 缺少 SPA script');
  const asset = await fetch(`${baseUrl}${script}`);
  expect(asset.status).toBe(200);
  expect(asset.headers.get('cache-control')).toContain('immutable');
  for (const role of ['api', 'worker']) {
    expect(JSON.parse(await project.node(role, diagnostics))).toMatchObject({ node: 'v24.22.1', uid: 1000, gid: 1000, sqliteVersion: '3.53.4', journalMode: 'wal', foreignKeys: 1, synchronous: 2, walAutoCheckpoint: 1000 });
  }
  expect(await project.node('api', `import{existsSync}from'node:fs';console.log(JSON.stringify(['typescript','vitest','drizzle-kit','@filehub/contracts'].map(n=>[n,existsSync('apps/server/node_modules/'+n)])));`)).toBe('[["typescript",false],["vitest",false],["drizzle-kit",false],["@filehub/contracts",true]]');
  expect(await project.node('api', `import{writeFileSync}from'node:fs';try{writeFileSync('/app/forbidden','x')}catch(e){console.log(e.code)}`)).toBe('EROFS');
  await project.node('api', `import{openDatabase,parseDatabaseConfig}from'./apps/server/dist/index.js';const db=openDatabase(parseDatabaseConfig());try{db.sqlite.exec("CREATE TABLE p05_proof(value TEXT NOT NULL); INSERT INTO p05_proof VALUES ('persistent-fixture')")}finally{db.close()}`);
  expect(JSON.parse(await project.node('worker', readProof))).toEqual([{ value: 'persistent-fixture' }]);
  await project.node('api',"import{mkdir,writeFile}from'node:fs/promises';await mkdir('/data/cache/deployment');await writeFile('/data/cache/deployment/config.env','SYNTHETIC=full-snapshot');");
  await project.compose(['stop', 'api', 'worker']);
  for (const role of ['api', 'worker']) expect((await project.container(role)).State).toMatchObject({ Running: false, ExitCode: 0, OOMKilled: false });
  expect(await project.compose(['logs', '--no-color', 'worker'])).toContain('worker_stopped');
  await project.compose(['up', '-d', '--force-recreate', '--wait', '--wait-timeout', '45', 'api', 'worker']);
  expect((await project.container('api')).Id).not.toBe(api.Id);
  expect((await project.container('worker')).Id).not.toBe(worker.Id);
  expect(mount(await project.container('api'), '/data/state').Name).toBe(project.stateVolume);
  expect(JSON.parse(await project.node('worker', readProof))).toEqual([{ value: 'persistent-fixture' }]);
  await project.compose(['stop', 'api', 'worker']);
  for (const role of ['api', 'worker']) expect((await project.container(role)).State.Running).toBe(false);
  const backups = await fixture.volume();
  await project.compose(['run', '--rm', '--no-deps', '-v', `${backups}:/data/backups`, 'api', 'apps/server/dist/maintenance.js', 'backup', '/data/backups/snapshot','/data/cache/deployment','--quiesced']);
  const recovery=await fixture.volume(),restored = await fixture.project({ stateDirectory: '/data/backups/recovered/state',recoveryVolume:recovery });
  await restored.compose(['run', '--rm', '--no-deps', '-v', `${backups}:/snapshot:ro`, 'migrate', 'apps/server/dist/maintenance.js', 'restore', '/snapshot/snapshot','/data/backups/recovered','--quiesced']);
  await restored.up();
  expect(JSON.parse(await restored.node('api', readProof))).toEqual([{ value: 'persistent-fixture' }]);
  expect(JSON.parse(await restored.node('worker', diagnostics))).toMatchObject({ sqliteVersion: '3.53.4', journalMode: 'wal' });
  expect(await restored.node('api',"import{readFile}from'node:fs/promises';console.log(await readFile('/data/backups/recovered/config/config.env','utf8'))")).toBe('SYNTHETIC=full-snapshot');
  const restoredPort=(await restored.container('api')).NetworkSettings.Ports['3000/tcp']?.[0]?.HostPort,restoredUrl=`http://127.0.0.1:${restoredPort}`;
  const restoredLogin=await fetch(`${restoredUrl}/api/session`,{method:'POST',headers:{origin:'http://127.0.0.1:8080','content-type':'application/json'},body:JSON.stringify({username:'admin',password:'Synthetic-container-password-123!'})});expect(restoredLogin.status).toBe(200);await restoredLogin.body?.cancel();const restoredCookie=restoredLogin.headers.get('set-cookie')?.split(';')[0];if(!restoredCookie)throw new Error('還原缺少 session');const restoredFile=await fetch(`${restoredUrl}/api/entries/${entry.id}/download?path=restored.bin`,{headers:{cookie:restoredCookie}});expect(restoredFile.status).toBe(200);expect(Buffer.from(await restoredFile.arrayBuffer())).toEqual(Buffer.from([0,1,128,255]));
  console.info(JSON.stringify({ imageId: api.Image, stateFilesystem: 'ext4', restored: true, node: '24.22.1', sqlite: '3.53.4' }));
});

test('migration 失敗會阻止 API 與 worker 啟動，不能用舊的成功紀錄放行', async () => {
  const fixture = await composeFixture();
  const project = await fixture.project();
  await project.compose(['up', '--no-deps', '--exit-code-from', 'migrate', 'migrate']);
  await project.compose(['run', '--rm', '--no-deps', 'migrate', '--input-type=module', '-e', `import{openDatabase,parseDatabaseConfig}from'./apps/server/dist/index.js';const db=openDatabase(parseDatabaseConfig());db.sqlite.exec('UPDATE schema_state SET revision=999');db.close()`]);
  await expect(project.up()).rejects.toThrow();
  expect((await project.container('migrate')).State).toMatchObject({ Status: 'exited', ExitCode: 1 });
  for (const role of ['api', 'worker']) expect((await project.container(role)).State).toMatchObject({ Status: 'created', Running: false });
});

test('worker 真實程序 SIGSTOP 後 heartbeat 過期會 unhealthy；恢復與 SIGTERM 正常收尾', async () => {
  const fixture = await composeFixture();
  const project = await fixture.project();
  await project.up();
  const worker = await project.container('worker');
  await docker(['kill', '--signal=SIGSTOP', worker.Id]);
  try {
    await eventually(() => project.container('worker'), (current) => current.State.Health?.Status === 'unhealthy');
    expect((await project.container('api')).State.Health?.Status).toBe('healthy');
  } finally { await docker(['kill', '--signal=SIGCONT', worker.Id]); }
  await eventually(() => project.container('worker'), (current) => current.State.Health?.Status === 'healthy');
  await project.compose(['stop', 'worker']);
  expect((await project.container('worker')).State).toMatchObject({ Running: false, ExitCode: 0 });
});

test('Linux 外部目錄兩服務同路徑／同身份；唯讀、讀寫及既有目錄權限失敗符合預期', async () => {
  const fixture = await composeFixture();
  const external = await fixture.volume();
  // root helper 僅準備本次測試的獨立 volume，不碰使用者目錄。
  await fixture.prepareVolume(external, `import{writeFileSync,chownSync,chmodSync}from'node:fs';chownSync('/fixture',1000,1000);chmodSync('/fixture',0o700);writeFileSync('/fixture/existing','fixture');chownSync('/fixture/existing',1000,1000)`);
  const source = (JSON.parse(await docker(['volume', 'inspect', external])) as { Mountpoint: string }[])[0]?.Mountpoint;
  if (!source) throw new Error('找不到測試外部 volume');
  const readonly = await fixture.project({ externalSource: source });
  await readonly.up();
  for (const role of ['api', 'worker']) {
    expect(mount(await readonly.container(role), '/mounts/example')).toMatchObject({ Type: 'bind', Source: source, RW: false });
    expect(await readonly.node(role, `import{readFileSync,writeFileSync}from'node:fs';console.log(readFileSync('/mounts/example/existing','utf8'));try{writeFileSync('/mounts/example/denied','x')}catch(e){console.log(e.code)}`)).toBe('fixture\nEROFS');
  }
  await readonly.compose(['stop', 'api', 'worker']);
  const writable = await fixture.project({ externalSource: source, externalReadOnly: false });
  await writable.up();
  await writable.node('api', `import{writeFileSync}from'node:fs';writeFileSync('/mounts/example/shared','api')`);
  expect(await writable.node('worker', `import{readFileSync,appendFileSync}from'node:fs';appendFileSync('/mounts/example/shared','+worker');console.log(readFileSync('/mounts/example/shared','utf8'))`)).toBe('api+worker');
  await fixture.prepareVolume(external, `import{chownSync}from'node:fs';chownSync('/fixture',2000,2000)`);
  for (const role of ['api', 'worker']) expect(await writable.node(role, `import{readFileSync}from'node:fs';try{readFileSync('/mounts/example/existing')}catch(e){console.log(e.code)}`)).toBe('EACCES');
});
