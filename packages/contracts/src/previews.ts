import { Type, type Static } from 'typebox';
import { ResourceSchema } from './files.js';
export const PreviewResponseSchema = Type.Object({
  resource: ResourceSchema,
  kind: Type.Union([Type.Literal('image'), Type.Literal('text'), Type.Literal('pdf'), Type.Literal('unsupported')]),
  reason: Type.Union([Type.Literal('supported'), Type.Literal('type'), Type.Literal('size'), Type.Literal('invalid')]),
}, { additionalProperties: false });
export type PreviewResponse = Static<typeof PreviewResponseSchema>;
