import type { ReactNode } from 'react';
import type { Preferences } from '@filehub/contracts';
import { Button, Dropdown, type MenuProps } from 'antd';
import type { Location } from './navigation.js';
import { ToolIcon } from '../../app/ToolIcon.js';

export function FileToolbar({ location, navigate, view, onView, loading, refresh, search, selecting, selected, onSelecting }: {
  location: Location; navigate(next: Location): void; view: Preferences['defaultView']; onView(view: Preferences['defaultView']): void;
  loading: boolean; refresh(): void; search: ReactNode; selecting: boolean; selected: boolean; onSelecting(): void;
}) {
  return <>{search}<div className="file-toolbar local-toolbar" role="group" aria-label="檔案工具列" hidden={selected}>
    <span className="toolbar-context">{location.filter ? `名稱包含「${location.filter}」` : '目前目錄'}</span>
    <div className="local-controls">
      <Button type="text" className="selection-mode-toggle" aria-label="選取項目" title="選取項目" aria-pressed={selecting} onClick={onSelecting}><ToolIcon name="select"/><span>選取</span></Button>
      <ViewControl view={view} onView={onView}/>
      <Button type="text" data-file-refresh aria-label="重新整理" title="重新整理" onClick={refresh} disabled={loading}><ToolIcon name="refresh"/><span className="toolbar-label">重新整理</span></Button>
      <Dropdown trigger={['click']} menu={{items:sortItems(location),onClick:({key})=>applySort(location,navigate,key)}}><Button type="text" className="toolbar-sort" aria-label="排序選項" title="排序選項"><ToolIcon name="sort"/><span className="toolbar-label">排序選項</span></Button></Dropdown>
    </div>
  </div></>;
}

export function sortItems(location:Location):NonNullable<MenuProps['items']>{
  return [{key:'sort-name',label:'排序：名稱'},{key:'sort-size',label:'排序：大小'},{key:'sort-modifiedAt',label:'排序：修改時間'},{type:'divider'},{key:'sort-direction',label:location.direction==='asc'?'改為遞減':'改為遞增'}];
}
export function applySort(location:Location,navigate:(next:Location)=>void,key:string){
  const value=key.slice(5);if(!key.startsWith('sort-')||!['name','size','modifiedAt','direction'].includes(value))return;
  navigate({...location,...(value==='direction'?{direction:location.direction==='asc'?'desc' as const:'asc' as const}:{sort:value==='size'||value==='modifiedAt'?value:'name' as const}),page:1,version:''});
}

export function ViewControl({view,onView}:{view:Preferences['defaultView'];onView(view:Preferences['defaultView']):void}) {
  const names = { list: '列表', mosaic: '圖磚', thumbnails: '圖庫' }, next = view === 'list' ? 'mosaic' : view === 'mosaic' ? 'thumbnails' : 'list';
  return <Button type="text" className="view-cycle" aria-label="切換檢視" data-view={view} aria-description={`目前${names[view]}；切換為${names[next]}`} title={`切換為${names[next]}`} onClick={()=>onView(next)}><ToolIcon name={view === 'list' ? 'list' : view === 'mosaic' ? 'grid' : 'gallery'}/><span>{names[view]}</span></Button>;
}
