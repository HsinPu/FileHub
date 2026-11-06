import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, onTestFinished, test } from 'vitest';
import { buildApp } from '../../src/app.js';
import { parseConfig } from '../../src/config/index.js';
import { databaseFixture } from '../helpers/database.js';

async function webFixture() {
  const fixture = await databaseFixture();
  const webRoot = join(fixture.directory, 'web');
  await mkdir(join(webRoot, 'assets'), { recursive: true });
  await writeFile(join(webRoot, 'index.html'), '<!doctype html><html lang="zh-Hant"><title>FileHub fixture</title></html>');
  await writeFile(join(webRoot, 'assets', 'app-test.js'), 'console.log("fixture");');
  await writeFile(join(fixture.directory, 'private.txt'), 'private-secret');
  const app = buildApp({ config: parseConfig({ FILEHUB_LOG_LEVEL: 'silent' }), webRoot });
  onTestFinished(() => app.close());
  return { app, fixture, webRoot };
}

test('SPA 與 assets 由 API 同源提供，HTML 不快取，hash assets 可快取；HEAD 不回 body', async () => {
  const { app } = await webFixture();
  const html = await app.inject('/');
  expect(html.statusCode).toBe(200);
  expect(html.headers['content-type']).toMatch(/text\/html/);
  expect(html.headers['cache-control']).toBe('no-store');
  expect(html.headers['x-content-type-options']).toBe('nosniff');
  expect(html.body).toContain('FileHub fixture');
  expect((await app.inject('/index.html')).statusCode).toBe(200);
  const script = await app.inject('/assets/app-test.js');
  expect(script.statusCode).toBe(200);
  expect(script.headers['cache-control']).toContain('immutable');
  const head = await app.inject({ method: 'HEAD', url: '/' });
  expect(head.statusCode).toBe(200);
  expect(head.body).toBe('');
});

test('/FileHub 前綴轉址保留 query，提供 SPA、資產與 API 路由', async () => {
  const { app } = await webFixture();
  const redirect = await app.inject('/FileHub?view=status');
  expect(redirect.statusCode).toBe(308);
  expect(redirect.headers.location).toBe('/FileHub/?view=status');
  const html = await app.inject('/FileHub/?view=status');
  expect(html.statusCode).toBe(200);
  expect(html.body).toContain('FileHub fixture');
  expect((await app.inject('/FileHub/assets/app-test.js')).headers['cache-control']).toContain('immutable');
  expect((await app.inject('/FileHub/health/live')).json()).toEqual({ status: 'ok' });
  for (const url of ['/FileHub/api/missing', '/FileHub/assets/%2e%2e/private.txt', '/FileHub-other/']) {
    const response = await app.inject(url);
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'NOT_FOUND' });
  }
});

test.each(['/api/missing', '/health/missing', '/assets/missing.js', '/src/main.tsx', '/@vite/client', '/.env', '/filehub.db', '/private.txt', '/assets/../private.txt', '/assets/%2e%2e/private.txt'])('未知 API／檔案 %s 不被 SPA fallback 吞掉，也不洩漏來源目錄', async (url) => {
  const { app } = await webFixture();
  const response = await app.inject({ url, headers: { accept: 'text/html' } });
  expect(response.statusCode).toBe(404);
  expect(response.headers['content-type']).toMatch(/application\/json/);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.json()).toMatchObject({ code: 'NOT_FOUND' });
  expect(response.body).not.toContain('private-secret');
  expect(response.body).not.toContain('FileHub fixture');
});

test('web build 缺少 index 時啟動失敗，不以 API ready 假裝完整產物可用', async () => {
  const fixture = await databaseFixture();
  const app = buildApp({ config: parseConfig({ FILEHUB_LOG_LEVEL: 'silent' }), webRoot: join(fixture.directory, 'missing') });
  onTestFinished(() => app.close());
  await expect(app.ready()).rejects.toThrow();
});
