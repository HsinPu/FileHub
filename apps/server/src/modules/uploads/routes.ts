import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { Readable } from 'node:stream';
import { UPLOAD_LIMITS } from '@filehub/contracts';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { EntryParamsSchema, UploadCreateSchema, UploadParamsSchema, UploadResponseSchema, UploadListSchema, ApiErrorResponseSchema } from '@filehub/contracts';
import type { AppConfig } from '../../config/index.js';
import type { IdentityService } from '../identity/service.js';
import { requireCsrf, sessionCookie } from '../identity/routes.js';
import type { UploadService } from './service.js';
import { PublicError } from '../../plugins/errors.js';

export const uploadRoutes: FastifyPluginAsync<{ uploads: UploadService; identity: IdentityService; config: AppConfig }> = async (instance, { uploads, identity, config }) => {
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  const current = (request: FastifyRequest) => identity.authenticate(sessionCookie(request));
  const write = (request: FastifyRequest) => { const session = current(request); requireCsrf(request, session.csrfToken, config); return session.user.id; };
  app.addHook('onRequest', async (request) => { current(request); });
  const errors = { 400: ApiErrorResponseSchema, 401: ApiErrorResponseSchema, 403: ApiErrorResponseSchema, 404: ApiErrorResponseSchema, 409: ApiErrorResponseSchema, 413: ApiErrorResponseSchema, 415: ApiErrorResponseSchema, 422: ApiErrorResponseSchema, 503: ApiErrorResponseSchema, 507: ApiErrorResponseSchema };
  app.addContentTypeParser('application/octet-stream', (_request, payload, done) => { done(null, payload); });
  app.post('/api/entries/:entryId/uploads', { bodyLimit: 4096, onRequest: async (request) => { write(request); }, schema: { params: EntryParamsSchema, body: UploadCreateSchema, response: { 200: UploadResponseSchema, ...errors } } }, async (request) => uploads.create(write(request), request.params.entryId, request.body, () => { write(request); }));
  app.get('/api/entries/:entryId/uploads', { schema: { params: EntryParamsSchema, response: { 200: UploadListSchema, ...errors } } }, async (request) => uploads.list(current(request).user.id, request.params.entryId));
  app.get('/api/uploads/:id', { schema: { params: UploadParamsSchema, response: { 200: UploadResponseSchema, ...errors } } }, async (request) => uploads.get(current(request).user.id, request.params.id));
  app.delete('/api/uploads/:id', { onRequest: async (request) => { write(request); }, schema: { params: UploadParamsSchema, response: { 200: UploadResponseSchema, ...errors } } }, async (request) => uploads.cancel(write(request), request.params.id));
  app.put('/api/uploads/:id/content', { bodyLimit: UPLOAD_LIMITS.chunkBytes, onRequest: async (request) => { write(request); }, schema: { params: UploadParamsSchema, response: { 200: UploadResponseSchema, ...errors } } }, async (request) => {
    const offset = request.headers['x-upload-offset'], hash = request.headers['x-upload-checksum'], length = request.headers['content-length'];
    if (request.headers['content-type'] !== 'application/octet-stream') throw new PublicError('UNSUPPORTED_MEDIA_TYPE');
    if (typeof offset !== 'string' || !/^(0|[1-9][0-9]{0,10})$/.test(offset) || typeof length !== 'string' || !/^[1-9][0-9]{0,7}$/.test(length) || typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash) || !(request.body instanceof Readable)) throw new PublicError('BAD_REQUEST');
    if (Number(length) > UPLOAD_LIMITS.chunkBytes) throw new PublicError('PAYLOAD_TOO_LARGE');
    request.raw.setTimeout(30_000, () => { request.raw.destroy(); });
    try { return await uploads.receive(write(request), request.params.id, Number(offset), Number(length), hash, request.body, () => { write(request); }); }
    finally { request.raw.setTimeout(0); }
  });
  app.post('/api/uploads/:id/finalize', { bodyLimit: 1024, onRequest: async (request) => { write(request); }, schema: { params: UploadParamsSchema, response: { 200: UploadResponseSchema, ...errors } } }, async (request) => {
    if (request.body !== undefined) throw new PublicError('BAD_REQUEST');
    return uploads.finalize(write(request), request.params.id, () => { write(request); });
  });
};
