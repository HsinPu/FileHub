import type { FastifyPluginAsync } from 'fastify';
import { EntriesResponseSchema, ApiErrorResponseSchema } from '@filehub/contracts';
import type { EntryService } from './service.js';
import type { IdentityService } from '../identity/service.js';
import { sessionCookie } from '../identity/routes.js';

export const entryRoutes: FastifyPluginAsync<{ entries: EntryService; identity: IdentityService }> = async (app, services) => {
  app.get('/api/entries', { schema: { response: { 200: EntriesResponseSchema, 401: ApiErrorResponseSchema, 503: ApiErrorResponseSchema } } }, async (request) => {
    const session = services.identity.authenticate(sessionCookie(request));
    return { entries: services.entries.list(session.user.id) };
  });
};
