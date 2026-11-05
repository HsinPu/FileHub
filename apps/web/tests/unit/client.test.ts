import { afterEach, expect, test, vi } from 'vitest';
import { EntriesResponseSchema } from '@filehub/contracts';
import { Type } from 'typebox';
import { api, errorText } from '../../src/lib/client.js';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

test.each([{ entries: [], privatePath: 'private' }, { entries: 'invalid' }, { entries: [{ id: 'invalid' }] }])('公開資料先驗 schema，拒絕格式或私有欄位 %j', async (body) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(body)));
  await expect(api('/api/entries', EntriesResponseSchema)).rejects.toMatchObject({ kind: 'invalid_response' });
});
test('固定錯誤文案，不回顯任意 server／network／HTML 內容', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(json({ code: 'FORBIDDEN', message: 'private-root', requestId: 'test' }, 403))
    .mockRejectedValueOnce(new Error('private-network')).mockResolvedValueOnce(new Response('<html>private-html</html>'));
  vi.stubGlobal('fetch', fetcher);
  for (let index = 0; index < 3; index++) {
    try { await api('/api/entries', EntriesResponseSchema); expect.unreachable(); }
    catch (error) { expect(errorText(error)).not.toContain('private-'); if (index === 0) expect(errorText(error)).toContain('沒有此項目'); }
  }
});
test('登出以同源 Cookie／CSRF 送出並接受無 JSON 的 204', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetcher);
  expect(await api('/api/session', Type.Null(), { method: 'DELETE', csrf: 'synthetic-csrf' })).toBeNull();
  expect(fetcher).toHaveBeenCalledWith('/api/session', expect.objectContaining({ method: 'DELETE', mode: 'same-origin', credentials: 'same-origin', redirect: 'error', cache: 'no-store', headers: expect.objectContaining({ 'x-csrf-token': 'synthetic-csrf' }) }));
});
test('10 秒期限及呼叫者取消會中止 fetch，清理 timer，已取消時不送出', async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, options) => new Promise((_resolve, reject) => { options?.signal?.addEventListener('abort', () => { reject(new Error('abort')); }, { once: true }); }));
  vi.stubGlobal('fetch', fetcher);
  const timed = expect(api('/api/entries', EntriesResponseSchema)).rejects.toMatchObject({ kind: 'timeout' });
  await vi.advanceTimersByTimeAsync(10_000); await timed;
  const controller = new AbortController();
  const cancelled = expect(api('/api/entries', EntriesResponseSchema, { signal: controller.signal })).rejects.toMatchObject({ kind: 'cancelled' });
  controller.abort(); await cancelled;
  const calls = fetcher.mock.calls.length;
  await expect(api('/api/entries', EntriesResponseSchema, { signal: controller.signal })).rejects.toMatchObject({ kind: 'cancelled' });
  expect(fetcher).toHaveBeenCalledTimes(calls);
  expect(vi.getTimerCount()).toBe(0);
});
