import { Type, type Static } from 'typebox';
import { RelativePathSchema } from './entries.js';
import { NameSchema } from './writes.js';

// FileHub upload session v1；這些是產品上限，不是 TUS capability 宣告。
export const UPLOAD_LIMITS = Object.freeze({ fileBytes: 1_073_741_824, chunkBytes: 4_194_304, lifetimeMs: 86_400_000, userSessions: 16, sessions: 64, userBytes: 4_294_967_296, bytes: 8_589_934_592 });
export const Sha256Schema = Type.String({ pattern: '^[a-f0-9]{64}$' });
export const UploadCreateSchema = Type.Object({
  id: Type.String({ format: 'uuid' }), parent: RelativePathSchema, name: NameSchema,
  size: Type.Integer({ minimum: 0, maximum: UPLOAD_LIMITS.fileBytes }), sha256: Type.Optional(Sha256Schema),
}, { additionalProperties: false });
export const UploadParamsSchema = Type.Object({ id: Type.String({ format: 'uuid' }) }, { additionalProperties: false });
export const UploadStateSchema = Type.Union([Type.Literal('open'), Type.Literal('writing'), Type.Literal('finalizing'), Type.Literal('completed'), Type.Literal('cancelled'), Type.Literal('expired'), Type.Literal('needs_review')]);
export const UploadChunkSchema = Type.Object({ offset: Type.Integer({ minimum: 0, maximum: UPLOAD_LIMITS.fileBytes }), length: Type.Integer({ minimum: 1, maximum: UPLOAD_LIMITS.chunkBytes }), sha256: Sha256Schema }, { additionalProperties: false });
export const UploadResponseSchema = Type.Object({
  id: Type.String({ format: 'uuid' }), entryId: Type.String({ format: 'uuid' }), parent: RelativePathSchema, name: NameSchema,
  size: Type.Integer({ minimum: 0, maximum: UPLOAD_LIMITS.fileBytes }), offset: Type.Integer({ minimum: 0, maximum: UPLOAD_LIMITS.fileBytes }),
  state: UploadStateSchema, createdAt: Type.String({ format: 'date-time' }), expiresAt: Type.String({ format: 'date-time' }),
  chunkBytes: Type.Literal(UPLOAD_LIMITS.chunkBytes), canResume: Type.Boolean(), cleanupPending: Type.Boolean(),
  chunks: Type.Array(UploadChunkSchema, { maxItems: 256 }), sha256: Type.Optional(Sha256Schema),
}, { additionalProperties: false });
export const UploadListSchema = Type.Object({ items: Type.Array(UploadResponseSchema, { maxItems: 50 }) }, { additionalProperties: false });
export type UploadCreate = Static<typeof UploadCreateSchema>;
export type UploadResponse = Static<typeof UploadResponseSchema>;
export type UploadChunk = Static<typeof UploadChunkSchema>;
