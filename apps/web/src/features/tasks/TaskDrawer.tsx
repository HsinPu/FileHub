import { useContext, useEffect, useId, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Button } from 'antd';
import { cssVariables } from '../../theme/index.js';
import { WorkspaceHeaderContext } from '../files/WorkspaceHeader.js';
import { ToolIcon } from '../../app/ToolIcon.js';
import { UploadController } from '../uploads/controller.js';
import { UploadPanel } from '../uploads/UploadPanel.js';
import { uploadSize } from '../uploads/model.js';
import { OperationController } from '../operations/controller.js';
import { OperationPanel } from '../operations/OperationPanel.js';

/** 浮動呈現不擁有傳輸生命週期；兩個 controller 持續由 Workspace 保留。 */
export function TaskDrawer({ uploads, operations, blocked }: { uploads: UploadController; operations: OperationController; blocked: boolean }) {
  const { overlayActive } = useContext(WorkspaceHeaderContext);
  const upload = useSyncExternalStore(uploads.subscribe, uploads.getSnapshot), operation = useSyncExternalStore(operations.subscribe, operations.getSnapshot);
  const seen = useRef(new Set<string>()), manual = useRef(false), dock = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), summary = useId(), body = useId();
  useEffect(() => {
    const current = new Set(upload.jobs.map(job => job.id)), added = [...current].some(id => !seen.current.has(id));
    seen.current = current;
    // 只為新增／恢復的項目開啟；進度與完成不重開、不搶目前表單焦點。
    if (added && !operations.getSnapshot().open) operations.setOpen(true);
  }, [upload.jobs, operations]);
  const active = upload.jobs.filter(job => ['queued','preparing','uploading','verifying','cancelling'].includes(job.phase)).length + operation.jobs.filter(job => ['queued','running','cancelling'].includes(job.state)).length;
  const attention = upload.jobs.filter(job => ['error','resume'].includes(job.phase)).length + operation.unknown.length + operation.jobs.filter(job => ['partial','failed','interrupted','needs_review'].includes(job.state)).length;
  const ended = upload.jobs.filter(job => ['completed','cancelled'].includes(job.phase)).length + operation.jobs.filter(job => ['succeeded','cancelled'].includes(job.state)).length;
  const message = Boolean(upload.notice || operation.notice || operation.error), hasWork = Boolean(upload.jobs.length || operation.jobs.length || operation.unknown.length || message);
  const description = `進行中 ${active} 項，待確認 ${attention} 項，已結束 ${ended} 項。${message ? '另有工作訊息。' : ''}`;
  const status = attention ? '待確認 '+attention : active ? '進行中 '+active : message ? '需要處理' : ended ? '已結束 '+ended : '沒有工作';
  // 只測量呈現高度；暫藏浮卡時保留原 clearance，避免搜尋／導覽返回位移。
  useLayoutEffect(() => {
    if (!operation.open || !dock.current) return;
    const element = dock.current, root = document.documentElement;
    const measure = () => { const height=element.getBoundingClientRect().height; if(height>0)root.style.setProperty('--fh-task-height',height+'px'); };
    const observer = new ResizeObserver(measure); observer.observe(element); measure();
    return () => { observer.disconnect(); root.style.removeProperty('--fh-task-height'); };
  }, [operation.open]);
  const open = operation.open && !blocked && !overlayActive;
  useLayoutEffect(() => { if (blocked || overlayActive) manual.current=false; if (open && manual.current) { manual.current = false; dock.current?.focus({ preventScroll: true }); } }, [open, blocked, overlayActive]);
  const close = () => { const inside = dock.current?.contains(document.activeElement); operations.setOpen(false); if (inside) trigger.current?.focus({ preventScroll: true }); };
  const showOperations = Boolean(operation.jobs.length || operation.unknown.length || operation.error || operation.notice || !upload.jobs.length);
  return <><Button type="text" ref={trigger} className="header-task-trigger" aria-label="工作" aria-expanded={open} aria-controls={body} aria-describedby={summary} disabled={blocked||overlayActive} title={description} onClick={() => { if (open) close(); else { manual.current = true; operations.setOpen(true); } }}><ToolIcon name="tasks"/><span className="header-task-label"><span>工作</span><span className={`header-task-state${attention||message ? ' attention' : ''}`} aria-hidden="true">{status}</span></span></Button>{createPortal(<div ref={dock} className={`task-drawer task-dock${open ? ' expanded' : ''}${hasWork ? ' has-work' : ''}`} style={cssVariables} data-expanded={String(operation.open)} hidden={!open} role={open ? 'dialog' : undefined} aria-label={open ? '工作' : undefined} aria-modal={open ? false : undefined} tabIndex={open ? -1 : undefined} onKeyDown={event => { if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(); } }}>
    <div className="task-dock-heading">
      <h2>工作</h2>{hasWork && <span className="task-compact"><span>進行中 {active} · 待確認 {attention} · 已結束 {ended}</span>{upload.jobs.length > 0 && <span>上傳已確認 {uploadSize(upload.jobs.reduce((sum, job) => sum + job.offset, 0))} / {uploadSize(upload.jobs.reduce((sum, job) => sum + job.size, 0))}</span>}</span>}
      {open && <><Button type="text" aria-label="更新工作" title="更新工作" aria-busy={operation.loading} aria-disabled={operation.loading} loading={operation.loading} onClick={() => { if (!operations.getSnapshot().loading) void operations.refresh(); }}><ToolIcon name="refresh"/></Button><Button type="text" aria-label="關閉工作" title="收合工作，不停止傳輸" onClick={close}><ToolIcon name="close"/></Button></>}
    </div>
    <span id={summary} className="visually-hidden">{description}</span>
    <div className="task-dock-body" id={body} hidden={!open}>
      <p className="task-summary" role="status">{description}</p>
      <p className="task-help">收合或切換頁面不會停止工作。</p>
      <UploadPanel controller={uploads}/>
      {showOperations && <OperationPanel controller={operations} embedded showNotice={open}/>}
    </div>
  </div>, document.body)}</>;
}
