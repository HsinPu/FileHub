export const PREVIEW_CACHE_LIMITS = Object.freeze({ entries: 32, bytes: 16 * 1024 * 1024 });

// 僅保存已轉碼 JPEG，沒有來源 bytes／grant／host path；不持久化到 DB 或磁碟。
export class PreviewCache {
  private readonly items = new Map<string, Buffer>();
  private bytes = 0;
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  constructor(private readonly limits: { entries: number; bytes: number } = PREVIEW_CACHE_LIMITS) {
    if (!Number.isInteger(limits.entries) || limits.entries < 1 || limits.entries > PREVIEW_CACHE_LIMITS.entries || !Number.isInteger(limits.bytes) || limits.bytes < 1 || limits.bytes > PREVIEW_CACHE_LIMITS.bytes) throw new RangeError('不正確的 preview cache 限制');
  }
  snapshot() { return Object.freeze({ entries: this.items.size, bytes: this.bytes, hits: this.hits, misses: this.misses, evictions: this.evictions }); }
  get(key: string): Buffer | undefined {
    const item = this.items.get(key);
    if (!item) { this.misses++; return undefined; }
    this.hits++; this.items.delete(key); this.items.set(key, item); return Buffer.from(item);
  }
  put(key: string, value: Buffer): void {
    if (!/^[a-f0-9]{64}$/.test(key) || value.length === 0 || value.length > Math.min(this.limits.bytes, 4194304)) return;
    const old = this.items.get(key);
    if (old) { this.bytes -= old.length; this.items.delete(key); }
    while (this.items.size >= this.limits.entries || this.bytes + value.length > this.limits.bytes) {
      const oldest = this.items.entries().next().value;
      if (!oldest) break;
      this.items.delete(oldest[0]); this.bytes -= oldest[1].length; this.evictions++;
    }
    this.items.set(key, Buffer.from(value)); this.bytes += value.length;
  }
  clear(): void { this.items.clear(); this.bytes = 0; }
}
