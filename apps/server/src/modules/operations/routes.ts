import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { OperationCreateSchema, OperationParamsSchema, OperationResponseSchema, OperationListSchema, OperationCapabilitiesSchema,ApiErrorResponseSchema } from '@filehub/contracts';
import type { AppConfig } from '../../config/index.js';
import type { IdentityService } from '../identity/service.js';
import { requireCsrf, sessionCookie } from '../identity/routes.js';
import type { OperationService } from './service.js';
import { PublicError } from '../../plugins/errors.js';

export const operationRoutes: FastifyPluginAsync<{ operations: OperationService; identity: IdentityService; config: AppConfig }> = async (instance, { operations, identity, config }) => {
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  const current = (request: FastifyRequest) => identity.authenticate(sessionCookie(request));
  const write = (request: FastifyRequest) => { const session = current(request); requireCsrf(request, session.csrfToken, config); return session.user.id; };
  app.addHook('onRequest', async (request) => { current(request); });
  const errors = { 400: ApiErrorResponseSchema, 401: ApiErrorResponseSchema, 403: ApiErrorResponseSchema, 404: ApiErrorResponseSchema, 409: ApiErrorResponseSchema, 413: ApiErrorResponseSchema, 422: ApiErrorResponseSchema, 503: ApiErrorResponseSchema };
  app.get('/api/operations', { schema: { response: { 200: OperationListSchema, ...errors } } }, async (request) => operations.catalog.list(current(request).user.id));
  app.get('/api/operations/capabilities',{schema:{response:{200:OperationCapabilitiesSchema,...errors}}},async()=>operations.capabilities());
  app.get('/api/operations/:id', { schema: { params: OperationParamsSchema, response: { 200: OperationResponseSchema, ...errors } } }, async (request) => operations.catalog.get(current(request).user.id, request.params.id));
  app.post('/api/operations', { bodyLimit: 65536, onRequest: async (request) => { write(request); }, schema: { body: OperationCreateSchema, response: { 200: OperationResponseSchema, ...errors } } }, async (request) => operations.create(write(request), request.body, () => { write(request); }));
  for (const action of ['cancel','retry'] as const) app.post(`/api/operations/:id/${action}`, { bodyLimit: 1024, onRequest: async (request) => { write(request); }, schema: { params: OperationParamsSchema, response: { 200: OperationResponseSchema, ...errors } } }, async (request) => {
    const user = write(request); if (request.body !== undefined) throw new PublicError('BAD_REQUEST'); return operations.catalog[action](user, request.params.id);
  });
};
