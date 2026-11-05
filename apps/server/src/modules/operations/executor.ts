import { randomUUID } from 'node:crypto';
import type { FileHandle } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { OperationCreateSchema, type ApiErrorCode, type OperationKind, type OperationCreate } from '@filehub/contracts';
import { Check } from 'typebox/value';
import { createOwner } from '../../storage/native.js';
import { PublicError } from '../../plugins/errors.js';
import { OperationCatalog, operationResources, bounded, type OperationClaim } from './catalog.js';

export interface OperationContext { catalog: OperationCatalog; claim: OperationClaim; user: string; input: OperationCreate; guard: FileHandle; signal: AbortSignal; check(): void }
export type OperationHandler = (context: OperationContext) => Promise<void>;
export class OperationExecutor {
  private readonly stopping = new AbortController();
  private readonly done: Promise<void>;
  private current: Promise<void> | undefined;
  constructor(readonly catalog: OperationCatalog, private readonly handlers: ReadonlyMap<OperationKind, OperationHandler>, pollMs: number) {
    if (!Number.isInteger(pollMs) || pollMs < 50 || pollMs > 60000) throw new RangeError('不正確的 operation poll interval');
    this.done = this.loop(pollMs); void this.done.catch(() => undefined);
  }
  async close(): Promise<void> { this.stopping.abort(); await this.done; await this.current; }
  private async loop(pollMs: number) {
    while (!this.stopping.signal.aborted) {
      try {
        if (!this.current && this.catalog.database.isReady()) {
          await this.catalog.recoverExpired();
          const id = this.catalog.next([...this.handlers.keys()]);
          if (id && !this.stopping.signal.aborted) {
            const task = this.execute(id); this.current = task;
            void task.catch(() => undefined).finally(() => { if (this.current === task) this.current = undefined; });
          }
        }
      } catch { /* DB／guard 不可用保留持久紀錄，下輪再檢查，不重播 running。 */ }
      try { await delay(pollMs, undefined, { signal: this.stopping.signal }); } catch { if (!this.stopping.signal.aborted) throw new Error('Operation poll failed'); }
    }
    await this.current;
  }
  private async execute(id: string): Promise<void> {
    const owner = randomUUID(), guard = await createOwner(this.catalog.database.sqlite.name, owner);
    const stop = new AbortController(), signal = AbortSignal.any([stop.signal, this.stopping.signal]);
    let heartbeat: Promise<void> | undefined;
    try {
      if (signal.aborted) return;
      const claim = this.catalog.claim(id, owner); if (!claim) return;
      const row = this.catalog.record(id), handler = this.handlers.get(row.kind); if (!handler) throw new PublicError('WRITE_UNSUPPORTED');
      heartbeat = (async () => {
        while (!stop.signal.aborted) {
          try { await delay(1000, undefined, { signal: stop.signal }); } catch { break; }
          if (!stop.signal.aborted) { try { this.catalog.heartbeat(claim); } catch { stop.abort(); break; } }
        }
      })();
      const check = () => { const current = this.catalog.owned(claim); if (signal.aborted || current.cancelRequested) throw new PublicError('CONFLICT'); };
      let failureCode: ApiErrorCode = 'WRITE_UNSUPPORTED';
      try {
        const input: unknown = JSON.parse(row.request);
        if (!Check(OperationCreateSchema, input) || input.id !== row.id || input.kind !== row.kind) throw new PublicError('BAD_REQUEST');
        if (bounded(operationResources(input)) !== row.resources) throw new PublicError('BAD_REQUEST');
        await handler({ catalog: this.catalog, claim, user: row.userId, input, guard, signal, check });
      }
      catch (error) {
        failureCode = error instanceof PublicError ? error.code : 'SERVICE_UNAVAILABLE';
        // handler 未證明停止的 running item 不能直接變 cancelled／failed。
        for (const item of this.catalog.items(id)) {
          if (item.state === 'running') this.catalog.item(claim, item.index, 'needs_review', undefined, 'MUTATION_UNCERTAIN');
        }
      }
      const completed=this.catalog.record(id);
      if(completed.owner===claim.owner&&completed.attempt===claim.attempt&&!['queued','running','cancelling'].includes(completed.state))return;
      const current = this.catalog.owned(claim);
      for (const item of this.catalog.items(id)) if (item.state === 'pending') this.catalog.item(claim, item.index, current.cancelRequested || signal.aborted ? 'cancelled' : 'failed', undefined, current.cancelRequested || signal.aborted ? undefined : failureCode);
      this.catalog.finish(claim);
    } finally { stop.abort(); await heartbeat; await guard.close(); }
  }
}
