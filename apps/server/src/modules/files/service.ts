import { createHash } from 'node:crypto';
import { lstat, opendir } from 'node:fs/promises';
import type { BigIntStats } from 'node:fs';
import { join } from 'node:path';
import type { ResourceMetadata, ListingResponse, MetadataResponse, ListQuery } from '@filehub/contracts';
import { openScoped, relativePath, type ScopedAnchor, type ScopedResource } from '../../storage/scoped.js';
import { PublicError } from '../../plugins/errors.js';
import type { EntryService } from '../entries/service.js';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export function fingerprint(entryId: string, path: string, stat: BigIntStats): string {
  return hash(`${entryId}\0${path}\0${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}:${stat.mode}`);
}
function safeError(error: unknown): PublicError {
  if (error instanceof PublicError) return error;
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  if (code === 'ENOENT') return new PublicError('CONFLICT');
  if (code === 'EACCES' || code === 'EPERM') return new PublicError('FORBIDDEN');
  return new PublicError('SERVICE_UNAVAILABLE');
}
function assertActive(signal?: AbortSignal): void { if (signal?.aborted) throw new PublicError('SERVICE_UNAVAILABLE'); }
export function resourceMetadata(entryId: string, path: string, stat: BigIntStats, download: boolean, write = false): ResourceMetadata {
  if (stat.size > BigInt(Number.MAX_SAFE_INTEGER)) throw new PublicError('RESOURCE_LIMIT');
  const kind = stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : stat.isSymbolicLink() ? 'link' : 'other';
  return { name: path.split('/').at(-1) ?? '', path, kind, size: kind === 'file' ? Number(stat.size) : null,
    modifiedAt: new Date(Number(stat.mtimeMs)).toISOString(), version: fingerprint(entryId, path, stat), canBrowse: kind === 'directory', canDownload: kind === 'file' && download, ...(write && ['file', 'directory'].includes(kind) ? { canWrite: true } : {}),...(process.platform==='linux'&&download&&path&&['file','directory'].includes(kind)?{canCopy:true}:{}),...(download&&path&&['file','directory'].includes(kind)?{canShare:true}:{}) };
}

export class FileService {
  private active = 0;
  constructor(readonly entries: EntryService) {}
  get activeRequests(): number { return this.active; }
  admitRead():()=>void{return this.enter();}
  private enter(): () => void {
    if (this.active >= 4) throw new PublicError('SERVICE_UNAVAILABLE');
    this.active++;
    let released = false;
    return () => { if (!released) { released = true; this.active--; } };
  }

  async metadata(user: string, entry: string, value: string, signal?: AbortSignal, anchor?: ScopedAnchor): Promise<MetadataResponse> {
    const access = this.entries.authorize(user, entry, value, 'browse');
    const release = this.enter(); let opened: ScopedResource | undefined;
    try {
      assertActive(signal); opened = await openScoped(access.root, access.path, false, anchor); assertActive(signal);
      await opened.verify(); this.entries.authorize(user, entry, value, 'browse');
      return { entryId: entry, scope: access.scope, resource: resourceMetadata(entry, access.path, opened.stat, access.canDownload(access.path), access.canWrite(access.path) && access.path !== access.scope) };
    } catch (error) { throw safeError(error); }
    finally { try { await opened?.close(); } finally { release(); } }
  }

  async list(user: string, entry: string, value: string, options: ListQuery = {}, signal?: AbortSignal, anchor?: ScopedAnchor, regularOnly = false): Promise<ListingResponse> {
    const offset = options.offset ?? 0, limit = options.limit ?? 100;
    if (!Number.isInteger(offset) || offset < 0 || offset > 5000 || !Number.isInteger(limit) || limit < 1 || limit > 100 || (offset > 0 && !options.version)) throw new PublicError('BAD_REQUEST');
    const access = this.entries.authorize(user, entry, value, 'browse');
    const release = this.enter(); let opened: ScopedResource | undefined;
    try {
      assertActive(signal); opened = await openScoped(access.root, access.path, false, anchor);
      if (!opened.stat.isDirectory()) throw new PublicError('BAD_REQUEST');
      const names: string[] = []; let scanned = 0, omitted = 0;
      // @ts-expect-error @types/node 24.19.2 遺漏已實測 Node 24.22.1 的 buffer encoding；名稱仍以 unknown 驗證。
      const directory = await opendir(opened.ioPath, { encoding: 'buffer', bufferSize: 32 });
      for await (const dirent of directory) {
        assertActive(signal);
        if (++scanned > 5000) throw new PublicError('RESOURCE_LIMIT');
        const raw: unknown = dirent.name;
        const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw));
        const name = buffer.toString('utf8');
        if (!buffer.equals(Buffer.from(name))) { omitted++; continue; }
        try { relativePath(access.path ? `${access.path}/${name}` : name); }
        catch { omitted++; continue; }
        names.push(name);
      }
      const items: ResourceMetadata[] = [];
      for (let index = 0; index < names.length; index += 8) {
        assertActive(signal);
        const path = opened.ioPath;
        const batch = await Promise.allSettled(names.slice(index, index + 8).map(async (name) => {
          const child = access.path ? `${access.path}/${name}` : name;
          return resourceMetadata(entry, child, await lstat(join(path, name), { bigint: true }), access.canDownload(child), access.canWrite(child));
        }));
        for (const result of batch) {
          if (result.status === 'rejected') throw result.reason;
          items.push(result.value);
        }
      }
      await opened.verify(); assertActive(signal);
      const after = await opened.handle.stat({ bigint: true });
      if (after.mtimeNs !== opened.stat.mtimeNs || after.ctimeNs !== opened.stat.ctimeNs) throw new PublicError('CONFLICT');
      if (this.entries.authorize(user, entry, value, 'browse').signature !== access.signature) throw new PublicError('CONFLICT');
      const ordinal = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
      items.sort((a, b) => ordinal(a.name, b.name));
      const filter = options.filter ?? '';
      if (filter.length > 128 || [...filter].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) || !filter.isWellFormed()) throw new PublicError('BAD_REQUEST');
      const visible = regularOnly ? items.filter(item => item.kind === 'file' || item.kind === 'directory') : items;
      const version = hash(`${fingerprint(entry, access.path, opened.stat)}:${access.signature}:${filter}:${JSON.stringify(visible)}`);
      if (options.version && options.version !== version) throw new PublicError('CONFLICT');
      const sort = options.sort ?? 'name', direction = options.direction === 'desc' ? -1 : 1;
      visible.sort((a, b) => {
        if ((a.kind === 'directory') !== (b.kind === 'directory')) return a.kind === 'directory' ? -1 : 1;
        const comparison = sort === 'size' ? (a.size ?? 0) - (b.size ?? 0) : ordinal(a[sort], b[sort]);
        return direction * (comparison || ordinal(a.name, b.name));
      });
      const filtered = filter ? visible.filter((item) => item.name.toLowerCase().includes(filter.toLowerCase())) : visible;
      return { entryId: entry, path: access.path, scope: access.scope, version, items: filtered.slice(offset, offset + limit), total: filtered.length, offset, limit, hasMore: offset + limit < filtered.length, omitted, ...(access.canWrite(access.path) ? { canCreate: true } : {}) };
    } catch (error) { throw safeError(error); }
    finally { try { await opened?.close(); } finally { release(); } }
  }

  async openDownload(user: string, entry: string, value: string, version?: string, signal?: AbortSignal, anchor?: ScopedAnchor) {
    const access = this.entries.authorize(user, entry, value, 'download');
    const release = this.enter(); let opened: ScopedResource | undefined;
    try {
      assertActive(signal); opened = await openScoped(access.root, access.path, false, anchor);
      if (!opened.stat.isFile()) throw new PublicError('BAD_REQUEST');
      const resource = resourceMetadata(entry, access.path, opened.stat, true);
      if (version && resource.version !== version) throw new PublicError('CONFLICT');
      await opened.verify(); assertActive(signal); this.entries.authorize(user, entry, value, 'download');
      const owned = opened; let closing: Promise<void> | undefined;
      return { resource, handle: owned.handle, close: () => closing ??= (async () => { try { await owned.close(); } finally { release(); } })() };
    } catch (error) { try { await opened?.close(); } finally { release(); } throw safeError(error); }
  }
}
