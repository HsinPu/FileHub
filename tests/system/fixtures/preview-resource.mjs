// 以 node --input-type=module -e 在正式 image 的 /app 執行。
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { setTimeout, clearTimeout } from 'node:timers';
import { open, writeFile, unlink } from 'node:fs/promises';
import { renderImage } from './apps/server/dist/modules/previews/renderer.js';
const sharp = createRequire(new URL('./apps/server/package.json', import.meta.url))('sharp');
const input = await sharp({ create: { width: 4000, height: 4000, channels: 3, background: '#2563eb' } }).png().toBuffer();
const child = spawn(process.execPath, ['--max-old-space-size=64', '--disable-proto=throw', './apps/server/native/preview-image.mjs', 'thumb'], { stdio: ['pipe', 'pipe', 'pipe'], env: { VIPS_CONCURRENCY: '1', FILEHUB_PREVIEW_MEASURE: '1' } });
const output = [], diagnostic = []; let size = 0, diagnosticSize = 0;
const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
child.stdin.on('error', () => undefined);
child.stdout.on('data', (bytes) => { size += bytes.length; if (size > 4194304) child.kill('SIGKILL'); else output.push(bytes); });
child.stderr.on('data', (bytes) => { diagnosticSize += bytes.length; if (diagnosticSize > 2048) child.kill('SIGKILL'); else diagnostic.push(bytes); });
const closed = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); }); child.stdin.end(input);
let code; try { code = await closed; } finally { clearTimeout(timer); }
if (code !== 0) throw new Error('bounded decoder failed');
const metadata = await sharp(Buffer.concat(output)).metadata();
if (metadata.width !== 256 || metadata.height !== 256) throw new Error('unexpected thumbnail');
const measurement = JSON.parse(Buffer.concat(diagnostic).toString());
const path = '/tmp/filehub-preview-over-limit.png';
const bomb = await sharp({ create: { width: 4001, height: 4000, channels: 3, background: '#ffffff' } }).png().toBuffer();
await writeFile(path, bomb, { flag: 'wx', mode: 0o600 }); const source = await open(path, 'r');
const started = performance.now();
try {
  let rejected = false;
  try { await renderImage(source, bomb.length, 'thumb'); } catch (error) { rejected = error?.code === 'UNSUPPORTED_MEDIA_TYPE'; }
  if (!rejected) throw new Error('pixel bound failed');
  process.stdout.write(JSON.stringify({ pixels: 16000000, inputBytes: input.length, outputBytes: size, child: measurement, overLimitPixels: 16004000, rejected: true, rejectionMs: Math.ceil(performance.now() - started) })+'\n');
} finally { await source.close(); await unlink(path); }
