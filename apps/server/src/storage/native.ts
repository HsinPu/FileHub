import { spawn } from 'node:child_process';
import { constants, type BigIntStats } from 'node:fs';
import { lstat, mkdir, open, type FileHandle } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PublicError } from '../plugins/errors.js';
import type { ApiErrorCode } from '@filehub/contracts';

const executable = fileURLToPath(new URL('../../native/filehub-fs', import.meta.url));
// src/storage and dist/storage have the same depth. No shell, unbounded output,
// automatic retry or killing an in-flight syscall on a request timeout.
export async function native(args: readonly string[], handles: readonly number[]): Promise<number> {
  if (process.platform !== 'linux') throw new PublicError('WRITE_UNSUPPORTED');
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [...args], { stdio: ['ignore', 'ignore', 'ignore', ...handles], windowsHide: true });
    child.once('error', () => { reject(new PublicError('WRITE_UNSUPPORTED')); });
    child.once('close', (code) => { resolve(code ?? 70); });
  });
}
export const witness = (s: BigIntStats) => `${s.dev}:${s.ino}:${s.size}:${s.mtimeNs}:${s.ctimeNs}:${s.mode}`;
export const stableWitness = (s: BigIntStats) => `${s.dev}:${s.ino}:${s.size}:${s.mtimeNs}:${s.mode}`;
export function nativeError(code: number): PublicError {
  const codes: Partial<Record<number, ApiErrorCode>> = { 10: 'CONFLICT', 11: 'CONFLICT', 12: 'FORBIDDEN', 13: 'CROSS_DEVICE', 14: 'WRITE_UNSUPPORTED', 15: 'STORAGE_FULL', 16: 'MUTATION_BUSY', 17: 'CONFLICT', 18: 'BAD_REQUEST' };
  return new PublicError(codes[code] ?? 'MUTATION_UNCERTAIN');
}
export function ownerPath(databaseName: string, owner: string) {
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(owner)) throw new PublicError('SERVICE_UNAVAILABLE');
  return join(dirname(databaseName), 'write-owners', `${owner}.lock`);
}
export async function createOwner(databaseName: string, owner: string): Promise<FileHandle> {
  if (process.platform !== 'linux') throw new PublicError('WRITE_UNSUPPORTED');
  const path = ownerPath(databaseName, owner);
  await mkdir(dirname(path), { mode: 0o700 }).catch((error: unknown) => { if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'EEXIST') throw error; });
  const parent = await lstat(dirname(path));
  if (!parent.isDirectory() || parent.isSymbolicLink()) throw new PublicError('FORBIDDEN');
  const handle = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_RDWR | constants.O_NOFOLLOW, 0o600);
  try { const code = await native(['lock'], [handle.fd]); if (code !== 0) throw nativeError(code); return handle; }
  catch (error) { await handle.close(); throw error; }
}
// 新 OFD 的 nonblocking flock 只有在舊 owner 及其繼承 helper 都釋放後才成功。
export async function proveOwner(databaseName: string, owner: string): Promise<FileHandle> {
  const path = ownerPath(databaseName, owner), parent = await lstat(dirname(path));
  if (!parent.isDirectory() || parent.isSymbolicLink()) throw new PublicError('MUTATION_UNCERTAIN');
  const handle = await open(path, constants.O_RDWR | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    if (!(await handle.stat()).isFile()) throw new PublicError('MUTATION_UNCERTAIN');
    const result = await native(['lock'], [handle.fd]);
    if (result !== 0) throw new PublicError(result === 16 ? 'MUTATION_BUSY' : 'MUTATION_UNCERTAIN');
    return handle;
  } catch (error) { await handle.close(); throw error; }
}
