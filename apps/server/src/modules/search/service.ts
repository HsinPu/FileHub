import { opendir } from 'node:fs/promises';
import type { SearchResponse } from '@filehub/contracts';
import { openScoped, relativePath, type ScopedResource } from '../../storage/scoped.js';
import { PublicError } from '../../plugins/errors.js';
import type { EntryService } from '../entries/service.js';
import { resourceMetadata } from '../files/service.js';

export const SEARCH_LIMITS = Object.freeze({ depth: 8, scanned: 10000, results: 100, timeMs: 2000, active: 2 });
export class SearchService {
  private active = 0;
  constructor(private readonly entries: EntryService) {}
  get activeRequests(): number { return this.active; }
  async search(user: string, entry: string, path: string, query: string, signal?: AbortSignal): Promise<SearchResponse> {
    if (!query.trim() || query.length > 128 || [...query].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) || !query.isWellFormed()) throw new PublicError('BAD_REQUEST');
    const access = this.entries.authorize(user, entry, path, 'browse');
    if (this.active >= SEARCH_LIMITS.active) throw new PublicError('SERVICE_UNAVAILABLE');
    this.active++;
    const started = performance.now();
    const items: SearchResponse['items'] = [], reasons = new Set<SearchResponse['reasons'][number]>();
    let scanned = 0, omitted = 0;
    const check = () => {
      if (signal?.aborted) throw new PublicError('SERVICE_UNAVAILABLE');
      if (performance.now() - started >= SEARCH_LIMITS.timeMs) reasons.add('time');
      return !['time', 'scan', 'results'].some((reason) => reasons.has(reason as 'time' | 'scan' | 'results'));
    };
    const visit = async (value: string, depth: number): Promise<void> => {
      if (!check()) return;
      const current = this.entries.authorize(user, entry, value, 'browse');
      if (current.signature !== access.signature) throw new PublicError('CONFLICT');
      let opened: ScopedResource | undefined;
      try {
        opened = await openScoped(current.root, value);
        if (!opened.stat.isDirectory()) { if (depth === 0) throw new PublicError('BAD_REQUEST'); return; }
        // @ts-expect-error Node 24 的 buffer encoding 型別缺漏；名稱在下方逐一驗證。
        const directory = await opendir(opened.ioPath, { encoding: 'buffer', bufferSize: 16 });
        for await (const dirent of directory) {
          if (!check()) break;
          if (scanned >= SEARCH_LIMITS.scanned) { reasons.add('scan'); break; }
          scanned++;
          const raw: unknown = dirent.name;
          const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw)), name = buffer.toString('utf8');
          const child = value ? `${value}/${name}` : name;
          try { if (!buffer.equals(Buffer.from(name))) throw new Error(); relativePath(child); }
          catch { omitted++; continue; }
          let resource: ScopedResource | undefined;
          try {
            const permission = this.entries.authorize(user, entry, child, 'browse');
            if (permission.signature !== access.signature) throw new PublicError('CONFLICT');
            resource = await openScoped(permission.root, child);
            await resource.verify();
            if (!check()) break;
            if (name.toLowerCase().includes(query.trim().toLowerCase())) {
              items.push(resourceMetadata(entry, child, resource.stat, permission.canDownload(child), permission.canWrite(child)));
              if (items.length >= SEARCH_LIMITS.results) { reasons.add('results'); break; }
            }
            if (resource.stat.isDirectory()) {
              if (depth + 1 >= SEARCH_LIMITS.depth) reasons.add('depth');
              else { await resource.close(); resource = undefined; await visit(child, depth + 1); }
            }
          } catch (error) {
            // 不跟隨 link；授權或入口變更不能當作普通 I/O 略過。
            if (error instanceof PublicError && ['CONFLICT', 'UNAUTHORIZED', 'SERVICE_UNAVAILABLE'].includes(error.code)) throw error;
            reasons.add('unavailable'); omitted++;
          } finally { await resource?.close(); }
        }
        await opened.verify();
        const after = await opened.handle.stat({ bigint: true });
        if (after.mtimeNs !== opened.stat.mtimeNs || after.ctimeNs !== opened.stat.ctimeNs) reasons.add('changed');
      } catch (error) {
        if (depth === 0 || error instanceof PublicError && ['CONFLICT', 'UNAUTHORIZED', 'SERVICE_UNAVAILABLE'].includes(error.code)) throw error;
        reasons.add('unavailable');
      } finally { await opened?.close(); }
    };
    try {
      await visit(access.path, 0); check();
      if (this.entries.authorize(user, entry, path, 'browse').signature !== access.signature) throw new PublicError('CONFLICT');
      items.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
      return { entryId: entry, path: access.path, query, items, partial: reasons.size > 0, reasons: [...reasons], scanned, omitted, elapsedMs: Math.ceil(performance.now() - started) };
    } finally { this.active--; }
  }
}
