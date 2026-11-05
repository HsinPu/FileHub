interface Pending { start(): void; cancel(): void }
export class ThumbnailQueue {
  private active = false;
  private readonly pending: Pending[] = [];
  run<T>(work: () => Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
    if (this.pending.length >= 64) return Promise.reject(new Error('縮圖等待數量超過上限'));
    return new Promise((resolve, reject) => {
      let started = false;
      const job: Pending = {
        cancel: () => {
          if (started) return;
          const index = this.pending.indexOf(job); if (index >= 0) this.pending.splice(index, 1);
          signal.removeEventListener('abort', job.cancel); reject(new DOMException('Aborted', 'AbortError'));
        },
        start: () => {
          started = true; this.active = true; signal.removeEventListener('abort', job.cancel);
          void Promise.resolve().then(() => { signal.throwIfAborted(); return work(); }).then(resolve, reject).finally(() => { this.active = false; this.next(); });
        },
      };
      signal.addEventListener('abort', job.cancel, { once: true }); this.pending.push(job); this.next();
    });
  }
  clear(): void { for (const job of [...this.pending]) job.cancel(); }
  private next(): void { if (!this.active) this.pending.shift()?.start(); }
}
