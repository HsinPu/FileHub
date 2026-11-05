import { copyFile, mkdir, open, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test } from 'vitest';
import { systemFixture } from './fixtures.js';
import { png } from '../helpers/preview-data.js';

// 只複製有關的正式產物至自有目錄，再把其 child 換成明確故障 stub。
test('正式 renderer 對卡住 child 的期限與取消會等待 close，不關閉借用原檔', async () => {
  const f = await systemFixture();
  const root = join(f.directory, 'renderer'), modules = join(root, 'dist', 'modules', 'previews'), native = join(root, 'native'), plugins = join(root, 'dist', 'plugins');
  await mkdir(modules, { recursive: true }); await mkdir(native); await mkdir(plugins);
  await writeFile(join(root, 'package.json'), '{"type":"module"}');
  await copyFile(fileURLToPath(new URL('../../apps/server/dist/modules/previews/renderer.js', import.meta.url)), join(modules, 'renderer.js'));
  await copyFile(fileURLToPath(new URL('../../apps/server/dist/plugins/errors.js', import.meta.url)), join(plugins, 'errors.js'));
  const pidPath = join(native, 'pid');
  await writeFile(join(native, 'preview-image.mjs'), "import process from 'node:process';import{writeFileSync}from'node:fs';writeFileSync(new URL('./pid',import.meta.url),String(process.pid));process.stdin.resume();setInterval(()=>{},1000);");
  const loaded: unknown = await import(pathToFileURL(join(modules, 'renderer.js')).href);
  if (!loaded || typeof loaded !== 'object' || !('renderImage' in loaded) || typeof loaded.renderImage !== 'function') throw new Error('missing renderer');
  const render = loaded.renderImage as (file: Awaited<ReturnType<typeof open>>, size: number, variant: 'thumb', signal?: AbortSignal) => Promise<Buffer>;
  const path = join(f.directory, 'input.png'), input = png(); await writeFile(path, input); const file = await open(path);
  const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  try {
    const started = performance.now(); await expect(render(file, input.length, 'thumb')).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(performance.now() - started).toBeLessThan(6000); const oldPid = Number(await readFile(pidPath, 'utf8')); expect(alive(oldPid)).toBe(false);
    const controller = new AbortController(), running = render(file, input.length, 'thumb', controller.signal);
    const caught = expect(running).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    let pid = oldPid;
    try {
      await expect.poll(async () => { pid = Number(await readFile(pidPath, 'utf8')); return pid; }).not.toBe(oldPid);
      controller.abort(); await caught; expect(alive(pid)).toBe(false); expect((await file.stat()).isFile()).toBe(true);
    } finally { controller.abort(); await caught; }
  } finally { await file.close(); }
});
