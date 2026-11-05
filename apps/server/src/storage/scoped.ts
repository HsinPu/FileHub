import { constants, type BigIntStats } from 'node:fs';
import { lstat, open, realpath, type FileHandle } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { PublicError } from '../plugins/errors.js';

export interface RootIdentity { readonly path: string; readonly device: string; readonly inode: string; readonly ancestors: readonly string[] }
export interface ScopedAnchor { readonly path: string; readonly device: string; readonly inode: string; readonly birthtimeNs?: string }
export interface ScopedResource {
  readonly handle: FileHandle;
  readonly stat: BigIntStats;
  readonly ioPath: string;
  verify(): Promise<void>;
  close(): Promise<void>;
}
const key = (stat: BigIntStats) => `${stat.dev}:${stat.ino}`;
const same = (a: BigIntStats, b: BigIntStats) => a.dev === b.dev && a.ino === b.ino;
export const hasControlCharacters = (value: string) => [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
const contained = (root: string, path: string) => { const value = relative(root, path); return !isAbsolute(value) && value !== '..' && !value.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`); };

export const privateName = (name: string) => name.toLowerCase() === '.filehub';
export function relativePath(value: string, internal = false): string {
  if (value.length > 1024 || !value.isWellFormed() || value.includes('\\') || hasControlCharacters(value) || value.startsWith('/') || /^[A-Za-z]:/.test(value)) throw new PublicError('BAD_REQUEST');
  const parts = value === '' ? [] : value.split('/');
  if (parts.length > 64 || parts.some((part) => !part || part === '.' || part === '..' || (!internal && privateName(part)) || Buffer.byteLength(part) > 255
    || (process.platform === 'win32' && (/[<>:"|?*]/.test(part) || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))))) throw new PublicError('BAD_REQUEST');
  return value;
}

function publicFsError(error: unknown, root = false): PublicError {
  if (error instanceof PublicError) return error;
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  if (root) return new PublicError('SERVICE_UNAVAILABLE');
  if (code === 'ENOENT') return new PublicError('NOT_FOUND');
  if (['EACCES', 'EPERM', 'ELOOP', 'ENOTDIR'].includes(String(code))) return new PublicError('FORBIDDEN');
  if (code === 'ENAMETOOLONG') return new PublicError('BAD_REQUEST');
  return new PublicError('SERVICE_UNAVAILABLE');
}

export async function inspectRoot(path: string): Promise<RootIdentity> {
  if (!isAbsolute(path) || path.includes('\0') || /^[\\/]{2}/.test(path)) throw new PublicError('BAD_REQUEST');
  try {
    const supplied = await lstat(path, { bigint: true });
    if (supplied.isSymbolicLink() || !supplied.isDirectory()) throw new PublicError('FORBIDDEN');
    const canonical = await realpath(path);
    const stat = await lstat(canonical, { bigint: true });
    if (!same(supplied, stat)) throw new PublicError('SERVICE_UNAVAILABLE');
    const ancestors: string[] = [];
    let current = canonical;
    for (let depth = 0; depth < 128; depth++) {
      ancestors.push(key(await lstat(current, { bigint: true })));
      const parent = dirname(current);
      if (parent === current) return { path: canonical, device: String(stat.dev), inode: String(stat.ino), ancestors };
      current = parent;
    }
    throw new PublicError('BAD_REQUEST');
  } catch (error) { throw publicFsError(error, true); }
}

export function overlaps(a: RootIdentity, b: RootIdentity): boolean {
  return contained(a.path, b.path) || contained(b.path, a.path)
    || a.ancestors.includes(`${b.device}:${b.inode}`) || b.ancestors.includes(`${a.device}:${a.inode}`);
}

export async function openScoped(root: RootIdentity, value: string, internal = false, anchor?: ScopedAnchor): Promise<ScopedResource> {
  const path = relativePath(value, internal);
  if (anchor && (relativePath(anchor.path) !== anchor.path || (anchor.path && path !== anchor.path && !path.startsWith(`${anchor.path}/`)))) throw new PublicError('FORBIDDEN');
  const assertAnchor = (current: string, stat: BigIntStats) => { if (anchor?.path === current && (String(stat.dev) !== anchor.device || String(stat.ino) !== anchor.inode || (anchor.birthtimeNs !== undefined && String(stat.birthtimeNs) !== anchor.birthtimeNs))) throw new PublicError('NOT_FOUND'); };
  const parts = path === '' ? [] : path.split('/');
  let handle: FileHandle | undefined;
  let rootOpened = false;
  const snapshots: { path: string; stat: BigIntStats }[] = [];
  const assertRoot = (stat: BigIntStats) => {
    if (!stat.isDirectory() || String(stat.dev) !== root.device || String(stat.ino) !== root.inode) throw new PublicError('SERVICE_UNAVAILABLE');
  };
  try {
    if (process.platform === 'linux') {
      handle = await open(root.path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
      const rootStat = await handle.stat({ bigint: true });
      assertRoot(rootStat); assertAnchor('', rootStat);
      rootOpened = true;
      for (const [index, part] of parts.entries()) {
        const parent = handle;
        handle = await open(`/proc/self/fd/${parent.fd}/${part}`, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK | (index < parts.length - 1 ? constants.O_DIRECTORY : 0));
        await parent.close();
        if (anchor) assertAnchor(parts.slice(0, index + 1).join('/'), await handle.stat({ bigint: true }));
      }
    } else if (process.platform === 'win32') {
      let current = root.path;
      for (const [index, part] of ['', ...parts].entries()) {
        if (part) current = join(current, part);
        const stat = await lstat(current, { bigint: true });
        if (stat.isSymbolicLink() || (index < parts.length && !stat.isDirectory())) throw new PublicError('FORBIDDEN');
        if (index === 0) { assertRoot(stat); rootOpened = true; }
        assertAnchor(parts.slice(0, index).join('/'), stat);
        snapshots.push({ path: current, stat });
      }
      handle = await open(current, 'r');
    } else throw new PublicError('SERVICE_UNAVAILABLE');
    const owned = handle;
    const stat = await owned.stat({ bigint: true });
    if (!stat.isFile() && !stat.isDirectory()) throw new PublicError('FORBIDDEN');
    const verify = async () => {
      if (process.platform === 'win32') {
        const last = snapshots.at(-1);
        if (!last || !same(last.stat, stat)) throw new PublicError('FORBIDDEN');
        for (const snapshot of snapshots) {
          const current = await lstat(snapshot.path, { bigint: true });
          if (current.isSymbolicLink() || !same(current, snapshot.stat) || !contained(root.path, await realpath(snapshot.path))) throw new PublicError('FORBIDDEN');
        }
      }
    };
    await verify();
    let closing: Promise<void> | undefined;
    return { handle: owned, stat, ioPath: process.platform === 'linux' ? `/proc/self/fd/${owned.fd}` : join(root.path, ...parts), verify, close: () => closing ??= owned.close() };
  } catch (error) {
    await handle?.close();
    throw publicFsError(error, !rootOpened);
  }
}
