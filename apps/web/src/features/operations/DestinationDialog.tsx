import { useEffect,useId,useRef,useState,useSyncExternalStore } from 'react';
import { Alert,Input,Modal } from 'antd';
import { MetadataResponseSchema,type PublicEntry } from '@filehub/contracts';
import { ApiClientError } from '../../lib/api.js';
import { api,errorText } from '../../lib/client.js';
import { DestinationBrowser } from './DestinationBrowser.js';
import type { Clipboard,OperationController } from './controller.js';
const under=(scope:string,path:string)=>!scope||scope===path||path.startsWith(`${scope}/`);
export function DestinationDialog({controller,clipboard,entries,current,onClose,onExpired}:{controller:OperationController;clipboard:Clipboard;entries:readonly PublicEntry[];current:{entry:string;path:string};onClose():void;onExpired():void}){
  const choices=entries.filter(entry=>entry.scopes.some(scope=>scope.canWrite)),initial=choices.find(entry=>entry.id===current.entry&&entry.scopes.some(scope=>scope.canWrite&&under(scope.path,current.path)))??choices[0],id=useId();
  const [open,setOpen]=useState(true),[entry,setEntry]=useState(initial?.id??''),[path,setPath]=useState(initial?.id===current.entry?current.path:initial?.scopes.find(scope=>scope.canWrite)?.path??''),[name,setName]=useState(''),[conflict,setConflict]=useState<'stop'|'skip'>('stop'),[busy,setBusy]=useState(false),[failure,setFailure]=useState<string>();const lifetime=useRef<AbortController|null>(null);
  useEffect(()=>{const abort=new AbortController();lifetime.current=abort;return()=>abort.abort();},[]);
  const state=useSyncExternalStore(controller.subscribe,controller.getSnapshot);
  useEffect(()=>{if(!state.clipboard&&!busy)setOpen(false);},[state.clipboard,busy]);
  const target=choices.find(item=>item.id===entry);
  const submit=async()=>{
    if(busy||!target||!lifetime.current||lifetime.current.signal.aborted)return;const signal=lifetime.current.signal;setBusy(true);setFailure(undefined);
    try{
      if(!target.scopes.some(scope=>scope.canWrite&&under(scope.path,path)))throw new Error('目的地不在可寫入範圍內。');
      if(clipboard.sources.some(source=>source.entryId===entry&&(path===source.path||path.startsWith(`${source.path}/`)||[path,name||source.path.split('/').at(-1)].filter(Boolean).join('/')===source.path)))throw new Error('請選擇其他目的地，或為單項複製填寫新名稱。');
      const metadata=await api(`/api/entries/${entry}/metadata?${new URLSearchParams({path})}`,MetadataResponseSchema,{signal});if(metadata.resource.kind!=='directory')throw new Error('目的地必須是既有資料夾。');
      const result=await controller.paste({entryId:entry,path,version:metadata.resource.version},name,conflict);if(signal.aborted)return;if(result==='rejected')setFailure('未建立工作，請確認上方訊息或重新選取來源。');else setOpen(false);
    }catch(error){if(!signal.aborted){if(error instanceof ApiClientError&&error.status===401)onExpired();else setFailure(error instanceof ApiClientError?errorText(error):error instanceof Error?error.message:'無法確認目的地。');}}
    finally{if(!signal.aborted)setBusy(false);}
  };
  return<Modal centered width={400} className="file-action-dialog" open={open} afterClose={onClose} title={clipboard.kind==='move'?'搬移項目':'複製項目'} onCancel={()=>setOpen(false)} onOk={()=>{void submit();}} okText="建立工作" cancelText="取消" confirmLoading={busy} okButtonProps={{disabled:busy||!target}} cancelButtonProps={{disabled:busy}} maskClosable={!busy} keyboard={!busy} closable={!busy} destroyOnHidden>
    <div className="operation-destination"><p>來源：{clipboard.label}，{clipboard.sources.length} 個項目。</p><details className="operation-source-details"><summary>來源項目</summary><ul className="operation-origin">{clipboard.sources.map(source=><li key={source.path}>{source.path}</li>)}</ul></details>
      <label htmlFor={`${id}-entry`}>目的地入口</label><select id={`${id}-entry`} value={entry} disabled={busy} onChange={event=>{const value=choices.find(option=>option.id===event.target.value);setEntry(event.target.value);setPath(value?.scopes.find(scope=>scope.canWrite)?.path??'');setFailure(undefined);}}>{choices.map(option=><option value={option.id} key={option.id}>{option.label}</option>)}</select>
      {target&&<DestinationBrowser key={target.id} entry={target} path={path} active={open} busy={busy} onPick={setPath} onExpired={onExpired}/>}
      <details className="destination-advanced"><summary>輸入路徑與其他選項</summary><label htmlFor={`${id}-path`}>目的地相對路徑</label><Input id={`${id}-path`} value={path} maxLength={1024} disabled={busy} placeholder="留空表示入口根目錄" onChange={event=>setPath(event.target.value)}/><p className="subtle">可寫入範圍：{target?.scopes.filter(scope=>scope.canWrite).map(scope=>scope.path||'入口根目錄').join('、')||'目前沒有可寫入入口'}</p>
      {clipboard.sources.length===1&&<><label htmlFor={`${id}-name`}>新名稱（選填）</label><Input id={`${id}-name`} value={name} maxLength={255} disabled={busy} placeholder="留空使用原名稱" onChange={event=>setName(event.target.value)}/></>}
      <label htmlFor={`${id}-conflict`}>遇到同名項目</label><select id={`${id}-conflict`} value={conflict} disabled={busy} onChange={event=>setConflict(event.target.value==='skip'?'skip':'stop')}><option value="stop">停止後續項目</option><option value="skip">略過衝突，繼續其他來源</option></select><p className="subtle">不覆寫或合併既有檔案。搬移跨磁碟時，先驗副本再將來源保留於回收區。</p></details>{busy&&<p role="status">正在確認目的地與建立工作，請稍候。</p>}{failure&&<Alert type="error" showIcon title={failure}/>}
    </div>
  </Modal>;
}
