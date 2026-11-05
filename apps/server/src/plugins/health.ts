import { ApiErrorResponseSchema, LiveResponseSchema, ReadyResponseSchema } from '@filehub/contracts';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyPluginAsync } from 'fastify';

export type ReadinessProbe = (signal: AbortSignal) => boolean | Promise<boolean>;

interface HealthOptions {
  readiness: ReadinessProbe;
  timeoutMs: number;
  closing: AbortSignal;
}

async function checkReadiness({ readiness, timeoutMs, closing }: HealthOptions): Promise<boolean> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const cancelled = new Promise<boolean>((resolve) => {
    controller.signal.addEventListener('abort', () => resolve(false), { once: true });
  });
  closing.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  if (closing.aborted) abort();
  try {
    if (controller.signal.aborted) return false;
    const result = Promise.resolve().then(() => readiness(controller.signal)).then((value) => value === true, () => false);
    return await Promise.race([result, cancelled]);
  } finally {
    clearTimeout(timer);
    closing.removeEventListener('abort', abort);
    controller.abort();
  }
}

export const healthRoutes: FastifyPluginAsync<HealthOptions> = async (instance, options) => {
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  app.get('/health/live', { schema: { response: { 200: LiveResponseSchema, default: ApiErrorResponseSchema } } }, () => ({ status: 'ok' as const }));
  app.get('/health/ready', { schema: { response: { 200: ReadyResponseSchema, 503: ReadyResponseSchema, default: ApiErrorResponseSchema } } }, async (_request, reply) => {
    const ready = await checkReadiness(options);
    return reply.code(ready ? 200 : 503).send({ status: ready ? 'ready' : 'not_ready' });
  });
};
