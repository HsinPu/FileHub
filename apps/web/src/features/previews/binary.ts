import { ApiClientError } from '../../lib/api.js';
import { appHref } from '../../lib/paths.js';

export async function previewBytes(url: string, signal: AbortSignal, maxBytes = 16777216): Promise<{ bytes: Uint8Array<ArrayBuffer>; mime: string }> {
  const timeout = AbortSignal.timeout(10000), combined = AbortSignal.any([signal, timeout]);
  const response = await fetch(appHref(url), { signal: combined, credentials: 'same-origin', mode: 'same-origin', redirect: 'error', cache: 'no-store' });
  if (!response.ok) { await response.body?.cancel(); throw new ApiClientError('http', response.status); }
  const mime = response.headers.get('content-type')?.split(';')[0] ?? '';
  const max = Math.min(maxBytes, mime === 'image/jpeg' ? 4194304 : mime === 'text/plain' ? 262144 : mime === 'application/pdf' ? 16777216 : 0);
  const reader = response.body?.getReader();
  if (!reader) throw new ApiClientError('invalid_response');
  const parts: Uint8Array[] = []; let length = 0;
  try {
    if (!max || Number(response.headers.get('content-length')) > max) throw new ApiClientError('invalid_response');
    while (true) {
      const next = await reader.read(); if (next.done) break;
      length += next.value.length;
      if (length > max) throw new ApiClientError('invalid_response');
      parts.push(next.value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.length; }
    return { bytes, mime };
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}
