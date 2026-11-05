import { randomUUID, createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { onTestFinished } from 'vitest';
import { UPLOAD_LIMITS } from '@filehub/contracts';
import { databaseFixture } from './database.js';
import { EntryService } from '../../src/modules/entries/service.js';
import { MutationService, type MutationDependencies } from '../../src/modules/files/mutations.js';
import { UploadService, type UploadDependencies } from '../../src/modules/uploads/service.js';

export const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
export async function uploadFixture(dependencies: UploadDependencies = {}, mutationDependencies: MutationDependencies = {}, now = Date.now) {
  const f = await databaseFixture(); f.migrate(); const db = f.open(), user = randomUUID();
  db.sqlite.prepare("INSERT INTO users VALUES (?, 'fixture', 'synthetic-hash', 'admin', 1, 1)").run(user);
  const root = join(f.directory, 'files'); await mkdir(join(root, 'team'), { recursive: true });
  const entries = new EntryService(db), entry = (await entries.register('external', 'receiver fixture', root)).id;
  const mutations = new MutationService(db, entries, mutationDependencies), uploads = new UploadService(db, entries, mutations, dependencies, now);
  onTestFinished(async () => { await uploads.close(); await mutations.close(); });
  if (process.platform === 'linux') await entries.setWritable(entry, true);
  const create = async (bytes: Buffer, name = '上傳 100%.bin') => uploads.create(user, entry, { id: randomUUID(), parent: 'team', name, size: bytes.length, sha256: digest(bytes) });
  const send = (id: string, bytes: Buffer, offset = 0) => uploads.receive(user, id, offset, bytes.length, digest(bytes), Readable.from((function* () { for (let i = 0; i < bytes.length; i += 65_536) yield bytes.subarray(i, i + 65_536); })()));
  const all = async (id: string, bytes: Buffer) => { for (let offset = 0; offset < bytes.length; offset += UPLOAD_LIMITS.chunkBytes) await send(id, bytes.subarray(offset, offset + UPLOAD_LIMITS.chunkBytes), offset); };
  return { ...f, db, user, root, entry, entries, mutations, uploads, create, send, all };
}
