import { afterEach, expect, test, vi } from 'vitest';
import { previewBytes } from '../../src/features/previews/binary.js';
afterEach(() => vi.unstubAllGlobals());
test('binary client 驗 MIME／實際長度並取消超限 body，不信任 Content-Length', async () => {
  let cancelled = false;
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(262145)); }, cancel() { cancelled = true; } });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream, { headers: { 'content-type': 'text/plain', 'content-length': '1' } })));
  await expect(previewBytes('/fixture', new AbortController().signal)).rejects.toMatchObject({ kind: 'invalid_response' }); expect(cancelled).toBe(true);
});
test('401 與未知 MIME 不交給 viewer；正常 bytes 保持', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('', { status: 401 })).mockResolvedValueOnce(new Response('<script/>', { headers: { 'content-type': 'text/html' } })).mockResolvedValueOnce(new Response('安全文字', { headers: { 'content-type': 'text/plain' } })));
  const signal = new AbortController().signal;
  await expect(previewBytes('/fixture', signal)).rejects.toMatchObject({ status: 401 });
  await expect(previewBytes('/fixture', signal)).rejects.toMatchObject({ kind: 'invalid_response' });
  expect(new TextDecoder().decode((await previewBytes('/fixture', signal)).bytes)).toBe('安全文字');
});
