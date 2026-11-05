import { EmptyState } from '../../app/EmptyState.js';
import type { HTMLAttributes, KeyboardEvent, MouseEvent } from 'react';
import { Button, Checkbox, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { ListingResponse, Preferences, ResourceMetadata } from '@filehub/contracts';
import { Thumbnail } from '../previews/Thumbnail.js';
import { FileIcon } from './FileIcon.js';
import { ResourceActions } from './ResourceActions.js';
import { ToolIcon } from '../../app/ToolIcon.js';
import type { MenuPosition } from './ResourceMenu.js';

const sizeLabel = (size: number | null) => size === null ? '—' : size < 1024 ? `${size} B` : size < 1024 ** 2 ? `${(size / 1024).toFixed(1)} KB` : size < 1024 ** 3 ? `${(size / 1024 ** 2).toFixed(1)} MB` : `${(size / 1024 ** 3).toFixed(1)} GB`;
const dateFormat = new Intl.DateTimeFormat('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
const selectable = (row: ResourceMetadata) => row.canDownload || row.canWrite || row.canCopy || row.canShare;
export function FileListing({ entry, value, view, selected, selecting, onSelected, open, preview, onMenu, sort, direction, onSort, onExpired }: {
  entry: string; value: ListingResponse; view: Preferences['defaultView']; selected: string[]; selecting:boolean; onSelected(paths: string[]): void;
  open(path: string): void; preview(resource: ResourceMetadata): void; onMenu(resource:ResourceMetadata,anchor:HTMLElement,position?:MenuPosition):void;
  sort:'name'|'size'|'modifiedAt'; direction:'asc'|'desc'; onSort(sort:'name'|'size'|'modifiedAt'):void; onExpired(): void;
}) {
  const toggle=(resource:ResourceMetadata)=>{if(selectable(resource))onSelected(selected.includes(resource.path)?selected.filter(path=>path!==resource.path):[...selected,resource.path]);};
  const activate=(resource:ResourceMetadata)=>{if(resource.canBrowse)open(resource.path);else if(resource.kind==='file' && resource.canDownload)preview(resource);};
  const keyboard=(event:KeyboardEvent<HTMLElement>,resource:ResourceMetadata)=>{
    if(event.key==='ContextMenu' || (event.shiftKey && event.key==='F10')){event.preventDefault();onMenu(resource,event.currentTarget);}
    else if(event.target===event.currentTarget && (event.key===' ' || event.key==='Enter')){event.preventDefault();if(event.key===' ')toggle(resource);else activate(resource);}
  };
  const events=(resource:ResourceMetadata):HTMLAttributes<HTMLElement>=>({tabIndex:0,'aria-selected':selected.includes(resource.path),onKeyDown:event=>keyboard(event,resource),onContextMenu:event=>{event.preventDefault();onMenu(resource,event.currentTarget,{x:event.clientX,y:event.clientY});},onClickCapture:(event:MouseEvent<HTMLElement>)=>{if((event.ctrlKey || event.metaKey) && !(event.target as Element).closest('[data-resource-menu],input,label')){event.preventDefault();event.stopPropagation();toggle(resource);}}});
  const checkbox=(resource:ResourceMetadata)=><Checkbox aria-label={`選取 ${resource.name}`} disabled={!selectable(resource)} checked={selected.includes(resource.path)} onChange={()=>toggle(resource)}/>;
  const sortButton=(key:typeof sort,label:string)=><Button type="text" className={`column-sort${key===sort?' sorted':''}${direction==='desc'?' descending':''}`} aria-label={`排序：${label}`} onClick={()=>onSort(key)}>{label}{key===sort&&<ToolIcon name="arrow"/>}</Button>;
  const eligible=value.items.filter(selectable), count=eligible.filter(row=>selected.includes(row.path)).length;
  const groups = [{ name: '資料夾', items: value.items.filter(item => item.kind === 'directory') }, { name: '檔案', items: value.items.filter(item => item.kind !== 'directory') }].filter(group => group.items.length);
  const columns: ColumnsType<ResourceMetadata> = [
    { title: <div className="name-heading">{selecting&&<Checkbox aria-label="選取本頁可操作項目" checked={eligible.length>0&&count===eligible.length} indeterminate={count>0&&count<eligible.length} disabled={!eligible.length} onChange={event=>onSelected(event.target.checked?eligible.map(row=>row.path):[])}/>} {sortButton('name','名稱')}</div>, key: 'name', render: (_: unknown, resource) => <div className="resource-name">{selecting?<span className="resource-check">{checkbox(resource)}</span>:<FileIcon resource={resource}/>}<div className="resource-label">{resource.canBrowse || resource.kind==='file'?<Button type="text" className="folder-link" aria-label={resource.kind==='file'?`預覽 ${resource.name}`:resource.name} disabled={!resource.canBrowse&&!resource.canDownload} onClick={()=>activate(resource)} title={resource.name}><span>{resource.name}</span><small className="mobile-file-meta">{resource.kind==='directory'?'資料夾':`${sizeLabel(resource.size)} · ${dateFormat.format(new Date(resource.modifiedAt))}`}</small></Button>:<span title={resource.name}>{resource.name}</span>}</div>{['link','other'].includes(resource.kind) && <Tag>無法開啟</Tag>}<ResourceActions resource={resource} open={anchor=>onMenu(resource,anchor)}/></div> },
    { title: sortButton('size','大小'), key: 'size', width:'17%', responsive:['sm'], render: (_: unknown, resource) => <span className="file-size">{sizeLabel(resource.size)}</span> },
    { title: sortButton('modifiedAt','修改時間'), key: 'modifiedAt', width:'28%', render: (_: unknown, resource) => <span className="subtle">{dateFormat.format(new Date(resource.modifiedAt))}</span> },
  ];
  if (!value.items.length) return <EmptyState description="這個資料夾目前是空的。"/>;
  if (view === 'list') return <Table<ResourceMetadata> className="file-table" size="small" columns={columns} dataSource={value.items} rowKey="path" pagination={false} tableLayout="fixed" rowClassName={resource=>selected.includes(resource.path)?'file-selected':''} onRow={resource=>events(resource)}/>;
  return <div className="file-tiles" role="list" aria-label={view === 'mosaic' ? '圖磚檢視' : '圖庫檢視'}>{groups.map(group => <section className="tile-group" key={group.name} aria-label={group.name}><h2>{group.name}</h2><div className={`thumbnail-grid ${view === 'mosaic' ? 'mosaic-grid' : 'gallery-grid'}`}>{group.items.map(resource => <article key={resource.path} className={`thumbnail-card${selected.includes(resource.path) ? ' selected' : ''}`} role="listitem" {...events(resource)}>
    {selecting&&checkbox(resource)}<ResourceActions resource={resource} open={anchor=>onMenu(resource,anchor)}/>
    <Thumbnail entry={entry} resource={resource} onExpired={onExpired} open={()=>activate(resource)}/>
    <div className="thumbnail-information"><div className="thumbnail-name" title={resource.name}>{resource.name}</div><div className="thumbnail-meta"><span>{resource.kind === 'directory' ? '—' : sizeLabel(resource.size)}</span>{view === 'mosaic' && <span>{dateFormat.format(new Date(resource.modifiedAt))}</span>}</div></div>
  </article>)}</div></section>)}</div>;
}
