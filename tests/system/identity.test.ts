import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { childEnvironment } from '../helpers/environment.js';
import { systemFixture } from './fixtures.js';

const exec = promisify(execFile);
const cli = fileURLToPath(new URL('../../apps/server/dist/cli.js', import.meta.url));
const password = '測試用-stdin-only-password-123!';

test('真實 CLI stdin 建帳號／改密碼，另一個 API 程序的舊 session 立即失效且不輸出秘密', async () => {
  const fixture = await systemFixture();
  fixture.migrate();
  const admin = async (args: string[], secret: string) => {
    const execution = exec(process.execPath, [cli, ...args], {
      cwd: fixture.directory, env: childEnvironment({ FILEHUB_STATE_DIR: fixture.config.stateDirectory }),
      windowsHide: true, timeout: 8000, maxBuffer: 65_536,
    });
    const payload = Buffer.from(JSON.stringify({ password: secret }));
    execution.child.stdin?.write(payload.subarray(0, 15));
    await new Promise((resolve) => setTimeout(resolve, 1000));
    execution.child.stdin?.end(payload.subarray(15));
    const output = await execution;
    expect(output.stdout).toContain('管理操作已完成');
    expect(output.stdout + output.stderr).not.toContain(secret);
    expect(output.stderr).toBe('');
  };
  await admin(['bootstrap', 'admin'], password);
  const api = await fixture.startService('api');
  const started = await api.waitForMessage((message) => message.type === 'started');
  if (typeof started.address !== 'string') throw new Error('missing API');
  const url = started.address;
  const login = await fetch(`${url}/api/session`, { method: 'POST', headers: { origin: url, 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin', password }) });
  expect(login.status).toBe(200);
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  if (!cookie) throw new Error('missing cookie');
  await login.body?.cancel();
  const current = await fetch(`${url}/api/session`, { headers: { cookie } });
  expect(current.status).toBe(200);
  await current.body?.cancel();
  await admin(['user-password', 'admin'], 'Different-synthetic-stdin-password!');
  const replay = await fetch(`${url}/api/session`, { headers: { cookie } });
  expect(replay.status).toBe(401);
  await replay.body?.cancel();
  const stopped = await api.request('stop');
  expect(stopped.databaseClosed).toBe(true);
  expect(await api.waitForExit()).toEqual({ code: 0, signal: null });
  expect(api.output()).toEqual({ stdout: '', stderr: '' });
});
