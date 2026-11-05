import type { FastifyPluginAsync } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { EntryParamsSchema, SearchQuerySchema, SearchResponseSchema, ApiErrorResponseSchema } from '@filehub/contracts';
import type { IdentityService } from '../identity/service.js';
import { sessionCookie } from '../identity/routes.js';
import type { SearchService } from './service.js';

export const searchRoutes: FastifyPluginAsync<{ search: SearchService; identity: IdentityService }> = async (instance, { search, identity }) => {
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  const closing = new AbortController();
  app.addHook('preClose', async () => { closing.abort(); });
  app.get('/api/entries/:entryId/search', { schema: { params: EntryParamsSchema, querystring: SearchQuerySchema, response: { 200: SearchResponseSchema, 400: ApiErrorResponseSchema, 401: ApiErrorResponseSchema, 403: ApiErrorResponseSchema, 404: ApiErrorResponseSchema, 409: ApiErrorResponseSchema, 503: ApiErrorResponseSchema } } }, async (request, reply) => {
    const user = () => identity.authenticate(sessionCookie(request)).user.id;
    const controller = new AbortController();
    const abort = () => { if (!reply.raw.writableEnded) controller.abort(); };
    request.raw.once('aborted', abort); reply.raw.once('close', abort);
    try {
      const result = await search.search(user(), request.params.entryId, request.query.path ?? '', request.query.query, AbortSignal.any([controller.signal, closing.signal]));
      user(); return result;
    } finally { request.raw.off('aborted', abort); reply.raw.off('close', abort); }
  });
};
