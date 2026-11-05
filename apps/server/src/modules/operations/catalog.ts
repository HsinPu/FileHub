import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { Check } from 'typebox/value';
import { OperationCreateSchema, OPERATION_LIMITS, type ApiErrorCode, type OperationCreate, type OperationResponse, type OperationKind } from '@filehub/contracts';
import type { FileHubDatabase } from '../../persistence/database.js';
import { operations, operationItems, operationArtifacts, users, entries } from '../../persistence/schema.js';
import { PublicError } from '../../plugins/errors.js';
import { assertAvailable, RESERVED_OPERATION_STATES, resourceReservations, type Reservation } from '../../storage/reservations.js';
import { proveOwner } from '../../storage/native.js';

export interface OperationClaim { id: string; owner: string; attempt: number }
export type OperationRecord = typeof operations.$inferSelect;
export type ItemRecord = typeof operationItems.$inferSelect;
export const bounded = (value: unknown) => {
  const canonical = (item: unknown): unknown => Array.isArray(item) ? item.map(canonical) : item && typeof item === 'object' ? Object.fromEntries(Object.entries(item).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0).map(([key,child]) => [key,canonical(child)])) : item;
  const text = JSON.stringify(canonical(value)); if (typeof text !== 'string' || Buffer.byteLength(text) > 65536) throw new PublicError('RESOURCE_LIMIT'); return text;
};
export function operationResources(input: OperationCreate): Reservation[] {
  if ((input.kind === 'archive') === !!input.destination) throw new PublicError('BAD_REQUEST');
  const paths=[...input.sources.map(({entryId,path})=>({entryId,path})),...(input.kind==='move'?input.sources.map(({entryId,path})=>({entryId,path:path.includes('/')?path.slice(0,path.lastIndexOf('/')):''})):[]),...(input.destination?[{entryId:input.destination.entryId,path:input.destination.path}]:[])];
  return resourceReservations(paths.filter((item,index)=>paths.findIndex(other=>other.entryId===item.entryId&&other.path===item.path)===index));
}
export class OperationCatalog {
  constructor(readonly database: FileHubDatabase, private readonly now = Date.now) {}
  ready() { if (!this.database.isReady()) throw new PublicError('SERVICE_UNAVAILABLE'); }
  private user(id: string) { this.ready(); if (!this.database.db.select().from(users).where(and(eq(users.id, id), eq(users.enabled, true))).get()) throw new PublicError('UNAUTHORIZED'); }
  items(id: string): ItemRecord[] { return this.database.db.select().from(operationItems).where(eq(operationItems.operationId, id)).orderBy(operationItems.index).limit(16).all(); }
  record(id: string): OperationRecord { this.ready(); const row = this.database.db.select().from(operations).where(eq(operations.id, id)).get(); if (!row) throw new PublicError('NOT_FOUND'); return row; }
  prior(user: string, input: OperationCreate): OperationResponse | undefined {
    this.user(user); const row = this.database.db.select().from(operations).where(eq(operations.id, input.id)).get();
    if (!row) return undefined; if (row.userId !== user) throw new PublicError('NOT_FOUND'); if (row.request !== bounded(input)) throw new PublicError('CONFLICT');
    return this.get(user, input.id);
  }
  enqueue(user: string, input: OperationCreate, resources: readonly Reservation[]): OperationResponse {
    this.user(user);
    if (!Check(OperationCreateSchema, input)) throw new PublicError('BAD_REQUEST');
    const request = bounded(input), normalized = resourceReservations(resources), encoded = bounded(normalized);
    if (encoded !== bounded(operationResources(input))) throw new PublicError('BAD_REQUEST');
    return this.database.sqlite.transaction(() => {
      this.user(user);
      const prior = this.database.db.select().from(operations).where(eq(operations.id, input.id)).get();
      if (prior) { if (prior.userId !== user) throw new PublicError('NOT_FOUND'); if (prior.request !== request || prior.resources !== encoded) throw new PublicError('CONFLICT'); return this.get(user, input.id); }
      for (const resource of normalized) if (!this.database.db.select().from(entries).where(and(eq(entries.id, resource.entryId), eq(entries.enabled, true))).get()) throw new PublicError('NOT_FOUND');
      const active = this.database.db.select({ userId: operations.userId }).from(operations).where(inArray(operations.state, [...RESERVED_OPERATION_STATES])).limit(33).all();
      if (active.length >= OPERATION_LIMITS.active || active.filter((row) => row.userId === user).length >= OPERATION_LIMITS.userActive) throw new PublicError('RESOURCE_LIMIT');
      if ((this.database.sqlite.prepare<[], { n: number }>('SELECT count(*) AS n FROM operations').get()?.n ?? 0) >= OPERATION_LIMITS.history) throw new PublicError('RESOURCE_LIMIT');
      assertAvailable(this.database, normalized);
      const now = this.now();
      this.database.db.insert(operations).values({ id: input.id, userId: user, kind: input.kind, state: 'queued', request, resources: encoded, createdAt: now, updatedAt: now }).run();
      input.sources.forEach((source, index) => { this.database.db.insert(operationItems).values({ operationId: input.id, index, entryId: source.entryId, path: source.path, updatedAt: now }).run(); });
      return this.get(user, input.id);
    }).immediate();
  }
  get(user: string, id: string): OperationResponse {
    this.user(user); const row = this.record(id); if (row.userId !== user) throw new PublicError('NOT_FOUND');
    const items = this.items(id);
    const artifact=this.database.db.select().from(operationArtifacts).where(eq(operationArtifacts.operationId,id)).get();
    return { id, kind: row.kind, state: row.state, cancelRequested: row.cancelRequested, attempt: row.attempt,
      items: items.map((item) => ({ index: item.index, entryId: item.entryId, path: item.path, state: item.state, bytesDone: item.bytesDone, bytesTotal: item.bytesTotal, ...(item.errorCode ? { errorCode: item.errorCode as ApiErrorCode } : {}) })),
      createdAt: new Date(row.createdAt).toISOString(), updatedAt: new Date(row.updatedAt).toISOString(), canRetry: row.state === 'interrupted' && row.owner === null && items.every((item) => item.state === 'pending' && item.evidence === '{}'),
      ...(row.state==='succeeded'&&artifact?.state==='available'&&artifact.sha256&&artifact.expiresAt>this.now()?{artifact:{bytes:artifact.bytes,sha256:artifact.sha256,expiresAt:new Date(artifact.expiresAt).toISOString()}}:{}) };
  }
  list(user: string) { this.user(user); return { items: this.database.db.select({ id: operations.id }).from(operations).where(eq(operations.userId, user)).orderBy(sql`CASE WHEN ${operations.state} IN ('queued','running','cancelling','interrupted','needs_review') THEN 0 ELSE 1 END`, desc(operations.createdAt), desc(operations.id)).limit(50).all().map(({ id }) => this.get(user, id)) }; }
  cancel(user: string, id: string): OperationResponse {
    return this.database.sqlite.transaction(() => {
      const view = this.get(user, id), row = this.record(id);
      if (!RESERVED_OPERATION_STATES.some((state) => state === row.state)) return view;
      const safe = row.state === 'queued' || row.state === 'interrupted' && view.canRetry;
      this.database.db.update(operations).set({ cancelRequested: true, state: safe ? 'cancelled' : row.state === 'running' ? 'cancelling' : row.state, updatedAt: this.now() }).where(eq(operations.id, id)).run();
      if (safe) this.database.db.update(operationItems).set({ state: 'cancelled', updatedAt: this.now() }).where(eq(operationItems.operationId, id)).run();
      return this.get(user, id);
    }).immediate();
  }
  retry(user: string, id: string): OperationResponse {
    return this.database.sqlite.transaction(() => {
      const view = this.get(user, id); if (!view.canRetry) throw new PublicError('CONFLICT');
      this.database.db.update(operations).set({ state: 'queued', cancelRequested: false, updatedAt: this.now() }).where(and(eq(operations.id, id), eq(operations.state, 'interrupted'), sql`${operations.owner} IS NULL`)).run();
      return this.get(user, id);
    }).immediate();
  }
  next(kinds: readonly OperationKind[]): string | undefined {
    this.ready(); if (!kinds.length) return undefined;
    return this.database.db.select({ id: operations.id }).from(operations).where(and(eq(operations.state, 'queued'), inArray(operations.kind, [...kinds]))).orderBy(operations.createdAt, operations.id).limit(1).get()?.id;
  }
  claim(id: string, owner: string = randomUUID()): OperationClaim | undefined {
    this.ready();
    return this.database.sqlite.transaction(() => {
      const row = this.record(id);
      const result = this.database.db.update(operations).set({ state: 'running', owner, attempt: row.attempt + 1, leaseUntil: this.now() + OPERATION_LIMITS.leaseMs, updatedAt: this.now() })
        .where(and(eq(operations.id, id), eq(operations.state, 'queued'), eq(operations.attempt, row.attempt), eq(operations.cancelRequested, false))).run();
      return result.changes === 1 ? { id, owner, attempt: row.attempt + 1 } : undefined;
    }).immediate();
  }
  owned(claim: OperationClaim): OperationRecord {
    const row = this.record(claim.id);
    if (row.owner !== claim.owner || row.attempt !== claim.attempt || !['running', 'cancelling'].includes(row.state) || (row.leaseUntil ?? 0) <= this.now()) throw new PublicError('CONFLICT');
    return row;
  }
  heartbeat(claim: OperationClaim): void {
    this.database.sqlite.transaction(() => { this.owned(claim); this.database.db.update(operations).set({ leaseUntil: this.now() + OPERATION_LIMITS.leaseMs, updatedAt: this.now() }).where(eq(operations.id, claim.id)).run(); }).immediate();
  }
  item(claim: OperationClaim, index: number, state: ItemRecord['state'], evidence?: unknown, errorCode?: ApiErrorCode): void {
    this.database.sqlite.transaction(() => {
      const row = this.owned(claim);
      const current = this.items(claim.id).find((item) => item.index === index); if (!current) throw new PublicError('NOT_FOUND');
      if (current.state === 'pending' && state === 'running' && row.cancelRequested) throw new PublicError('CONFLICT');
      const allowed = current.state === 'pending' ? ['running','failed','cancelled'] : current.state === 'running' ? ['running','succeeded','failed','cancelled','needs_review'] : [];
      if (!allowed.includes(state)) throw new PublicError('CONFLICT');
      this.database.db.update(operationItems).set({ state, ...(evidence === undefined ? {} : { evidence: bounded(evidence) }), errorCode: errorCode ?? null, updatedAt: this.now() }).where(and(eq(operationItems.operationId, claim.id), eq(operationItems.index, index))).run();
    }).immediate();
  }
  progress(claim: OperationClaim, index: number, done: number, total: number, force = false): boolean {
    if (!Number.isSafeInteger(done) || !Number.isSafeInteger(total) || done < 0 || done > total || total > OPERATION_LIMITS.bytes) throw new PublicError('BAD_REQUEST');
    return this.database.sqlite.transaction(() => {
      this.owned(claim); const item = this.items(claim.id).find((row) => row.index === index);
      if (!item || item.state !== 'running' || done < item.bytesDone || (item.bytesTotal !== 0 && item.bytesTotal !== total)) throw new PublicError('CONFLICT');
      if (!force && this.now() - item.updatedAt < OPERATION_LIMITS.progressMs) return false;
      this.database.db.update(operationItems).set({ bytesDone: done, bytesTotal: total, updatedAt: this.now() }).where(and(eq(operationItems.operationId, claim.id), eq(operationItems.index, index))).run(); return true;
    }).immediate();
  }
  finish(claim: OperationClaim): void {
    this.database.sqlite.transaction(() => {
      const row = this.owned(claim), items = this.items(claim.id);
      if (items.some((item) => ['pending','running'].includes(item.state))) throw new PublicError('CONFLICT');
      const success = items.filter((item) => item.state === 'succeeded').length;
      const state = items.some((item) => item.state === 'needs_review') ? 'needs_review' : success === items.length ? 'succeeded' : success > 0 ? 'partial' : row.cancelRequested || items.every((item) => item.state === 'cancelled') ? 'cancelled' : 'failed';
      this.database.db.update(operations).set({ state, leaseUntil: null, updatedAt: this.now() }).where(eq(operations.id, claim.id)).run();
    }).immediate();
  }
  async recoverExpired(kinds?:readonly OperationKind[]): Promise<{ id: string; state: string }[]> {
    this.ready(); const result: { id: string; state: string }[] = [];
    if(kinds&&!kinds.length)return result;
    const rows = this.database.db.select().from(operations).where(and(inArray(operations.state, ['running','cancelling']), lt(operations.leaseUntil, this.now()),...(kinds?[inArray(operations.kind,[...kinds])]:[]))).orderBy(operations.updatedAt).limit(4).all();
    for (const row of rows) {
      if (!row.owner) continue;
      let proof;
      try { proof = await proveOwner(this.database.sqlite.name, row.owner); }
      catch { result.push({ id: row.id, state: 'owner_unproven' }); continue; }
      try {
        this.database.sqlite.transaction(() => {
          const current = this.record(row.id);
          if (current.owner !== row.owner || current.attempt !== row.attempt || !['running','cancelling'].includes(current.state) || (current.leaseUntil ?? 0) >= this.now()) return;
          const untouched = this.items(row.id).every((item) => item.state === 'pending' && item.evidence === '{}');
          const state = untouched ? current.cancelRequested ? 'cancelled' : 'interrupted' : 'needs_review';
          this.database.db.update(operations).set({ state, owner: untouched ? null : row.owner, attempt: row.attempt + 1, leaseUntil: null, updatedAt: this.now() }).where(eq(operations.id, row.id)).run();
          if (!untouched) this.database.db.update(operationItems).set({ state: 'needs_review', updatedAt: this.now() }).where(and(eq(operationItems.operationId, row.id), eq(operationItems.state, 'running'))).run();
          if (state === 'cancelled') this.database.db.update(operationItems).set({ state: 'cancelled', updatedAt: this.now() }).where(eq(operationItems.operationId, row.id)).run();
          result.push({ id: row.id, state });
        }).immediate();
      } finally { await proof.close(); }
    }
    return result;
  }
}
