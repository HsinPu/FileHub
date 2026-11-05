import process from 'node:process';
import { Buffer } from 'node:buffer';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { open, writeFile, unlink } from 'node:fs/promises';
import { renderImage } from './apps/server/dist/modules/previews/renderer.js';
const sharp = createRequire(new URL('./apps/server/package.json', import.meta.url))('sharp');
const bytes = await sharp({ create: { width: 64, height: 32, channels: 3, background: '#2563eb' } }).png().toBuffer();
const path = '/tmp/filehub-preview-smoke.png'; await writeFile(path, bytes, { flag: 'wx', mode: 0o600 });
const source = await open(path, 'r');
try {
  const result = await renderImage(source, bytes.length, 'preview');
  if (!result.subarray(0, 3).equals(Buffer.from([255,216,255]))) throw new Error('invalid derivative');
  process.stdout.write(JSON.stringify({ preview: 'ok', sharp: sharp.versions.sharp, vips: sharp.versions.vips, inputBytes: bytes.length, outputBytes: result.length })+'\n');
} finally { await source.close(); await unlink(path); }
// 將此檔案內容以 node --input-type=module -e 傳給正式 image，cwd 為 /app。
