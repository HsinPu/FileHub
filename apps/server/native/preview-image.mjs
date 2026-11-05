import process from 'node:process';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import sharp from 'sharp';

// 只從 stdin 接受已授權原檔 bytes，沒有使用者 path、URL 或 shell 參數。
sharp.cache(false); sharp.concurrency(1);
const started = performance.now();
try {
  const parts = []; let length = 0;
  for await (const chunk of process.stdin) {
    length += chunk.length;
    if (length > 16 * 1024 * 1024) throw new Error();
    parts.push(chunk);
  }
  const bytes = Buffer.concat(parts, length);
  if (process.argv[3] && createHash('sha256').update(bytes).digest('hex') !== process.argv[3]) throw new Error();
  const input = sharp(bytes, { limitInputPixels: 16_000_000, limitInputChannels: 4, failOn: 'warning', pages: 1, animated: false, ignoreIcc: true });
  const metadata = await input.metadata();
  if (!['jpeg', 'png', 'webp'].includes(metadata.format) || metadata.depth !== 'uchar' || !metadata.width || !metadata.height || metadata.width * metadata.height > 16_000_000 || (metadata.pages ?? 1) > 1) throw new Error();
  const size = process.argv[2] === 'thumb' ? 256 : 1600;
  const output = await input.rotate().resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true }).toColourspace('srgb').flatten({ background: '#ffffff' }).jpeg({ quality: 80 }).timeout({ seconds: 2 }).toBuffer();
  if (output.length > (size === 256 ? 262144 : 4194304)) throw new Error();
  process.stdout.write(output);
  if (process.env.FILEHUB_PREVIEW_MEASURE === '1') process.stderr.write(JSON.stringify({ elapsedMs: Math.ceil(performance.now() - started), ...process.resourceUsage() })+'\n');
} catch { process.exitCode = 1; }
