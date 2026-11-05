import { Type, type Static } from 'typebox';
import { ResourceSchema } from './files.js';
import { RelativePathSchema } from './entries.js';

export const SearchTextSchema = Type.String({ minLength: 1, maxLength: 128, pattern: '^[^\\u0000-\\u001f\\u007f]+$' });
export const SearchQuerySchema = Type.Object({ path: Type.Optional(RelativePathSchema), query: SearchTextSchema }, { additionalProperties: false });
export const SearchReasonSchema = Type.Union([Type.Literal('depth'), Type.Literal('scan'), Type.Literal('results'), Type.Literal('time'), Type.Literal('unavailable'), Type.Literal('changed')]);
export const SearchResponseSchema = Type.Object({
  entryId: Type.String({ format: 'uuid' }), path: RelativePathSchema, query: SearchTextSchema,
  items: Type.Array(ResourceSchema, { maxItems: 100 }), partial: Type.Boolean(), reasons: Type.Array(SearchReasonSchema, { maxItems: 6, uniqueItems: true }),
  scanned: Type.Integer({ minimum: 0, maximum: 10000 }), omitted: Type.Integer({ minimum: 0 }), elapsedMs: Type.Integer({ minimum: 0 }),
}, { additionalProperties: false });
export type SearchResponse = Static<typeof SearchResponseSchema>;
