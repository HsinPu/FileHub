import { createHash } from 'node:crypto';
import type { writeIntents } from '../../persistence/schema.js';
import { PublicError } from '../../plugins/errors.js';
import { openScoped, type RootIdentity } from '../../storage/scoped.js';
import { stableWitness } from '../../storage/native.js';
import { joinPath, type WritePlan } from '../files/mutations.js';
import { uploadPath, type UploadRow } from './catalog.js';

export function validatePublication(intent: typeof writeIntents.$inferSelect, plan: WritePlan, row: UploadRow, evidence?: string) {
  const raw: unknown = JSON.parse(intent.payload);
  const request: unknown = raw && typeof raw === 'object' && 'request' in raw ? raw.request : undefined;
  if (intent.kind !== 'rename' || row.publicationId !== intent.id || row.userId !== intent.userId || row.entryId !== plan.entryId
    || !['finalizing', 'needs_review'].includes(row.state) || row.offset !== row.size || !row.payloadIdentity || !row.stagingIdentity || !row.sha256
    || plan.source !== uploadPath(row.id) || plan.target !== joinPath(row.parent, row.name)
    || !request || typeof request !== 'object' || !('uploadId' in request) || request.uploadId !== row.id || !('sha256' in request) || request.sha256 !== row.sha256 || !('size' in request) || request.size !== row.size
    || (evidence !== undefined && (evidence.split(':').slice(0, 2).join(':') !== row.payloadIdentity || evidence.split(':')[2] !== String(row.size)))) throw new PublicError('MUTATION_UNCERTAIN');
}
export async function verifyPublished(root: RootIdentity, path: string, row: UploadRow) {
  const resource = await openScoped(root, path);
  try {
    if (!resource.stat.isFile() || resource.stat.nlink !== 1n || resource.stat.size !== BigInt(row.size)) throw new PublicError('MUTATION_UNCERTAIN');
    const hash = createHash('sha256'), buffer = Buffer.alloc(65_536); let offset = 0;
    while (offset < row.size) { const { bytesRead } = await resource.handle.read(buffer, 0, Math.min(buffer.length, row.size - offset), offset); if (!bytesRead) throw new PublicError('MUTATION_UNCERTAIN'); hash.update(buffer.subarray(0, bytesRead)); offset += bytesRead; }
    if (hash.digest('hex') !== row.sha256 || stableWitness(resource.stat) !== stableWitness(await resource.handle.stat({ bigint: true }))) throw new PublicError('MUTATION_UNCERTAIN');
  } finally { await resource.close(); }
}
