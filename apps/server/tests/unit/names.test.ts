import { expect, test } from 'vitest';
import { fileName, overlapsPath } from '../../src/storage/names.js';

test.each(['', '.', '..', '../x', 'a/b', 'a\\b', ' leading', 'trailing ', 'tail.', 'a\u0000b', 'COM1.txt', 'aux', '.FiLeHub', 'a:b', '中'.repeat(86)])('新名稱拒絕不可攜／保留／越界值 %j', (value) => {
  expect(() => fileName(value)).toThrow(expect.objectContaining({ code: 'BAD_REQUEST' }));
});
test('名稱不二次 decode 或正規化，保留 Unicode／字面百分號', () => {
  for (const value of ['報告 100%.txt', '%2e%2e', 'é.txt', 'e\u0301.txt']) expect(fileName(value)).toBe(value);
});
test('子樹重疊有 segment 邊界，入口根覆蓋所有子路徑', () => {
  expect(overlapsPath('', 'a/b')).toBe(true);
  expect(overlapsPath('a', 'a/b')).toBe(true);
  expect(overlapsPath('a/b', 'a')).toBe(true);
  expect(overlapsPath('a', 'ab')).toBe(false);
});
