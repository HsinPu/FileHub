import { randomUUID, createHash } from 'node:crypto';
import { mkdir, stat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Agent, request } from 'node:http';
import { expect, onTestFinished, test } from 'vitest';
import { UPLOAD_LIMITS } from '@filehub/contracts';
import { buildApp, closeApp, listenApp, parseConfig, migrateDatabase, openDatabase, IdentityService, EntryService, MutationService, UploadService } from '@filehub/server';
import { temporaryDirectory } from './fixtures.js';

test('真實 TCP chunk 中斷回復 offset、關閉 handles，再續傳／finalize 驗 bytes', async () => {
  const directory = await temporaryDirectory(), config = parseConfig({ FILEHUB_STATE_DIR: join(directory, 'state'), FILEHUB_PORT: '0', FILEHUB_LOG_LEVEL: 'silent' });
  migrateDatabase(config); const db = openDatabase(config); onTestFinished(() => db.close());
  const identity = new IdentityService(db); await identity.bootstrap('admin', 'Synthetic-upload-tcp-password-2026!');
  const root = join(directory, 'files'); await mkdir(root);
  const entries = new EntryService(db), entry = await entries.register('managed', 'TCP receiver', root);
  const mutations = new MutationService(db, entries), uploads = new UploadService(db, entries, mutations);
  onTestFinished(async () => { await uploads.close(); await mutations.close(); });
  const app = buildApp({ config, dependencies: { identity, entries, mutations, uploads } }); onTestFinished(() => closeApp(app, 2000));
  const url = await listenApp(app, config), agent = new Agent({ keepAlive: false }); onTestFinished(() => agent.destroy());
  const login = await identity.login('admin', 'Synthetic-upload-tcp-password-2026!', '127.0.0.1');
  const headers = { cookie: `filehub_session=${login.token}`, origin: url, 'x-csrf-token': login.session.csrfToken };
  const send = (method: string, path: string, extra: Record<string, string> = {}, bytes?: Buffer) => new Promise<{ status: number; body: string }>((resolve, reject) => {
    const call = request(`${url}${path}`, { method, headers: { ...headers, ...extra }, agent }, (response) => {
      const chunks: Buffer[] = []; response.on('data', (chunk: Buffer) => chunks.push(chunk)); response.once('error', reject);
      response.once('end', () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString() }));
    }); call.once('error', reject); call.setTimeout(8000, () => call.destroy(new Error('owned TCP fixture timeout'))); call.end(bytes);
  });
  const id = randomUUID(), bytes = Buffer.alloc(UPLOAD_LIMITS.chunkBytes, 0x61), checksum = createHash('sha256').update(bytes).digest('hex');
  const input = Buffer.from(JSON.stringify({ id, parent: '', name: 'TCP.bin', size: bytes.length, sha256: checksum }));
  const createPath = `/api/entries/${entry.id}/uploads`;
  if (process.platform !== 'linux') { expect((await send('POST', createPath, { 'content-type': 'application/json' }, input)).status).toBe(403); return; }
  await entries.setWritable(entry.id, true);
  expect((await send('POST', createPath, { 'content-type': 'application/json' }, input)).status).toBe(200);
  const chunkHeaders = { 'content-type': 'application/octet-stream', 'content-length': String(bytes.length), 'x-upload-offset': '0', 'x-upload-checksum': checksum };
  const path = `/api/uploads/${id}/content`, payload = join(root, '.filehub', 'staging', `u-${id}`);
  const interrupted = request(`${url}${path}`, { method: 'PUT', headers: { ...headers, ...chunkHeaders }, agent }, (response) => response.resume()); interrupted.on('error', () => {});
  try {
    interrupted.write(bytes.subarray(0, 65_536));
    await expect.poll(async () => { try { return (await stat(payload)).size; } catch { return 0; } }).toBeGreaterThan(0);
    expect(uploads.activeRequests).toBe(1); expect(uploads.get(login.session.user.id, id).offset).toBe(0);
  } finally { interrupted.destroy(); }
  await expect.poll(() => uploads.activeRequests).toBe(0);
  expect(uploads.get(login.session.user.id, id)).toMatchObject({ state: 'open', offset: 0, chunks: [] }); expect((await stat(payload)).size).toBe(0);
  expect((await send('PUT', path, chunkHeaders, bytes)).status).toBe(200);
  expect((await send('PUT', path, { ...chunkHeaders, 'x-upload-offset': '1' }, bytes)).status).toBe(409);
  expect((await send('PUT', path, { ...chunkHeaders, 'x-upload-checksum': '0'.repeat(64) }, bytes)).status).toBe(409);
  expect((await send('POST', `/api/uploads/${id}/finalize`)).status).toBe(200);
  expect((await readFile(join(root, 'TCP.bin'))).equals(bytes)).toBe(true);
  expect((await send('POST', `/api/uploads/${id}/finalize`)).status).toBe(200);
});
