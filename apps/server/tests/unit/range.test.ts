import { expect, test } from 'vitest';
import { byteRange } from '../../src/modules/files/range.js';

test.each([
  ['bytes=1-4', 1, 4], ['bytes=5-', 5, 10], ['bytes=-3', 8, 10], ['bytes=0-999', 0, 10], ['bytes=-999', 0, 10],
])('單一 Range %s 有界回傳', (value, start, end) => {
  expect(byteRange(String(value), 11)).toEqual({ start, end, partial: true });
});
test.each(['bytes=-0', 'bytes=11-', 'bytes=4-1', 'bytes=-', 'bytes=999999999999999999-', 'malformed'])('拒絕不支援 Range %s', (value) => {
  expect(() => byteRange(value, 11)).toThrow();
});
test('未知單位及未實作的多段 Range 保守忽略，bytes 單位不區分大小寫', () => {
  for (const value of ['items=0-1', 'bytes=0-1,3-4']) expect(byteRange(value, 11)).toEqual({ start: 0, end: 10, partial: false });
  expect(byteRange('BYTES=0-1', 11)).toEqual({ start: 0, end: 1, partial: true });
});
test('空檔案沒有 range 時為零 bytes，有 Range 則拒絕', () => {
  expect(byteRange(undefined, 0)).toEqual({ start: 0, end: -1, partial: false });
  expect(() => byteRange('bytes=0-', 0)).toThrow();
});
