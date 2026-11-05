import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { ApiErrorCode, MutationResponse } from '@filehub/contracts';
import type { FileHubDatabase } from '../persistence/database.js';
import { writeIntents, users, entries, operations } from '../persistence/schema.js';
import { PublicError } from '../plugins/errors.js';
import { assertAvailable, resourceReservations, type Reservation } from './reservations.js';
import type { OperationPermit } from './reservations.js';
export type { Reservation } from './reservations.js';

export interface WriteHandle { id: string; owner: string; generation: number }
type Intent = typeof writeIntents.$inferSelect;
const boundedJson = (value: unknown) => { const result = JSON.stringify(value); if (typeof result !== 'string') throw new PublicError('BAD_REQUEST'); if (Buffer.byteLength(result) > 16_384) throw new PublicError('RESOURCE_LIMIT'); return result; };

export class WriteCoordinator {
  constructor(readonly database: FileHubDatabase, readonly owner: string = randomUUID()) {}
  private ready() { if (!this.database.isReady()) throw new PublicError('SERVICE_UNAVAILABLE'); }
  begin(userId: string, kind: Intent['kind'], resources: readonly Reservation[], payload: unknown, id: string = randomUUID(), permit?:OperationPermit): WriteHandle {
    this.ready();
    if (!['mkdir', 'rename', 'trash', 'restore'].includes(kind) || !resources.length || resources.length > 16) throw new PublicError('BAD_REQUEST');
    const normalized = resourceReservations(resources);
    const serialized = boundedJson(payload);
    return this.database.sqlite.transaction(() => {
      if (!this.database.db.select().from(users).where(and(eq(users.id, userId), eq(users.enabled, true))).get()) throw new PublicError('UNAUTHORIZED');
      for (const resource of normalized) if (!this.database.db.select().from(entries).where(and(eq(entries.id, resource.entryId), eq(entries.enabled, true))).get()) throw new PublicError('NOT_FOUND');
      const count = this.database.sqlite.prepare<[], { n: number }>('SELECT count(*) AS n FROM write_intents').get()?.n ?? 0;
      if (count >= 10_000) throw new PublicError('RESOURCE_LIMIT');
      if(permit&&this.database.db.select({userId:operations.userId}).from(operations).where(eq(operations.id,permit.id)).get()?.userId!==userId)throw new PublicError('FORBIDDEN');
      assertAvailable(this.database, normalized,permit);
      const record = { id, userId, kind, status: 'prepared' as const, owner: this.owner, generation: 1,
        resources: boundedJson(normalized), payload: serialized, createdAt: Date.now(), updatedAt: Date.now() };
      this.database.db.insert(writeIntents).values(record).run();
      return { id: record.id, owner: this.owner, generation: 1 };
    }).immediate();
  }
  transition(handle: WriteHandle, from: Intent['status'], to: Intent['status'], evidence: unknown = {}, errorCode?: ApiErrorCode): WriteHandle {
    this.ready();
    if (handle.owner !== this.owner) throw new PublicError('CONFLICT');
    if (!((from === 'prepared' && ['applying', 'failed', 'needs_review'].includes(to)) || (from === 'applying' && ['succeeded', 'failed', 'needs_review'].includes(to)))) throw new PublicError('CONFLICT');
    const encoded = boundedJson(evidence);
    const result = this.database.db.update(writeIntents).set({ status: to, evidence: encoded, errorCode: errorCode ?? null, generation: handle.generation + 1, updatedAt: Date.now() })
      .where(and(eq(writeIntents.id, handle.id), eq(writeIntents.owner, handle.owner), eq(writeIntents.generation, handle.generation), eq(writeIntents.status, from))).run();
    if (result.changes !== 1) throw new PublicError('CONFLICT');
    return { ...handle, generation: handle.generation + 1 };
  }
  get(userId: string, id: string): MutationResponse {
    this.ready();
    const intent = this.database.db.select().from(writeIntents).where(and(eq(writeIntents.id, id), eq(writeIntents.userId, userId))).get();
    if (!intent) throw new PublicError('NOT_FOUND');
    return { id: intent.id, kind: intent.kind, status: intent.status, createdAt: new Date(intent.createdAt).toISOString(), updatedAt: new Date(intent.updatedAt).toISOString(), ...(intent.errorCode ? { errorCode: intent.errorCode as ApiErrorCode } : {}) };
  }
}
