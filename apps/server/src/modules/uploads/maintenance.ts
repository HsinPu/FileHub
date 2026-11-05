import { createHash, randomUUID } from 'node:crypto';
import type { FileHandle } from 'node:fs/promises';
import { and, asc, eq, inArray, isNull, lte, or } from 'drizzle-orm';
import { UPLOAD_LIMITS } from '@filehub/contracts';
import type { FileHubDatabase } from '../../persistence/database.js';
import { uploadSessions, uploadChunks, writeIntents } from '../../persistence/schema.js';
import { PublicError } from '../../plugins/errors.js';
import { createOwner, native, nativeError, proveOwner, stableWitness, witness } from '../../storage/native.js';
import { openScoped } from '../../storage/scoped.js';
import { recoverWrites, type RecoveryResult } from '../../storage/recovery.js';
import { EntryService } from '../entries/service.js';
import { uploadPath, type UploadRow } from './catalog.js';
import { identityOf, openPayload } from './payload.js';

type Outcome = 'open' | 'cleaned' | 'busy' | 'needs_review' | 'owner_unknown' | 'changed';
export interface UploadMaintenanceResult { items: { id: string; outcome: Outcome }[]; publications: RecoveryResult[] }
export interface MaintenanceDependencies { checkpoint?(phase: 'fenced' | 'unlinked', id: string): Promise<void> | void }
export class UploadMaintainer {
  readonly owner = randomUUID();
  private guard: Promise<FileHandle> | undefined;
  private current: Promise<UploadMaintenanceResult> | undefined;
  private closed = false;
  private cursor = '';
  private readonly entries: EntryService;
  constructor(readonly database: FileHubDatabase, private readonly dependencies: MaintenanceDependencies = {}, private readonly now = Date.now) { this.entries = new EntryService(database); }
  run(signal?: AbortSignal): Promise<UploadMaintenanceResult> {
    if (this.closed) return Promise.reject(new PublicError('SERVICE_UNAVAILABLE'));
    if (this.current) return this.current;
    this.current = this.perform(signal).finally(() => { this.current = undefined; }); return this.current;
  }
  async close() { this.closed = true; await this.current?.catch(() => {}); await this.guard?.then((handle) => handle.close(), () => {}); }
  private change(row: UploadRow, values: Partial<typeof uploadSessions.$inferInsert>) {
    if (!this.database.db.update(uploadSessions).set({ ...values, generation: row.generation + 1, updatedAt: this.now() }).where(and(eq(uploadSessions.id, row.id), eq(uploadSessions.owner, this.owner), eq(uploadSessions.generation, row.generation))).run().changes) throw new PublicError('CONFLICT');
  }
  private async perform(signal?: AbortSignal): Promise<UploadMaintenanceResult> {
    if (process.platform !== 'linux') throw new PublicError('WRITE_UNSUPPORTED');
    if (!this.database.isReady()) throw new PublicError('SERVICE_UNAVAILABLE');
    const rows = this.database.db.select().from(uploadSessions).where(and(eq(uploadSessions.cleaned, false), or(lte(uploadSessions.expiresAt, this.now()), inArray(uploadSessions.state, ['writing', 'finalizing', 'cancelled', 'expired', 'needs_review'])))).orderBy(asc(uploadSessions.id)).limit(65).all();
    if (rows.length > 64) throw new PublicError('RESOURCE_LIMIT');
    const selected = [...rows.filter((row) => row.id > this.cursor), ...rows.filter((row) => row.id <= this.cursor)].slice(0, 4);
    const result: UploadMaintenanceResult = { items: [], publications: [] };
    if (!selected.length || signal?.aborted) return result;
    if (selected.some((row) => row.publicationId && this.database.db.select().from(writeIntents).where(and(eq(writeIntents.id, row.publicationId), inArray(writeIntents.status, ['prepared', 'applying', 'needs_review']))).get())) result.publications = (await recoverWrites(this.database, { uploadIds: selected.map((row) => row.id) })).items;
    for (const selectedRow of selected) {
      if (signal?.aborted) break;
      this.cursor = selectedRow.id;
      const row = this.database.db.select().from(uploadSessions).where(eq(uploadSessions.id, selectedRow.id)).get();
      if (!row || row.cleaned || row.state === 'completed') continue;
      const publication = row.publicationId ? this.database.db.select().from(writeIntents).where(eq(writeIntents.id, row.publicationId)).get() : undefined;
      if (publication && publication.status !== 'failed') { result.items.push({ id: row.id, outcome: publication.status === 'needs_review' || publication.status === 'succeeded' ? 'needs_review' : 'busy' }); continue; }
      if (row.state === 'open' && !row.owner && row.expiresAt > this.now()) { result.items.push({ id: row.id, outcome: 'open' }); continue; }
      result.items.push({ id: row.id, outcome: await this.process(row) });
    }
    return result;
  }
  private async process(previous: UploadRow): Promise<Outcome> {
    let proof: FileHandle | undefined, payload: Awaited<ReturnType<typeof openPayload>> | undefined;
    let fencedRow: UploadRow | undefined;
    try {
      if (previous.owner && previous.owner !== this.owner) {
        try { proof = await proveOwner(this.database.sqlite.name, previous.owner); }
        catch (error) { return error instanceof PublicError && error.code === 'MUTATION_BUSY' ? 'busy' : 'owner_unknown'; }
      }
      await (this.guard ??= createOwner(this.database.sqlite.name, this.owner));
      const state = ['open', 'writing', 'finalizing'].includes(previous.state) && previous.expiresAt <= this.now() ? 'expired' : previous.state;
      const fenced = this.database.db.update(uploadSessions).set({ state, owner: this.owner, generation: previous.generation + 1, updatedAt: this.now() }).where(and(eq(uploadSessions.id, previous.id), eq(uploadSessions.generation, previous.generation), eq(uploadSessions.state, previous.state), previous.owner === null ? isNull(uploadSessions.owner) : eq(uploadSessions.owner, previous.owner))).run();
      if (!fenced.changes) return 'changed';
      const row = { ...previous, state, owner: this.owner, generation: previous.generation + 1 };
      fencedRow = row;
      await this.dependencies.checkpoint?.('fenced', row.id);
      const access = this.entries.maintenance(row.entryId), control = await openScoped(access.root, '.filehub', true);
      try { if (identityOf(control.stat) !== access.controlIdentity) throw new PublicError('MUTATION_UNCERTAIN'); } finally { await control.close(); }
      const discard = row.state === 'cancelled' || row.state === 'expired';
      let exists = true;
      try { const resource = await openScoped(access.root, uploadPath(row.id), true); await resource.close(); }
      catch (error) { if (error instanceof PublicError && error.code === 'NOT_FOUND') exists = false; else throw error; }
      if (!exists) {
        if (!discard && (row.payloadIdentity || row.offset !== 0)) throw new PublicError('MUTATION_UNCERTAIN');
        const parent = await openScoped(access.root, '.filehub/staging', true);
        try { if (row.stagingIdentity && identityOf(parent.stat) !== row.stagingIdentity) throw new PublicError('MUTATION_UNCERTAIN'); await parent.handle.sync(); } finally { await parent.close(); }
        this.change(row, { state: discard ? row.state : 'open', owner: null, cleaned: discard, reservedBytes: discard ? 0 : row.reservedBytes }); return discard ? 'cleaned' : 'open';
      }
      if (!row.payloadIdentity || !row.stagingIdentity) throw new PublicError('MUTATION_UNCERTAIN');
      payload = await openPayload(access, row, () => { throw new PublicError('MUTATION_UNCERTAIN'); });
      const before = await payload.handle.stat({ bigint: true });
      if (before.size < BigInt(row.offset) || before.size > BigInt(row.size)) throw new PublicError('MUTATION_UNCERTAIN');
      if (discard) {
        await payload.verify();
        const guard = await this.guard;
        if (!guard) throw new PublicError('MUTATION_UNCERTAIN');
        const code = await native(['unlink', Buffer.from(`u-${row.id}`).toString('hex'), witness(before)], [guard.fd, payload.parent.handle.fd]);
        if (code !== 0) throw nativeError(code);
        await this.dependencies.checkpoint?.('unlinked', row.id);
        this.change(row, { owner: null, cleaned: true, reservedBytes: 0 }); return 'cleaned';
      }
      const chunks = this.database.db.select().from(uploadChunks).where(eq(uploadChunks.uploadId, row.id)).orderBy(asc(uploadChunks.offset)).limit(257).all();
      if (chunks.length > 256) throw new PublicError('MUTATION_UNCERTAIN');
      const buffer = Buffer.alloc(65_536), full = createHash('sha256'); let position = 0;
      for (const chunk of chunks) {
        if (chunk.offset !== position || chunk.length !== Math.min(UPLOAD_LIMITS.chunkBytes, row.size - position) || position + chunk.length > row.offset) throw new PublicError('MUTATION_UNCERTAIN');
        const hash = createHash('sha256'); let done = 0;
        while (done < chunk.length) { const { bytesRead } = await payload.handle.read(buffer, 0, Math.min(buffer.length, chunk.length - done), position + done); if (!bytesRead) throw new PublicError('MUTATION_UNCERTAIN'); const bytes = buffer.subarray(0, bytesRead); hash.update(bytes); full.update(bytes); done += bytesRead; }
        if (hash.digest('hex') !== chunk.sha256) throw new PublicError('MUTATION_UNCERTAIN'); position += chunk.length;
      }
      if (position !== row.offset || (row.offset === row.size && row.expectedSha256 && full.digest('hex') !== row.expectedSha256) || stableWitness(before) !== stableWitness(await payload.handle.stat({ bigint: true }))) throw new PublicError('MUTATION_UNCERTAIN');
      await payload.verify(); if (before.size > BigInt(row.offset)) await payload.handle.truncate(row.offset); await payload.handle.sync();
      this.change(row, { state: 'open', owner: null }); return 'open';
    } catch {
      if (fencedRow && !['cancelled', 'expired'].includes(fencedRow.state)) { try { this.change(fencedRow, { state: 'needs_review' }); } catch { /* 保留 durable owner，不能假裝已釋放。 */ } }
      return 'needs_review';
    }
    finally { try { await payload?.close(); } finally { await proof?.close(); } }
  }
}
