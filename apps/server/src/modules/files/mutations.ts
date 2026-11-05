import { lstat, mkdir, type FileHandle } from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import type { MkdirRequest, RenameRequest, MutationResponse } from '@filehub/contracts';
import type { FileHubDatabase } from '../../persistence/database.js';
import { writeIntents } from '../../persistence/schema.js';
import { PublicError } from '../../plugins/errors.js';
import { WriteCoordinator, type WriteHandle } from '../../storage/coordinator.js';
import { fileName } from '../../storage/names.js';
import { openScoped, relativePath, type ScopedResource } from '../../storage/scoped.js';
import { createOwner, native, nativeError, stableWitness, witness } from '../../storage/native.js';
import type { EntryService } from '../entries/service.js';
import type { OperationPermit } from '../../storage/reservations.js';
import { fingerprint } from './service.js';

export const parentOf = (path: string) => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
export const joinPath = (parent: string, name: string) => parent ? `${parent}/${name}` : name;
export interface WritePlan { entryId: string; source: string; target: string; request: unknown }
export interface MovePreparation {
  access: ReturnType<EntryService['authorize']>; destination: ScopedResource;
  sourceParent: string; sourceName: string; prepare: boolean; version?: string; parentVersion?: string; stable?: string;
}
export interface MoveRecords { prepared(): void; terminal(status: MutationResponse['status']): void }
export interface MutationDependencies {
  invoke?: typeof native;
  checkpoint?(phase: 'prepared' | 'applying' | 'effect', id: string): Promise<void> | void;
}
export class MutationService {
  readonly coordinator: WriteCoordinator;
  private guard: Promise<FileHandle> | undefined;
  private pending = new Set<Promise<unknown>>();
  private closed = false;
  constructor(readonly database: FileHubDatabase, readonly entries: EntryService, private readonly dependencies: MutationDependencies = {}) { this.coordinator = new WriteCoordinator(database); }
  async close(): Promise<void> {
    this.closed = true;
    await Promise.allSettled([...this.pending]);
    await this.guard?.then((handle) => handle.close(), () => {});
  }
  status(user: string, id: string) {
    // Authenticate current user even for a completed operation.
    this.entries.list(user);
    return this.coordinator.get(user, id);
  }
  private run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.closed || this.pending.size >= 4) return Promise.reject(new PublicError('SERVICE_UNAVAILABLE'));
    const result = operation(); this.pending.add(result);
    void result.finally(() => this.pending.delete(result)).catch(() => {});
    return result;
  }
  mkdir(user: string, entry: string, input: MkdirRequest, reauthorize = () => {}): Promise<MutationResponse> {
    return this.run(async () => {
      const parent = relativePath(input.parent), name = fileName(input.name);
      const target = joinPath(parent, name); relativePath(target);
      const access = this.entries.authorize(user, entry, parent, 'write');
      const plan = { entryId: entry, source: `.filehub/staging/${input.id}`, target, request: input };
      return this.execute(user, 'mkdir', input.id, plan, [parent], async () => {
        const directory = await openScoped(access.root, parent);
        try { this.expected(entry, parent, directory, input.parentVersion); }
        catch (error) { await directory.close(); throw error; }
        return { access, destination: directory, sourceParent: '.filehub/staging', sourceName: input.id, prepare: true, parentVersion: input.parentVersion };
      }, () => { reauthorize(); this.entries.authorize(user, entry, parent, 'write'); });
    });
  }
  rename(user: string, entry: string, input: RenameRequest, reauthorize = () => {}): Promise<MutationResponse> {
    return this.run(async () => {
      const path = relativePath(input.path), parent = relativePath(input.parent), name = fileName(input.name);
      const target = joinPath(parent, name); relativePath(target);
      const access = this.entries.authorize(user, entry, path, 'write');
      this.entries.authorize(user, entry, parentOf(path), 'write');
      this.entries.authorize(user, entry, parent, 'write');
      if (!path || path === access.scope || target === path || target.startsWith(`${path}/`)) throw new PublicError('BAD_REQUEST');
      const plan = { entryId: entry, source: path, target, request: input };
      return this.execute(user, 'rename', input.id, plan, [parentOf(path), parent], async () => {
        const source = await openScoped(access.root, path);
        try { this.expected(entry, path, source, input.version); }
        finally { await source.close(); }
        const directory = await openScoped(access.root, parent);
        try { this.expected(entry, parent, directory, input.parentVersion); }
        catch (error) { await directory.close(); throw error; }
        return { access, destination: directory, sourceParent: parentOf(path), sourceName: path.split('/').at(-1) ?? '', prepare: false, version: input.version, parentVersion: input.parentVersion };
      }, () => { reauthorize(); this.entries.authorize(user, entry, path, 'write'); this.entries.authorize(user, entry, parentOf(path), 'write'); this.entries.authorize(user, entry, parent, 'write'); });
    });
  }
  private expected(entry: string, path: string, resource: ScopedResource, version: string) {
    if (fingerprint(entry, path, resource.stat) !== version) throw new PublicError('CONFLICT');
  }
  // Internal service composition only; no route accepts a WritePlan or records callback.
  move(user: string, kind: 'rename' | 'trash' | 'restore', id: string, plan: WritePlan, reservations: string[], prepare: () => Promise<MovePreparation>, reauthorize: () => void, records: MoveRecords, permit?:OperationPermit) {
    return this.run(() => this.execute(user, kind, id, plan, reservations, prepare, reauthorize, records,permit));
  }
  private async execute(user: string, kind: MutationResponse['kind'], id: string, plan: WritePlan, reservations: string[], prepare: () => Promise<MovePreparation>, reauthorize: () => void, records?: MoveRecords, permit?:OperationPermit): Promise<MutationResponse> {
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id)) throw new PublicError('BAD_REQUEST');
    const prior = this.database.db.select().from(writeIntents).where(eq(writeIntents.id, id)).get();
    if (prior) {
      if (prior.userId !== user) throw new PublicError('NOT_FOUND');
      if (prior.kind !== kind || prior.payload !== JSON.stringify(plan)) throw new PublicError('CONFLICT');
      if (prior.status === 'succeeded' || prior.status === 'failed') return this.coordinator.get(user, id);
      throw new PublicError(prior.status === 'needs_review' ? 'MUTATION_UNCERTAIN' : 'MUTATION_BUSY');
    }
    const prepared = await prepare();
    const handles: ScopedResource[] = [prepared.destination];
    let handle: WriteHandle | undefined, applying = false, attempted = false, knownFailure = false;
    let evidence: unknown = {};
    try {
      reauthorize();
      const guard = await (this.guard ??= createOwner(this.database.sqlite.name, this.coordinator.owner));
      // Failed guard creation must not permit an intent without liveness proof.
      const control = await openScoped(prepared.access.root, '.filehub', true); handles.push(control);
      if (`${control.stat.dev}:${control.stat.ino}` !== prepared.access.controlIdentity) throw new PublicError('CONFLICT');
      const source = await openScoped(prepared.access.root, prepared.sourceParent, true); handles.push(source);
      handle = this.database.sqlite.transaction(() => {
        const reserved = this.coordinator.begin(user, kind, reservations.map((path) => ({ entryId: plan.entryId, path })), plan, id,permit);
        records?.prepared(); return reserved;
      }).immediate();
      await this.dependencies.checkpoint?.('prepared', id);
      if (prepared.prepare) { await mkdir(`${source.ioPath}/${prepared.sourceName}`, { mode: 0o750 }); await source.handle.sync(); }
      const stat = await lstat(`${source.ioPath}/${prepared.sourceName}`, { bigint: true });
      if (!stat.isDirectory() && !stat.isFile()) throw new PublicError('FORBIDDEN');
      if (prepared.version && fingerprint(plan.entryId, plan.source, stat) !== prepared.version) throw new PublicError('CONFLICT');
      if (prepared.stable && stableWitness(stat) !== prepared.stable) throw new PublicError('MUTATION_UNCERTAIN');
      evidence = { witness: stableWitness(stat), exact: witness(stat) };
      reauthorize();
      const currentParent = await openScoped(prepared.access.root, parentOf(plan.target), true); handles.push(currentParent);
      if (currentParent.stat.dev !== prepared.destination.stat.dev || currentParent.stat.ino !== prepared.destination.stat.ino) throw new PublicError('CONFLICT');
      // Parent versions are checked again immediately before committing intent.
      if (prepared.parentVersion) this.expected(plan.entryId, parentOf(plan.target), currentParent, prepared.parentVersion);
      handle = this.coordinator.transition(handle, 'prepared', 'applying', evidence); applying = true;
      await this.dependencies.checkpoint?.('applying', id);
      attempted = true;
      const code = await (this.dependencies.invoke ?? native)(['rename', Buffer.from(prepared.sourceName).toString('hex'), Buffer.from(plan.target.split('/').at(-1) ?? '').toString('hex'), witness(stat)], [guard.fd, source.handle.fd, prepared.destination.handle.fd,...(permit?[permit.guardFd]:[])]);
      if (code !== 0) { knownFailure = code >= 10 && code <= 18; throw nativeError(code); }
      await this.dependencies.checkpoint?.('effect', id);
      const after = await lstat(`${prepared.destination.ioPath}/${plan.target.split('/').at(-1) ?? ''}`, { bigint: true });
      if (stableWitness(after) !== stableWitness(stat)) throw new PublicError('MUTATION_UNCERTAIN');
      const completed = handle;
      this.database.sqlite.transaction(() => { this.coordinator.transition(completed, 'applying', 'succeeded', evidence); records?.terminal('succeeded'); }).immediate();
      return this.coordinator.get(user, id);
    } catch (error) {
      const uncertain = applying && attempted && !knownFailure;
      const failure = error instanceof PublicError ? error : new PublicError(uncertain ? 'MUTATION_UNCERTAIN' : fsCode(error));
      if (handle) {
        const current = handle;
        this.database.sqlite.transaction(() => {
          this.coordinator.transition(current, applying ? 'applying' : 'prepared', uncertain ? 'needs_review' : 'failed', evidence, uncertain ? 'MUTATION_UNCERTAIN' : failure.code);
          records?.terminal(uncertain ? 'needs_review' : 'failed');
        }).immediate();
      }
      throw uncertain ? new PublicError('MUTATION_UNCERTAIN') : failure;
    } finally {
      await Promise.all(handles.map((resource) => resource.close()));
    }
  }
}
function fsCode(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  if (code === 'EEXIST') return 'CONFLICT';
  if (code === 'ENOENT') return 'NOT_FOUND';
  if (code === 'EACCES' || code === 'EPERM' || code === 'EROFS') return 'FORBIDDEN';
  if (code === 'ENOSPC' || code === 'EDQUOT') return 'STORAGE_FULL';
  return 'SERVICE_UNAVAILABLE';
}
