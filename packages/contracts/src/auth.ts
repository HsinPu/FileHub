import { Type, type Static } from 'typebox';

export const UsernameSchema = Type.String({ pattern: '^[A-Za-z0-9][A-Za-z0-9._-]{2,31}$', maxLength: 32 });
export const LoginRequestSchema = Type.Object({ username: UsernameSchema, password: Type.String({ minLength: 1, maxLength: 128 }) }, { additionalProperties: false });
export const UserSchema = Type.Object({
  id: Type.String({ format: 'uuid' }), username: UsernameSchema,
  role: Type.Union([Type.Literal('admin'), Type.Literal('member')]),
}, { additionalProperties: false });
export const SessionResponseSchema = Type.Object({
  user: UserSchema, csrfToken: Type.String({ pattern: '^[a-f0-9]{64}$' }), expiresAt: Type.String({ format: 'date-time' }),
}, { additionalProperties: false });
export type PublicUser = Static<typeof UserSchema>;
export type SessionResponse = Static<typeof SessionResponseSchema>;
