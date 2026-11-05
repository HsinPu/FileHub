import { Type, type Static } from 'typebox';
import { RelativePathSchema } from './entries.js';
import { ResourceVersionSchema } from './files.js';
import { ApiErrorCodeSchema } from './errors.js';

export const NameSchema = Type.String({ minLength: 1, maxLength: 255 });
export const MkdirRequestSchema = Type.Object({ id: Type.String({ format: 'uuid' }), parent: RelativePathSchema, parentVersion: ResourceVersionSchema, name: NameSchema }, { additionalProperties: false });
export const RenameRequestSchema = Type.Object({ id: Type.String({ format: 'uuid' }), path: RelativePathSchema, version: ResourceVersionSchema, parent: RelativePathSchema, parentVersion: ResourceVersionSchema, name: NameSchema }, { additionalProperties: false });
export const TrashRequestSchema = Type.Object({ id: Type.String({ format: 'uuid' }), path: RelativePathSchema, version: ResourceVersionSchema }, { additionalProperties: false });
export const MutationStatusSchema = Type.Union([Type.Literal('prepared'), Type.Literal('applying'), Type.Literal('succeeded'), Type.Literal('failed'), Type.Literal('needs_review')]);
export const MutationResponseSchema = Type.Object({
  id: Type.String({ format: 'uuid' }), kind: Type.Union([Type.Literal('mkdir'), Type.Literal('rename'), Type.Literal('trash'), Type.Literal('restore')]),
  status: MutationStatusSchema, createdAt: Type.String({ format: 'date-time' }), updatedAt: Type.String({ format: 'date-time' }),
  errorCode: Type.Optional(ApiErrorCodeSchema),
}, { additionalProperties: false });
export type MutationResponse = Static<typeof MutationResponseSchema>;
export type MkdirRequest = Static<typeof MkdirRequestSchema>;
export type RenameRequest = Static<typeof RenameRequestSchema>;
