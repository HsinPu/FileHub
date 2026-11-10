import { expect, test } from 'vitest';
import { relativePath } from '../../src/storage/scoped.js';

test.each(['..', '.', '/etc/passwd', '//server/share', 'C:/outside', 'C:relative', 'a/../b', 'a/./b', 'a//b', 'a\\b', 'a\0b', 'a\nb', `${'a/'.repeat(64)}b`, 'x'.repeat(256)])('拒絕非 canonical path：%j', (value) => {
  expect(() => relativePath(value)).toThrow();
});
test('空字串代表根，Unicode 與百分號名稱不作第二次解碼或正規化', () => {
  for (const value of ['', '資料夾/檔案.txt', 'literal%2f.txt', '．．/safe']) expect(relativePath(value)).toBe(value);
});

test('本機 Windows 名稱限制與 Linux 遠端路徑分開，兩者都拒絕越界及私有 namespace', () => {
  for (const value of ['reports:2026', 'con', 'trailing.', 'reports/a?.txt']) {
    expect(relativePath(value, false, 'linux')).toBe(value);
    expect(() => relativePath(value, false, 'win32')).toThrow();
    if (process.platform === 'win32') expect(() => relativePath(value)).toThrow();
  }
  for (const platform of ['win32', 'linux'] as const) {
    for (const value of ['../outside', '.filehub/secret', 'a\\b', 'a\0b']) expect(() => relativePath(value, false, platform)).toThrow();
  }
});
