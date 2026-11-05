import { expect, test } from 'vitest';
import { href, parseLocation } from '../../src/features/files/navigation.js';
test('設定深連結往返保留入口、中文路徑、排序、filter 及版本分頁', () => {
  const location = parseLocation(`?entry=synthetic-entry&path=${encodeURIComponent('文件/報告')}&sort=size&direction=desc&filter=report&page=2&version=${'a'.repeat(64)}&view=settings&section=storage`);
  expect(location).toMatchObject({ view: 'settings', section: 'storage', entry: 'synthetic-entry', path: '文件/報告', sort: 'size', direction: 'desc', page: 2, filter: 'report' });
  expect(parseLocation(href(location).slice(1))).toEqual(location);
  const files = parseLocation(href({ ...location, view: 'files' }).slice(1));
  expect(files).toMatchObject({ view: 'files', path: location.path, page: 2, version: location.version, filter: 'report' });
  expect(href(files)).not.toContain('section');
});
test.each(['?view=unknown&section=invalid&page=2', '?view=settings&section=personal&page=-1', '?view=settings&section=accounts&page=999&version=' + 'a'.repeat(64)])('未知或無效導覽輸入有界且不繞過檔案版本規則：%s', search => {
  const location = parseLocation(search); expect(location.page).toBe(1); expect(href(location)).toMatch(/^\/\?/);
});
test('私有導覽不把分享秘密、主機路徑欄位或不相關 query 帶回 URL', () => {
  const url = href(parseLocation('?view=settings&section=personal&secret=canary&hostPath=canary&filter=' + 'x'.repeat(180)));
  expect(url).not.toContain('canary'); expect(new URLSearchParams(url.slice(2)).get('filter')).toHaveLength(128);
});

test.each(['shares','trash'] as const)('%s 管理頁保留檔案上下文且不輸出設定分類', view => {
  const location = parseLocation(`?view=${view}&entry=entry-id&path=team&sort=modifiedAt&direction=desc&filter=notes&section=accounts`);
  expect(location.view).toBe(view);
  const url = href(location); expect(url).not.toContain('section=');
  expect(parseLocation(url.slice(1))).toMatchObject({ view, entry: 'entry-id', path: 'team', sort: 'modifiedAt', direction: 'desc', filter: 'notes' });
});
