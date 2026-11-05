import { EmptyState } from '../../app/EmptyState.js';
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert, Button, Spin, Tag, Table } from 'antd';
import { ShareListSchema, ShareSchema, type Share } from '@filehub/contracts';
import { ToolIcon } from '../../app/ToolIcon.js';
import { FileIcon } from '../files/FileIcon.js';
import { useResource } from '../../lib/useResource.js';
import { api, errorText } from '../../lib/client.js';
import { ApiClientError } from '../../lib/api.js';
import type { RegisterNavigationGuard } from '../files/navigation.js';

export function ShareManagementPage({ navigation, csrf, registerGuard, onExpired, onBack }: { navigation:ReactNode; csrf: string; registerGuard: RegisterNavigationGuard; onExpired(): void; onBack(): void }) {
  const list = useResource('/api/shares', ShareListSchema, onExpired, true), [pending, setPending] = useState<string>(), pendingRef = useRef<string | undefined>(undefined), [error, setError] = useState<string>(), [notice, setNotice] = useState<string>();
  useLayoutEffect(() => registerGuard(() => { if (!pendingRef.current) return true; setNotice('正在撤銷，完成後才能離開。'); return false; }), [registerGuard]);
  useEffect(() => { if (!pending) return; const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; }; window.addEventListener('beforeunload', unload); return () => window.removeEventListener('beforeunload', unload); }, [pending]);
  const revoke = async (id: string) => {
    if (pendingRef.current) return;
    pendingRef.current = id; setPending(id); setError(undefined); setNotice(undefined);
    try { await api(`/api/shares/${id}/revoke`, ShareSchema, { method: 'POST', csrf }); list.reload(); }
    catch (reason) { if (reason instanceof ApiClientError && reason.status === 401) onExpired(); else setError(errorText(reason)); }
    finally { pendingRef.current = undefined; setPending(undefined); setNotice(undefined); }
  };
  return <section className="share-management" aria-label="分享管理頁面"><header className="management-heading"><h1>分享管理</h1><p>管理已建立的公開連結與到期狀態。</p></header>
    <div className="management-topline">{navigation}<div className="management-buttons"><Button type="text" aria-label="返回檔案" title="返回檔案" onClick={onBack}><ToolIcon name="back"/></Button></div></div>
    <div className="management-card"><div className="management-card-heading"><h2>分享項目</h2><Button type="text" aria-label="重新整理分享" title="重新整理分享" disabled={Boolean(pending)} loading={list.loading} onClick={list.reload}><ToolIcon name="refresh"/></Button></div><p className="management-note">顯示最近 100 筆；完整連結僅在建立時顯示，撤銷後無法再啟用。</p>
    {(list.error || error) && <Alert type="error" showIcon title={error ?? errorText(list.error)}/>}{notice && <Alert type="info" showIcon title={notice}/>}
    {list.loading && !list.value ? <div className="files-feedback" role="status"><Spin size="small"/> 正在讀取分享</div> : !list.value?.items.length ? !list.error && <EmptyState description="尚無公開分享"/> : <Table<Share> className="management-table" size="small" rowKey="id" dataSource={list.value.items} pagination={false} scroll={{x:640}} columns={[{title:"檔案／目錄",width:260,render:(_,item)=><div className="managed-resource"><FileIcon resource={item}/><div><strong>{item.name}</strong>{item.path!==item.name&&<small>{item.path||"入口根目錄"}</small>}</div></div>},{title:"狀態",width:120,render:(_,item)=><Tag>{item.revoked?"已撤銷":Date.parse(item.expiresAt)<=Date.now()?"已到期":item.passwordProtected?"密碼保護":"連結存取"}</Tag>},{title:"到期時間",width:180,render:(_,item)=>new Date(item.expiresAt).toLocaleString("zh-TW")},{title:"操作",width:80,render:(_,item)=><Button type="text" danger disabled={Boolean(pending)||list.loading||item.revoked} loading={pending===item.id} aria-label={`撤銷 ${item.name}`} title="撤銷分享" onClick={()=>void revoke(item.id)}><ToolIcon name="trash"/></Button>}]}/>}
    </div>
  </section>;
}
