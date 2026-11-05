import { and, asc, desc, eq } from 'drizzle-orm';
import { Value } from 'typebox/value';
import { UPLOAD_LIMITS, UploadCreateSchema, type UploadCreate, type UploadResponse } from '@filehub/contracts';
import type { FileHubDatabase } from '../../persistence/database.js';
import { uploadChunks, uploadSessions } from '../../persistence/schema.js';
import { PublicError } from '../../plugins/errors.js';
import { fileName } from '../../storage/names.js';
import { openScoped, relativePath } from '../../storage/scoped.js';
import { joinPath } from '../files/mutations.js';
import type { EntryService } from '../entries/service.js';

export type UploadRow = typeof uploadSessions.$inferSelect;
export const uploadPath = (id: string) => `.filehub/staging/u-${id}`;
export class UploadCatalog {
  constructor(readonly database: FileHubDatabase, readonly entries: EntryService, readonly now: () => number = Date.now) {}
  own(user: string, id: string): UploadRow {
    this.entries.list(user);
    const row = this.database.db.select().from(uploadSessions).where(and(eq(uploadSessions.id, id), eq(uploadSessions.userId, user))).get();
    if (!row) throw new PublicError('NOT_FOUND');
    return row;
  }
  dto(row: UploadRow, canWrite = false): UploadResponse {
    const state = row.state === 'open' && row.expiresAt <= this.now() ? 'expired' : row.state;
    return { id: row.id, entryId: row.entryId, parent: row.parent, name: row.name, size: row.size, offset: row.offset, state,
      createdAt: new Date(row.createdAt).toISOString(), expiresAt: new Date(row.expiresAt).toISOString(), chunkBytes: UPLOAD_LIMITS.chunkBytes,
      canResume: state === 'open' && canWrite, cleanupPending: !row.cleaned && (state === 'expired' || state === 'cancelled'),
      chunks: this.database.db.select({ offset: uploadChunks.offset, length: uploadChunks.length, sha256: uploadChunks.sha256 }).from(uploadChunks).where(eq(uploadChunks.uploadId, row.id)).orderBy(asc(uploadChunks.offset)).limit(256).all(),
      ...(row.sha256 ? { sha256: row.sha256 } : {}) };
  }
  get(user: string, id: string): UploadResponse {
    const row = this.own(user, id), access = this.entries.authorize(user, row.entryId, row.parent, 'browse');
    return this.dto(row, access.canWrite(joinPath(row.parent, row.name)));
  }
  list(user: string, entryId: string) {
    if (!this.entries.list(user).some((entry) => entry.id === entryId)) throw new PublicError('NOT_FOUND');
    const rows = this.database.db.select().from(uploadSessions).where(and(eq(uploadSessions.userId, user), eq(uploadSessions.entryId, entryId))).orderBy(asc(uploadSessions.cleaned), desc(uploadSessions.createdAt), asc(uploadSessions.id)).limit(50).all();
    return { items: rows.flatMap((row) => {
      try { return [this.get(user, row.id)]; } catch (error) { if (error instanceof PublicError && ['FORBIDDEN', 'NOT_FOUND'].includes(error.code)) return []; throw error; }
    }) };
  }
  async create(user: string, entryId: string, input: UploadCreate, reauthorize = () => {}): Promise<UploadResponse> {
    if (!Value.Check(UploadCreateSchema, input) || !/^[a-f0-9-]{36}$/.test(input.id)) throw new PublicError('BAD_REQUEST');
    const parent = relativePath(input.parent), name = fileName(input.name); relativePath(joinPath(parent, name));
    const access = this.entries.authorize(user, entryId, parent, 'write');
    const directory = await openScoped(access.root, parent);
    try { if (!directory.stat.isDirectory()) throw new PublicError('BAD_REQUEST'); await directory.verify(); }
    finally { await directory.close(); }
    this.database.sqlite.transaction(() => {
      reauthorize(); this.entries.authorize(user, entryId, parent, 'write');
      const prior = this.database.db.select().from(uploadSessions).where(eq(uploadSessions.id, input.id)).get();
      if (prior) {
        if (prior.userId !== user) throw new PublicError('NOT_FOUND');
        if (prior.entryId !== entryId || prior.parent !== parent || prior.name !== name || prior.size !== input.size || prior.expectedSha256 !== (input.sha256 ?? null)) throw new PublicError('CONFLICT');
        return;
      }
      const usage = this.database.sqlite.prepare<[string, string], { count: number; bytes: number; ownCount: number; ownBytes: number }>('SELECT count(*) AS count, coalesce(sum(reserved_bytes),0) AS bytes, coalesce(sum(user_id = ?),0) AS ownCount, coalesce(sum(CASE WHEN user_id = ? THEN reserved_bytes ELSE 0 END),0) AS ownBytes FROM upload_sessions WHERE cleaned = 0').get(user, user);
      const history = this.database.sqlite.prepare<[], { n: number }>('SELECT count(*) AS n FROM upload_sessions').get();
      if (!usage || !history || history.n >= 10000 || usage.count >= UPLOAD_LIMITS.sessions || usage.ownCount >= UPLOAD_LIMITS.userSessions || usage.bytes + input.size > UPLOAD_LIMITS.bytes || usage.ownBytes + input.size > UPLOAD_LIMITS.userBytes) throw new PublicError('RESOURCE_LIMIT');
      const now = this.now();
      this.database.db.insert(uploadSessions).values({ id: input.id, userId: user, entryId, parent, name, size: input.size, expectedSha256: input.sha256, reservedBytes: input.size, createdAt: now, updatedAt: now, expiresAt: now + UPLOAD_LIMITS.lifetimeMs }).run();
    }).immediate();
    return this.get(user, input.id);
  }
  cancel(user: string, id: string): UploadResponse {
    // 撤銷 grant 後仍可取消自己的暫存；不查閱別人的 session，也不發布檔案。
    const row = this.own(user, id);
    if (row.state === 'completed' || row.state === 'cancelled' || row.state === 'expired') return this.dto(row);
    if (row.state !== 'open' || row.owner) throw new PublicError('MUTATION_BUSY');
    const cleaned = row.payloadIdentity === null;
    const changed = this.database.db.update(uploadSessions).set({ state: row.expiresAt <= this.now() ? 'expired' : 'cancelled', cleaned, reservedBytes: cleaned ? 0 : row.reservedBytes, generation: row.generation + 1, updatedAt: this.now() }).where(and(eq(uploadSessions.id, id), eq(uploadSessions.generation, row.generation), eq(uploadSessions.state, 'open'))).run();
    if (!changed.changes) throw new PublicError('MUTATION_BUSY');
    return this.dto(this.own(user, id));
  }
}
