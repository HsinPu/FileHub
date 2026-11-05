import { FileIcon } from '../files/FileIcon.js';
import { EmptyState } from '../../app/EmptyState.js';
import { Alert, Button, List, Spin } from 'antd';
import { SearchResponseSchema, type ResourceMetadata } from '@filehub/contracts';
import { useResource } from '../../lib/useResource.js';
import { errorText } from '../../lib/client.js';

const reasons = { depth: '深度上限', scan: '掃描數量上限', results: '結果數量上限', time: '時間上限', unavailable: '部分位置無法讀取', changed: '搜尋期間內容已變動' };
export function SearchPanel({ entry, path, query, onExpired, open }: { entry: string; path: string; query: string; onExpired(): void; open(resource: ResourceMetadata): void }) {
  const result = useResource(query ? `/api/entries/${entry}/search?${new URLSearchParams({ path, query })}` : null, SearchResponseSchema, onExpired);
  return <section className="search-results" aria-label="遞迴搜尋結果">
    {result.loading && <p role="status"><Spin size="small"/> 正在搜尋，可取消或送出新查詢。</p>}
    {!!result.error && <Alert type="error" title={errorText(result.error)} action={<Button onClick={result.reload}>重試搜尋</Button>}/>}
    {result.value && <><p role="status">找到 {result.value.items.length} 項；掃描 {result.value.scanned} 項，{result.value.elapsedMs} ms。</p>{result.value.partial && <Alert type="warning" title={`部分結果：${result.value.reasons.map((reason) => reasons[reason]).join('、')}。請縮小搜尋範圍。`}/>}<List dataSource={result.value.items} locale={{ emptyText: <EmptyState description="沒有符合名稱的項目。"/> }} renderItem={(item) => <List.Item><Button type="link" className="search-result" aria-label={item.path} onClick={() => { open(item); }}><FileIcon resource={item}/><span className="search-result-copy"><strong>{item.name}</strong><small>{item.path}</small></span></Button></List.Item>}/></>}
  </section>;
}
