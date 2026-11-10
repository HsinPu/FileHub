import { eq } from 'drizzle-orm';
import { Check } from 'typebox/value';
import type { Static, TSchema } from 'typebox';
import {
  ApiErrorResponseSchema, PublicShareInfoSchema, PublicShareListingSchema, PublicShareResourceSchema, SHARE_LIMITS,
  type ListQuery, type ListingResponse, type MetadataResponse, type PublicEntry, type PublicShareResource, type ResourceMetadata,
} from '@filehub/contracts';
import type { FileHubDatabase } from '../../persistence/database.js';
import { entries, users } from '../../persistence/schema.js';
import { PublicError } from '../../plugins/errors.js';
import { relativePath } from '../../storage/scoped.js';
import { publicCookieName } from '../shares/routes.js';
import type { RemoteSource } from './config.js';
import { remoteRequest } from './transport.js';

interface RemoteSession { readonly cookie: string; readonly expiresAt: number }

function resource(value: PublicShareResource): ResourceMetadata {
  return { ...value, canDownload: false, canWrite: false, canCopy: false, canShare: false };
}

function matchesPath(path: string, expected: string): boolean {
  try { return relativePath(path) === expected; }
  catch { return false; }
}

export class RemoteService {
  private readonly closing = new AbortController();
  private readonly sessions = new Map<string, RemoteSession>();
  private readonly sessionLoads = new Map<string, Promise<RemoteSession>>();
  private readonly pending = new Set<Promise<unknown>>();
  private active = 0;

  constructor(private readonly database: FileHubDatabase, private readonly sources: readonly RemoteSource[]) {
    if (sources.some(source => database.db.select().from(entries).where(eq(entries.id, source.id)).get())) {
      throw new Error('遠端入口 ID 與本機入口衝突。');
    }
  }

  has(id: string): boolean { return this.sources.some(source => source.id === id); }

  private authorized(userId: string, id?: string): readonly RemoteSource[] {
    if (!this.database.isReady()) throw new PublicError('SERVICE_UNAVAILABLE');
    const user = this.database.db.select().from(users).where(eq(users.id, userId)).get();
    if (!user?.enabled) throw new PublicError('UNAUTHORIZED');
    return this.sources.filter(source => (id === undefined || source.id === id)
      && (user.role === 'admin' || source.users.includes(user.username)));
  }

  listEntries(userId: string): PublicEntry[] {
    return this.authorized(userId).map(source => ({
      id: source.id, label: source.label, kind: 'remote', readOnly: true,
      scopes: [{ path: '', canDownload: false, canWrite: false }],
    }));
  }

  private track<T>(task: Promise<T>): Promise<T> {
    this.pending.add(task);
    void task.then(() => this.pending.delete(task), () => this.pending.delete(task));
    return task;
  }

  async close(): Promise<void> {
    this.closing.abort();
    await Promise.allSettled([...this.pending]);
    this.sessions.clear();
  }

  private async json<T extends TSchema>(source: RemoteSource, endpoint: string, schema: T, signal: AbortSignal, cookie?: string): Promise<Static<T>> {
    const response = await remoteRequest(source, endpoint, signal, cookie);
    if (response.status === 200 && Check(schema, response.value)) return response.value;
    if (response.status === 401 || response.status === 403) this.sessions.delete(source.id);
    if (Check(ApiErrorResponseSchema, response.value)) {
      if (response.status === 409 && response.value.code === 'CONFLICT') throw new PublicError('CONFLICT');
      if (response.status === 404 && response.value.code === 'NOT_FOUND') throw new PublicError('NOT_FOUND');
    }
    throw new PublicError('REMOTE_UNAVAILABLE');
  }

  private session(source: RemoteSource): Promise<RemoteSession> {
    const current = this.sessions.get(source.id);
    if (current && current.expiresAt > Date.now() + 1000) return Promise.resolve(current);
    const loading = this.sessionLoads.get(source.id);
    if (loading) return loading;
    const task = this.track((async () => {
      try {
        const signal = AbortSignal.any([this.closing.signal, AbortSignal.timeout(5000)]);
        const response = await remoteRequest(source, 'access', signal);
        if (response.status !== 200 || !Check(PublicShareInfoSchema, response.value)
          || response.value.kind !== 'directory' || response.value.passwordProtected) throw new PublicError('REMOTE_UNAVAILABLE');
        const name = publicCookieName(source.shareId);
        const cookies = response.cookies.map(value => value.split(';')[0] ?? '').filter(value => value.startsWith(name + '='));
        const cookie = cookies[0];
        if (cookies.length !== 1 || !cookie || !/^[A-Za-z0-9_-]{43}$/.test(cookie.slice(name.length + 1))) throw new PublicError('REMOTE_UNAVAILABLE');
        const session = { cookie, expiresAt: Math.min(Date.parse(response.value.expiresAt), Date.now() + SHARE_LIMITS.sessionMs) };
        if (!Number.isFinite(session.expiresAt) || signal.aborted) throw new PublicError('REMOTE_UNAVAILABLE');
        this.sessions.set(source.id, session);
        return session;
      } finally { this.sessionLoads.delete(source.id); }
    })());
    this.sessionLoads.set(source.id, task);
    return task;
  }

  private async run<T>(userId: string, id: string, path: string, signal: AbortSignal | undefined,
    read: (source: RemoteSource, path: string, cookie: string, signal: AbortSignal) => Promise<T>): Promise<T> {
    const source = this.authorized(userId, id)[0];
    if (!source) throw new PublicError('NOT_FOUND');
    const normalized = relativePath(path);
    if (this.closing.signal.aborted || this.active >= 4) throw new PublicError('REMOTE_UNAVAILABLE');
    this.active++;
    return this.track((async () => {
      try {
        const deadline = AbortSignal.any([this.closing.signal, AbortSignal.timeout(5000), ...(signal ? [signal] : [])]);
        const session = await this.session(source);
        if (deadline.aborted) throw new PublicError('REMOTE_UNAVAILABLE');
        const result = await read(source, normalized, session.cookie, deadline);
        if (!this.authorized(userId, id).length) throw new PublicError('NOT_FOUND');
        if (deadline.aborted) throw new PublicError('REMOTE_UNAVAILABLE');
        return result;
      } catch (error) {
        if (error instanceof PublicError) throw error;
        throw new PublicError('REMOTE_UNAVAILABLE');
      } finally { this.active--; }
    })());
  }

  metadata(userId: string, id: string, path: string, signal?: AbortSignal): Promise<MetadataResponse> {
    return this.run(userId, id, path, signal, async (source, normalized, cookie, deadline) => {
      const value = await this.json(source, 'resource?' + new URLSearchParams({ path: normalized }), PublicShareResourceSchema, deadline, cookie);
      if (value.path !== normalized) throw new PublicError('REMOTE_UNAVAILABLE');
      return { entryId: id, scope: '', resource: resource(value) };
    });
  }

  list(userId: string, id: string, path: string, options: ListQuery, signal?: AbortSignal): Promise<ListingResponse> {
    return this.run(userId, id, path, signal, async (source, normalized, cookie, deadline) => {
      const offset = options.offset ?? 0, limit = options.limit ?? 50;
      const query = new URLSearchParams({ path: normalized, offset: String(offset), limit: String(limit) });
      for (const key of ['sort', 'direction', 'filter', 'version'] as const) {
        if (options[key] !== undefined) query.set(key, options[key]);
      }
      const value = await this.json(source, 'files?' + query, PublicShareListingSchema, deadline, cookie);
      const paths = new Set<string>();
      for (const item of value.items) {
        const expected = normalized ? normalized + '/' + item.name : item.name;
        if (!item.name || item.name.includes('/') || item.name.includes('\\')
          || !matchesPath(item.path, expected) || paths.has(item.path)) throw new PublicError('REMOTE_UNAVAILABLE');
        paths.add(item.path);
      }
      if (value.path !== normalized || value.offset !== offset || value.limit !== limit
        || value.items.length > limit || value.total < value.items.length
        || value.hasMore !== (offset + value.items.length < value.total)) throw new PublicError('REMOTE_UNAVAILABLE');
      return { ...value, entryId: id, scope: '', canCreate: false, items: value.items.map(resource) };
    });
  }
}
