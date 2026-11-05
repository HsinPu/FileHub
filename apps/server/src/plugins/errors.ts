import type { ApiErrorCode, ApiErrorResponse } from '@filehub/contracts';
import type { FastifyInstance } from 'fastify';

const messages: Record<ApiErrorCode, string> = {
  BAD_REQUEST: '請求格式不正確。',
  NOT_FOUND: '找不到此 API。',
  PAYLOAD_TOO_LARGE: '請求內容超過允許大小。',
  UNSUPPORTED_MEDIA_TYPE: '不支援此內容格式。',
  SERVICE_UNAVAILABLE: '服務尚未就緒。',
  INTERNAL_ERROR: '伺服器發生錯誤。',
  UNAUTHORIZED: '請重新登入，或確認帳號與密碼。',
  FORBIDDEN: '沒有執行此操作的權限。',
  CONFLICT: '目前狀態不允許此操作。',
  RATE_LIMITED: '請稍後再試。',
  RESOURCE_LIMIT: '資源超過目前支援的限制。',
  RANGE_NOT_SATISFIABLE: '不支援此下載範圍。',
  MUTATION_BUSY: '此位置有尚未完成的操作，請稍後重試。',
  MUTATION_UNCERTAIN: '操作結果需要確認，請查看操作狀態。',
  WRITE_UNSUPPORTED: '此環境目前不支援寫入。',
  STORAGE_FULL: '儲存空間或配額不足。',
  CROSS_DEVICE: '此操作不支援跨檔案系統。',
};

export class PublicError extends Error {
  constructor(readonly code: ApiErrorCode) { super(messages[code]); }
}

function classify(error: unknown): { code: ApiErrorCode; status: number; details?: ApiErrorResponse['details'] } {
  if (error instanceof PublicError) {
    const status: Partial<Record<ApiErrorCode, number>> = { BAD_REQUEST: 400, PAYLOAD_TOO_LARGE: 413, UNSUPPORTED_MEDIA_TYPE: 415, UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404, CONFLICT: 409, RATE_LIMITED: 429, SERVICE_UNAVAILABLE: 503, RESOURCE_LIMIT: 422, RANGE_NOT_SATISFIABLE: 416 };
    const writeStatus: Partial<Record<ApiErrorCode, number>> = { MUTATION_BUSY: 409, MUTATION_UNCERTAIN: 409, WRITE_UNSUPPORTED: 422, STORAGE_FULL: 507, CROSS_DEVICE: 422 };
    return { code: error.code, status: status[error.code] ?? writeStatus[error.code] ?? 500 };
  }
  if (error !== null && typeof error === 'object') {
    if ('code' in error && typeof error.code === 'string' && /^(SQLITE_BUSY|SQLITE_LOCKED)(_|$)/.test(error.code)) return { code: 'SERVICE_UNAVAILABLE', status: 503 };
    if ('validation' in error && Array.isArray(error.validation)) {
      const context = 'validationContext' in error ? error.validationContext : undefined;
      const location = (['body', 'querystring', 'params', 'headers'] as const).find((candidate) => candidate === context);
      return { code: 'BAD_REQUEST', status: 400, ...(location ? { details: { location } } : {}) };
    }
    if ('statusCode' in error) {
      switch (error.statusCode) {
        case 400: return { code: 'BAD_REQUEST', status: 400 };
        case 404: return { code: 'NOT_FOUND', status: 404 };
        case 413: return { code: 'PAYLOAD_TOO_LARGE', status: 413 };
        case 415: return { code: 'UNSUPPORTED_MEDIA_TYPE', status: 415 };
        case 503: return { code: 'SERVICE_UNAVAILABLE', status: 503 };
      }
    }
  }
  return { code: 'INTERNAL_ERROR', status: 500 };
}

// 安裝在 root instance，讓後續 encapsulated plugins 也繼承同一個錯誤邊界。
export function installErrorHandlers(app: FastifyInstance): void {
  app.setNotFoundHandler((request, reply) => {
    const response: ApiErrorResponse = { code: 'NOT_FOUND', message: messages.NOT_FOUND, requestId: request.id };
    return reply.code(404).send(response);
  });
  app.setErrorHandler((error: unknown, request, reply) => {
    const { code, status, details } = classify(error);
    if (status === 500) request.log.error({ event: 'request_failed' }, 'API 請求失敗');
    const response: ApiErrorResponse = { code, message: messages[code], requestId: request.id, ...(details ? { details } : {}) };
    return reply.code(status).send(response);
  });
}
