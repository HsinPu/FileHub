import { expect, test, vi } from 'vitest';
import { ApiClientError, getReadiness } from '../../src/lib/api.js';

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

test.each([{ status: 200, value: 'ready' }, { status: 503, value: 'not_ready' }])('健康狀態 $status 是合法回應，503 不被當作通用錯誤', async ({ status, value }) => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ status: value }, status));
  expect(await getReadiness({ fetcher })).toEqual({ status: value });
  expect(fetcher).toHaveBeenCalledWith('/health/ready', expect.objectContaining({ credentials: 'same-origin', redirect: 'error', cache: 'no-store' }));
});

test.each([
  { value: { status: 'ready', hostPath: 'private' }, status: 200 },
  { value: { status: 'not_ready' }, status: 200 },
  { value: { status: 'ready' }, status: 503 },
  { value: { status: 'unknown' }, status: 200 },
])('不相信 TypeScript 型別，拒絕不符公開 schema／HTTP 語意的內容：%j', async ({ value, status }) => {
  await expect(getReadiness({ fetcher: vi.fn<typeof fetch>().mockResolvedValue(json(value, status)) })).rejects.toMatchObject({ kind: 'invalid_response' });
});

test('合法公開錯誤保留 code／requestId，畫面訊息不回顯後端任意文字', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ code: 'INTERNAL_ERROR', message: 'private-secret-path', requestId: 'test-request' }, 500));
  try {
    await getReadiness({ fetcher });
    expect.unreachable();
  } catch (error) {
    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({ kind: 'http', code: 'INTERNAL_ERROR', requestId: 'test-request', status: 500 });
    expect(String(error)).not.toContain('private-secret-path');
  }
});

test('HTML／無效 JSON 與網路 exception 都轉固定訊息，不反射內容', async () => {
  const cases = [
    vi.fn<typeof fetch>().mockResolvedValue(new Response('<html>private-secret</html>', { status: 502 })),
    vi.fn<typeof fetch>().mockRejectedValue(new Error('private-secret-connection')),
  ];
  for (const fetcher of cases) {
    await expect(getReadiness({ fetcher })).rejects.toBeInstanceOf(ApiClientError);
    await expect(getReadiness({ fetcher })).rejects.not.toThrow(/private-secret/);
  }
});

test('有界 timeout 與呼叫端取消都中止 fetch，並清理 timer／listener', async () => {
  const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  }));
  await expect(getReadiness({ fetcher, timeoutMs: 10 })).rejects.toMatchObject({ kind: 'timeout' });
  const controller = new AbortController();
  const request = getReadiness({ fetcher, signal: controller.signal });
  controller.abort();
  await expect(request).rejects.toMatchObject({ kind: 'cancelled' });
  const alreadyAborted = new AbortController();
  alreadyAborted.abort();
  const unused = vi.fn<typeof fetch>();
  await expect(getReadiness({ fetcher: unused, signal: alreadyAborted.signal })).rejects.toMatchObject({ kind: 'cancelled' });
  expect(unused).not.toHaveBeenCalled();
});
