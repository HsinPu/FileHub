import { onTestFinished, expect, test } from 'vitest';
import { buildApp } from '../../src/app.js';
import { parseConfig } from '../../src/config/index.js';
import { IdentityService } from '../../src/modules/identity/service.js';
import { databaseFixture } from '../helpers/database.js';
import { runAdmin } from '../../src/cli.js';

const password = 'Synthetic-test-password-123!';
const origin = 'http://127.0.0.1:3000';

async function fixture() {
  const storage = await databaseFixture();
  storage.migrate();
  const database = storage.open();
  let now = Date.now();
  const identity = new IdentityService(database, () => now);
  const admin = await identity.bootstrap('admin', password);
  const app = buildApp({ config: parseConfig({ FILEHUB_LOG_LEVEL: 'silent' }), dependencies: { identity } });
  onTestFinished(() => app.close());
  const login = (name = 'admin', secret = password) => app.inject({ method: 'POST', url: '/api/session', headers: { origin }, payload: { username: name, password: secret } });
  return { database, identity, app, login, admin, advance: (ms: number) => { now += ms; } };
}

test('無預設帳密、只允許首次 bootstrap；密碼只存 scrypt hash', async () => {
  const f = await fixture();
  await expect(f.identity.bootstrap('another', password)).rejects.toThrow();
  const rows = f.database.sqlite.prepare('SELECT * FROM users').all();
  expect(rows).toHaveLength(1);
  expect(JSON.stringify(rows)).not.toContain(password);
  expect(JSON.stringify(rows)).toContain('scrypt');
});

test('登入、查 session、CSRF logout 及舊 Cookie 重播均由伺服器驗證', async () => {
  const f = await fixture();
  const response = await f.login();
  expect(response.statusCode).toBe(200);
  const cookie = response.cookies[0];
  expect(cookie).toMatchObject({ name: 'filehub_session', httpOnly: true, sameSite: 'Strict', path: '/' });
  if (!cookie) throw new Error('missing cookie');
  const header = `${cookie.name}=${cookie.value}`;
  const session = response.json<{ csrfToken: string; user: { username: string } }>();
  expect(session.user.username).toBe('admin');
  expect(session.csrfToken).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify(f.database.sqlite.prepare('SELECT * FROM sessions').all())).not.toContain(cookie.value);
  expect((await f.app.inject({ url: '/api/session', headers: { cookie: header } })).statusCode).toBe(200);
  const denied = await f.app.inject({ method: 'DELETE', url: '/api/session', headers: { cookie: header, origin } });
  expect(denied.statusCode).toBe(403);
  const logout = await f.app.inject({ method: 'DELETE', url: '/api/session', headers: { cookie: header, origin, 'x-csrf-token': session.csrfToken } });
  expect(logout.statusCode).toBe(204);
  expect((await f.app.inject({ url: '/api/session', headers: { cookie: header } })).statusCode).toBe(401);
});

test('登入 Origin／格式防護在驗密碼前拒絕，不建立 session', async () => {
  const f = await fixture();
  for (const unsafe of [undefined, 'null', 'https://attacker.invalid', `${origin}.attacker.invalid`]) {
    expect((await f.app.inject({ method: 'POST', url: '/api/session', headers: unsafe ? { origin: unsafe } : {}, payload: { username: 'admin', password } })).statusCode).toBe(403);
  }
  expect(f.database.sqlite.prepare('SELECT count(*) AS n FROM sessions').get()).toEqual({ n: 0 });
  expect(f.database.sqlite.prepare('SELECT count(*) AS n FROM login_throttle').get()).toEqual({ n: 0 });
});

test('固定期限 session 的並行重複查詢不 refresh、不增加 row；到期全部拒絕',async()=>{
  const f=await fixture(),login=await f.login(),cookie=login.cookies[0];if(!cookie)throw new Error('missing cookie');const headers={cookie:`${cookie.name}=${cookie.value}`},before=f.database.sqlite.prepare('SELECT * FROM sessions').all();f.advance(60_000);const reads=await Promise.all(Array.from({length:4},()=>f.app.inject({url:'/api/session',headers})));expect(reads.map(response=>response.statusCode)).toEqual([200,200,200,200]);expect(reads.every(response=>response.cookies.length===0)).toBe(true);expect(f.database.sqlite.prepare('SELECT * FROM sessions').all()).toEqual(before);f.advance(12*60*60_000);expect((await f.app.inject({url:'/api/session',headers})).statusCode).toBe(401);
});

test('未知帳號與錯密碼為相同錯誤，持久節流跨 service 生效，時間窗後可登入', async () => {
  const f = await fixture();
  expect((await f.login('missing')).json()).toMatchObject({ code: 'UNAUTHORIZED' });
  for (let i = 0; i < 5; i++) expect((await f.login('admin', 'wrong-synthetic-password')).statusCode).toBe(401);
  expect((await f.login()).statusCode).toBe(429);
  const other = new IdentityService(f.database);
  await expect(other.login('admin', password, '127.0.0.1')).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  f.advance(15 * 60_000 + 1);
  expect((await f.login()).statusCode).toBe(200);
}, 20_000);

test('到期、改密碼、停用即撤銷；不能停用最後一個管理員', async () => {
  const f = await fixture();
  await f.identity.createUser('reader', password);
  const member = await f.login('reader');
  const cookie = member.cookies[0];
  if (!cookie) throw new Error('missing cookie');
  const header = { cookie: `${cookie.name}=${cookie.value}` };
  await f.identity.changePassword('reader', 'Another-synthetic-password!');
  expect((await f.app.inject({ url: '/api/session', headers: header })).statusCode).toBe(401);
  expect((await f.login('reader')).statusCode).toBe(401);
  const current = await f.login('reader', 'Another-synthetic-password!');
  await f.identity.disableUser('reader');
  expect((await f.app.inject({ url: '/api/session', headers: { cookie: `filehub_session=${current.cookies[0]?.value}` } })).statusCode).toBe(401);
  await expect(f.identity.disableUser('admin')).rejects.toMatchObject({ code: 'CONFLICT' });
  const admin = await f.login();
  f.advance(12 * 60 * 60_000 + 1);
  expect((await f.app.inject({ url: '/api/session', headers: { cookie: `filehub_session=${admin.cookies[0]?.value}` } })).statusCode).toBe(401);
}, 20_000);

test('HTTPS origin 發 Secure Cookie；偽造 Host／重複 Cookie 不能繞過驗證', async () => {
  const f = await fixture();
  const app = buildApp({ config: parseConfig({ FILEHUB_LOG_LEVEL: 'silent', FILEHUB_PUBLIC_ORIGIN: 'https://files.example.test' }), dependencies: { identity: f.identity } });
  onTestFinished(() => app.close());
  const response = await app.inject({ method: 'POST', url: '/api/session', headers: { origin: 'https://files.example.test' }, payload: { username: 'admin', password } });
  expect(response.statusCode).toBe(200);
  expect(response.cookies[0]?.secure).toBe(true);
  const cookie = `filehub_session=${response.cookies[0]?.value}`;
  expect((await app.inject({ url: '/api/session', headers: { cookie: `${cookie}; ${cookie}` } })).statusCode).toBe(401);
  const denied = await app.inject({ method: 'POST', url: '/api/session', headers: { host: 'attacker.invalid', origin: 'https://attacker.invalid', 'x-forwarded-host': 'attacker.invalid' }, payload: { username: 'admin', password } });
  expect(denied.statusCode).toBe(403);
});

test('CLI 共用正式 DB 與撤銷規則，非法命令不讀密碼', async () => {
  const f = await fixture();
  const environment = { FILEHUB_STATE_DIR: f.identity.database.sqlite.name.replace(/[\\/]filehub\.db$/, '') };
  let reads = 0;
  const read = async () => { reads++; return password; };
  await expect(runAdmin(['unknown', 'reader'], environment, read)).rejects.toThrow();
  expect(reads).toBe(0);
  await runAdmin(['user-create', 'operator'], environment, read);
  const login = await f.login('operator');
  expect(login.statusCode).toBe(200);
  await runAdmin(['user-password', 'operator'], environment, async () => 'Changed-synthetic-password-123!');
  expect((await f.app.inject({ url: '/api/session', headers: { cookie: `filehub_session=${login.cookies[0]?.value}` } })).statusCode).toBe(401);
  await runAdmin(['user-disable', 'operator'], environment, read);
  expect((await f.login('operator', 'Changed-synthetic-password-123!')).statusCode).toBe(401);
});
