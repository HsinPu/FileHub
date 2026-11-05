import { expect, test } from 'vitest';
import { relativePath } from '../../src/storage/scoped.js';

test.each(['..', '.', '/etc/passwd', '//server/share', 'C:/outside', 'C:relative', 'a/../b', 'a/./b', 'a//b', 'a\\b', 'a\0b', 'a\nb', `${'a/'.repeat(64)}b`, 'x'.repeat(256)])('拒絕非 canonical path：%j', (value) => {
  expect(() => relativePath(value)).toThrow();
});
test('空字串代表根，Unicode 與百分號名稱不作第二次解碼或正規化', () => {
  for (const value of ['', '資料夾/檔案.txt', 'literal%2f.txt', '．．/safe']) expect(relativePath(value)).toBe(value);
});
