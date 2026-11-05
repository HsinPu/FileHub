import { expect, test } from 'vitest';
import { uploadRelativePath, planSelection } from '../../src/features/uploads/model.js';

test.each(['../file', '/file', 'a//b', 'a\\b', 'C:/file', 'a/./b', '.filehub/a', 'a/.FILEHUB/b', 'a/NUL.txt', 'a/trailing.', 'a/ spaced', 'a/line\nname', 'a/'.repeat(64) + 'file', '中'.repeat(86)])('folder input 拒絕不可攜／越界相對路徑 %j', (value) => { expect(() => uploadRelativePath(value)).toThrow(); });
test('保留 Unicode／百分號 literal，空檔與長中文名稱均可規劃', () => {
  const name = '中'.repeat(70) + ' 100%.txt', file = new File([], name);
  const result = planSelection([file], false, '文件');
  expect(result[0]).toMatchObject({ path: name, file }); expect(result[0]?.error).toBeUndefined();
  expect(uploadRelativePath('資料/e\u0301/é/%2e%2e.txt')).toEqual(['資料', 'e\u0301', 'é', '%2e%2e.txt']);
});
test('folder prefix、同名重複與檔案／資料夾衝突逐項回報，其他檔案保持可用', () => {
  const file = (path: string) => { const result = new File(['x'], path.split('/').at(-1) ?? 'file'); Object.defineProperty(result, 'webkitRelativePath', { value: path }); return result; };
  const results = planSelection([file('root/a'), file('root/a/b'), file('root/a'), file('root/normal.txt')], true, 'team');
  expect(results.slice(0, 3).every((item) => item.error?.includes('衝突'))).toBe(true);
  expect(results[3]).toMatchObject({ path: 'root/normal.txt' }); expect(results[3]?.error).toBeUndefined();
});
