import { EmptyState } from '../../app/EmptyState.js';
import { ToolIcon } from '../../app/ToolIcon.js';
import { useState } from 'react';
import { Alert, Button, Pagination, Spin, Table, Tag } from 'antd';
import { TrashResponseSchema, type TrashItem } from '@filehub/contracts';
import { useResource } from '../../lib/useResource.js';
import { errorText } from '../../lib/client.js';
import { TrashDialog } from './TrashDialog.js';

export function TrashPanel({ entry, csrf, onExpired, onBack, standalone=false }: { entry: string; csrf: string; onExpired(): void; onBack(): void; standalone?: boolean }) {
  const [page, setPage] = useState(1), [restore, setRestore] = useState<TrashItem>();
  const result = useResource(`/api/entries/${entry}/trash?offset=${(page - 1) * 50}`, TrashResponseSchema, onExpired);
  return <section className="trash-panel" aria-label="垃圾桶列表">
    <div className="file-toolbar">{!standalone&&<h2>垃圾桶</h2>}<div className="write-actions">{!standalone&&<Button onClick={onBack}>返回檔案列表</Button>}<Button type="text" aria-label="重新整理垃圾桶" title="重新整理垃圾桶" onClick={result.reload} disabled={result.loading}><ToolIcon name="refresh"/></Button></div></div>
    <p className="subtle trash-policy">只顯示目前可見的回收項目。還原會重新驗權限；內容保留至還原，本版不提供永久刪除。</p>
    {result.loading ? <div role="status"><Spin size="small"/> 正在讀取垃圾桶</div> : result.error ? <Alert type="error" title={errorText(result.error)} action={<Button onClick={result.reload}>重試</Button>}/> : result.value && <>
      <Table<TrashItem> className="management-table" size="small" scroll={{x:580}} tableLayout="fixed" rowKey="id" dataSource={result.value.items} pagination={false} locale={{ emptyText: <EmptyState description="垃圾桶目前沒有可見項目。"/> }} columns={[
        { title: '原位置', key: 'original', render: (_: unknown, item) => <div className="trash-original">{item.originalPath}<small>{item.kind === 'directory' ? '資料夾' : '檔案'} · {new Date(item.createdAt).toLocaleString('zh-TW')}</small></div> },
        { title: '狀態', width: 92, render: (_: unknown, item) => <Tag>{item.status === 'available' ? '可還原' : item.status === 'needs_review' ? '需要確認' : '處理中'}</Tag> },
        { title: '操作', width: 72, render: (_: unknown, item) => <Button type="text" size="small" aria-label={`還原 ${item.originalPath}`} disabled={!item.canRestore} onClick={() => { setRestore(item); }}>還原</Button> },
      ]}/>
      {result.value.total > 50 && <Pagination current={page} total={result.value.total} pageSize={50} showSizeChanger={false} onChange={setPage}/>}
    </>}
    {restore && <TrashDialog entry={entry} restore={restore} csrf={csrf} onExpired={onExpired} onCancel={() => { setRestore(undefined); }} onDone={() => { setRestore(undefined); result.reload(); }}/>}
  </section>;
}
