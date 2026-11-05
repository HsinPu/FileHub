import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Input, Modal, type InputRef } from 'antd';
import { MetadataResponseSchema, MutationResponseSchema, type ResourceMetadata, type TrashItem } from '@filehub/contracts';
import { api, errorText } from '../../lib/client.js';
import { useResource } from '../../lib/useResource.js';
import { ApiClientError } from '../../lib/api.js';

export function TrashDialog({ entry, source, restore, csrf, onExpired, onCancel, onDone }: {
  entry: string; source?: ResourceMetadata; restore?: TrashItem; csrf: string; onExpired(): void; onCancel(): void; onDone(): void;
}) {
  const original = restore?.originalPath ?? source?.path ?? '';
  const [parentInput, setParentInput] = useState(original.includes('/') ? original.slice(0, original.lastIndexOf('/')) : '');
  const [parent, setParent] = useState(parentInput), [name, setName] = useState(original.split('/').at(-1) ?? '');
  const [open, setOpen] = useState(true), [pending, setPending] = useState(false), [attempt, setAttempt] = useState<string>(), [error, setError] = useState<string>();
  const completed = useRef(false), alive = useRef(true), input = useRef<InputRef>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const directory = useResource(restore ? `/api/entries/${entry}/metadata?${new URLSearchParams({ path: parent }).toString()}` : null, MetadataResponseSchema, onExpired);
  const finish = () => { completed.current = true; setOpen(false); };
  const title = restore ? '還原項目' : '移至垃圾桶';
  const query = async () => {
    if (!attempt) return;
    setPending(true);
    try {
      const result = await api(`/api/mutations/${attempt}`, MutationResponseSchema);
      if (!alive.current) return;
      if (result.status === 'succeeded') finish();
      else setError(result.status === 'failed' ? '操作未完成，請關閉後重新整理。' : '結果仍待確認，請勿重複操作；需要時聯絡管理員。');
    } catch (failure) { if (alive.current) { if (failure instanceof ApiClientError && failure.status === 401) onExpired(); else setError(errorText(failure)); } }
    finally { if (alive.current) setPending(false); }
  };
  const submit = async () => {
    if (pending || attempt || (restore && (!directory.value || parentInput !== parent || !name))) return;
    const id = crypto.randomUUID(); setAttempt(id); setPending(true); setError(undefined);
    try {
      const url = restore ? `/api/entries/${entry}/trash/${restore.id}/restore` : `/api/entries/${entry}/trash`;
      const body = restore ? { id, parent, name, parentVersion: directory.value?.resource.version, version: restore.version } : { id, path: source?.path, version: source?.version };
      const result = await api(url, MutationResponseSchema, { method: 'POST', csrf, body });
      if (!alive.current) return;
      if (result.status === 'succeeded') finish(); else setError('操作未完成，請查詢結果。');
    } catch (failure) {
      if (!alive.current) return;
      if (failure instanceof ApiClientError && failure.status === 401) onExpired(); else setError(`${errorText(failure)} 可查詢結果；請勿重複送出。`);
    } finally { if (alive.current) setPending(false); }
  };
  return <Modal centered width={400} className="file-action-dialog" open={open} title={title} onCancel={() => { setOpen(false); }} keyboard={!pending} closable={!pending} maskClosable={!pending}
    afterClose={() => { if (completed.current) onDone(); else onCancel(); }} afterOpenChange={(shown) => { if (shown) input.current?.focus({ cursor: 'all' }); }}
    footer={<><Button onClick={() => { setOpen(false); }} disabled={pending}>取消</Button>{attempt ? <Button aria-label="查詢操作結果" onClick={() => { void query(); }} disabled={pending} loading={pending}>查詢操作結果</Button> : <Button type="primary" danger={!restore} aria-label={`確認${title}`} onClick={() => { void submit(); }} disabled={pending || (Boolean(restore) && (!directory.value || parentInput !== parent || !name))} loading={pending}>確認{title}</Button>}</>}>
    <form className="write-form" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <p className="trash-original">原位置：{original}</p>
      {restore ? <><label htmlFor="restore-parent">還原至相對資料夾</label><Input id="restore-parent" ref={input} value={parentInput} maxLength={1024} disabled={pending || Boolean(attempt)} onChange={(event) => { setParentInput(event.target.value); }} placeholder="入口根目錄"/>
        <Button onClick={() => { setParent(parentInput); directory.reload(); }} disabled={pending || Boolean(attempt)}>確認還原位置</Button>
        <label htmlFor="restore-name">還原名稱</label><Input id="restore-name" value={name} maxLength={255} disabled={pending || Boolean(attempt)} onChange={(event) => { setName(event.target.value); }}/>
        <p className="subtle">同名項目會保留。可調整名稱或選擇有寫入權限的既有資料夾。</p>
        {directory.loading && <p role="status">正在確認還原位置，請稍候。</p>}{Boolean(directory.error) && <Alert type="error" title={errorText(directory.error)}/>}</> : <p>將保留內容並從目前位置移入垃圾桶，可於垃圾桶還原。沒有自動清除期限；空間不足時會拒絕操作。</p>}
      {error && <Alert type="error" title={error} showIcon/>}
    </form>
  </Modal>;
}
