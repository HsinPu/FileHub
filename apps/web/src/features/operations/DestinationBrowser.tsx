import { useState } from 'react';
import { Alert, Button, Pagination, Spin } from 'antd';
import { ListingResponseSchema, type PublicEntry } from '@filehub/contracts';
import { useResource } from '../../lib/useResource.js';
import { errorText } from '../../lib/client.js';
import { ToolIcon } from '../../app/ToolIcon.js';
const under=(scope:string,path:string)=>!scope||scope===path||path.startsWith(scope+'/');

/** 只瀏覽公開 listing；選擇的位置仍在正式 submit 重新取得 metadata／授權。 */
export function DestinationBrowser({entry,path,active,busy,onPick,onExpired}:{entry:PublicEntry;path:string;active:boolean;busy:boolean;onPick(path:string):void;onExpired():void}){
  const scopes=entry.scopes.filter(scope=>scope.canWrite),initial=[...scopes].sort((a,b)=>b.path.length-a.path.length).find(scope=>under(scope.path,path))?.path??scopes[0]?.path??'';
  const [scope,setScope]=useState(initial),[location,setLocation]=useState({path:under(initial,path)?path:initial,page:1,version:''});
  const query=new URLSearchParams({path:location.path,limit:'50',offset:String((location.page-1)*50),sort:'name',direction:'asc'});if(location.page>1)query.set('version',location.version);
  const listing=useResource(active?`/api/entries/${entry.id}/files?${query}`:null,ListingResponseSchema,onExpired);
  const browse=(next:string)=>{if(!busy&&under(scope,next)){setLocation({path:next,page:1,version:''});onPick(next);}};
  return <section className="destination-browser" aria-label="瀏覽目的地資料夾">
    {scopes.length>1&&<><label htmlFor="destination-scope">可寫入範圍</label><select id="destination-scope" value={scope} disabled={busy} onChange={event=>{const next=event.target.value;setScope(next);setLocation({path:next,page:1,version:''});onPick(next);}}>{scopes.map(item=><option value={item.path} key={item.path}>{item.path||'入口根目錄'}</option>)}</select></>}
    <div className="destination-navigation"><Button type="text" aria-label="目的地上一層" title="目的地上一層" disabled={busy||location.path===scope} onClick={()=>browse(location.path.split('/').slice(0,-1).join('/'))}><ToolIcon name="back"/></Button><Button type="text" disabled={busy} onClick={()=>browse(scope)}>授權根目錄</Button><Button type="text" disabled={busy||path===location.path||!under(scope,path)} onClick={()=>{if(under(scope,path))setLocation({path,page:1,version:''});}}>顯示輸入路徑</Button></div>
    <p className="destination-current" role="status">目前位置：{location.path||'入口根目錄'}</p>
    {listing.loading?<p role="status"><Spin size="small"/> 正在讀取目的地資料夾。</p>:listing.error?<Alert type="error" title={errorText(listing.error)} action={<Button onClick={()=>{setLocation({...location,page:1,version:''});listing.reload();}}>重試</Button>}/>:<><ul className="destination-folders">{listing.value?.items.filter(resource=>resource.kind==='directory'&&resource.canBrowse).map(resource=><li key={resource.path}><Button type="text" disabled={busy} aria-label={`目的地資料夾 ${resource.name}`} onClick={()=>browse(resource.path)}><ToolIcon name="files"/><span>{resource.name}</span></Button></li>)}</ul>{listing.value&&!listing.value.items.some(resource=>resource.kind==='directory'&&resource.canBrowse)&&<p className="subtle">此頁沒有可瀏覽的子資料夾。</p>}{listing.value&&listing.value.total>50&&<Pagination aria-label="目的地目錄分頁" size="small" current={location.page} pageSize={50} total={listing.value.total} showSizeChanger={false} onChange={page=>setLocation({...location,page,version:listing.value?.version??''})}/>}</>}
  </section>;
}
