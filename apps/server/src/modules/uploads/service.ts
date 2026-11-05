import { createHash, randomUUID } from 'node:crypto';
import type { FileHandle } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import { and, eq } from 'drizzle-orm';
import { UPLOAD_LIMITS, type UploadCreate, type UploadResponse } from '@filehub/contracts';
import type { FileHubDatabase } from '../../persistence/database.js';
import { uploadChunks, uploadSessions } from '../../persistence/schema.js';
import { PublicError } from '../../plugins/errors.js';
import { createOwner, stableWitness } from '../../storage/native.js';
import { openScoped } from '../../storage/scoped.js';
import type { EntryService } from '../entries/service.js';
import { joinPath, type MutationService } from '../files/mutations.js';
import { UploadCatalog, uploadPath, type UploadRow } from './catalog.js';
import { openPayload, uploadError } from './payload.js';

export interface UploadDependencies { checkpoint?(phase: 'claimed' | 'received' | 'verified', id: string): Promise<void> | void }
export class UploadService extends UploadCatalog {
  readonly owner = randomUUID();
  private guard: Promise<FileHandle> | undefined;
  private pending = new Set<Promise<unknown>>();
  private closed = false;
  get activeRequests() { return this.pending.size; }
  constructor(database: FileHubDatabase, entries: EntryService, readonly mutations: MutationService, private readonly dependencies: UploadDependencies = {}, now = Date.now) { super(database, entries, now); }
  async close() { this.closed = true; await Promise.allSettled([...this.pending]); await this.guard?.then((handle) => handle.close(), () => {}); }
  private run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.closed || this.pending.size >= 4) return Promise.reject(new PublicError('SERVICE_UNAVAILABLE'));
    const result = operation(); this.pending.add(result); void result.finally(() => this.pending.delete(result)).catch(() => {}); return result;
  }
  override create(user: string, entryId: string, input: UploadCreate, reauthorize = () => {}) { return this.run(() => super.create(user, entryId, input, reauthorize)); }
  private authorize(user: string, row: UploadRow, reauthorize: () => void) { reauthorize(); return this.entries.authorize(user, row.entryId, row.parent, 'write'); }
  private async claim(user: string, id: string, state: 'writing' | 'finalizing', reauthorize: () => void) {
    const row = this.own(user, id); this.authorize(user, row, reauthorize);
    if (row.state !== 'open' || row.owner) throw new PublicError(row.state === 'needs_review' ? 'MUTATION_UNCERTAIN' : 'MUTATION_BUSY');
    if (row.expiresAt <= this.now()) throw new PublicError('CONFLICT');
    await (this.guard ??= createOwner(this.database.sqlite.name, this.owner));
    this.authorize(user, row, reauthorize);
    const generation = row.generation + 1;
    if (!this.database.db.update(uploadSessions).set({ state, owner: this.owner, generation, updatedAt: this.now() }).where(and(eq(uploadSessions.id, id), eq(uploadSessions.generation, row.generation), eq(uploadSessions.state, 'open'))).run().changes) throw new PublicError('MUTATION_BUSY');
    return { ...row, state, owner: this.owner, generation };
  }
  private change(row: UploadRow, values: Partial<typeof uploadSessions.$inferInsert>) {
    if (!this.database.db.update(uploadSessions).set(values).where(and(eq(uploadSessions.id, row.id), eq(uploadSessions.owner, this.owner), eq(uploadSessions.generation, row.generation))).run().changes) throw new PublicError('MUTATION_UNCERTAIN');
  }
  private payload(user: string, row: UploadRow, reauthorize: () => void) {
    return openPayload(this.authorize(user, row, reauthorize), row, (stagingIdentity, payloadIdentity) => this.change(row, { stagingIdentity, payloadIdentity }));
  }
  receive(user: string, id: string, offset: number, length: number, sha256: string, input: Readable, reauthorize = () => {}): Promise<UploadResponse> {
    return this.run(async () => {
      if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length) || length < 1 || length > UPLOAD_LIMITS.chunkBytes || !/^[a-f0-9]{64}$/.test(sha256)) throw new PublicError('BAD_REQUEST');
      const row = await this.claim(user, id, 'writing', reauthorize);
      let payload: Awaited<ReturnType<typeof openPayload>> | undefined, wrote = false, committed = false;
      try {
        await this.dependencies.checkpoint?.('claimed', id);
        const replay = offset < row.offset ? this.database.db.select().from(uploadChunks).where(and(eq(uploadChunks.uploadId, id), eq(uploadChunks.offset, offset))).get() : undefined;
        if (offset !== row.offset && (!replay || replay.length !== length || replay.sha256 !== sha256)) throw new PublicError('CONFLICT');
        if (!replay && length !== Math.min(UPLOAD_LIMITS.chunkBytes, row.size - offset)) throw new PublicError('CONFLICT');
        payload = await this.payload(user, row, reauthorize);
        const before = await payload.handle.stat({ bigint: true });
        if (before.size !== BigInt(row.offset)) throw new PublicError('MUTATION_UNCERTAIN');
        const hash = createHash('sha256'); let received = 0;
        for await (const piece of input) {
          if (!(piece instanceof Uint8Array) || received + piece.byteLength > length) throw new PublicError('PAYLOAD_TOO_LARGE');
          hash.update(piece);
          if (!replay) {
            let done = 0; wrote = true;
            while (done < piece.byteLength) { const { bytesWritten } = await payload.handle.write(piece, done, piece.byteLength - done, offset + received + done); if (!bytesWritten) throw new PublicError('STORAGE_FULL'); done += bytesWritten; }
          }
          received += piece.byteLength;
        }
        if (received !== length || hash.digest('hex') !== sha256) throw new PublicError('CONFLICT');
        await payload.handle.sync(); await payload.verify(); this.authorize(user, row, reauthorize);
        if (row.expiresAt <= this.now()) throw new PublicError('CONFLICT');
        await this.dependencies.checkpoint?.('received', id);
        this.database.sqlite.transaction(() => {
          this.authorize(user, row, reauthorize);
          if (row.expiresAt <= this.now()) throw new PublicError('CONFLICT');
          if (!replay) this.database.db.insert(uploadChunks).values({ uploadId: id, offset, length, sha256 }).run();
          this.change(row, { state: 'open', owner: null, offset: replay ? row.offset : offset + length, generation: row.generation + 1, updatedAt: this.now() });
        }).immediate(); committed = true;
        return this.get(user, id);
      } catch (error) {
        if (!committed) {
          let safe = !(error instanceof PublicError && ['MUTATION_UNCERTAIN', 'SERVICE_UNAVAILABLE'].includes(error.code));
          if (payload && wrote) { try { await payload.verify(); await payload.handle.truncate(row.offset); await payload.handle.sync(); } catch { safe = false; } }
          try { this.change(row, { state: safe ? 'open' : 'needs_review', owner: safe ? null : this.owner, generation: row.generation + 1, updatedAt: this.now() }); } catch { /* DB unavailable: durable owner is intentionally retained. */ }
        }
        throw uploadError(error);
      } finally { await payload?.close(); }
    });
  }
  finalize(user: string, id: string, reauthorize = () => {}): Promise<UploadResponse> {
    return this.run(async () => {
      const previous = this.own(user, id);
      if (previous.state === 'completed') { this.authorize(user, previous, reauthorize); return this.get(user, id); }
      const row = await this.claim(user, id, 'finalizing', reauthorize);
      let payload: Awaited<ReturnType<typeof openPayload>> | undefined;
      try {
        if (row.offset !== row.size) throw new PublicError('CONFLICT');
        payload = await this.payload(user, row, reauthorize);
        const before = await payload.handle.stat({ bigint: true });
        if (before.size !== BigInt(row.size)) throw new PublicError('MUTATION_UNCERTAIN');
        const chunks = this.database.db.select().from(uploadChunks).where(eq(uploadChunks.uploadId, id)).all().sort((a, b) => a.offset - b.offset);
        const full = createHash('sha256'), buffer = Buffer.alloc(65_536); let position = 0;
        for (const chunk of chunks) {
          if (chunk.offset !== position || chunk.length !== Math.min(UPLOAD_LIMITS.chunkBytes, row.size - position)) throw new PublicError('MUTATION_UNCERTAIN');
          const hash = createHash('sha256'); let done = 0;
          while (done < chunk.length) { const { bytesRead } = await payload.handle.read(buffer, 0, Math.min(buffer.length, chunk.length - done), position + done); if (!bytesRead) throw new PublicError('MUTATION_UNCERTAIN'); const bytes = buffer.subarray(0, bytesRead); hash.update(bytes); full.update(bytes); done += bytesRead; }
          if (hash.digest('hex') !== chunk.sha256) throw new PublicError('MUTATION_UNCERTAIN');
          position += chunk.length;
        }
        const sha256 = full.digest('hex');
        if (position !== row.size || (row.expectedSha256 && row.expectedSha256 !== sha256) || stableWitness(before) !== stableWitness(await payload.handle.stat({ bigint: true }))) throw new PublicError('MUTATION_UNCERTAIN');
        await payload.handle.sync(); await payload.verify(); this.authorize(user, row, reauthorize);
        if (row.expiresAt <= this.now()) throw new PublicError('CONFLICT');
        this.change(row, { sha256 }); await this.dependencies.checkpoint?.('verified', id);
        const publication = randomUUID(), target = joinPath(row.parent, row.name), plan = { entryId: row.entryId, source: uploadPath(id), target, request: { uploadId: id, sha256, size: row.size } };
        const beforePublish = () => { const access = this.authorize(user, row, reauthorize); if (row.expiresAt <= this.now()) throw new PublicError('CONFLICT'); return access; };
        const result = await this.mutations.move(user, 'rename', publication, plan, [row.parent], async () => {
          const access = beforePublish(), destination = await openScoped(access.root, row.parent);
          if (!destination.stat.isDirectory()) { await destination.close(); throw new PublicError('CONFLICT'); }
          return { access, destination, sourceParent: '.filehub/staging', sourceName: `u-${id}`, prepare: false, stable: stableWitness(before) };
        }, () => { beforePublish(); }, {
          prepared: () => { this.change(row, { publicationId: publication }); },
          terminal: (status) => { this.change(row, { state: status === 'succeeded' ? 'completed' : status === 'failed' ? 'open' : 'needs_review', owner: status === 'needs_review' ? this.owner : null, generation: row.generation + 1, cleaned: status === 'succeeded', reservedBytes: status === 'succeeded' ? 0 : row.reservedBytes, updatedAt: this.now() }); },
        });
        if (result.status !== 'succeeded') throw new PublicError('MUTATION_UNCERTAIN');
        return this.get(user, id);
      } catch (error) {
        const current = this.own(user, id);
        if (current.owner === this.owner && current.generation === row.generation) {
          const safe = error instanceof PublicError && !['MUTATION_UNCERTAIN', 'SERVICE_UNAVAILABLE'].includes(error.code);
          try { this.change(row, { state: safe ? 'open' : 'needs_review', owner: safe ? null : this.owner, generation: row.generation + 1, updatedAt: this.now() }); } catch { /* Preserve a durable owner when terminal DB commit is unavailable. */ }
        }
        throw uploadError(error);
      } finally { await payload?.close(); }
    });
  }
}
