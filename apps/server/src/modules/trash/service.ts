import { createHash } from 'node:crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { RestoreRequest, TrashRequest, TrashResponse, TrashItem } from '@filehub/contracts';
import { trashItems, users } from '../../persistence/schema.js';
import type { FileHubDatabase } from '../../persistence/database.js';
import type { EntryService } from '../entries/service.js';
import { MutationService, joinPath, parentOf } from '../files/mutations.js';
import { fingerprint } from '../files/service.js';
import { fileName } from '../../storage/names.js';
import { stableWitness } from '../../storage/native.js';
import { openScoped, relativePath } from '../../storage/scoped.js';
import { PublicError } from '../../plugins/errors.js';
import type { OperationPermit } from '../../storage/reservations.js';

type Access = ReturnType<EntryService['authorize']>;
const active = ['prepared', 'available', 'restoring', 'needs_review'] as const;
const inside = (scope: string, path: string) => !scope || path === scope || path.startsWith(`${scope}/`);
const payload = (id: string) => `.filehub/trash/${id}`;
export class TrashService {
  private activeLists = 0;
  constructor(readonly database: FileHubDatabase, readonly entries: EntryService, readonly mutations: MutationService) {}
  private admin(user: string) { return this.database.db.select().from(users).where(eq(users.id, user)).get()?.role === 'admin'; }
  private async directory(access: Access) {
    const control = await openScoped(access.root, '.filehub', true);
    try { if (`${control.stat.dev}:${control.stat.ino}` !== access.controlIdentity) throw new PublicError('CONFLICT'); }
    finally { await control.close(); }
    return openScoped(access.root, '.filehub/trash', true);
  }
  async put(user: string, entry: string, input: TrashRequest, reauthorize = () => {}, permit?:OperationPermit) {
    const path = relativePath(input.path);
    const access = this.entries.authorize(user, entry, path, 'write');
    if (!path || path === access.scope) throw new PublicError('BAD_REQUEST');
    this.entries.authorize(user, entry, parentOf(path), 'write');
    const plan = { entryId: entry, source: path, target: payload(input.id), request: input };
    let kind: 'directory' | 'file' = 'file', observed = '';
    return this.mutations.move(user, 'trash', input.id, plan, [parentOf(path)], async () => {
      const source = await openScoped(access.root, path);
      try {
        if (fingerprint(entry, path, source.stat) !== input.version) throw new PublicError('CONFLICT');
        kind = source.stat.isDirectory() ? 'directory' : 'file'; observed = stableWitness(source.stat);
      } finally { await source.close(); }
      const destination = await this.directory(access);
      if (String(destination.stat.dev) !== observed.split(':')[0]) { await destination.close(); throw new PublicError('CROSS_DEVICE'); }
      return { access, destination, sourceParent: parentOf(path), sourceName: path.split('/').at(-1) ?? '', prepare: false, version: input.version, stable: observed };
    }, () => { reauthorize(); this.entries.authorize(user, entry, path, 'write'); this.entries.authorize(user, entry, parentOf(path), 'write'); }, {
      prepared: () => {
        const count = this.database.sqlite.prepare<[string], { n: number }>('SELECT count(*) AS n FROM trash_items WHERE entry_id=?').get(entry)?.n ?? 0;
        if (count >= 1000) throw new PublicError('RESOURCE_LIMIT');
        this.database.db.insert(trashItems).values({ id: input.id, entryId: entry, userId: user, originalPath: path, kind, witness: observed, status: 'prepared', mutationId: input.id, createdAt: Date.now(), updatedAt: Date.now() }).run();
      },
      terminal: (status) => { this.database.db.update(trashItems).set({ status: status === 'succeeded' ? 'available' : status === 'failed' ? 'failed' : 'needs_review', updatedAt: Date.now() }).where(eq(trashItems.id, input.id)).run(); },
    },permit);
  }
  async restore(user: string, entry: string, id: string, input: RestoreRequest, reauthorize = () => {}) {
    const item = this.database.db.select().from(trashItems).where(and(eq(trashItems.id, id), eq(trashItems.entryId, entry))).get();
    if (!item || (item.userId !== user && !this.admin(user))) throw new PublicError('NOT_FOUND');
    this.entries.authorize(user, entry, item.originalPath, 'write');
    const parent = relativePath(input.parent), name = fileName(input.name), target = joinPath(parent, name); relativePath(target);
    const access = this.entries.authorize(user, entry, parent, 'write');
    const plan = { entryId: entry, source: payload(id), target, request: input };
    return this.mutations.move(user, 'restore', input.id, plan, [parentOf(item.originalPath), parent], async () => {
      if (item.status !== 'available') throw new PublicError('CONFLICT');
      const directory = await this.directory(access); await directory.close();
      const source = await openScoped(access.root, payload(id), true);
      try {
        if (fingerprint(entry, payload(id), source.stat) !== input.version || stableWitness(source.stat) !== item.witness) throw new PublicError('MUTATION_UNCERTAIN');
      } finally { await source.close(); }
      const destination = await openScoped(access.root, parent);
      if (fingerprint(entry, parent, destination.stat) !== input.parentVersion || !destination.stat.isDirectory()) { await destination.close(); throw new PublicError('CONFLICT'); }
      if (String(destination.stat.dev) !== item.witness.split(':')[0]) { await destination.close(); throw new PublicError('CROSS_DEVICE'); }
      return { access, destination, sourceParent: '.filehub/trash', sourceName: id, prepare: false, version: input.version, parentVersion: input.parentVersion, stable: item.witness };
    }, () => { reauthorize(); this.entries.authorize(user, entry, item.originalPath, 'write'); this.entries.authorize(user, entry, parent, 'write'); }, {
      prepared: () => {
        const change = this.database.db.update(trashItems).set({ status: 'restoring', restoreMutationId: input.id, updatedAt: Date.now() }).where(and(eq(trashItems.id, id), eq(trashItems.status, 'available'))).run();
        if (change.changes !== 1) throw new PublicError('CONFLICT');
      },
      terminal: (status) => { this.database.db.update(trashItems).set({ status: status === 'succeeded' ? 'restored' : status === 'failed' ? 'available' : 'needs_review', updatedAt: Date.now() }).where(eq(trashItems.id, id)).run(); },
    });
  }
  async list(user: string, entry: string, offset = 0): Promise<TrashResponse> {
    const visible = this.entries.list(user).find((item) => item.id === entry);
    if (!visible) throw new PublicError('NOT_FOUND');
    if (!Number.isInteger(offset) || offset < 0 || offset > 1000) throw new PublicError('BAD_REQUEST');
    if (this.activeLists >= 4) throw new PublicError('SERVICE_UNAVAILABLE');
    this.activeLists++;
    try {
      const records = this.database.db.select().from(trashItems).where(and(eq(trashItems.entryId, entry), inArray(trashItems.status, [...active]), ...(this.admin(user) ? [] : [eq(trashItems.userId, user)]))).orderBy(desc(trashItems.createdAt), desc(trashItems.id)).limit(1001).all();
      if (records.length > 1000) throw new PublicError('RESOURCE_LIMIT');
      const allowed = records.filter((record) => visible.scopes.some((scope) => inside(scope.path, record.originalPath)));
      const items: TrashItem[] = [];
      for (const record of allowed.slice(offset, offset + 50)) {
        const access = this.entries.authorize(user, entry, record.originalPath, 'browse');
        let version = createHash('sha256').update(`${record.id}:${record.witness}`).digest('hex'), consistent = false;
        try {
          const directory = await this.directory(access); await directory.close();
          const resource = await openScoped(access.root, payload(record.id), true);
          try { version = fingerprint(entry, payload(record.id), resource.stat); consistent = stableWitness(resource.stat) === record.witness; }
          finally { await resource.close(); }
        } catch (error) {
          if (!(error instanceof PublicError) || !['NOT_FOUND', 'FORBIDDEN'].includes(error.code)) throw error;
        }
        this.entries.authorize(user, entry, record.originalPath, 'browse');
        const status = consistent ? record.status as TrashItem['status'] : 'needs_review';
        items.push({ id: record.id, originalPath: record.originalPath, kind: record.kind, status, version,
          createdAt: new Date(record.createdAt).toISOString(), canRestore: consistent && record.status === 'available' && access.canWrite(record.originalPath) });
      }
      if (JSON.stringify(this.entries.list(user).find((item) => item.id === entry)) !== JSON.stringify(visible)) throw new PublicError('CONFLICT');
      return { items, total: allowed.length, offset, hasMore: offset + items.length < allowed.length };
    } finally { this.activeLists--; }
  }
}
