import { Type, type Static } from 'typebox';

export const LiveResponseSchema = Type.Object({ status: Type.Literal('ok') }, { additionalProperties: false });
export const ReadyResponseSchema = Type.Object({
  status: Type.Union([Type.Literal('ready'), Type.Literal('not_ready')]),
}, { additionalProperties: false });

export type LiveResponse = Static<typeof LiveResponseSchema>;
export type ReadyResponse = Static<typeof ReadyResponseSchema>;
