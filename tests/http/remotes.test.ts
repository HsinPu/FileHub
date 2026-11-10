import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, onTestFinished, test } from 'vitest';
import {
  buildApp, closeApp, listenApp, parseConfig, migrateDatabase, openDatabase,
  IdentityService, EntryService, FileService, ShareService, RemoteService, parseRemoteSources,
} from '@filehub/server';
import type { ListingResponse, MetadataResponse } from '@filehub/contracts';
import { temporaryDirectory } from './fixtures.js';

const password = 'Synthetic-remote-filehub-password-123!';

async function site(directory: string) {
  const config = parseConfig({ FILEHUB_STATE_DIR: join(directory, 'state'), FILEHUB_PORT: '0', FILEHUB_LOG_LEVEL: 'silent' });
  migrateDatabase(config);
  const database = openDatabase(config);
  onTestFinished(() => database.close());
  const identity = new IdentityService(database), admin = await identity.bootstrap('admin', password);
  const root = join(directory, 'files');
  await mkdir(join(root, 'published', 'nested'), { recursive: true });
  await writeFile(join(root, 'published', 'nested', '遠端文件.txt'), 'remote fixture');
  await writeFile(join(root, 'outside.txt'), 'outside canary');
  for (const name of ['alpha.txt', 'beta.txt', 'gamma.txt']) await writeFile(join(root, 'published', name), name);
  const entries = new EntryService(database), entry = await entries.register('managed', '本機資料', root);
  const files = new FileService(entries);
  let now = Date.now();
  const shares = new ShareService(database, entries, files, () => now);
  return { config, database, identity, admin, entries, entry, files, shares, root, expire: () => { now += 86400001; } };
}

async function fixture() {
  const directory = await temporaryDirectory();
  const c = await site(join(directory, 'c'));
  const cApp = buildApp({ config: c.config, dependencies: { ...c, readiness: () => true } });
  const cAddress = await listenApp(cApp, c.config);
  onTestFinished(() => closeApp(cApp, 1000));
  const secret = randomBytes(32).toString('base64url'), shareId = randomUUID();
  const input = {
    id: shareId, entryId: c.entry.id, path: 'published', secret,
    version: (await c.files.metadata(c.admin.id, c.entry.id, 'published')).resource.version,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  };
  await c.shares.create(c.admin.id, input);
  const a = await site(join(directory, 'a'));
  const sourceId = randomUUID(), shareUrl = cAddress + '/FileHub/?share=' + shareId + '#' + secret;
  const sources = parseRemoteSources({ version: 1, sources: [{ id: sourceId, label: 'C 的檔案', url: shareUrl, address: '127.0.0.1', allowHttp: true, users: ['reader'] }] });
  const remotes = new RemoteService(a.database, sources);
  const aApp = buildApp({ config: a.config, dependencies: { ...a, remotes, readiness: () => true } });
  aApp.addHook('preClose', () => remotes.close());
  const aAddress = await listenApp(aApp, a.config);
  onTestFinished(() => closeApp(aApp, 1000));
  const login = async (username = 'admin') => {
    const response = await fetch(aAddress + '/FileHub/api/session', {
      method: 'POST', headers: { origin: aAddress, 'content-type': 'application/json' }, body: JSON.stringify({ username, password }),
    });
    expect(response.status).toBe(200);
    await response.body?.cancel();
    const cookie = response.headers.get('set-cookie')?.split(';')[0];
    if (!cookie) throw new Error('Missing A session');
    return { cookie };
  };
  const headers = await login();
  const get = (path: string, auth = headers) => fetch(aAddress + '/FileHub' + path, { headers: auth });
  const base = '/api/entries/' + sourceId;
  return { a, c, cApp, cAddress, aApp, sourceId, shareId, secret, shareUrl, sources, login, get, base };
}

test('真實 B→A→C 列表與 metadata 保留路徑、分頁、篩選與版本，秘密留在 A', async () => {
  const f = await fixture();
  const entryResponse = await f.get('/api/entries'), serialized = await entryResponse.text();
  expect(JSON.parse(serialized)).toMatchObject({ entries: [{ kind: 'managed' }, { id: f.sourceId, label: 'C 的檔案', kind: 'remote', readOnly: true }] });
  for (const privateValue of [f.secret, f.shareUrl, f.c.root, f.shareId]) expect(serialized).not.toContain(privateValue);
  const first = await f.get(f.base + '/files?limit=2&sort=name&direction=asc');
  expect(first.status).toBe(200);
  const listing = await first.json() as ListingResponse;
  expect(listing).toMatchObject({ entryId: f.sourceId, path: '', scope: '', total: 4, hasMore: true, canCreate: false });
  expect(listing.items.map(item => item.name)).toEqual(['nested', 'alpha.txt']);
  expect(listing.items.every(item => !item.canDownload && !item.canWrite && !item.canCopy && !item.canShare)).toBe(true);
  const second = await f.get(f.base + '/files?' + new URLSearchParams({ offset: '2', limit: '2', version: listing.version }));
  expect(second.status).toBe(200);
  expect((await second.json() as ListingResponse).items.map(item => item.name)).toEqual(['beta.txt', 'gamma.txt']);
  const filtered = await f.get(f.base + '/files?filter=beta');
  expect((await filtered.json() as ListingResponse).items.map(item => item.name)).toEqual(['beta.txt']);
  const nested = await f.get(f.base + '/files?path=nested');
  expect((await nested.json() as ListingResponse).items[0]).toMatchObject({ path: 'nested/遠端文件.txt', canDownload: false });
  const metadata = await f.get(f.base + '/metadata?path=nested');
  expect((await metadata.json() as MetadataResponse).resource).toMatchObject({ path: 'nested', kind: 'directory', canBrowse: true });
  expect((await f.get(f.base + '/files?path=../outside')).status).toBe(400);
  expect((await f.get(f.base + '/files?path=.filehub')).status).toBe(400);
  expect((await f.get(f.base + '/download?path=alpha.txt')).status).toBe(404);
  expect((await f.get('/api/entries/' + f.a.entry.id + '/files')).status).toBe(200);
}, 20000);

test('A 帳號可見範圍與 C 撤銷獨立驗證，C 斷線與恢復保留 A session', async () => {
  const f = await fixture();
  const reader = await f.a.identity.createUser('reader', password);
  const stranger = await f.a.identity.createUser('stranger', password);
  const readerHeaders = await f.login(reader.username), strangerHeaders = await f.login(stranger.username);
  expect((await f.get(f.base + '/files', readerHeaders)).status).toBe(200);
  const strangerEntries = await f.get('/api/entries', strangerHeaders);
  expect((await strangerEntries.text())).not.toContain(f.sourceId);
  expect((await f.get(f.base + '/files', strangerHeaders)).status).toBe(404);
  await closeApp(f.cApp, 1000);
  const disconnected = await f.get(f.base + '/files');
  expect(disconnected.status).toBe(503);
  expect(await disconnected.json()).toMatchObject({ code: 'REMOTE_UNAVAILABLE' });
  expect((await f.get('/api/entries/' + f.a.entry.id + '/files')).status).toBe(200);
  expect((await f.get('/api/session')).status).toBe(200);
  const restartedConfig = { ...f.c.config, port: Number(new URL(f.cAddress).port) };
  const restarted = buildApp({ config: restartedConfig, dependencies: { ...f.c } });
  await listenApp(restarted, restartedConfig);
  onTestFinished(() => closeApp(restarted, 1000));
  expect((await f.get(f.base + '/files')).status).toBe(200);
  await f.c.shares.revoke(f.c.admin.id, f.shareId);
  const revoked = await f.get(f.base + '/files');
  expect(revoked.status).not.toBe(401);
  expect(revoked.ok).toBe(false);
  expect((await f.get('/api/session')).status).toBe(200);
}, 20000);

test('C 分享到期及 A 撤銷帳號後停止遠端瀏覽', async () => {
  const f = await fixture();
  await f.a.identity.createUser('reader', password);
  const reader = await f.login('reader');
  expect((await f.get(f.base + '/files', reader)).status).toBe(200);
  await f.a.identity.disableUser('reader');
  expect((await f.get(f.base + '/files', reader)).status).toBe(401);
  f.c.expire();
  const expired = await f.get(f.base + '/files');
  expect(expired.ok).toBe(false);
  expect(expired.status).not.toBe(401);
  expect((await f.get('/api/session')).status).toBe(200);
}, 20000);
