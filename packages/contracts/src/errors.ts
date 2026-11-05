import { Type, type Static } from 'typebox';

export const ApiErrorCodeSchema = Type.Union([
  Type.Literal('BAD_REQUEST'),
  Type.Literal('NOT_FOUND'),
  Type.Literal('PAYLOAD_TOO_LARGE'),
  Type.Literal('UNSUPPORTED_MEDIA_TYPE'),
  Type.Literal('SERVICE_UNAVAILABLE'),
  Type.Literal('INTERNAL_ERROR'),
  Type.Literal('UNAUTHORIZED'), Type.Literal('FORBIDDEN'), Type.Literal('CONFLICT'), Type.Literal('RATE_LIMITED'),
  Type.Literal('RESOURCE_LIMIT'), Type.Literal('RANGE_NOT_SATISFIABLE'),
  Type.Literal('MUTATION_BUSY'), Type.Literal('MUTATION_UNCERTAIN'), Type.Literal('WRITE_UNSUPPORTED'), Type.Literal('STORAGE_FULL'), Type.Literal('CROSS_DEVICE'),
]);

export const ValidationLocationSchema = Type.Union([
  Type.Literal('body'), Type.Literal('querystring'), Type.Literal('params'), Type.Literal('headers'),
]);

export const ApiErrorResponseSchema = Type.Object({
  code: ApiErrorCodeSchema,
  message: Type.String({ minLength: 1, maxLength: 256 }),
  requestId: Type.String({ minLength: 1, maxLength: 128 }),
  details: Type.Optional(Type.Object({ location: ValidationLocationSchema }, { additionalProperties: false })),
}, { additionalProperties: false });

export type ApiErrorCode = Static<typeof ApiErrorCodeSchema>;
export type ApiErrorResponse = Static<typeof ApiErrorResponseSchema>;
