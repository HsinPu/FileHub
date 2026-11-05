import { Type } from 'typebox';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { EntryParamsSchema, MkdirRequestSchema, RenameRequestSchema, MutationResponseSchema, ApiErrorResponseSchema } from '@filehub/contracts';
import type { AppConfig } from '../../config/index.js';
import type { IdentityService } from '../identity/service.js';
import { requireCsrf, sessionCookie } from '../identity/routes.js';
import type { MutationService } from './mutations.js';

export const writeRoutes: FastifyPluginAsync<{ mutations: MutationService; identity: IdentityService; config: AppConfig }> = async (instance, { mutations, identity, config }) => {
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  const current = (request: FastifyRequest) => identity.authenticate(sessionCookie(request));
  app.addHook('onRequest', async (request) => { current(request); });
  const reauthorize = (request: FastifyRequest) => { const session = current(request); requireCsrf(request, session.csrfToken, config); return session.user.id; };
  const errors = { 400: ApiErrorResponseSchema, 401: ApiErrorResponseSchema, 403: ApiErrorResponseSchema, 404: ApiErrorResponseSchema, 409: ApiErrorResponseSchema, 422: ApiErrorResponseSchema, 503: ApiErrorResponseSchema, 507: ApiErrorResponseSchema };
  app.post('/api/entries/:entryId/directories', { bodyLimit: 4096, onRequest: async (request) => { reauthorize(request); }, schema: { params: EntryParamsSchema, body: MkdirRequestSchema, response: { 200: MutationResponseSchema, ...errors } } }, async (request) => mutations.mkdir(reauthorize(request), request.params.entryId, request.body, () => { reauthorize(request); }));
  app.post('/api/entries/:entryId/rename', { bodyLimit: 4096, onRequest: async (request) => { reauthorize(request); }, schema: { params: EntryParamsSchema, body: RenameRequestSchema, response: { 200: MutationResponseSchema, ...errors } } }, async (request) => mutations.rename(reauthorize(request), request.params.entryId, request.body, () => { reauthorize(request); }));
  app.get('/api/mutations/:id', { schema: { params: Type.Object({ id: Type.String({ format: 'uuid' }) }, { additionalProperties: false }), response: { 200: MutationResponseSchema, ...errors } } }, async (request) => mutations.status(current(request).user.id, request.params.id));
};
