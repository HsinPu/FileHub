import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import { composeFixture, image } from './compose-fixtures.js';

test('正式 A image 以私有唯讀設定瀏覽 C，C 離線時 A 保持就緒', async () => {
  const fixture = await composeFixture();
  const cImage = process.env.FILEHUB_TEST_REMOTE_IMAGE || image;
  const c = await fixture.project({ image: cImage, publicOrigin: 'http://filehub-c.test:3000', allowLanHttp: true });
  await c.up();
  const input = JSON.parse(await c.node('api', `
    import{mkdir,writeFile}from'node:fs/promises';
    import{randomBytes,randomUUID}from'node:crypto';
    import{openDatabase,parseDatabaseConfig,IdentityService,EntryService,FileService,ShareService}from'./apps/server/dist/index.js';
    const db=openDatabase(parseDatabaseConfig());
    try{
      const identity=new IdentityService(db),user=await identity.bootstrap('admin','Synthetic-compose-remote-123!');
      await mkdir('/data/files/published/nested',{recursive:true});
      await mkdir('/data/files/published/a:2026',{recursive:true});
      await writeFile('/data/files/published/nested/C-proof.txt','C canary');
      await writeFile('/data/files/published/a:2026.txt','C canary');
      await writeFile('/data/files/published/a:2026/inside.txt','C canary');
      const entries=new EntryService(db),entry=await entries.register('managed','C','/data/files'),files=new FileService(entries);
      const secret=randomBytes(32).toString('base64url'),id=randomUUID(),path='published';
      await new ShareService(db,entries,files).create(user.id,{id,secret,entryId:entry.id,path,version:(await files.metadata(user.id,entry.id,path)).resource.version,expiresAt:new Date(Date.now()+86400000).toISOString()});
      console.log(JSON.stringify({id,secret}));
    }finally{db.close();}
  `)) as { id: string; secret: string };
  const cContainer = await c.container('api');
  const address = cContainer.NetworkSettings.Networks[c.name + '_default']?.IPAddress;
  if (!address) throw new Error('C 缺少本次網路位址');
  const sourceId = randomUUID(), configVolume = await fixture.volume();
  const settings = { version: 1, sources: [{
    id: sourceId, label: 'C 的檔案',
    url: 'http://filehub-c.test:3000/FileHub/?share=' + input.id + '#' + input.secret,
    address, allowHttp: true, users: [],
  }] };
  await fixture.prepareVolume(configVolume, `
    import{writeFileSync,chownSync,chmodSync}from'node:fs';
    const path='/fixture/remote-sources.json';
    writeFileSync(path,${JSON.stringify(JSON.stringify(settings))},{mode:0o600});
    chownSync(path,1000,1000);chmodSync(path,0o600);
  `);
  const a = await fixture.project({ remoteSourcesVolume: configVolume, networkProject: c.name });
  await a.up();
  const aContainer = await a.container('api');
  expect(aContainer.Config.Image).toBe(image);
  expect(cContainer.Config.Image).toBe(cImage);
  expect(aContainer.Mounts.find(mount => mount.Destination === '/run/filehub/remote-sources.json')).toMatchObject({ RW: false });
  expect((await a.container('worker')).Mounts.some(mount => mount.Destination === '/run/filehub/remote-sources.json')).toBe(false);
  const port = aContainer.NetworkSettings.Ports['3000/tcp']?.[0]?.HostPort;
  if (!port) throw new Error('A 缺少發布埠');
  const base = 'http://127.0.0.1:' + port + '/FileHub';
  await a.node('api', `
    import{openDatabase,parseDatabaseConfig,IdentityService}from'./apps/server/dist/index.js';
    const db=openDatabase(parseDatabaseConfig());try{await new IdentityService(db).bootstrap('admin','Synthetic-compose-remote-123!')}finally{db.close()}
  `);
  const login = await fetch(base + '/api/session', { method: 'POST', headers: { origin: 'http://127.0.0.1:8080', 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'Synthetic-compose-remote-123!' }) });
  expect(login.status).toBe(200);
  await login.body?.cancel();
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  if (!cookie) throw new Error('A 缺少登入 Cookie');
  const get = (path: string) => fetch(base + path, { headers: { cookie } });
  const entryResponse = await get('/api/entries'), text = await entryResponse.text();
  expect(entryResponse.status).toBe(200);
  expect(JSON.parse(text)).toMatchObject({ entries: [{ id: sourceId, kind: 'remote', readOnly: true }] });
  expect(text).not.toContain(input.secret);
  const remote = '/api/entries/' + sourceId;
  const root = await get(remote + '/files');
  expect(root.status).toBe(200);
  expect(await root.json()).toMatchObject({ total: 3, items: [
    { path: 'a:2026', kind: 'directory' },
    { path: 'nested', kind: 'directory' },
    { path: 'a:2026.txt', kind: 'file', canDownload: false },
  ] });
  const listing = await get(remote + '/files?path=nested');
  expect(listing.status).toBe(200);
  expect(await listing.json()).toMatchObject({ items: [{ name: 'C-proof.txt', path: 'nested/C-proof.txt', canDownload: false, canWrite: false }] });
  if (cImage === image) {
    const path = new URLSearchParams({ path: 'a:2026' });
    const directory = await get(remote + '/files?' + path);
    expect(directory.status).toBe(200);
    expect(await directory.json()).toMatchObject({ path: 'a:2026', items: [{ path: 'a:2026/inside.txt' }] });
    const metadata = await get(remote + '/metadata?' + path);
    expect(metadata.status).toBe(200);
    expect(await metadata.json()).toMatchObject({ resource: { path: 'a:2026', canBrowse: true } });
  } else if (cImage === 'filehub:0.41.0') {
    const directory = await get(remote + '/files?' + new URLSearchParams({ path: 'a:2026' }));
    expect(directory.status).toBe(400);
    expect(await directory.json()).toMatchObject({ code: 'BAD_REQUEST' });
  }
  await c.compose(['stop', 'api']);
  expect((await get('/api/entries/' + sourceId + '/files')).status).toBe(503);
  expect((await get('/health/ready')).status).toBe(200);
  expect((await get('/api/session')).status).toBe(200);
});
