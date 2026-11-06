import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Input, Modal, Spin, type InputRef } from 'antd';
import { MetadataResponseSchema, MutationResponseSchema, type ResourceMetadata } from '@filehub/contracts';
import { api, errorText } from '../../lib/client.js';
import { useResource } from '../../lib/useResource.js';
import { ApiClientError } from '../../lib/api.js';
import { browserUuid } from '../../lib/uuid.js';

export function WriteDialog({ entry, parent, source, csrf, onExpired, onCancel, onDone }: {
  entry: string; parent: string; source?: ResourceMetadata; csrf: string; onExpired(): void; onCancel(): void; onDone(): void;
}) {
  const [name, setName] = useState(source?.name ?? '');
  const [open, setOpen] = useState(true);
  const completed = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const finish = () => { completed.current = true; setOpen(false); };
  const [pending, setPending] = useState(false);
  const [attempt, setAttempt] = useState<string>();
  const [error, setError] = useState<string>();
  const input = useRef<InputRef>(null);
  const directory = useResource(`/api/entries/${entry}/metadata?${new URLSearchParams({ path: parent }).toString()}`, MetadataResponseSchema, onExpired);
  const title = source ? '重新命名' : '新建資料夾';
  const result = async (id: string) => {
    setPending(true);
    try {
      const value = await api(`/api/mutations/${id}`, MutationResponseSchema);
      if (!alive.current) return;
      if (value.status === 'succeeded') { finish(); return; }
      setError(value.status === 'failed' ? '操作未完成。請關閉視窗、重新整理後再試。' : value.status === 'needs_review' ? '結果需要管理員確認。保留目前檔案，請勿重複操作。' : '操作仍在處理，請稍後再次查詢。');
    } catch (failure) { if (alive.current) { if (failure instanceof ApiClientError && failure.status === 401) onExpired(); else setError(errorText(failure)); } }
    finally { if (alive.current) setPending(false); }
  };
  const submit = async () => {
    if (!directory.value || !name || pending || attempt) return;
    const id = browserUuid(); setAttempt(id); setPending(true); setError(undefined);
    try {
      const value = await api(`/api/entries/${entry}/${source ? 'rename' : 'directories'}`, MutationResponseSchema, { method: 'POST', csrf,
        body: { id, parent, parentVersion: directory.value.resource.version, name, ...(source ? { path: source.path, version: source.version } : {}) } });
      if (!alive.current) return;
      if (value.status === 'succeeded') finish();
      else setError('操作未完成，請查詢結果或關閉後重新整理。');
    } catch (failure) {
      if (!alive.current) return;
      if (failure instanceof ApiClientError && failure.status === 401) onExpired();
      else setError(`${errorText(failure)} 操作結果可再次查詢；請勿重複送出。`);
    } finally { if (alive.current) setPending(false); }
  };
  return <Modal centered width={400} className="file-action-dialog" open={open} title={title} onCancel={() => { setOpen(false); }} afterClose={() => { if (completed.current) onDone(); else onCancel(); }} keyboard={!pending} closable={!pending} maskClosable={!pending}
    afterOpenChange={(opened) => { if (opened) input.current?.focus({ cursor: 'all' }); }}
    footer={<><Button onClick={() => { setOpen(false); }} disabled={pending}>取消</Button>{attempt ? <Button onClick={() => { void result(attempt); }} disabled={pending} loading={pending} aria-label="查詢操作結果">查詢操作結果</Button> : <Button type="primary" aria-label={`確認${title}`} loading={pending} disabled={!name || pending || !directory.value} onClick={() => { void submit(); }}>確認{title}</Button>}</>}>
    <form onSubmit={(event) => { event.preventDefault(); void submit(); }} className="write-form">
      <p className="subtle">位置：{parent || '入口根目錄'}。同名項目會保留，操作不會覆寫。</p>
      <label htmlFor="write-name">{source ? '新名稱' : '資料夾名稱'}</label><Input id="write-name" ref={input} value={name} maxLength={255} disabled={pending || Boolean(attempt)} onChange={(event) => { setName(event.target.value); }} autoComplete="off"/>
      {directory.loading && <Spin size="small"/>}{Boolean(directory.error) && <Alert type="error" title={errorText(directory.error)}/>}
      {error && <Alert type="error" title={error} showIcon/>}
    </form>
  </Modal>;
}
