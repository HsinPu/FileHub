import { expect, test } from 'vitest';
import { hashPassword, verifyPassword } from '../../src/modules/identity/password.js';
import { parseConfig } from '../../src/config/index.js';

test('新密碼不截斷或正規化；hash 有隨機 salt，驗證不接受損毀格式', async () => {
  for (const password of ['short', 'x'.repeat(129), 'long-password-\0-invalid']) await expect(hashPassword(password)).rejects.toThrow();
  const secret = 'Synthetic-long-password-123';
  const first = await hashPassword(secret);
  const second = await hashPassword(secret);
  expect(first).not.toBe(second);
  expect(await verifyPassword(secret, first)).toBe(true);
  expect(await verifyPassword(`${secret}x`, first)).toBe(false);
  expect(await verifyPassword(secret, 'invalid')).toBe(false);
});

test('public origin 拒絕路徑、帳密、非 loopback HTTP 與空值，不信任 proxy headers', () => {
  for (const value of ['', 'null', 'http://files.example.test', 'https://files.example.test/', 'https://user:pass@files.example.test']) {
    expect(() => parseConfig({ FILEHUB_PUBLIC_ORIGIN: value })).toThrow();
  }
  expect(parseConfig({ FILEHUB_PUBLIC_ORIGIN: 'https://files.example.test' }).publicOrigin).toBe('https://files.example.test');
});

test('KDF 不建立無界佇列，同程序超過一個即節流', async () => {
  const first = hashPassword('Synthetic-concurrency-password');
  await expect(hashPassword('Another-synthetic-password')).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  await first;
});
