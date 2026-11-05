import { useEffect, useId, useRef, useSyncExternalStore } from 'react';
import { Alert, Button, Dropdown, Progress, Tag } from 'antd';
import { UploadController, type UploadJob, type UploadTarget } from './controller.js';
import { ToolIcon } from '../../app/ToolIcon.js';
import { uploadSize } from './model.js';

export function UploadPicker({ controller, target, disabled, onSelected }: { controller: UploadController; target: UploadTarget; disabled: boolean; onSelected(): void }) {
  const files = useRef<HTMLInputElement>(null), folder = useRef<HTMLInputElement>(null);
  useEffect(() => { folder.current?.setAttribute('webkitdirectory', ''); }, []);
  const selected = (input: HTMLInputElement, directory: boolean) => { const picked = Array.from(input.files ?? []); controller.enqueue(picked, directory, target); input.value = ''; if (picked.length) onSelected(); };
  return <><Dropdown disabled={disabled} trigger={['click']} menu={{ items: [{ key: 'files', label: '上傳檔案' }, { key: 'folder', label: '上傳資料夾' }], onClick: ({ key }) => { if (!disabled) (key === 'folder' ? folder : files).current?.click(); } }}><Button type="primary" className="upload-trigger" aria-label="上傳" title={disabled?'目前入口無法上傳':'上傳'} disabled={disabled}><ToolIcon name="upload"/><span className="toolbar-label">上傳</span></Button></Dropdown>
    <input ref={files} type="file" hidden multiple disabled={disabled} aria-label="選擇上傳檔案" onChange={(event) => { selected(event.currentTarget, false); }}/>
    <input ref={folder} type="file" hidden multiple disabled={disabled} aria-label="選擇上傳資料夾" onChange={(event) => { selected(event.currentTarget, true); }}/></>;
}
const labels: Record<UploadJob['phase'], string> = { queued: '等待中', preparing: '準備／比對中', uploading: '傳送中', verifying: '驗證與發布中', completed: '已完成', error: '尚未完成', resume: '等待重新選檔', cancelled: '已取消', cancelling: '確認取消中' };
function Item({ job, controller }: { job: UploadJob; controller: UploadController }) {
  const input = useRef<HTMLInputElement>(null), title = useId(), busy = ['preparing', 'uploading', 'verifying', 'cancelling'].includes(job.phase);
  const percent = job.phase === 'completed' ? 100 : job.size ? Math.min(99, Math.floor(job.offset / job.size * 100)) : 0;
  return <li className="upload-item" aria-labelledby={title}>
    <div className="upload-item-heading"><strong id={title}>{job.path}</strong><Tag color={job.phase === 'completed' ? 'success' : job.phase === 'error' ? 'error' : 'default'}>{labels[job.phase]}</Tag></div>
    <p className="subtle upload-location">{job.target.label} / {job.target.parent ? `${job.target.parent}/` : ''}{job.path}</p>
    <Progress percent={percent} size="small" status={job.phase === 'error' ? 'exception' : job.phase === 'completed' ? 'success' : 'normal'} aria-label={`${job.path} 上傳進度`}/>
    <p className="upload-confirmed">已確認 {uploadSize(job.offset)} / {uploadSize(job.size)}{job.sent > job.offset ? `；本段已送出 ${uploadSize(job.sent - job.offset)}` : ''}</p>
    {job.message && <p className={job.phase === 'error' ? 'upload-error' : 'subtle'} role={job.phase === 'error' ? 'alert' : 'status'}>{job.message}</p>}
    {job.phase === 'completed' && job.session?.sha256 && <details className="task-details"><summary>驗證資訊</summary><p className="upload-checksum">SHA-256：{job.session.sha256}</p></details>}
    <div className="upload-item-actions">
      {['error', 'resume'].includes(job.phase) && <>{job.file && <Button size="small" onClick={() => { controller.retry(job.id); }}>重試此項</Button>}<Button size="small" onClick={() => input.current?.click()}>重新選檔續傳</Button><input ref={input} type="file" hidden aria-label={`重新選檔 ${job.path}`} onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) controller.retry(job.id, file); event.currentTarget.value = ''; }}/></>}
      {!['completed', 'cancelled'].includes(job.phase) && <><Button size="small" disabled={busy} onClick={() => { void controller.check(job.id); }}>查詢狀態</Button><Button size="small" disabled={job.phase === 'cancelling'} onClick={() => { void controller.cancel(job.id); }}>取消此項</Button></>}
    </div>
  </li>;
}
export function UploadPanel({ controller }: { controller: UploadController }) {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  if (!snapshot.jobs.length && !snapshot.notice) return null;
  return <section className="upload-panel" aria-label="上傳面板"><div className="upload-panel-heading"><h2>上傳</h2><Button size="small" disabled={!snapshot.jobs.some((job) => ['completed', 'cancelled'].includes(job.phase))} onClick={() => { controller.clearFinished(); }}>清除完成項目</Button></div>
    <details className="task-guidance"><summary>上傳限制與續傳</summary><p className="subtle">每檔最多 1 GiB；完成驗證後才發布，同名檔案不覆寫。資料夾僅建立含檔案的階層，空資料夾請另行新建。</p><p className="subtle">切換目錄保留上傳。重新整理後需重新選檔比對，24 小時後無法續傳；取消不會刪除已發布的檔案。</p></details>
    {snapshot.notice && <Alert type="error" title={snapshot.notice} showIcon/>}
    <ul className="upload-list" tabIndex={0} aria-label="上傳項目">{snapshot.jobs.map((job) => <Item key={job.id} job={job} controller={controller}/>)}</ul>
  </section>;
}
