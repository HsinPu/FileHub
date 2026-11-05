import { ApiErrorResponseSchema } from '@filehub/contracts';
import type { TSchema, Static } from 'typebox';
import { Check } from 'typebox/value';
import { ApiClientError } from './api.js';

export async function api<T extends TSchema>(url: string, schema: T, options: { method?: 'GET' | 'POST' | 'DELETE'; body?: unknown; csrf?: string; bearer?: string; signal?: AbortSignal } = {}): Promise<Static<T>> {
  if (options.signal?.aborted) throw new ApiClientError('cancelled');
  const controller = new AbortController();
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
  const timer = setTimeout(() => { controller.abort(); }, 10_000);
  try {
    const response = await fetch(url, { method: options.method ?? 'GET', credentials: 'same-origin', mode: 'same-origin', redirect: 'error', cache: 'no-store', signal,
      headers: { accept: 'application/json', ...(options.body === undefined ? {} : { 'content-type': 'application/json' }), ...(options.csrf ? { 'x-csrf-token': options.csrf } : {}), ...(options.bearer ? { authorization: `Bearer ${options.bearer}` } : {}) },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }) });
    const value: unknown = response.status === 204 ? null : await response.json().catch(() => { throw new ApiClientError('invalid_response'); });
    if (!response.ok && Check(ApiErrorResponseSchema, value)) throw new ApiClientError('http', response.status, value.code, value.requestId);
    if (!response.ok || !Check(schema, value)) throw new ApiClientError('invalid_response');
    return value;
  } catch (error) {
    if (options.signal?.aborted) throw new ApiClientError('cancelled');
    if (controller.signal.aborted) throw new ApiClientError('timeout');
    if (error instanceof ApiClientError) throw error;
    throw new ApiClientError('network');
  } finally { clearTimeout(timer); }
}

export function errorText(error: unknown): string {
  if (!(error instanceof ApiClientError)) return '無法完成操作，請稍後重試。';
  switch (error.code) {
    case 'UNAUTHORIZED': return '帳號或密碼不正確，或登入已到期，請重新登入。';
    case 'FORBIDDEN': return '沒有此項目的存取權限，請聯絡管理員。';
    case 'NOT_FOUND': return '項目已移除或授權已變更，請重新選擇入口。';
    case 'CONFLICT': return '目錄或檔案已變更，請重新整理列表。';
    case 'RESOURCE_LIMIT': return '資源超過目前限制，請縮小操作範圍或聯絡管理員。';
    case 'RATE_LIMITED': return '登入嘗試過於頻繁，請稍後再試。';
    case 'SERVICE_UNAVAILABLE': return '入口或服務暫時無法使用，請確認連線後重試。';
    case 'MUTATION_BUSY': return '此位置有未完成操作，請稍後再試或聯絡管理員確認。';
    case 'MUTATION_UNCERTAIN': return '操作結果需要管理員確認，請勿重複送出。';
    case 'WRITE_UNSUPPORTED': return '此環境不支援寫入，請使用 Linux 部署。';
    case 'CROSS_DEVICE': return '無法跨檔案系統移動，原項目保留。';
    case 'STORAGE_FULL': return '空間或配額不足，請聯絡管理員。';
    case 'BAD_REQUEST': return '路徑或輸入格式不正確，請檢查後重試。';
    default: return error.message;
  }
}
