import { Check } from 'typebox/value';
import { sha256 } from '@noble/hashes/sha2.js';
import { ApiErrorResponseSchema, UploadResponseSchema, type UploadResponse } from '@filehub/contracts';
import { ApiClientError } from '../../lib/api.js';
import { appHref } from '../../lib/paths.js';

export async function hashBlob(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const hash = crypto.subtle
    ? new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))
    : sha256(new Uint8Array(buffer));
  return Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
export function sendChunk(id: string, offset: number, bytes: Blob, sha256: string, csrf: string, signal: AbortSignal, progress: (bytes: number) => void): Promise<UploadResponse> {
  if (signal.aborted) return Promise.reject(new ApiClientError('cancelled'));
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest(), path = appHref(`/api/uploads/${id}/content`);
    const abort = () => { xhr.abort(); };
    const finish = (error?: unknown, value?: UploadResponse) => { signal.removeEventListener('abort', abort); if (error) reject(error); else if (value) resolve(value); };
    xhr.open('PUT', path); xhr.timeout = 30_000;
    xhr.setRequestHeader('content-type', 'application/octet-stream'); xhr.setRequestHeader('accept', 'application/json');
    xhr.setRequestHeader('x-upload-offset', String(offset)); xhr.setRequestHeader('x-upload-checksum', sha256); xhr.setRequestHeader('x-csrf-token', csrf);
    xhr.upload.onprogress = (event) => { if (!signal.aborted) progress(Math.min(event.loaded, bytes.size)); };
    xhr.onabort = () => finish(new ApiClientError('cancelled')); xhr.onerror = () => finish(new ApiClientError('network')); xhr.ontimeout = () => finish(new ApiClientError('timeout'));
    xhr.onload = () => {
      if (signal.aborted) { finish(new ApiClientError('cancelled')); return; }
      let value: unknown; try { value = JSON.parse(xhr.responseText); } catch { finish(new ApiClientError('invalid_response')); return; }
      if (xhr.responseURL !== new URL(path, window.location.origin).href) { finish(new ApiClientError('invalid_response')); return; }
      if (xhr.status >= 400 && Check(ApiErrorResponseSchema, value)) { finish(new ApiClientError('http', xhr.status, value.code, value.requestId)); return; }
      if (xhr.status !== 200 || !Check(UploadResponseSchema, value)) { finish(new ApiClientError('invalid_response')); return; }
      resolve(value); signal.removeEventListener('abort', abort);
    };
    signal.addEventListener('abort', abort, { once: true }); xhr.send(bytes);
  });
}
