import { constants, type BigIntStats } from 'node:fs';
import { open, type FileHandle } from 'node:fs/promises';
import { PublicError } from '../../plugins/errors.js';
import { openScoped } from '../../storage/scoped.js';
import type { EntryService } from '../entries/service.js';
import { uploadPath, type UploadRow } from './catalog.js';

export const identityOf = (stat: BigIntStats) => `${stat.dev}:${stat.ino}`;
export function uploadError(error: unknown): PublicError {
  if (error instanceof PublicError) return error;
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  if (code === 'ENOSPC' || code === 'EDQUOT') return new PublicError('STORAGE_FULL');
  if (['EACCES', 'EPERM', 'EROFS', 'ELOOP'].includes(String(code))) return new PublicError('FORBIDDEN');
  if (code === 'EEXIST') return new PublicError('MUTATION_UNCERTAIN');
  return new PublicError('SERVICE_UNAVAILABLE');
}
// 只開啟 DB 指定的私有 payload；never truncate/open-w 或採用既有未知檔案。
export async function openPayload(access: Pick<ReturnType<EntryService['authorize']>, 'root' | 'controlIdentity'>, row: UploadRow, record: (parent: string, payload: string) => void) {
  const control = await openScoped(access.root, '.filehub', true);
  try { if (identityOf(control.stat) !== access.controlIdentity) throw new PublicError('MUTATION_UNCERTAIN'); }
  finally { await control.close(); }
  const parent = await openScoped(access.root, '.filehub/staging', true);
  let handle: FileHandle | undefined;
  try {
    if (!parent.stat.isDirectory() || String(parent.stat.dev) !== access.root.device || (row.stagingIdentity && identityOf(parent.stat) !== row.stagingIdentity)) throw new PublicError('MUTATION_UNCERTAIN');
    const path = `${parent.ioPath}/${uploadPath(row.id).split('/').at(-1) ?? ''}`;
    handle = await open(path, constants.O_RDWR | constants.O_NOFOLLOW | constants.O_NONBLOCK | (row.payloadIdentity ? 0 : constants.O_CREAT | constants.O_EXCL), 0o600);
    const stat = await handle.stat({ bigint: true });
    if (!stat.isFile() || stat.nlink !== 1n || (row.payloadIdentity && identityOf(stat) !== row.payloadIdentity) || String(stat.dev) !== access.root.device) throw new PublicError('MUTATION_UNCERTAIN');
    if (!row.payloadIdentity) { await handle.sync(); await parent.handle.sync(); record(identityOf(parent.stat), identityOf(stat)); }
    const owned = handle;
    const verify = async () => {
      const current = await openScoped(access.root, uploadPath(row.id), true);
      try { if (identityOf(current.stat) !== identityOf(stat) || current.stat.nlink !== 1n) throw new PublicError('MUTATION_UNCERTAIN'); }
      finally { await current.close(); }
      const directory = await openScoped(access.root, '.filehub/staging', true);
      try { if (identityOf(directory.stat) !== identityOf(parent.stat)) throw new PublicError('MUTATION_UNCERTAIN'); }
      finally { await directory.close(); }
    };
    return { handle: owned, parent, verify, close: async () => { try { await owned.close(); } finally { await parent.close(); } } };
  } catch (error) { try { await handle?.close(); } finally { await parent.close(); } throw uploadError(error); }
}
