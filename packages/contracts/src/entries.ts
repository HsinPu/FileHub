import { Type, type Static } from 'typebox';

export const RelativePathSchema = Type.String({ maxLength: 1024 });
export const EntrySchema = Type.Object({
  id: Type.String({ format: 'uuid' }), label: Type.String({ minLength: 1, maxLength: 80 }),
  kind: Type.Union([Type.Literal('managed'), Type.Literal('external')]), readOnly: Type.Boolean(),
  scopes: Type.Array(Type.Object({ path: RelativePathSchema, canDownload: Type.Boolean(), canWrite: Type.Optional(Type.Boolean()) }, { additionalProperties: false }), { maxItems: 100 }),
}, { additionalProperties: false });
export const EntriesResponseSchema = Type.Object({ entries: Type.Array(EntrySchema, { maxItems: 100 }) }, { additionalProperties: false });
export type PublicEntry = Static<typeof EntrySchema>;
