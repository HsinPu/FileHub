import { Type } from 'typebox';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { EntryParamsSchema, TrashRequestSchema, RestoreRequestSchema, TrashQuerySchema, TrashResponseSchema, MutationResponseSchema, ApiErrorResponseSchema } from '@filehub/contracts';
import type { AppConfig } from '../../config/index.js';
import type { IdentityService } from '../identity/service.js';
import { requireCsrf, sessionCookie } from '../identity/routes.js';
import type { TrashService } from './service.js';

export const trashRoutes: FastifyPluginAsync<{ trash: TrashService; identity: IdentityService; config: AppConfig }> = async (instance, { trash, identity, config }) => {
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  const current = (request: FastifyRequest) => identity.authenticate(sessionCookie(request));
  const write = (request: FastifyRequest) => { const session = current(request); requireCsrf(request, session.csrfToken, config); return session.user.id; };
  app.addHook('onRequest', async (request) => { current(request); });
  const errors = { 400: ApiErrorResponseSchema, 401: ApiErrorResponseSchema, 403: ApiErrorResponseSchema, 404: ApiErrorResponseSchema, 409: ApiErrorResponseSchema, 422: ApiErrorResponseSchema, 503: ApiErrorResponseSchema, 507: ApiErrorResponseSchema };
  app.get('/api/entries/:entryId/trash', { schema: { params: EntryParamsSchema, querystring: TrashQuerySchema, response: { 200: TrashResponseSchema, ...errors } } }, async (request) => trash.list(current(request).user.id, request.params.entryId, request.query.offset));
  app.post('/api/entries/:entryId/trash', { bodyLimit: 4096, onRequest: async (request) => { write(request); }, schema: { params: EntryParamsSchema, body: TrashRequestSchema, response: { 200: MutationResponseSchema, ...errors } } }, async (request) => trash.put(write(request), request.params.entryId, request.body, () => { write(request); }));
  app.post('/api/entries/:entryId/trash/:id/restore', { bodyLimit: 4096, onRequest: async (request) => { write(request); }, schema: { params: Type.Object({ entryId: Type.String({ format: 'uuid' }), id: Type.String({ format: 'uuid' }) }, { additionalProperties: false }), body: RestoreRequestSchema, response: { 200: MutationResponseSchema, ...errors } } }, async (request) => trash.restore(write(request), request.params.entryId, request.params.id, request.body, () => { write(request); }));
};
