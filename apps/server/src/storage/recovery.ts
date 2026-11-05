import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, type FileHandle } from 'node:fs/promises';
import { dirname } from 'node:path';
import { and, eq, inArray } from 'drizzle-orm';
import type { FileHubDatabase } from '../persistence/database.js';
import { trashItems, uploadSessions, users, writeIntents } from '../persistence/schema.js';
import { EntryService } from '../modules/entries/service.js';
import { parentOf, type WritePlan } from '../modules/files/mutations.js';
import { PublicError } from '../plugins/errors.js';
import { openScoped, relativePath, type RootIdentity } from './scoped.js';
import { createOwner, native, ownerPath, proveOwner, stableWitness } from './native.js';
import { validatePublication, verifyPublished } from '../modules/uploads/publication.js';

type Intent = typeof writeIntents.$inferSelect;
type Outcome = 'succeeded' | 'failed' | 'needs_review' | 'busy' | 'owner_unknown' | 'changed';
export interface RecoveryResult { id: string; outcome: Outcome }
const active = ['prepared', 'applying', 'needs_review'] as const;
function planOf(intent: Intent, upload = false): WritePlan {
  const value: unknown = JSON.parse(intent.payload);
  if (!value || typeof value !== 'object' || !('entryId' in value) || typeof value.entryId !== 'string'
    || !('source' in value) || typeof value.source !== 'string' || !('target' in value) || typeof value.target !== 'string') throw new PublicError('BAD_REQUEST');
  const plan = { entryId: value.entryId, source: relativePath(value.source, true), target: relativePath(value.target, true), request: undefined };
  if (!plan.source || !plan.target) throw new PublicError('BAD_REQUEST');
  if (intent.kind === 'mkdir') {
    if (plan.source !== `.filehub/staging/${intent.id}`) throw new PublicError('BAD_REQUEST');
    relativePath(plan.target);
  } else if (intent.kind === 'rename') { relativePath(plan.source, upload); relativePath(plan.target); }
  else if (intent.kind === 'trash') { relativePath(plan.source); if (plan.target !== `.filehub/trash/${intent.id}`) throw new PublicError('BAD_REQUEST'); }
  else { relativePath(plan.target); if (!/^\.filehub\/trash\/[a-f0-9-]{36}$/.test(plan.source)) throw new PublicError('BAD_REQUEST'); }
  return plan;
}
async function observed(root: RootIdentity, path: string) {
  try { const resource = await openScoped(root, path, true); try { return stableWitness(resource.stat); } finally { await resource.close(); } }
  catch (error) { if (error instanceof PublicError && error.code === 'NOT_FOUND') return undefined; throw error; }
}
// No file publication, rename, unlink, or recursive replay occurs here.
export async function recoverWrites(database: FileHubDatabase, options: { uploadIds?: readonly string[] } = {}): Promise<{ items: RecoveryResult[] }> {
  if (process.platform !== 'linux') throw new PublicError('WRITE_UNSUPPORTED');
  if (!database.isReady()) throw new PublicError('SERVICE_UNAVAILABLE');
  const admin = database.db.select().from(users).where(and(eq(users.enabled, true), eq(users.role, 'admin'))).limit(1).get();
  if (!admin) throw new PublicError('SERVICE_UNAVAILABLE');
  const intents = database.db.select().from(writeIntents).where(and(inArray(writeIntents.status, [...active]), options.uploadIds ? inArray(writeIntents.id, database.db.select({ id: uploadSessions.publicationId }).from(uploadSessions).where(inArray(uploadSessions.id, [...options.uploadIds]))) : undefined)).limit(129).all();
  if (intents.length > 128) throw new PublicError('RESOURCE_LIMIT');
  const entries = new EntryService(database), owner = randomUUID(), items: RecoveryResult[] = [];
  let guard: FileHandle | undefined;
  try {
    for (const intent of intents) {
      let probe: FileHandle | undefined, uploadProbe: FileHandle | undefined;
      try {
        const path = ownerPath(database.sqlite.name, intent.owner);
        const parent = await lstat(dirname(path));
        if (!parent.isDirectory() || parent.isSymbolicLink()) throw new PublicError('FORBIDDEN');
        probe = await open(path, constants.O_RDWR | constants.O_NOFOLLOW | constants.O_NONBLOCK);
        if (!(await probe.stat()).isFile()) throw new PublicError('FORBIDDEN');
        const lock = await native(['lock'], [probe.fd]);
        if (lock !== 0) { items.push({ id: intent.id, outcome: lock === 16 ? 'busy' : 'owner_unknown' }); continue; }
        const upload = database.db.select().from(uploadSessions).where(eq(uploadSessions.publicationId, intent.id)).get();
        if (upload?.owner && upload.owner !== intent.owner) {
          try { uploadProbe = await proveOwner(database.sqlite.name, upload.owner); }
          catch (error) { items.push({ id: intent.id, outcome: error instanceof PublicError && error.code === 'MUTATION_BUSY' ? 'busy' : 'owner_unknown' }); continue; }
        }
        guard ??= await createOwner(database.sqlite.name, owner);
        const fenced = database.db.update(writeIntents).set({ owner, generation: intent.generation + 1, updatedAt: Date.now() })
          .where(and(eq(writeIntents.id, intent.id), eq(writeIntents.owner, intent.owner), eq(writeIntents.generation, intent.generation), eq(writeIntents.status, intent.status))).run();
        if (fenced.changes !== 1) { items.push({ id: intent.id, outcome: 'changed' }); continue; }
        let outcome: 'succeeded' | 'failed' | 'needs_review' = 'needs_review';
        let plan: WritePlan | undefined, trashWitness: string | undefined;
        try {
          plan = planOf(intent, upload !== undefined);
          if (upload) validatePublication(intent, plan, upload);
          const access = entries.authorize(admin.id, plan.entryId, '', 'browse');
          const control = await openScoped(access.root, '.filehub', true);
          try { if (`${control.stat.dev}:${control.stat.ino}` !== access.controlIdentity) throw new PublicError('CONFLICT'); }
          finally { await control.close(); }
          if (intent.kind === 'trash' || intent.kind === 'restore') {
            const row = database.db.select().from(trashItems).where(intent.kind === 'trash' ? eq(trashItems.mutationId, intent.id) : eq(trashItems.restoreMutationId, intent.id)).get();
            if (!row || row.entryId !== plan.entryId || (intent.kind === 'trash'
              ? row.id !== intent.id || plan.source !== row.originalPath
              : plan.source !== `.filehub/trash/${row.id}`)) throw new PublicError('CONFLICT');
            trashWitness = row.witness;
          }
          if (intent.status === 'prepared') outcome = 'failed';
          else {
            const evidence: unknown = JSON.parse(intent.evidence);
            if (!evidence || typeof evidence !== 'object' || !('witness' in evidence) || typeof evidence.witness !== 'string') throw new PublicError('BAD_REQUEST');
            if (trashWitness !== undefined && trashWitness !== evidence.witness) throw new PublicError('CONFLICT');
            if (upload) validatePublication(intent, plan, upload, evidence.witness);
            const source = await observed(access.root, plan.source), target = await observed(access.root, plan.target);
            if (source === evidence.witness && target === undefined) outcome = 'failed';
            else if (source === undefined && target === evidence.witness) {
              if (upload) await verifyPublished(access.root, plan.target, upload);
              // Re-establish directory durability before declaring observed completion.
              for (const parent of new Set([parentOf(plan.source), parentOf(plan.target)])) {
                const directory = await openScoped(access.root, parent, true);
                try { await directory.handle.sync(); } finally { await directory.close(); }
              }
              outcome = 'succeeded';
            }
          }
        } catch { outcome = 'needs_review'; }
        if (!database.isReady()) throw new PublicError('SERVICE_UNAVAILABLE');
        const finalOutcome = outcome, currentPlan = plan;
        database.sqlite.transaction(() => {
          const updated = database.db.update(writeIntents).set({ status: finalOutcome, errorCode: finalOutcome === 'needs_review' ? 'MUTATION_UNCERTAIN' : finalOutcome === 'failed' ? 'CONFLICT' : null,
            generation: intent.generation + 2, updatedAt: Date.now() }).where(and(eq(writeIntents.id, intent.id), eq(writeIntents.owner, owner), eq(writeIntents.generation, intent.generation + 1), eq(writeIntents.status, intent.status))).run();
          if (updated.changes !== 1) throw new PublicError('CONFLICT');
          if (intent.kind === 'trash') database.db.update(trashItems).set({ status: finalOutcome === 'succeeded' ? 'available' : finalOutcome === 'failed' ? 'failed' : 'needs_review', updatedAt: Date.now() }).where(and(eq(trashItems.mutationId, intent.id), eq(trashItems.entryId, currentPlan?.entryId ?? ''))).run();
          if (intent.kind === 'restore') database.db.update(trashItems).set({ status: finalOutcome === 'succeeded' ? 'restored' : finalOutcome === 'failed' ? 'available' : 'needs_review', updatedAt: Date.now() }).where(and(eq(trashItems.restoreMutationId, intent.id), eq(trashItems.entryId, currentPlan?.entryId ?? ''))).run();
          if (upload) {
            const changed = database.db.update(uploadSessions).set({ state: finalOutcome === 'succeeded' ? 'completed' : finalOutcome === 'failed' ? 'open' : 'needs_review', owner: finalOutcome === 'needs_review' ? owner : null, generation: upload.generation + 1, cleaned: finalOutcome === 'succeeded', reservedBytes: finalOutcome === 'succeeded' ? 0 : upload.reservedBytes, updatedAt: Date.now() }).where(and(eq(uploadSessions.id, upload.id), eq(uploadSessions.generation, upload.generation), eq(uploadSessions.publicationId, intent.id))).run();
            if (changed.changes !== 1) throw new PublicError('CONFLICT');
          }
        }).immediate();
        items.push({ id: intent.id, outcome });
      } catch { items.push({ id: intent.id, outcome: 'owner_unknown' }); }
      finally { try { await uploadProbe?.close(); } finally { await probe?.close(); } }
    }
    return { items };
  } finally { await guard?.close(); }
}
