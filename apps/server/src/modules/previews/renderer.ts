import { spawn } from 'node:child_process';
import type { FileHandle } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { PublicError } from '../../plugins/errors.js';

export const IMAGE_OUTPUT_LIMIT = 4 * 1024 * 1024;
export async function renderImage(handle: FileHandle, size: number, variant: 'preview' | 'thumb', signal?: AbortSignal, expectedHash?: string): Promise<Buffer> {
  if (signal?.aborted) throw new PublicError('SERVICE_UNAVAILABLE');
  const child = spawn(process.execPath, ['--max-old-space-size=64', '--disable-proto=throw', fileURLToPath(new URL('../../../native/preview-image.mjs', import.meta.url)), variant, ...(expectedHash ? [expectedHash] : [])], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true, env: { ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}), VIPS_CONCURRENCY: '1', LANG: 'C.UTF-8' } });
  const parts: Buffer[] = []; let length = 0, failed = false;
  // FileHandle.createReadStream().destroy() 會影響借用 handle 的生命週期；這裡只借 read。
  const reader = Readable.from((async function* () {
    let position = 0;
    while (position < size && !failed && !signal?.aborted) {
      const bytes = Buffer.alloc(Math.min(65536, size - position));
      const result = await handle.read(bytes, 0, bytes.length, position);
      if (!result.bytesRead) throw new PublicError('CONFLICT');
      position += result.bytesRead; yield bytes.subarray(0, result.bytesRead);
    }
  })(), { objectMode: false, highWaterMark: 65536 });
  const readerDone = finished(reader).catch(() => undefined);
  const stop = () => { failed = true; reader.destroy(); child.stdin.destroy(); child.kill('SIGKILL'); };
  const timer = setTimeout(stop, 3000);
  signal?.addEventListener('abort', stop, { once: true });
  const error = () => { stop(); };
  reader.on('error', error); child.stdin.on('error', error);
  child.stdout.on('data', (chunk: Buffer) => { length += chunk.length; if (length > IMAGE_OUTPUT_LIMIT) stop(); else parts.push(chunk); });
  try {
    const exit = new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
    reader.pipe(child.stdin);
    const code = await exit;
    if (failed || signal?.aborted) throw new PublicError('SERVICE_UNAVAILABLE');
    if (code !== 0 || length === 0) throw new PublicError('UNSUPPORTED_MEDIA_TYPE');
    return Buffer.concat(parts, length);
  } catch (error) { throw error instanceof PublicError ? error : new PublicError('SERVICE_UNAVAILABLE'); }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', stop); reader.destroy(); child.stdin.destroy(); child.stdout.destroy(); await readerDone; }
}
