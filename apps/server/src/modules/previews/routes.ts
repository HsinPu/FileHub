import type { FastifyPluginAsync } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { Static } from 'typebox';
import { EntryParamsSchema, ResourceQuerySchema, PreviewResponseSchema, ApiErrorResponseSchema } from '@filehub/contracts';
import type { IdentityService } from '../identity/service.js';
import { sessionCookie } from '../identity/routes.js';
import { byteRange } from '../files/range.js';
import type { PreviewService } from './service.js';

export const previewRoutes: FastifyPluginAsync<{ previews: PreviewService; identity: IdentityService }> = async (instance, { previews, identity }) => {
  const app = instance.withTypeProvider<TypeBoxTypeProvider>(), closing = new AbortController(), pending = new Set<Promise<unknown>>();
  app.addHook('preClose', async () => { closing.abort(); });
  app.addHook('onClose', async () => { await Promise.allSettled([...pending]); previews.cache.clear(); });
  const errors = { 400: ApiErrorResponseSchema, 401: ApiErrorResponseSchema, 403: ApiErrorResponseSchema, 404: ApiErrorResponseSchema, 409: ApiErrorResponseSchema, 415: ApiErrorResponseSchema, 416: ApiErrorResponseSchema, 422: ApiErrorResponseSchema, 503: ApiErrorResponseSchema };
  app.get('/api/entries/:entryId/preview', { schema: { params: EntryParamsSchema, querystring: ResourceQuerySchema, response: { 200: PreviewResponseSchema, ...errors } } }, async (request) => {
    const user = identity.authenticate(sessionCookie(request)).user.id;
    const task = previews.info(user, request.params.entryId, request.query.path ?? '', request.query.version, closing.signal); pending.add(task);
    try { const result = await task; identity.authenticate(sessionCookie(request)); return result; } finally { pending.delete(task); }
  });
  for (const variant of ['preview', 'thumb'] as const) instance.route<{ Params: Static<typeof EntryParamsSchema>; Querystring: Static<typeof ResourceQuerySchema> }>({ method: ['GET', 'HEAD'], url: `/api/entries/:entryId/preview/${variant === 'thumb' ? 'thumbnail' : 'content'}`, exposeHeadRoute: false, schema: { params: EntryParamsSchema, querystring: ResourceQuerySchema, response: errors }, handler: async (request, reply) => {
    const user = identity.authenticate(sessionCookie(request)).user.id, controller = new AbortController();
    const abort = () => { if (!reply.raw.writableEnded) controller.abort(); };
    request.raw.once('aborted', abort); reply.raw.once('close', abort);
    const task = previews.content(user, request.params.entryId, request.query.path ?? '', request.query.version, AbortSignal.any([closing.signal, controller.signal]), variant); pending.add(task);
    try {
      const result = await task; identity.authenticate(sessionCookie(request));
      const size = result.bytes.length;
      let range;
      try { range = byteRange(request.method === 'HEAD' || request.headers['if-range'] !== undefined ? undefined : request.headers.range, size); }
      catch (error) { reply.header('content-range', `bytes */${size}`); throw error; }
      const filename = encodeURIComponent(result.info.resource.name).replace(/[!'()*]/g, (value) => `%${value.charCodeAt(0).toString(16).toUpperCase()}`);
      reply.header('content-type', result.mime).header('content-disposition', `inline; filename="preview"; filename*=UTF-8''${filename}`)
        .header('content-security-policy', "default-src 'none'; sandbox").header('x-content-type-options', 'nosniff').header('x-frame-options', 'DENY')
        .header('referrer-policy', 'no-referrer').header('cross-origin-resource-policy', 'same-origin').header('accept-ranges', 'bytes')
        .header('etag', `W/"${variant}-${result.info.resource.version}"`).header('content-length', String(Math.max(0, range.end - range.start + 1)));
      if (range.partial) reply.header('content-range', `bytes ${range.start}-${range.end}/${size}`);
      return reply.code(range.partial ? 206 : 200).send(request.method === 'HEAD' ? undefined : result.bytes.subarray(range.start, range.end + 1));
    } finally { pending.delete(task); request.raw.off('aborted', abort); reply.raw.off('close', abort); }
  } });
};
