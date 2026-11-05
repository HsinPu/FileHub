import { mkdir, open } from 'node:fs/promises';
import { join } from 'node:path';
import { Agent, request, type IncomingMessage, type IncomingHttpHeaders } from 'node:http';
import { expect, onTestFinished, test } from 'vitest';
import { buildApp, closeApp, listenApp, parseConfig, migrateDatabase, openDatabase, IdentityService, EntryService, FileService } from '@filehub/server';
import { temporaryDirectory } from './fixtures.js';

test('真實 TCP 下載中斷後關閉 reader／handle，HEAD 不啟動殘留串流', async () => {
  const directory = await temporaryDirectory();
  const config = parseConfig({ FILEHUB_STATE_DIR: join(directory, 'state'), FILEHUB_PORT: '0', FILEHUB_LOG_LEVEL: 'silent' });
  migrateDatabase(config); const db = openDatabase(config); onTestFinished(() => db.close());
  const identity = new IdentityService(db); await identity.bootstrap('admin', 'Synthetic-tcp-password-123!');
  const root = join(directory, 'files'); await mkdir(root);
  const data = await open(join(root, 'large.bin'), 'w');
  try { await data.truncate(128 * 1024 * 1024); } finally { await data.close(); }
  const entries = new EntryService(db); const entry = await entries.register('managed', '下載', root);
  const files = new FileService(entries);
  const app = buildApp({ config, dependencies: { identity, entries, files } });
  onTestFinished(() => closeApp(app, 2000));
  const url = await listenApp(app, config);
  const agent = new Agent({ keepAlive: false });
  const send = (method: string, target: string, headers: Record<string, string>, body?: string) => new Promise<{ status: number; headers: IncomingHttpHeaders }>((resolve, reject) => {
    const call = request(target, { method, headers, agent }, (response) => {
      response.resume();
      response.once('end', () => resolve({ status: response.statusCode ?? 0, headers: response.headers }));
      response.once('error', reject);
    });
    call.once('error', reject);
    call.setTimeout(8000, () => call.destroy(new Error('TCP fixture timeout')));
    call.end(body);
  });
  try {
    const payload = JSON.stringify({ username: 'admin', password: 'Synthetic-tcp-password-123!' });
    const login = await send('POST', `${url}/api/session`, { origin: url, 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(payload)) }, payload);
    expect(login.status).toBe(200);
    const cookie = login.headers['set-cookie']?.[0]?.split(';')[0]; if (!cookie) throw new Error('missing cookie');
    const path = `${url}/api/entries/${entry.id}/download?path=large.bin`;
    const response = await new Promise<IncomingMessage>((resolve, reject) => {
      const call = request(path, { headers: { cookie }, agent }, resolve);
      call.once('error', reject); call.setTimeout(8000, () => call.destroy(new Error('TCP fixture timeout'))); call.end();
    });
    expect(response.statusCode).toBe(200);
    try {
      await new Promise<void>((resolve, reject) => {
        response.once('data', (chunk: Buffer) => {
          try { expect(chunk.byteLength).toBeGreaterThan(0); expect(files.activeRequests).toBe(1); resolve(); }
          catch (error) { reject(error); }
        });
        response.once('error', reject);
      });
    } finally { response.destroy(); }
    await expect.poll(() => files.activeRequests, { timeout: 5000 }).toBe(0);
    const head = await send('HEAD', path, { cookie, range: 'bytes=0-1' });
    expect(head.status).toBe(200);
    expect(head.headers['content-length']).toBe(String(128 * 1024 * 1024));
    await expect.poll(() => files.activeRequests, { timeout: 5000 }).toBe(0);
  } finally { agent.destroy(); }
});
