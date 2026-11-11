import { randomUUID } from 'node:crypto';
import { createServer, type ServerResponse } from 'node:http';
import { expect, onTestFinished, test } from 'vitest';
import { databaseFixture } from '../helpers/database.js';
import { IdentityService } from '../../src/modules/identity/service.js';
import { parseRemoteSources } from '../../src/modules/remotes/config.js';
import { RemoteService } from '../../src/modules/remotes/service.js';
import { publicCookieName } from '../../src/modules/shares/routes.js';

const version = 'a'.repeat(64), modifiedAt = '2026-11-10T00:00:00.000Z';
const resource = (path: string, kind: 'file' | 'directory' = 'directory') => ({
  name: path.split('/').at(-1) ?? '', path, kind, size: kind === 'directory' ? null : 10,
  modifiedAt, version, canBrowse: kind === 'directory', canDownload: kind === 'file',
});
function send(response: ServerResponse, value: unknown, status = 200) {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(value));
}

async function fixture(rootNames = ['reports:2026', 'con', 'trailing.']) {
  const storage = await databaseFixture();
  storage.migrate();
  const database = storage.open(), user = await new IdentityService(database).bootstrap('admin', 'Synthetic-remote-service-123!');
  const shareId = randomUUID(), cookieName = publicCookieName(shareId);
  let accesses = 0;
  const paths: string[] = [], held: ServerResponse[] = [];
  let hold = false, override: unknown;
  let accessGate: Promise<undefined> | undefined;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.pathname.endsWith('/access')) {
      const cookie = (++accesses === 1 ? 'A' : 'B').repeat(43);
      await accessGate;
      if (response.destroyed) return;
      response.setHeader('set-cookie', cookieName + '=' + cookie + '; HttpOnly');
      send(response, { name: 'C', kind: 'directory', passwordProtected: false, expiresAt: new Date(Date.now() + 86400000).toISOString() });
      return;
    }
    const path = url.searchParams.get('path') ?? '';
    paths.push(path);
    if (hold) { held.push(response); return; }
    if (override !== undefined) { send(response, override); return; }
    if (url.pathname.endsWith('/resource')) { send(response, resource(path)); return; }
    const items = path ? [resource(path + '/a?.txt', 'file')] : rootNames.map(name => resource(name));
    send(response, { path, version, items, total: items.length, offset: 0, limit: 50, hasMore: false, omitted: 0 });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  onTestFinished(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing C fixture address');
  const sourceId = randomUUID();
  const sources = parseRemoteSources({ version: 1, sources: [{
    id: sourceId, label: 'C', url: 'http://127.0.0.1:' + address.port + '/?share=' + shareId + '#' + 'S'.repeat(43),
    address: '127.0.0.1', allowHttp: true, users: [],
  }] });
  const remotes = new RemoteService(database, sources);
  onTestFinished(() => remotes.close());
  return { remotes, user, sourceId, paths, held, hold: (value: boolean) => { hold = value; }, accesses: () => accesses,
    response: (value: unknown) => { override = value; },
    holdAccess() {
      const gate = Promise.withResolvers<undefined>();
      accessGate = gate.promise;
      return () => {
        accessGate = undefined;
        gate.resolve(undefined);
      };
    },
  };
}

test('A 的作業系統不限制 C 的合法 Linux 名稱，仍在傳輸前拒絕越界及私有路徑', async () => {
  const f = await fixture(['reports:2026', 'con', 'trailing.', 'a:2026']);
  const listing = await f.remotes.list(f.user.id, f.sourceId, '', {});
  expect(listing.items.map(item => item.path)).toEqual(['reports:2026', 'con', 'trailing.', 'a:2026']);
  const nested = await f.remotes.list(f.user.id, f.sourceId, 'reports:2026', {});
  expect(nested.items[0]?.path).toBe('reports:2026/a?.txt');
  expect((await f.remotes.metadata(f.user.id, f.sourceId, 'con')).resource.path).toBe('con');
  expect((await f.remotes.list(f.user.id, f.sourceId, 'a:2026', {})).items[0]?.path).toBe('a:2026/a?.txt');
  expect((await f.remotes.metadata(f.user.id, f.sourceId, 'a:2026')).resource.path).toBe('a:2026');
  expect(f.paths).toEqual(['', 'reports:2026', 'con', 'a:2026', 'a:2026']);
  for (const path of ['../outside', '.filehub/secret']) {
    await expect(f.remotes.list(f.user.id, f.sourceId, path, {})).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  }
  expect(f.paths).toHaveLength(5);
});

test('等候 C 登入時取消一份瀏覽會釋放名額，其他瀏覽仍使用同一個登入', async () => {
  const f = await fixture();
  const releaseAccess = f.holdAccess();
  const stop = new AbortController();
  let cancellation: unknown;
  const canceled = f.remotes.list(f.user.id, f.sourceId, '', {}, stop.signal).catch((error: unknown) => { cancellation = error; });
  const waiting = Promise.allSettled(Array.from({ length: 3 }, () => f.remotes.list(f.user.id, f.sourceId, '', {})));
  try {
    await expect.poll(f.accesses).toBe(1);
    stop.abort();
    await expect.poll(() => cancellation, { timeout: 1000 }).toMatchObject({ code: 'REMOTE_UNAVAILABLE' });
    expect(f.paths).toHaveLength(0);
    const next = Promise.allSettled([f.remotes.list(f.user.id, f.sourceId, '', {})]);
    releaseAccess();
    expect([...(await waiting), ...(await next)].map(result => result.status)).toEqual(Array(4).fill('fulfilled'));
    expect(f.accesses()).toBe(1);
    expect(f.paths).toHaveLength(4);
  } finally {
    releaseAccess();
    await canceled;
    await waiting;
  }
});

test('已取消的瀏覽不啟動 C 登入', async () => {
  const f = await fixture();
  await expect(f.remotes.list(f.user.id, f.sourceId, '', {}, AbortSignal.abort())).rejects.toMatchObject({ code: 'REMOTE_UNAVAILABLE' });
  expect(f.accesses()).toBe(0);
});

test('晚到的舊 C session 拒絕不清除已更新的 session，並行登入只建立一次', async () => {
  const f = await fixture();
  await Promise.all([f.remotes.list(f.user.id, f.sourceId, '', {}), f.remotes.list(f.user.id, f.sourceId, '', {})]);
  expect(f.accesses()).toBe(1);
  f.hold(true);
  const first = expect(f.remotes.list(f.user.id, f.sourceId, '', {})).rejects.toMatchObject({ code: 'REMOTE_UNAVAILABLE' });
  const stale = expect(f.remotes.list(f.user.id, f.sourceId, '', {})).rejects.toMatchObject({ code: 'REMOTE_UNAVAILABLE' });
  await expect.poll(() => f.held.length).toBe(2);
  const [firstResponse, staleResponse] = f.held;
  if (!firstResponse || !staleResponse) throw new Error('Missing held C responses');
  send(firstResponse, {}, 401);
  await first;
  f.hold(false);
  await f.remotes.list(f.user.id, f.sourceId, '', {});
  expect(f.accesses()).toBe(2);
  send(staleResponse, {}, 401);
  await stale;
  await f.remotes.list(f.user.id, f.sourceId, '', {});
  expect(f.accesses()).toBe(2);
});

test('C 回傳越界項目或錯誤分頁時不發布清單', async () => {
  const f = await fixture();
  const listing = { path: '', version, items: [resource('safe')], total: 1, offset: 0, limit: 50, hasMore: false, omitted: 0 };
  for (const value of [
    { ...listing, items: [resource('../outside')] },
    { ...listing, items: [resource('.filehub')] },
    { ...listing, items: [{ ...resource('safe'), path: 'other/safe' }] },
    { ...listing, offset: 1 }, { ...listing, hasMore: true },
  ]) {
    f.response(value);
    await expect(f.remotes.list(f.user.id, f.sourceId, '', {})).rejects.toMatchObject({ code: 'REMOTE_UNAVAILABLE' });
  }
});

test('同時只接受四份遠端瀏覽，關閉會中止自己的等待且拒絕新工作', async () => {
  const f = await fixture();
  await f.remotes.list(f.user.id, f.sourceId, '', {});
  f.hold(true);
  const reads = Promise.allSettled(Array.from({ length: 4 }, () => f.remotes.list(f.user.id, f.sourceId, '', {})));
  await expect.poll(() => f.held.length).toBe(4);
  await expect(f.remotes.list(f.user.id, f.sourceId, '', {})).rejects.toMatchObject({ code: 'REMOTE_UNAVAILABLE' });
  expect(f.held).toHaveLength(4);
  await f.remotes.close();
  for (const result of await reads) {
    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') expect(result.reason).toMatchObject({ code: 'REMOTE_UNAVAILABLE' });
  }
  await expect(f.remotes.list(f.user.id, f.sourceId, '', {})).rejects.toMatchObject({ code: 'REMOTE_UNAVAILABLE' });
});
