import type { FastifyInstance } from 'fastify';
import type { AppConfig } from './config/index.js';
import { createShutdown } from './lifecycle/shutdown.js';

export { ShutdownTimeoutError } from './lifecycle/shutdown.js';

const closingApplications = new WeakMap<FastifyInstance, Promise<void>>();

export function closeApp(app: FastifyInstance, timeoutMs: number): Promise<void> {
  const existing = closingApplications.get(app);
  if (existing) return existing;
  const closing = createShutdown(() => app.close(), timeoutMs, () => { app.server.closeAllConnections(); })();
  closingApplications.set(app, closing);
  return closing;
}

// 呼叫後由此函式負責啟動失敗的 app 清理；成功後由呼叫端 closeApp。
export async function listenApp(app: FastifyInstance, config: AppConfig): Promise<string> {
  try {
    return await app.listen({ host: config.host, port: config.port });
  } catch (startupError) {
    try {
      await closeApp(app, config.shutdownTimeoutMs);
    } catch (cleanupError) {
      throw new AggregateError([startupError, cleanupError], 'API 啟動失敗且清理發生錯誤。', { cause: cleanupError });
    }
    throw startupError;
  }
}
