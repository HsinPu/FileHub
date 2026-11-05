import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { and, eq } from 'drizzle-orm';
import type { PublicEntry } from '@filehub/contracts';
import type { FileHubDatabase } from '../../persistence/database.js';
import { entries, grants, users } from '../../persistence/schema.js';
import { PublicError } from '../../plugins/errors.js';
import { hasControlCharacters, inspectRoot, openScoped, overlaps, relativePath, type RootIdentity } from '../../storage/scoped.js';
import { normalizeUsername } from '../identity/service.js';

type Entry = typeof entries.$inferSelect;
function rootOf(entry: Entry): RootIdentity {
  const ancestors: unknown = JSON.parse(entry.rootAncestors);
  if (!Array.isArray(ancestors) || !ancestors.every((item): item is string => typeof item === 'string')) throw new PublicError('SERVICE_UNAVAILABLE');
  return { path: entry.rootPath, device: entry.rootDevice, inode: entry.rootInode, ancestors };
}
const under = (scope: string, path: string) => scope === '' || scope === path || path.startsWith(`${scope}/`);

export class EntryService {
  constructor(readonly database: FileHubDatabase) {}
  private ready(): void { if (!this.database.isReady()) throw new PublicError('SERVICE_UNAVAILABLE'); }
  private user(id: string) {
    this.ready();
    const user = this.database.db.select().from(users).where(eq(users.id, id)).get();
    if (!user?.enabled) throw new PublicError('UNAUTHORIZED');
    return user;
  }

  async inspectRegistration(kind:'managed'|'external',label:string,path:string):Promise<RootIdentity>{
    this.ready();
    if (!['managed', 'external'].includes(kind) || !label.trim() || [...label].length > 80 || hasControlCharacters(label)) throw new PublicError('BAD_REQUEST');
    const root = await inspectRoot(path);
    const state = await inspectRoot(dirname(this.database.sqlite.name));
    if (overlaps(root, state)) throw new PublicError('FORBIDDEN');
    const catalog=this.database.db.select().from(entries).all();if(catalog.some(entry=>overlaps(root,rootOf(entry))))throw new PublicError('CONFLICT');return root;
  }
  async register(kind:'managed'|'external',label:string,path:string,reauthorize=()=>{},expected?:RootIdentity):Promise<Pick<PublicEntry,'id'|'label'|'kind'>>{
    const root=await this.inspectRegistration(kind,label,path);if(expected&&(root.path!==expected.path||root.device!==expected.device||root.inode!==expected.inode))throw new PublicError('CONFLICT');
    return this.database.sqlite.transaction(() => {
      this.ready();reauthorize();
      const catalog = this.database.db.select().from(entries).all();
      if (catalog.length >= 100) throw new PublicError('RATE_LIMITED');
      if (catalog.some((entry) => overlaps(root, rootOf(entry)))) throw new PublicError('CONFLICT');
      const entry = { id: randomUUID(), label: label.trim(), kind, rootPath: root.path, rootDevice: root.device, rootInode: root.inode, rootAncestors: JSON.stringify(root.ancestors), enabled: true };
      this.database.db.insert(entries).values(entry).run();
      return { id: entry.id, label: entry.label, kind: entry.kind };
    }).immediate();
  }

  list(userId: string): PublicEntry[] {
    const user = this.user(userId);
    const permissions = this.database.db.select().from(grants).where(eq(grants.userId, user.id)).all();
    return this.database.db.select().from(entries).where(eq(entries.enabled, true)).all().flatMap((entry) => {
      const writable = entry.writable && process.platform === 'linux';
      const scopes = user.role === 'admin' ? [{ path: '', canDownload: true, ...(writable ? { canWrite: true } : {}) }] : permissions.filter((grant) => grant.entryId === entry.id).map((grant) => ({ path: grant.scope, canDownload: grant.canDownload, ...(writable && grant.canWrite ? { canWrite: true } : {}) }));
      return scopes.length ? [{ id: entry.id, label: entry.label, kind: entry.kind, readOnly: !scopes.some((scope) => scope.canWrite), scopes: scopes.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0) }] : [];
    }).sort((a, b) => a.label < b.label ? -1 : a.label > b.label ? 1 : a.id < b.id ? -1 : 1);
  }
  // 私有 worker／CLI 使用；不註冊公開 route，也不授予使用者瀏覽／發布能力。
  maintenance(entryId: string) {
    this.ready();
    const entry = this.database.db.select().from(entries).where(eq(entries.id, entryId)).get();
    if (!entry) throw new PublicError('NOT_FOUND');
    return { root: rootOf(entry), controlIdentity: entry.controlIdentity };
  }

  authorize(userId: string, entryId: string, value: string, capability: 'browse' | 'download' | 'write') {
    if (!['browse', 'download', 'write'].includes(capability)) throw new PublicError('FORBIDDEN');
    const path = relativePath(value);
    const user = this.user(userId);
    const entry = this.database.db.select().from(entries).where(and(eq(entries.id, entryId), eq(entries.enabled, true))).get();
    if (!entry) throw new PublicError('NOT_FOUND');
    const allowed = user.role === 'admin' ? [{ scope: '', canDownload: true, canWrite: true }] : this.database.db.select().from(grants).where(and(eq(grants.userId, user.id), eq(grants.entryId, entry.id))).all();
    if (!allowed.length) throw new PublicError('NOT_FOUND');
    const writable = entry.writable && process.platform === 'linux';
    const matches = allowed.filter((grant) => under(grant.scope, path) && (capability === 'browse' || (capability === 'download' ? grant.canDownload : entry.writable && grant.canWrite))).sort((a, b) => b.scope.length - a.scope.length);
    if (!matches.length) throw new PublicError('FORBIDDEN');
    if (capability === 'write' && process.platform !== 'linux') throw new PublicError('WRITE_UNSUPPORTED');
    const policy = allowed.map(({ scope, canDownload, canWrite }) => ({ scope, canDownload, canWrite: writable && canWrite })).sort((a, b) => a.scope < b.scope ? -1 : a.scope > b.scope ? 1 : 0);
    return { entryId: entry.id, path, scope: matches[0]?.scope ?? '', root: rootOf(entry), controlIdentity: entry.controlIdentity, signature: JSON.stringify(policy),
      canDownload: (child: string) => allowed.some((grant) => grant.canDownload && under(grant.scope, child)),
      canWrite: (child: string) => writable && allowed.some((grant) => grant.canWrite && under(grant.scope, child)) };
  }

  async grant(name: string, entryId: string, value: string, canDownload = true, canWrite = false,reauthorize=()=>{}): Promise<void> {
    this.ready();
    const scope = relativePath(value);
    const username = normalizeUsername(name);
    const user = this.database.db.select().from(users).where(eq(users.username, username)).get();
    const entry = this.database.db.select().from(entries).where(and(eq(entries.id, entryId), eq(entries.enabled, true))).get();
    if (!user?.enabled || !entry) throw new PublicError('NOT_FOUND');
    const resource = await openScoped(rootOf(entry), scope);
    try { if (!resource.stat.isDirectory()) throw new PublicError('BAD_REQUEST'); }
    finally { await resource.close(); }
    this.database.sqlite.transaction(() => {
      this.ready();reauthorize();
      if (!this.database.db.select().from(entries).where(and(eq(entries.id, entryId), eq(entries.enabled, true))).get()
        || !this.database.db.select().from(users).where(and(eq(users.id, user.id), eq(users.enabled, true))).get()) throw new PublicError('CONFLICT');
      const prior = this.database.db.select().from(grants).where(eq(grants.userId, user.id)).all();
      if (prior.length >= 100 && !prior.some((grant) => grant.entryId === entryId && grant.scope === scope)) throw new PublicError('RATE_LIMITED');
      this.database.db.insert(grants).values({ userId: user.id, entryId, scope, canDownload, canWrite }).onConflictDoUpdate({ target: [grants.userId, grants.entryId, grants.scope], set: { canDownload, canWrite } }).run();
    }).immediate();
  }

  async revoke(name: string, entryId: string, value: string): Promise<void> {
    this.ready();
    const scope = relativePath(value);
    const user = this.database.db.select().from(users).where(eq(users.username, normalizeUsername(name))).get();
    if (!user) throw new PublicError('NOT_FOUND');
    this.database.db.delete(grants).where(and(eq(grants.userId, user.id), eq(grants.entryId, entryId), eq(grants.scope, scope))).run();
  }

  async disable(entryId: string): Promise<void> {
    this.ready();
    if (!this.database.db.update(entries).set({ enabled: false }).where(eq(entries.id, entryId)).run().changes) throw new PublicError('NOT_FOUND');
  }

  async setWritable(entryId: string, enabled: boolean,reauthorize=()=>{}): Promise<void> {
    this.ready();
    const entry = this.database.db.select().from(entries).where(and(eq(entries.id, entryId), eq(entries.enabled, true))).get();
    if (!entry) throw new PublicError('NOT_FOUND');
    reauthorize();
    if (!enabled) { this.database.db.update(entries).set({ writable: false }).where(eq(entries.id, entryId)).run(); return; }
    if (process.platform !== 'linux') throw new PublicError('WRITE_UNSUPPORTED');
    const root = rootOf(entry);
    let identity = entry.controlIdentity;
    if (!identity) {
      const directory = await openScoped(root, '');
      try {
        // Exclusive creation: never adopt an existing external .filehub directory.
        await mkdir(`${directory.ioPath}/.filehub`, { mode: 0o700 });
        const control = await openScoped(root, '.filehub', true);
        try {
          await mkdir(`${control.ioPath}/staging`, { mode: 0o700 });
          await mkdir(`${control.ioPath}/trash`, { mode: 0o700 });
          await control.handle.sync(); await directory.handle.sync();
          identity = `${control.stat.dev}:${control.stat.ino}`;
        } finally { await control.close(); }
      } finally { await directory.close(); }
    } else {
      const control = await openScoped(root, '.filehub', true);
      try { if (`${control.stat.dev}:${control.stat.ino}` !== identity) throw new PublicError('CONFLICT'); }
      finally { await control.close(); }
    }
    // 保存已驗證的 private owner 證據，即使管理者在 FS await 期間被撤權也不能遺失。
    const owned=this.database.db.select().from(entries).where(eq(entries.id,entryId)).get();
    if(!owned||owned.rootDevice!==entry.rootDevice||owned.rootInode!==entry.rootInode||(owned.controlIdentity!==null&&owned.controlIdentity!==identity))throw new PublicError('CONFLICT');
    this.database.db.update(entries).set({controlIdentity:identity}).where(eq(entries.id,entryId)).run();
    this.database.sqlite.transaction(()=>{this.ready();reauthorize();const current=this.database.db.select().from(entries).where(eq(entries.id,entryId)).get();if(!current?.enabled||current.controlIdentity!==identity)throw new PublicError('CONFLICT');this.database.db.update(entries).set({writable:true}).where(eq(entries.id,entryId)).run();}).immediate();
  }
}
