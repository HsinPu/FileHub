import { Type, type Static } from 'typebox';
import { RelativePathSchema } from './entries.js';

export const ResourceVersionSchema = Type.String({ pattern: '^[a-f0-9]{64}$' });
export const EntryParamsSchema = Type.Object({ entryId: Type.String({ format: 'uuid' }) }, { additionalProperties: false });
export const ResourceQuerySchema = Type.Object({ path: Type.Optional(RelativePathSchema), version: Type.Optional(ResourceVersionSchema) }, { additionalProperties: false });
export const ListQuerySchema = Type.Object({
  filter: Type.Optional(Type.String({ maxLength: 128, pattern: '^[^\\u0000-\\u001f\\u007f]*$' })),
  path: Type.Optional(RelativePathSchema), version: Type.Optional(ResourceVersionSchema),
  sort: Type.Optional(Type.Union([Type.Literal('name'), Type.Literal('size'), Type.Literal('modifiedAt')])),
  direction: Type.Optional(Type.Union([Type.Literal('asc'), Type.Literal('desc')])),
  offset: Type.Optional(Type.Integer({ minimum: 0, maximum: 5000 })), limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
}, { additionalProperties: false });
export const ResourceSchema = Type.Object({
  name: Type.String({ maxLength: 255 }), path: RelativePathSchema,
  kind: Type.Union([Type.Literal('directory'), Type.Literal('file'), Type.Literal('link'), Type.Literal('other')]),
  size: Type.Union([Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }), Type.Null()]),
  modifiedAt: Type.String({ format: 'date-time' }), version: ResourceVersionSchema,
  canBrowse: Type.Boolean(), canDownload: Type.Boolean(), canWrite: Type.Optional(Type.Boolean()),canCopy:Type.Optional(Type.Boolean()),canShare:Type.Optional(Type.Boolean()),
}, { additionalProperties: false });
export const MetadataResponseSchema = Type.Object({ entryId: Type.String({ format: 'uuid' }), scope: RelativePathSchema, resource: ResourceSchema }, { additionalProperties: false });
export const ListingResponseSchema = Type.Object({
  entryId: Type.String({ format: 'uuid' }), path: RelativePathSchema, scope: RelativePathSchema, version: ResourceVersionSchema,
  items: Type.Array(ResourceSchema, { maxItems: 100 }), total: Type.Integer({ minimum: 0, maximum: 5000 }),
  offset: Type.Integer({ minimum: 0 }), limit: Type.Integer({ minimum: 1, maximum: 100 }), hasMore: Type.Boolean(),
  omitted: Type.Integer({ minimum: 0 }), canCreate: Type.Optional(Type.Boolean()),
}, { additionalProperties: false });
export type ResourceMetadata = Static<typeof ResourceSchema>;
export type MetadataResponse = Static<typeof MetadataResponseSchema>;
export type ListingResponse = Static<typeof ListingResponseSchema>;
export type ListQuery = Static<typeof ListQuerySchema>;
