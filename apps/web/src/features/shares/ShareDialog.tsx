import { useEffect,useRef,useState } from 'react';
import { Alert,Button,Input,Modal } from 'antd';
import { ShareSchema,type Share,type ShareCreate,type ResourceMetadata } from '@filehub/contracts';
import { api,errorText } from '../../lib/client.js';
import { ApiClientError } from '../../lib/api.js';
import { appHref } from '../../lib/paths.js';
import { browserUuid } from '../../lib/uuid.js';
export function ShareDialog({entry,resource,csrf,onExpired,onClose}:{entry:string;resource:ResourceMetadata;csrf:string;onExpired():void;onClose():void}){
  const [password,setPassword]=useState(''),[days,setDays]=useState(1),[attempt,setAttempt]=useState<ShareCreate>(),[result,setResult]=useState<Share>(),[pending,setPending]=useState(false),[error,setError]=useState<string>(),[open,setOpen]=useState(true);
  const alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const failed=(reason:unknown)=>{if(!alive.current)return;if(reason instanceof ApiClientError&&reason.status===401)onExpired();else setError(errorText(reason));};
  const submit=async()=>{if(pending||attempt)return;const secret=btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');const body:ShareCreate={id:browserUuid(),entryId:entry,path:resource.path,version:resource.version,secret,expiresAt:new Date(Date.now()+days*86400000).toISOString(),...(password?{password}:{})};setAttempt(body);setPending(true);setError(undefined);setPassword('');try{const value=await api('/api/shares',ShareSchema,{method:'POST',csrf,body});if(alive.current)setResult(value);}catch(reason){failed(reason);}finally{if(alive.current)setPending(false);}};
  const query=async()=>{if(!attempt||pending)return;setPending(true);setError(undefined);try{const value=await api(`/api/shares/${attempt.id}`,ShareSchema);if(alive.current)setResult(value);}catch(reason){failed(reason);}finally{if(alive.current)setPending(false);}};
  const link=attempt&&result?`${window.location.origin}${appHref(`/?share=${result.id}#${attempt.secret}`)}`:'';
  return <Modal centered width={400} className="file-action-dialog" open={open} title="建立公開分享" onCancel={()=>setOpen(false)} afterClose={onClose} keyboard={!pending} closable={!pending} maskClosable={!pending} footer={<><Button onClick={()=>setOpen(false)} disabled={pending}>關閉</Button>{!result&&(attempt?<Button aria-label="查詢建立結果" aria-busy={pending} disabled={pending} onClick={()=>void query()} loading={pending}>查詢建立結果</Button>:<Button type="primary" aria-label="建立分享" aria-busy={pending} onClick={()=>void submit()} disabled={pending||Boolean(password&&[...password].length<15)} loading={pending}>建立分享</Button>)}</>}>
    <div className="share-form"><p className="share-name">{resource.name}</p><p>連結持有人可讀取及下載此項目。來源移動、替換、授權變更或分享撤銷後即停止提供內容。</p>
    {error&&<Alert type="error" showIcon title={error}/>}
    {result?<><Alert type="success" title="分享已建立" description="請保存連結，關閉後無法再次取得完整連結。"/><label htmlFor="share-link">分享連結</label><Input.TextArea id="share-link" value={link} readOnly autoSize={{minRows:3,maxRows:5}}/><p>到期：{new Date(result.expiresAt).toLocaleString('zh-TW')}</p></>:<><label htmlFor="share-days">有效期間</label><select id="share-days" value={days} disabled={Boolean(attempt)} onChange={event=>setDays(Number(event.target.value))}><option value={1}>1 天</option><option value={7}>7 天</option><option value={30}>30 天</option></select><label htmlFor="share-password">分享密碼（選填，15–128 字元）</label><Input.Password id="share-password" value={password} maxLength={128} disabled={Boolean(attempt)} autoComplete="new-password" onChange={event=>setPassword(event.target.value)}/>{attempt&&<p>請求已送出。結果未確認時請查詢狀態，勿另外建立相同分享。</p>}</>}
    </div>
  </Modal>;
}
