import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { setTimeout, clearTimeout } from 'node:timers';

const root = fileURLToPath(new URL('../', import.meta.url));
const metadata = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
if (!metadata || typeof metadata.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(metadata.version)) throw new Error('無效 image 版本');
const child = spawn('docker', ['compose', '--env-file', '.env.example', 'build', 'migrate'], {
  cwd: root, windowsHide: true, stdio: 'inherit', env: { ...process.env, FILEHUB_IMAGE: `filehub:${metadata.version}` },
});
const timer = setTimeout(() => child.kill('SIGKILL'), 15 * 60_000);
child.once('error', () => { clearTimeout(timer); console.error('無法啟動 Docker image 建置。'); process.exitCode = 1; });
child.once('close', (code) => { clearTimeout(timer); process.exitCode = code ?? 1; });
