export class ShutdownTimeoutError extends Error {
  constructor() {
    super('服務未在期限內完成關閉。');
    this.name = 'ShutdownTimeoutError';
  }
}

export function createShutdown(close: () => void | Promise<void>, timeoutMs: number, onTimeout?: () => void): () => Promise<void> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw new RangeError('關閉期限必須是 1 到 60000 的整數。');
  let closing: Promise<void> | undefined;
  return () => {
    closing ??= (async () => {
      let timer: NodeJS.Timeout | undefined;
      try {
        await Promise.race([
          Promise.resolve().then(close),
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => {
              const timeout = new ShutdownTimeoutError();
              try { onTimeout?.(); reject(timeout); }
              catch (error) { reject(new AggregateError([timeout, error], '服務關閉逾時且清理失敗。', { cause: error })); }
            }, timeoutMs);
          }),
        ]);
      } finally { clearTimeout(timer); }
    })();
    return closing;
  };
}

interface ShutdownSignals {
  once(event: 'SIGINT' | 'SIGTERM', listener: () => void): unknown;
  off(event: 'SIGINT' | 'SIGTERM', listener: () => void): unknown;
}

// 只在程序入口明確註冊；測試可提供自己的 EventEmitter，不發送 OS signal。
export function registerShutdownSignals(close: () => Promise<void>, onFailure: (error: unknown) => void, signals: ShutdownSignals = process): () => void {
  const detach = () => {
    signals.off('SIGINT', shutdown);
    signals.off('SIGTERM', shutdown);
  };
  const shutdown = () => {
    detach();
    void Promise.resolve().then(close).catch(onFailure);
  };
  signals.once('SIGINT', shutdown);
  signals.once('SIGTERM', shutdown);
  return detach;
}
