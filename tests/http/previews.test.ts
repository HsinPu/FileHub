import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { request } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { expect, onTestFinished, test } from 'vitest';
import { buildApp, closeApp, listenApp, parseConfig, migrateDatabase, openDatabase, IdentityService, EntryService, FileService } from '@filehub/server';
import { temporaryDirectory } from './fixtures.js';
import { png } from '../helpers/preview-data.js';

test('真實 TCP 預覽在讀取期間斷線，fd admission 關閉且下一次可用', async () => {
  const directory = await temporaryDirectory();
  const config = parseConfig({ FILEHUB_STATE_DIR: join(directory, 'state'), FILEHUB_PORT: '0', FILEHUB_LOG_LEVEL: 'silent' });
  migrateDatabase(config); const db = openDatabase(config); onTestFinished(() => db.close());
  const identity = new IdentityService(db); await identity.bootstrap('admin', 'Synthetic-preview-tcp-password-123!');
  const root = join(directory, 'files'); await mkdir(root); await writeFile(join(root, 'image.png'), png(4000, 4000));
  const entries = new EntryService(db), entry = await entries.register('managed', '預覽', root), files = new FileService(entries);
  const app = buildApp({ config, dependencies: { identity, entries, files } }); onTestFinished(() => closeApp(app, 2000));
  const address = await listenApp(app, config);
  const login = await fetch(`${address}/api/session`, { method: 'POST', headers: { origin: address, 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'Synthetic-preview-tcp-password-123!' }) });
  await login.arrayBuffer(); const cookie = login.headers.get('set-cookie')?.split(';')[0]; if (!cookie) throw new Error('missing fixture cookie');
  const url = `${address}/api/entries/${entry.id}/preview/content?path=image.png`;
  const call = request(url, { headers: { cookie }, agent: false }); const closed = new Promise<void>((resolve) => call.once('close', resolve));
  call.on('error', () => undefined); call.setTimeout(8000, () => call.destroy()); call.end();
  try { await expect.poll(() => files.activeRequests, { interval: 5, timeout: 5000 }).toBeGreaterThan(0); }
  finally { call.destroy(); await closed; }
  await expect.poll(() => files.activeRequests, { timeout: 5000 }).toBe(0);
  let done = false, renderError: unknown; const latencies: number[] = [];
  const rendering = fetch(url, { headers: { cookie }, signal: AbortSignal.timeout(8000) }).then(async (next) => { expect(next.status).toBe(200); expect(new Uint8Array(await next.arrayBuffer()).subarray(0, 3)).toEqual(new Uint8Array([255,216,255])); }).catch((error: unknown) => { renderError = error; }).finally(() => { done = true; });
  try {
    do {
      const started = performance.now(), live = await fetch(`${address}/health/live`, { signal: AbortSignal.timeout(2000) }); await live.arrayBuffer();
      expect(live.status).toBe(200); latencies.push(performance.now() - started); await delay(10);
    } while (!done && latencies.length < 100);
  } finally { await rendering; }
  if (renderError) throw renderError;
  process.stdout.write(`${JSON.stringify({ measurement: 'preview-live-16mp', platform: process.platform, samples: latencies.length, maxLiveMs: Math.ceil(Math.max(...latencies)) })}\n`);
  await expect.poll(() => files.activeRequests, { timeout: 5000 }).toBe(0);
});
