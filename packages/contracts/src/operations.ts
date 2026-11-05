import { Type, type Static } from 'typebox';
import { RelativePathSchema } from './entries.js';
import { ResourceVersionSchema } from './files.js';
import { NameSchema } from './writes.js';
import { ApiErrorCodeSchema } from './errors.js';

export const OPERATION_LIMITS = Object.freeze({ sources: 16, active: 32, userActive: 8, history: 10000, nodes: 1000, depth: 16, fileBytes: 1073741824, bytes: 2147483648, leaseMs: 5000, progressMs: 250 });
export const ARCHIVE_LIMITS=Object.freeze({bytes:2155872256,totalBytes:8589934592,ttlMs:86400000,centralBytes:4194304});
export const OperationKindSchema = Type.Union([Type.Literal('copy'), Type.Literal('move'), Type.Literal('archive')]);
export const OperationCapabilitiesSchema=Type.Object({kinds:Type.Array(OperationKindSchema,{maxItems:3,uniqueItems:true}),maxSources:Type.Integer({minimum:1,maximum:OPERATION_LIMITS.sources})},{additionalProperties:false});
export type OperationCapabilities=Static<typeof OperationCapabilitiesSchema>;
export const OperationSourceSchema = Type.Object({ entryId: Type.String({ format: 'uuid' }), path: RelativePathSchema, version: ResourceVersionSchema, name: Type.Optional(NameSchema) }, { additionalProperties: false });
export const OperationCreateSchema = Type.Object({
  id: Type.String({ format: 'uuid' }), kind: OperationKindSchema,
  sources: Type.Array(OperationSourceSchema, { minItems: 1, maxItems: OPERATION_LIMITS.sources }),
  destination: Type.Optional(Type.Object({ entryId: Type.String({ format: 'uuid' }), path: RelativePathSchema, version: ResourceVersionSchema }, { additionalProperties: false })),
  conflict: Type.Union([Type.Literal('stop'), Type.Literal('skip')]),
}, { additionalProperties: false });
export const OperationStateSchema = Type.Union([Type.Literal('queued'), Type.Literal('running'), Type.Literal('cancelling'), Type.Literal('succeeded'), Type.Literal('partial'), Type.Literal('failed'), Type.Literal('cancelled'), Type.Literal('interrupted'), Type.Literal('needs_review')]);
export const OperationItemStateSchema = Type.Union([Type.Literal('pending'), Type.Literal('running'), Type.Literal('succeeded'), Type.Literal('failed'), Type.Literal('cancelled'), Type.Literal('needs_review')]);
export const OperationItemSchema = Type.Object({
  index: Type.Integer({ minimum: 0, maximum: 15 }), entryId: Type.String({ format: 'uuid' }), path: RelativePathSchema,
  state: OperationItemStateSchema, bytesDone: Type.Integer({ minimum: 0, maximum: OPERATION_LIMITS.bytes }), bytesTotal: Type.Integer({ minimum: 0, maximum: OPERATION_LIMITS.bytes }), errorCode: Type.Optional(ApiErrorCodeSchema),
}, { additionalProperties: false });
export const OperationResponseSchema = Type.Object({
  id: Type.String({ format: 'uuid' }), kind: OperationKindSchema, state: OperationStateSchema, cancelRequested: Type.Boolean(), attempt: Type.Integer({ minimum: 0 }),
  items: Type.Array(OperationItemSchema, { minItems: 1, maxItems: OPERATION_LIMITS.sources }),
  createdAt: Type.String({ format: 'date-time' }), updatedAt: Type.String({ format: 'date-time' }), canRetry: Type.Boolean(),
  artifact:Type.Optional(Type.Object({bytes:Type.Integer({minimum:22,maximum:ARCHIVE_LIMITS.bytes}),sha256:Type.String({pattern:'^[a-f0-9]{64}$'}),expiresAt:Type.String({format:'date-time'})},{additionalProperties:false})),
}, { additionalProperties: false });
export const OperationListSchema = Type.Object({ items: Type.Array(OperationResponseSchema, { maxItems: 50 }) }, { additionalProperties: false });
export const OperationParamsSchema = Type.Object({ id: Type.String({ format: 'uuid' }) }, { additionalProperties: false });
export type OperationCreate = Static<typeof OperationCreateSchema>;
export type OperationResponse = Static<typeof OperationResponseSchema>;
export type OperationKind = Static<typeof OperationKindSchema>;
