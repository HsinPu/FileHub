import { expect, test } from 'vitest';
import { PreviewCache } from '../../src/modules/previews/cache.js';
const key = (i: number) => i.toString(16).padStart(64, '0');
test('cache 同時限制數量與 byte、LRU 淘汰，回傳 bytes 不可改壞下一個回應', () => {
  const cache = new PreviewCache({ entries: 2, bytes: 10 });
  cache.put(key(1), Buffer.from('1234')); cache.put(key(2), Buffer.from('5678'));
  const value = cache.get(key(1)); if (!value) throw new Error(); value[0] = 0;
  cache.put(key(3), Buffer.from('90'));
  expect(cache.get(key(2))).toBeUndefined(); expect(cache.get(key(1))?.toString()).toBe('1234');
  cache.put(key(4), Buffer.from('123456789'));
  expect(cache.snapshot()).toMatchObject({ entries: 1, bytes: 9, evictions: 3 });
  cache.put(key(5), Buffer.alloc(11)); expect(cache.snapshot().entries).toBe(1);
  cache.clear(); expect(cache.snapshot()).toMatchObject({ entries: 0, bytes: 0 });
});
test('cache 大量寫入仍有固定上限，重建不依賴持久資料', () => {
  const cache = new PreviewCache();
  for (let i = 0; i < 80; i++) cache.put(key(i), Buffer.alloc(1024 * 1024, i));
  expect(cache.snapshot()).toMatchObject({ entries: 16, bytes: 16777216, evictions: 64 });
  const fresh = new PreviewCache(); expect(fresh.get(key(79))).toBeUndefined();
  expect(() => new PreviewCache({ entries: 33, bytes: 1 })).toThrow(RangeError);
});
