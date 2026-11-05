import { useContext, useEffect, useRef, useState } from 'react';
import { Button, Input, Popover, type InputRef } from 'antd';
import type { ResourceMetadata } from '@filehub/contracts';
import { SearchPanel } from './SearchPanel.js';
import { ToolIcon } from '../../app/ToolIcon.js';
import { WorkspaceHeaderContext, WorkspaceHeaderSearch } from '../files/WorkspaceHeader.js';

export function SearchControls({ entry, path, filter, onFilter, onMode, onExpired, open }: {
  entry: string; path: string; filter: string; onFilter(text: string): void; onMode(recursive: boolean): void;
  onExpired(): void; open(resource: ResourceMetadata): void;
}) {
  const [scope, setScope] = useState('directory'), [text, setText] = useState(filter), [expanded, setExpanded] = useState(false);
  const [request, setRequest] = useState<{ query: string; revision: number }>(), trigger=useRef<HTMLButtonElement>(null), input=useRef<InputRef>(null);
  const {setSearching}=useContext(WorkspaceHeaderContext), recursive=scope==='recursive';
  useEffect(()=>{setSearching(expanded);return()=>setSearching(false);},[expanded,setSearching]);
  useEffect(()=>{if(!expanded)return;const frame=requestAnimationFrame(()=>input.current?.focus());return()=>cancelAnimationFrame(frame);},[expanded]);
  const back=()=>{setExpanded(false);setRequest(undefined);setText(filter);setScope('directory');onMode(false);requestAnimationFrame(()=>trigger.current?.focus());};
  const clear = () => { setText(''); setRequest(undefined); if (filter) onFilter(''); };
  return <section className="search-panel" aria-label="名稱搜尋"><WorkspaceHeaderSearch><Button ref={trigger} type="text" className="search-launch" aria-label="搜尋檔案" aria-expanded={expanded} onClick={()=>setExpanded(true)}><ToolIcon name="search"/><span>{filter||'搜尋名稱…'}</span></Button>
    <div className={`unified-search${expanded?' active':''}`} hidden={!expanded} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();back();}}}>
      <form id="name-search-form" className="search-form" onSubmit={event=>{event.preventDefault();if(recursive){if(text.trim())setRequest(previous=>({query:text,revision:(previous?.revision??0)+1}));}else{setExpanded(false);onFilter(text);}}}>
        <Button type="text" aria-label="返回檔案" title="返回檔案" onClick={back}><ToolIcon name="back"/></Button>
        <label htmlFor="search-query" className="sr-only">搜尋名稱</label><Input ref={input} id="search-query" value={text} maxLength={128} placeholder="搜尋名稱…" onChange={event=>setText(event.target.value)}/>
        <Button type="text" htmlType="submit" aria-label="搜尋" title="搜尋" disabled={recursive&&!text.trim()}><ToolIcon name="search"/></Button>
        {(!!text||!!request||!!filter)&&<Button type="text" aria-label="清除搜尋" title="清除搜尋" onClick={clear}><ToolIcon name="close"/></Button>}
      </form>
      <div className="search-content"><h1 className="search-heading">搜尋檔案</h1><p className="search-location">搜尋位置：{path || '入口根目錄'}</p><div className="search-scope-controls"><label htmlFor="search-scope">搜尋範圍</label><select id="search-scope" value={scope} onChange={event=>{setScope(event.target.value);setRequest(undefined);onMode(event.target.value==='recursive');}}><option value="directory">目前資料夾</option><option value="recursive">包含子目錄</option></select>
      <Popover trigger="click" title="名稱搜尋" content={<p className="search-help">依名稱搜尋，不區分大小寫。「目前資料夾」只篩選此層；「包含子目錄」最多 8 層、10,000 項、100 筆結果、2 秒。檔案系統等待可能延長實際耗時。</p>}><Button type="text" aria-label="搜尋說明">?</Button></Popover></div>
      {recursive&&filter&&<p className="search-context">目前資料夾的篩選「{filter}」暫停套用，切回原範圍即可查看。</p>}
      {recursive?(request?<SearchPanel key={request.revision} entry={entry} path={path} query={request.query} onExpired={onExpired} open={resource=>{if(resource.kind!=='file')back();open(resource);}}/>:<p className="search-context">輸入名稱後搜尋目前路徑及子目錄；結果另列完整相對路徑。</p>):<p className="search-context">依名稱篩選目前資料夾，按 Enter 顯示結果。</p>}
      </div>
    </div></WorkspaceHeaderSearch></section>;
}
