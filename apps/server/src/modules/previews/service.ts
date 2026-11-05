import { extname } from 'node:path';
import { createHash } from 'node:crypto';
import type { PreviewResponse } from '@filehub/contracts';
import { fingerprint, type FileService } from '../files/service.js';
import { PublicError } from '../../plugins/errors.js';
import { renderImage } from './renderer.js';
import { PreviewCache } from './cache.js';

export const PREVIEW_LIMITS = Object.freeze({ text: 262144, image: 16777216, pdf: 16777216, active: 2 });
export class PreviewService {
  private active = 0;
  constructor(readonly files: FileService, readonly cache = new PreviewCache()) {}
  get activeRequests() { return this.active; }
  async open(user: string, entry: string, path: string, version?: string, signal?: AbortSignal) {
    const opened = await this.files.openDownload(user, entry, path, version, signal);
    try {
      const size = opened.resource.size ?? 0, extension = extname(opened.resource.name).toLowerCase();
      const header = Buffer.alloc(Math.min(size, 32)); await opened.handle.read(header, 0, header.length, 0);
      let kind: PreviewResponse['kind'] = 'unsupported', reason: PreviewResponse['reason'] = 'type';
      const image = ['.png', '.jpg', '.jpeg', '.webp'].includes(extension);
      const imageMagic = header.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || header[0] === 255 && header[1] === 216 && header[2] === 255 || header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WEBP';
      if (image || extension === '.pdf') {
        if (size > (image ? PREVIEW_LIMITS.image : PREVIEW_LIMITS.pdf)) reason = 'size';
        else if (image ? imageMagic : header.toString('ascii', 0, 5) === '%PDF-') { kind = image ? 'image' : 'pdf'; reason = 'supported'; }
        else reason = 'invalid';
      } else if (['.txt','.md','.log','.csv','.json','.yaml','.yml','.xml','.html','.htm','.svg','.js','.ts','.css','.py','.sh'].includes(extension)) {
        if (size > PREVIEW_LIMITS.text) reason = 'size';
        else { kind = 'text'; reason = 'supported'; }
      }
      return { ...opened, info: { resource: opened.resource, kind, reason } satisfies PreviewResponse };
    } catch (error) { await opened.close(); throw error; }
  }
  async info(user: string, entry: string, path: string, version?: string, signal?: AbortSignal): Promise<PreviewResponse> {
    const opened = await this.open(user, entry, path, version, signal);
    try { return opened.info; } finally { await opened.close(); }
  }
  async content(user: string, entry: string, path: string, version?: string, signal?: AbortSignal, variant: 'preview' | 'thumb' = 'preview') {
    if (this.active >= PREVIEW_LIMITS.active) throw new PublicError('SERVICE_UNAVAILABLE');
    this.active++;
    let opened: Awaited<ReturnType<PreviewService['open']>> | undefined;
    try {
      opened = await this.open(user, entry, path, version, signal);
      if (opened.info.kind === 'unsupported' || variant === 'thumb' && opened.info.kind !== 'image') throw new PublicError(opened.info.reason === 'size' ? 'RESOURCE_LIMIT' : 'UNSUPPORTED_MEDIA_TYPE');
      const source = opened;
      const size = source.resource.size ?? 0;
      let bytes: Buffer, cacheKey: string | undefined, hit = false;
      if (source.info.kind === 'image') {
        const hash = createHash('sha256'); let position = 0;
        while (position < size) {
          if (signal?.aborted) throw new PublicError('SERVICE_UNAVAILABLE');
          const chunk = Buffer.alloc(Math.min(65536, size - position)), next = await source.handle.read(chunk, 0, chunk.length, position);
          if (!next.bytesRead) throw new PublicError('CONFLICT');
          hash.update(chunk.subarray(0, next.bytesRead)); position += next.bytesRead;
        }
        const digest = hash.digest('hex');
        cacheKey = createHash('sha256').update(`jpeg-v1:sharp-0.35.5:q80:${variant}\0${entry}\0${path}\0${source.resource.version}\0${digest}`).digest('hex');
        const cached = this.cache.get(cacheKey); hit = !!cached;
        bytes = cached ?? await renderImage(source.handle, size, variant, signal, digest);
      }
      else {
        bytes = Buffer.alloc(size); let read = 0;
        while (read < size) { if (signal?.aborted) throw new PublicError('SERVICE_UNAVAILABLE'); const next = await source.handle.read(bytes, read, Math.min(65536, size - read), read); if (!next.bytesRead) throw new PublicError('CONFLICT'); read += next.bytesRead; }
        if (source.info.kind === 'text') {
          try { const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); if ([...text].some((char) => char.charCodeAt(0) < 32 && !['\n','\r','\t'].includes(char))) throw new Error(); }
          catch { throw new PublicError('UNSUPPORTED_MEDIA_TYPE'); }
        }
      }
      if (signal?.aborted) throw new PublicError('SERVICE_UNAVAILABLE');
      if (fingerprint(entry, path, await source.handle.stat({ bigint: true })) !== source.resource.version) throw new PublicError('CONFLICT');
      const current = await this.files.metadata(user, entry, path, signal);
      this.files.entries.authorize(user, entry, path, 'download');
      if (current.resource.version !== source.resource.version) throw new PublicError('CONFLICT');
      if (cacheKey && !hit) this.cache.put(cacheKey, bytes);
      return { bytes, info: source.info, mime: source.info.kind === 'image' ? 'image/jpeg' : source.info.kind === 'pdf' ? 'application/pdf' : 'text/plain; charset=utf-8' };
    } finally { try { await opened?.close(); } finally { this.active--; } }
  }
}
