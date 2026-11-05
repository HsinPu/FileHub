import { eq, inArray } from 'drizzle-orm';
import type { FileHubDatabase } from '../persistence/database.js';
import { operations, writeIntents } from '../persistence/schema.js';
import { PublicError } from '../plugins/errors.js';
import { relativePath } from './scoped.js';
import { overlapsPath } from './names.js';

export interface Reservation { entryId: string; path: string }
export interface OperationPermit { id:string; owner:string; attempt:number; guardFd:number }
export const RESERVED_OPERATION_STATES = ['queued', 'running', 'cancelling', 'interrupted', 'needs_review'] as const;
export function resourceReservations(value: unknown): Reservation[] {
  if (!Array.isArray(value) || !value.length || value.length > 64) throw new PublicError('BAD_REQUEST');
  return value.map((item: unknown) => {
    if (!item || typeof item !== 'object' || !('entryId' in item) || !('path' in item) || typeof item.entryId !== 'string'
      || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(item.entryId) || typeof item.path !== 'string') throw new PublicError('BAD_REQUEST');
    return { entryId: item.entryId, path: relativePath(item.path) };
  });
}
// 呼叫者必須在同一個 IMMEDIATE 短交易內檢查並新增紀錄。
export function assertAvailable(database: FileHubDatabase, resources: readonly Reservation[], permit?:OperationPermit): void {
  if(permit){
    const row=database.db.select().from(operations).where(eq(operations.id,permit.id)).get();
    if(!row||row.owner!==permit.owner||row.attempt!==permit.attempt||row.state!=='running'||row.cancelRequested||(row.leaseUntil??0)<=Date.now())throw new PublicError('CONFLICT');
    const owned=resourceReservations(JSON.parse(row.resources));
    if(resources.some(resource=>!owned.some(parent=>parent.entryId===resource.entryId&&(!parent.path||resource.path===parent.path||resource.path.startsWith(`${parent.path}/`)))))throw new PublicError('FORBIDDEN');
  }
  const writes = database.db.select({ resources: writeIntents.resources }).from(writeIntents).where(inArray(writeIntents.status, ['prepared', 'applying', 'needs_review'])).limit(129).all();
  const jobs = database.db.select({ id:operations.id, resources: operations.resources }).from(operations).where(inArray(operations.state, [...RESERVED_OPERATION_STATES])).limit(129).all().filter(row=>row.id!==permit?.id);
  if (writes.length + jobs.length >= 128) throw new PublicError('RESOURCE_LIMIT');
  for (const record of [...writes, ...jobs]) {
    let other: Reservation[];
    try { other = resourceReservations(JSON.parse(record.resources)); } catch { throw new PublicError('SERVICE_UNAVAILABLE'); }
    if (resources.some((a) => other.some((b) => a.entryId === b.entryId && overlapsPath(a.path, b.path)))) throw new PublicError('MUTATION_BUSY');
  }
}
