import { ApiErrorResponseSchema, ReadyResponseSchema, type ApiErrorCode, type ReadyResponse } from '@filehub/contracts';
import { Check } from 'typebox/value';
import { appHref } from './paths.js';

type ErrorKind = 'http' | 'network' | 'timeout' | 'cancelled' | 'invalid_response';
const messages: Record<ErrorKind, string> = {
  http: '服務暫時無法回應，請稍後重新檢查。',
  network: '無法連線到服務，請確認連線後重新檢查。',
  timeout: '等候服務回應逾時，請重新檢查。',
  cancelled: '已取消這次檢查。',
  invalid_response: '服務回應格式不正確，請稍後重新檢查。',
};

export class ApiClientError extends Error {
  constructor(readonly kind: ErrorKind, readonly status?: number, readonly code?: ApiErrorCode, readonly requestId?: string) {
    super(messages[kind]);
    this.name = 'ApiClientError';
  }
}

interface RequestOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly fetcher?: typeof fetch;
}

export async function getReadiness({ signal, timeoutMs = 5000, fetcher = globalThis.fetch }: RequestOptions = {}): Promise<ReadyResponse> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw new RangeError('API timeout 必須是 1 到 60000 的整數。');
  if (signal?.aborted) throw new ApiClientError('cancelled');
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const response = await fetcher(appHref('/health/ready'), {
      signal: controller.signal, credentials: 'same-origin', mode: 'same-origin', redirect: 'error', cache: 'no-store',
      headers: { accept: 'application/json' },
    });
    const body: unknown = await response.json().catch(() => { throw new ApiClientError('invalid_response'); });
    if ((response.status === 200 || response.status === 503) && Check(ReadyResponseSchema, body)) {
      if ((response.status === 200) !== (body.status === 'ready')) throw new ApiClientError('invalid_response');
      return body;
    }
    if (!response.ok && Check(ApiErrorResponseSchema, body)) throw new ApiClientError('http', response.status, body.code, body.requestId);
    throw new ApiClientError('invalid_response');
  } catch (error) {
    if (signal?.aborted) throw new ApiClientError('cancelled');
    if (timedOut) throw new ApiClientError('timeout');
    if (error instanceof ApiClientError) throw error;
    throw new ApiClientError('network');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}
