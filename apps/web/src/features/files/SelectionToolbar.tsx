import { useRef, useState } from 'react';
import { Button, Dropdown } from 'antd';
import type { Preferences } from '@filehub/contracts';
import { applySort, sortItems, ViewControl } from './FileToolbar.js';
import type { Location } from './navigation.js';
import { ToolIcon } from '../../app/ToolIcon.js';
import type { FileAction } from './actions.js';

export function SelectionSummary({ total, omitted }: { total: number | undefined; omitted: number }) {
  return total === undefined ? null : <span className="listing-summary" role="status">{total} 個項目{omitted ? `；${omitted} 個名稱無法顯示` : ''}</span>;
}
export function SelectionToolbar({ count, actions, rename, trash, clear, view, onView, refresh, loading, location, navigate }: {
  location:Location; navigate(next:Location):void; refresh():void; loading:boolean; count: number; actions: FileAction[]; rename: FileAction; trash: FileAction; clear(): void; view:Preferences['defaultView'];onView(view:Preferences['defaultView']):void;
}) {
  const more = useRef<HTMLButtonElement>(null), all = [...actions, rename, trash];
  const [expanded,setExpanded]=useState(false);
  if (!count) return null;
  return <div className="selection-actions" role="group" aria-label="選取操作">
    <span className="selection-count">已選取 {count} 項</span>
    <ViewControl view={view} onView={onView}/>
    {actions.map(action => <Button type="text" className={`selection-action action-${action.key}`} key={action.key} aria-label={action.name} aria-busy={Boolean(action.busy)} loading={Boolean(action.busy)} title={action.name} disabled={action.disabled} onClick={action.run}><ToolIcon name={action.icon}/></Button>)}
    <Dropdown open={expanded} onOpenChange={setExpanded} autoFocus trigger={['click']} popupRender={menu=><div onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setExpanded(false);more.current?.focus();}}}>{menu}</div>} menu={{ expandIcon:<span aria-hidden="true"><ToolIcon name="chevron"/></span>, items: [...all.map(action => ({ key: action.key, label: action.name, icon: <ToolIcon name={action.icon}/>, disabled: action.disabled, danger: action.key === 'trash' })), {key:'refresh',label:'重新整理',icon:<ToolIcon name="refresh"/>,disabled:loading},{key:'sort',label:'排序選項',icon:<ToolIcon name="sort"/>,children:sortItems(location)}], onClick: ({ key }) => { setExpanded(false); more.current?.focus(); if(key==='refresh'){refresh();return;} if(key.startsWith('sort-')){applySort(location,navigate,key);return;} const action = all.find(item => item.key === key); if (action && !action.disabled) action.run(); } }}><Button type="text" ref={more} aria-label="更多所選操作" aria-haspopup="menu" aria-expanded={expanded} title="更多所選操作"><ToolIcon name="more"/></Button></Dropdown>
    <Button type="text" aria-label="清除選取" title="清除選取" onClick={()=>{clear();requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>('.selection-mode-toggle')?.focus());}}><ToolIcon name="close"/></Button>
  </div>;
}
