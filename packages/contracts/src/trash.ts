import { Type, type Static } from 'typebox';
import { RelativePathSchema } from './entries.js';
import { ResourceVersionSchema } from './files.js';
import { NameSchema } from './writes.js';

export const TrashQuerySchema = Type.Object({ offset: Type.Optional(Type.Integer({ minimum: 0, maximum: 1000 })) }, { additionalProperties: false });
export const RestoreRequestSchema = Type.Object({ id: Type.String({ format: 'uuid' }), parent: RelativePathSchema, parentVersion: ResourceVersionSchema, name: NameSchema, version: ResourceVersionSchema }, { additionalProperties: false });
export const TrashItemSchema = Type.Object({
  id: Type.String({ format: 'uuid' }), originalPath: RelativePathSchema, kind: Type.Union([Type.Literal('file'), Type.Literal('directory')]),
  status: Type.Union([Type.Literal('prepared'), Type.Literal('available'), Type.Literal('restoring'), Type.Literal('needs_review')]),
  version: ResourceVersionSchema, createdAt: Type.String({ format: 'date-time' }), canRestore: Type.Boolean(),
}, { additionalProperties: false });
export const TrashResponseSchema = Type.Object({ items: Type.Array(TrashItemSchema, { maxItems: 50 }), total: Type.Integer({ minimum: 0, maximum: 1000 }), offset: Type.Integer({ minimum: 0 }), hasMore: Type.Boolean() }, { additionalProperties: false });
export type TrashItem = Static<typeof TrashItemSchema>;
export type TrashResponse = Static<typeof TrashResponseSchema>;
export type RestoreRequest = Static<typeof RestoreRequestSchema>;
export type TrashRequest = { id: string; path: string; version: string };
