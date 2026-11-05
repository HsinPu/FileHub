import { Readable } from 'node:stream';
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { Static } from 'typebox';
import { EntryParamsSchema, ListQuerySchema, ResourceQuerySchema, ListingResponseSchema, MetadataResponseSchema, ApiErrorResponseSchema } from '@filehub/contracts';
import type { FileService } from './service.js';
import type { IdentityService } from '../identity/service.js';
import { sessionCookie } from '../identity/routes.js';
import { PublicError } from '../../plugins/errors.js';
import { byteRange } from './range.js';

export const fileRoutes: FastifyPluginAsync<{ files: FileService; identity: IdentityService }> = async (instance, { files, identity }) => {
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  const closing = new AbortController();
  const downloads = new Set<() => Promise<void>>();
  app.addHook('preClose', async () => { closing.abort(); });
  app.addHook('onClose', async () => {
    const results = await Promise.allSettled([...downloads].map((close) => close()));
    if (results.some((result) => result.status === 'rejected')) throw new Error('檔案資源未正常關閉');
  });
  app.addHook('onRequest', async (request) => { identity.authenticate(sessionCookie(request)); });
  const errors = { 400: ApiErrorResponseSchema, 401: ApiErrorResponseSchema, 403: ApiErrorResponseSchema, 404: ApiErrorResponseSchema, 409: ApiErrorResponseSchema, 416: ApiErrorResponseSchema, 422: ApiErrorResponseSchema, 503: ApiErrorResponseSchema };
  const user = (request: FastifyRequest) => identity.authenticate(sessionCookie(request)).user.id;
  const requestSignal = (request: FastifyRequest, reply: FastifyReply) => {
    const controller = new AbortController();
    const abort = () => { controller.abort(); };
    request.raw.once('aborted', abort);
    const closed = () => { if (!reply.raw.writableEnded) abort(); };
    reply.raw.once('close', closed);
    return { signal: AbortSignal.any([controller.signal, closing.signal]), dispose: () => { request.raw.off('aborted', abort); reply.raw.off('close', closed); } };
  };
  app.get('/api/entries/:entryId/files', { schema: { params: EntryParamsSchema, querystring: ListQuerySchema, response: { 200: ListingResponseSchema, ...errors } } }, async (request, reply) => {
    const operation = requestSignal(request, reply);
    try {
      const result = await files.list(user(request), request.params.entryId, request.query.path ?? '', request.query, operation.signal);
      user(request); return result;
    } finally { operation.dispose(); }
  });
  app.get('/api/entries/:entryId/metadata', { schema: { params: EntryParamsSchema, querystring: ResourceQuerySchema, response: { 200: MetadataResponseSchema, ...errors } } }, async (request, reply) => {
    const operation = requestSignal(request, reply);
    try {
      const result = await files.metadata(user(request), request.params.entryId, request.query.path ?? '', operation.signal);
      user(request);
      if (request.query.version && request.query.version !== result.resource.version) throw new PublicError('CONFLICT');
      return result;
    }
    finally { operation.dispose(); }
  });
  instance.route<{ Params: Static<typeof EntryParamsSchema>; Querystring: Static<typeof ResourceQuerySchema> }>({ method: ['GET', 'HEAD'], url: '/api/entries/:entryId/download', exposeHeadRoute: false, schema: { params: EntryParamsSchema, querystring: ResourceQuerySchema, response: errors }, handler: async (request, reply) => {
    const operation = requestSignal(request, reply);
    const opened = await files.openDownload(user(request), request.params.entryId, request.query.path ?? '', request.query.version, operation.signal).catch((error: unknown) => { operation.dispose(); throw error; });
    let transferred = false;
    try {
      user(request);
      const size = opened.resource.size ?? 0;
      const etag = `W/"${opened.resource.version}"`;
      let range;
      // Metadata fingerprint 為 weak validator，If-Range 一律保守回完整內容。
      try { range = byteRange(request.method === 'HEAD' || request.headers['if-range'] !== undefined ? undefined : request.headers.range, size); }
      catch (error) { reply.header('content-range', `bytes */${size}`); throw error; }
      const filename = encodeURIComponent(opened.resource.name).replace(/[!'()*]/g, (value) => `%${value.charCodeAt(0).toString(16).toUpperCase()}`);
      reply.header('content-type', 'application/octet-stream').header('content-disposition', `attachment; filename="download"; filename*=UTF-8''${filename}`)
        .header('x-content-type-options', 'nosniff').header('accept-ranges', 'bytes').header('etag', etag).header('content-length', String(range.end - range.start + 1));
      if (range.partial) reply.header('content-range', `bytes ${range.start}-${range.end}/${size}`);
      if (request.method === 'HEAD') { await opened.close(); return reply.code(200).send(); }
      if (size === 0) { await opened.close(); return reply.code(200).send(Buffer.alloc(0)); }
      const reader = opened.handle.createReadStream({ start: range.start, end: range.end, autoClose: false, highWaterMark: 65_536 });
      const stream = Readable.from((async function* () {
        try {
          let sent = 0;
          for await (const value of reader) {
            const chunk: unknown = value;
            if (!Buffer.isBuffer(chunk)) throw new PublicError('SERVICE_UNAVAILABLE');
            assertNotClosed(operation.signal); sent += chunk.length; yield chunk;
          }
          if (sent !== range.end - range.start + 1) throw new PublicError('SERVICE_UNAVAILABLE');
        }
        catch { throw new PublicError('SERVICE_UNAVAILABLE'); }
        finally { reader.destroy(); await opened.close(); }
      })(), { objectMode: false, highWaterMark: 65_536 });
      const abort = () => { if (!reply.raw.writableEnded) { reader.destroy(); stream.destroy(); } };
      reply.raw.once('close', abort);
      downloads.add(opened.close);
      stream.once('close', () => {
        reader.destroy();
        operation.dispose(); reply.raw.off('close', abort);
        void opened.close().catch(() => { request.log.error({ event: 'file_close_failed' }, '檔案資源未正常關閉'); }).finally(() => { downloads.delete(opened.close); });
      });
      transferred = true;
      return reply.code(range.partial ? 206 : 200).send(stream);
    } finally { if (!transferred) { operation.dispose(); await opened.close(); } }
  } });
};

function assertNotClosed(signal: AbortSignal): void { if (signal.aborted) throw new PublicError('SERVICE_UNAVAILABLE'); }
