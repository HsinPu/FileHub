import { timingSafeEqual } from 'node:crypto';
import { Type } from 'typebox';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { LoginRequestSchema, SessionResponseSchema, ApiErrorResponseSchema, fileHubMountPrefix } from '@filehub/contracts';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { AppConfig } from '../../config/index.js';
import { PublicError } from '../../plugins/errors.js';
import type { IdentityService } from './service.js';

export const COOKIE_NAME = 'filehub_session';
function sessionCookieName(request: FastifyRequest): string {
  return fileHubMountPrefix(request.originalUrl) ? `${COOKIE_NAME}_filehub` : COOKIE_NAME;
}
export function sessionCookie(request: FastifyRequest): string | undefined {
  const name = sessionCookieName(request);
  const values = (request.headers.cookie ?? '').split(';').map((part) => part.trim()).filter((part) => part.startsWith(`${name}=`));
  if (values.length !== 1) return undefined;
  return values[0]?.slice(name.length + 1);
}
function targetOrigin(request: FastifyRequest, config: AppConfig): string {
  const host = config.host.includes(':') ? `[${config.host}]` : config.host;
  return config.publicOrigin ?? `http://${host}:${request.socket.localPort ?? config.port}`;
}
export function requireOrigin(request: FastifyRequest, config: AppConfig): void {
  if (request.headers.origin !== targetOrigin(request, config) || request.headers['sec-fetch-site'] === 'cross-site') throw new PublicError('FORBIDDEN');
}
function cookieValue(token: string, request: FastifyRequest, config: AppConfig, clear = false): string {
  const path = `${fileHubMountPrefix(request.originalUrl)}/`;
  return `${sessionCookieName(request)}=${token}; Path=${path}; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : 43200}${targetOrigin(request, config).startsWith('https:') ? '; Secure' : ''}`;
}
export function clearSessionCookie(request:FastifyRequest,config:AppConfig):string{return cookieValue('',request,config,true);}
export function requireCsrf(request: FastifyRequest, expected: string, config: AppConfig): void {
  requireOrigin(request, config);
  const actual = request.headers['x-csrf-token'];
  if (typeof actual !== 'string' || !/^[a-f0-9]{64}$/.test(actual) || !timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'))) throw new PublicError('FORBIDDEN');
}

export const identityRoutes: FastifyPluginAsync<{ identity: IdentityService; config: AppConfig }> = async (instance, { identity, config }) => {
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  const errors = { 400: ApiErrorResponseSchema, 401: ApiErrorResponseSchema, 403: ApiErrorResponseSchema, 429: ApiErrorResponseSchema };
  app.post('/api/session', {
    bodyLimit: 4096, onRequest: async (request) => { requireOrigin(request, config); },
    schema: { body: LoginRequestSchema, response: { 200: SessionResponseSchema, ...errors } },
  }, async (request, reply) => {
    const result = await identity.login(request.body.username, request.body.password, request.ip, sessionCookie(request));
    reply.header('set-cookie', cookieValue(result.token, request, config));
    return result.session;
  });
  app.get('/api/session', { schema: { response: { 200: SessionResponseSchema, ...errors } } }, async (request) => {
    const session = identity.authenticate(sessionCookie(request));
    return { user: session.user, expiresAt: new Date(session.expiresAt).toISOString(), csrfToken: session.csrfToken };
  });
  app.delete('/api/session', { schema: { response: { 204: Type.Null(), ...errors } } }, async (request, reply) => {
    const session = identity.authenticate(sessionCookie(request));
    requireCsrf(request, session.csrfToken, config);
    identity.logout(session);
    return reply.header('set-cookie', clearSessionCookie(request, config)).code(204).send(null);
  });
};
