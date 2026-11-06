import { UPLOAD_LIMITS, MetadataResponseSchema, MutationResponseSchema, UploadResponseSchema, UploadListSchema, type UploadResponse } from '@filehub/contracts';
import { ApiClientError } from '../../lib/api.js';
import { api, errorText } from '../../lib/client.js';
import { browserUuid } from '../../lib/uuid.js';
import { hashBlob, sendChunk } from './transport.js';
import { joinUploadPath, planSelection, uploadRelativePath } from './model.js';

export interface UploadTarget { entryId: string; label: string; parent: string }
type Phase = 'queued' | 'preparing' | 'uploading' | 'verifying' | 'completed' | 'error' | 'resume' | 'cancelled' | 'cancelling';
export interface UploadJob { id: string; target: UploadTarget; path: string; size: number; offset: number; sent: number; phase: Phase; file?: File | undefined; session?: UploadResponse; message?: string | undefined; createAttempted?: boolean }
interface Snapshot { jobs: readonly UploadJob[]; notice?: string }
const active = (phase: Phase) => ['preparing', 'uploading', 'verifying', 'cancelling'].includes(phase);
export class UploadController {
  private snapshot: Snapshot = { jobs: [] };
  private listeners = new Set<() => void>();
  private lifetime = new AbortController();
  private running: { id: string; controller: AbortController; done: Promise<void> } | undefined;
  private cancelled = new Set<string>();
  constructor(private readonly csrf: string, private readonly expired: () => void, private readonly published: () => void) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private emit(snapshot: Snapshot) { if (this.lifetime.signal.aborted) return; this.snapshot = snapshot; for (const listener of this.listeners) listener(); }
  private update(id: string, patch: Partial<UploadJob>) { this.emit({ ...this.snapshot, jobs: this.snapshot.jobs.map((job) => job.id === id ? { ...job, ...patch } : job) }); }
  private failed(error: unknown) { if (error instanceof ApiClientError && error.status === 401) { this.dispose(); this.expired(); } }
  dispose() { this.lifetime.abort(); this.running?.controller.abort(); this.listeners.clear(); this.snapshot = { jobs: [] }; }
  enqueue(files: readonly File[], folder: boolean, target: UploadTarget) {
    const retained = this.snapshot.jobs.filter((job) => !['completed', 'cancelled'].includes(job.phase));
    if (files.length + retained.length > 100) { this.emit({ ...this.snapshot, notice: '上傳面板一次最多保留 100 個項目，請分批選取。' }); return; }
    const jobs = planSelection(files, folder, target.parent).map(({ file, path, error }): UploadJob => ({ id: browserUuid(), target, path, size: file.size, offset: 0, sent: 0, phase: error ? 'error' : 'queued', file, ...(error ? { message: error } : {}) }));
    this.emit({ jobs: [...retained, ...jobs] }); this.pump();
  }
  async load(target: UploadTarget) {
    try {
      const response = await api(`/api/entries/${target.entryId}/uploads`, UploadListSchema, { signal: this.lifetime.signal });
      const known = new Set(this.snapshot.jobs.map((job) => job.id));
      const jobs = response.items.filter((row) => !known.has(row.id) && !['completed', 'cancelled', 'expired'].includes(row.state)).map((row): UploadJob => ({ id: row.id, target: { ...target, parent: row.parent }, path: row.name, size: row.size, offset: row.offset, sent: row.offset, phase: 'resume', session: row, message: '重新選擇同一個檔案，驗證已傳送部分後續傳。' }));
      this.emit({ ...this.snapshot, jobs: [...this.snapshot.jobs, ...jobs].slice(0, 100) });
    } catch (error) { if (!this.lifetime.signal.aborted) { this.failed(error); this.emit({ ...this.snapshot, notice: errorText(error) }); } }
  }
  private pump() {
    if (this.lifetime.signal.aborted || this.running) return;
    const job = this.snapshot.jobs.find((item) => item.phase === 'queued'); if (!job) return;
    const controller = new AbortController(), signal = AbortSignal.any([controller.signal, this.lifetime.signal]);
    const done = this.transfer(job, signal).catch((error: unknown) => {
      if (!this.cancelled.has(job.id) && !this.lifetime.signal.aborted) { this.failed(error); this.update(job.id, { phase: 'error', message: error instanceof Error && !(error instanceof ApiClientError) ? error.message : errorText(error) }); }
    }).finally(() => { if (this.running?.id === job.id) this.running = undefined; this.pump(); });
    this.running = { id: job.id, controller, done };
  }
  private async ensureDirectories(job: UploadJob, signal: AbortSignal) {
    const parts = uploadRelativePath(job.path), name = parts.pop(); if (!name) throw new Error('無效檔名。'); let parent = job.target.parent;
    for (const folder of parts) {
      signal.throwIfAborted(); const path = joinUploadPath(parent, folder);
      try {
        const existing = await api(`/api/entries/${job.target.entryId}/metadata?${new URLSearchParams({ path })}`, MetadataResponseSchema, { signal });
        if (existing.resource.kind !== 'directory' || !existing.resource.canWrite) throw new Error('資料夾位置與既有檔案衝突，或沒有寫入權限。');
      } catch (error) {
        if (!(error instanceof ApiClientError) || error.status !== 404) throw error;
        const metadata = await api(`/api/entries/${job.target.entryId}/metadata?${new URLSearchParams({ path: parent })}`, MetadataResponseSchema, { signal });
        const id = browserUuid();
        try { await api(`/api/entries/${job.target.entryId}/directories`, MutationResponseSchema, { method: 'POST', body: { id, parent, parentVersion: metadata.resource.version, name: folder }, csrf: this.csrf, signal }); }
        catch (failure) {
          if (signal.aborted) throw failure;
          const result = await api(`/api/mutations/${id}`, MutationResponseSchema, { signal }).catch(() => { throw failure; });
          if (result.status !== 'succeeded') throw failure;
        }
      }
      parent = path;
    }
    return { parent, name };
  }
  private async transfer(job: UploadJob, signal: AbortSignal) {
    if (!job.file) { this.update(job.id, { phase: 'resume' }); return; }
    if (job.file.name !== uploadRelativePath(job.path).at(-1) || job.file.size !== job.size) throw new Error('檔案名稱或大小不同，請重新選擇原檔。');
    this.update(job.id, { phase: 'preparing', message: undefined });
    let session: UploadResponse;
    try { session = await api(`/api/uploads/${job.id}`, UploadResponseSchema, { signal }); }
    catch (error) {
      if (!(error instanceof ApiClientError) || error.status !== 404) throw error;
      const destination = await this.ensureDirectories(job, signal);
      this.update(job.id, { createAttempted: true });
      session = await api(`/api/entries/${job.target.entryId}/uploads`, UploadResponseSchema, { method: 'POST', body: { id: job.id, ...destination, size: job.file.size }, csrf: this.csrf, signal });
    }
    this.update(job.id, { session, offset: session.offset, sent: session.offset });
    if (session.id !== job.id || session.entryId !== job.target.entryId) throw new ApiClientError('invalid_response');
    if (session.state === 'completed') { this.complete(job.id, session); return; }
    if (!session.canResume || session.state !== 'open') throw new Error(session.state === 'needs_review' ? '結果需要管理員確認，請保留此上傳紀錄。' : '此上傳目前無法續傳；請查詢狀態或取消後重新選取。');
    if (job.file.size !== session.size || job.file.name !== session.name) throw new Error('檔案名稱或大小不同，請重新選擇原檔。');
    let prefix = 0;
    for (const chunk of session.chunks) {
      signal.throwIfAborted();
      if (chunk.offset !== prefix || await hashBlob(job.file.slice(chunk.offset, chunk.offset + chunk.length)) !== chunk.sha256) throw new Error('已傳送內容與選取檔案不同，請選原檔，或取消後重新上傳。');
      prefix += chunk.length;
    }
    if (prefix !== session.offset) throw new Error('伺服器上傳紀錄不完整，請聯絡管理員。');
    while (session.offset < session.size) {
      signal.throwIfAborted(); const offset = session.offset, bytes = job.file.slice(offset, offset + UPLOAD_LIMITS.chunkBytes), hash = await hashBlob(bytes);
      signal.throwIfAborted();
      this.update(job.id, { phase: 'uploading', offset, sent: offset });
      session = await sendChunk(job.id, offset, bytes, hash, this.csrf, signal, (sent) => { this.update(job.id, { sent: offset + sent }); });
      if (session.id !== job.id || session.offset !== offset + bytes.size) throw new ApiClientError('invalid_response');
      this.update(job.id, { session, offset: session.offset, sent: session.offset });
    }
    signal.throwIfAborted(); this.update(job.id, { phase: 'verifying', message: '正在驗證完整內容並發布。' });
    try { session = await api(`/api/uploads/${job.id}/finalize`, UploadResponseSchema, { method: 'POST', csrf: this.csrf, signal }); }
    catch (error) {
      if (signal.aborted) throw error;
      const observed = await api(`/api/uploads/${job.id}`, UploadResponseSchema, { signal }).catch(() => { throw error; });
      if (observed.state !== 'completed') throw error; session = observed;
    }
    if (session.state !== 'completed' || session.offset !== job.file.size || !session.sha256) throw new ApiClientError('invalid_response');
    this.complete(job.id, session);
  }
  private complete(id: string, session: UploadResponse) { this.update(id, { session, phase: 'completed', offset: session.size, sent: session.size, file: undefined, message: '已驗證並發布。' }); this.published(); }
  retry(id: string, file?: File) {
    if (this.running?.id === id) return;
    const job = this.snapshot.jobs.find((item) => item.id === id); if (!job || active(job.phase)) return;
    if (!file && !job.file) return;
    this.cancelled.delete(id); this.update(id, { ...(file ? { file } : {}), phase: 'queued', message: undefined }); this.pump();
  }
  async check(id: string) {
    try { const session = await api(`/api/uploads/${id}`, UploadResponseSchema, { signal: this.lifetime.signal }); if (session.state === 'completed') this.complete(id, session); else this.update(id, { session, offset: session.offset, sent: session.offset, message: `伺服器狀態：${session.state === 'open' ? '可續傳' : session.state === 'needs_review' ? '需要管理員確認' : '尚未完成'}。` }); }
    catch (error) { if (!this.lifetime.signal.aborted) { this.failed(error); this.update(id, { message: errorText(error) }); } }
  }
  async cancel(id: string) {
    const job = this.snapshot.jobs.find((item) => item.id === id); if (!job || ['completed', 'cancelled'].includes(job.phase)) return;
    this.cancelled.add(id); this.update(id, { phase: 'cancelling', message: '正在確認取消結果。' });
    if (this.running?.id === id) { this.running.controller.abort(); await this.running.done; }
    const latest = this.snapshot.jobs.find((item) => item.id === id);
    if (!latest?.session && !latest?.createAttempted) { this.update(id, { phase: 'cancelled', file: undefined, message: '已取消。' }); return; }
    try {
      let session: UploadResponse | undefined;
      for (let attempt = 0; attempt < 4; attempt++) {
        try { session = await api(`/api/uploads/${id}`, UploadResponseSchema, { method: 'DELETE', csrf: this.csrf, signal: this.lifetime.signal }); break; }
        catch (error) {
          if (error instanceof ApiClientError && error.status === 404 && !job.session && job.phase === 'queued') break;
          if (!(error instanceof ApiClientError) || error.code !== 'MUTATION_BUSY' || attempt === 3) throw error;
          await new Promise<void>((resolve) => { setTimeout(resolve, 250); });
        }
      }
      if (session?.state === 'completed') this.complete(id, session);
      else this.update(id, { ...(session ? { session } : {}), phase: 'cancelled', file: undefined, message: session?.cleanupPending ? '已取消，暫存內容等待清理。' : '已取消。' });
    } catch (error) { if (!this.lifetime.signal.aborted) { this.failed(error); this.update(id, { phase: 'error', message: `取消尚未確認。${errorText(error)}` }); } }
  }
  clearFinished() { this.emit({ ...this.snapshot, jobs: this.snapshot.jobs.filter((job) => !['completed', 'cancelled'].includes(job.phase)) }); }
}
