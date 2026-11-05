import { EmptyState } from '../../app/EmptyState.js';
import { useId,useSyncExternalStore } from 'react';
import { Alert,Button,Progress,Tag } from 'antd';
import type { OperationResponse } from '@filehub/contracts';
import { ApiClientError } from '../../lib/api.js';
import { errorText } from '../../lib/client.js';
import { OperationController } from './controller.js';
const labels:Record<OperationResponse['state'],string>={queued:'等待執行',running:'處理中',cancelling:'取消中',succeeded:'已完成',partial:'部分完成',failed:'未完成',cancelled:'已取消',interrupted:'執行已中斷',needs_review:'需要處置'};
const itemLabels={pending:'等待中',running:'處理中',succeeded:'已完成',failed:'未完成',cancelled:'已取消',needs_review:'需要處置'};
const kinds={copy:'複製',move:'搬移',archive:'ZIP 封存'};
const size=(bytes:number)=>bytes<1024?`${bytes} B`:bytes<1024**2?`${(bytes/1024).toFixed(1)} KB`:bytes<1024**3?`${(bytes/1024**2).toFixed(1)} MB`:`${(bytes/1024**3).toFixed(1)} GB`;
function Item({job,controller,busy}:{job:OperationResponse;controller:OperationController;busy:boolean}){
  const title=useId();return<li className="operation-item" aria-labelledby={title}>
    <div className="operation-item-heading"><strong id={title}>{kinds[job.kind]}</strong><Tag color={job.state==='succeeded'?'success':job.state==='partial'||job.state==='needs_review'?'warning':job.state==='failed'?'error':'default'}>{labels[job.state]}</Tag></div>
    <details className="task-details"><summary>工作細節</summary><p className="operation-id">工作編號：<code>{job.id}</code></p></details>
    {job.state==='cancelling'&&<p className="subtle">等待正在執行的讀寫停止；請保留這份工作。</p>}
    {job.state==='partial'&&<p className="operation-warning">僅部分來源完成，請逐項確認。</p>}
    {job.state==='needs_review'&&<p className="operation-warning">檔案可能已有部分變更，請先確認結果或聯絡管理員，勿重複送出。</p>}
    <ul className="operation-sources">{job.items.map(item=><li key={item.index}><div className="operation-source-heading"><span>{item.path}</span><span>{itemLabels[item.state]}</span></div>{(item.bytesTotal>0||item.state==='succeeded')&&<><Progress percent={item.state==='succeeded'?100:item.bytesTotal?Math.min(99,Math.floor(item.bytesDone/item.bytesTotal*100)):0} size="small" status={item.state==='failed'?'exception':item.state==='succeeded'?'success':'normal'} aria-label={`${item.path} 工作進度`}/><span className="subtle">已處理 {size(item.bytesDone)} / {size(item.bytesTotal)}</span></>}{item.errorCode&&<p className="operation-warning">{errorText(new ApiClientError('http',undefined,item.errorCode))}</p>}</li>)}</ul>
    <div className="operation-item-actions"><Button size="small" onClick={()=>{void controller.recheck(job.id);}} disabled={busy}>回查這份工作</Button>{['queued','running','cancelling'].includes(job.state)&&<Button size="small" disabled={busy||job.state==='cancelling'} loading={busy} onClick={()=>{void controller.action(job.id,'cancel');}}>取消工作</Button>}{job.canRetry&&<Button size="small" disabled={busy} onClick={()=>{void controller.action(job.id,'retry');}}>重試未開始工作</Button>}{job.kind==='archive'&&job.artifact&&<Button size="small" disabled={Date.parse(job.artifact.expiresAt)<=Date.now()} onClick={()=>{void controller.download(job.id);}}>下載 ZIP</Button>}</div>
    {job.artifact&&<p className="subtle operation-expiry">產物 {size(job.artifact.bytes)}，到期：{new Date(job.artifact.expiresAt).toLocaleString('zh-TW')}</p>}
    {job.kind==='archive'&&job.state==='succeeded'&&!job.artifact&&<p className="subtle">產物已到期或無法使用。</p>}
  </li>;
}
export function OperationPanel({controller,embedded=false,showNotice=true}:{controller:OperationController;embedded?:boolean;showNotice?:boolean}){
  const state=useSyncExternalStore(controller.subscribe,controller.getSnapshot),title=useId();return<>
    {showNotice&&state.notice&&<Alert className="operation-notice" type="info" showIcon title={state.notice} closable onClose={()=>controller.dismissNotice()}/>}
    {(embedded||state.open)&&<section className="operation-panel" role="region" aria-labelledby={title}><div className="operation-panel-heading"><h2 id={title}>工作面板</h2><div>{!embedded&&<Button loading={state.loading} onClick={()=>{void controller.refresh();}}>更新工作</Button>}{!embedded&&<Button onClick={()=>controller.setOpen(false)}>收合工作面板</Button>}</div></div>
      <details className="task-guidance"><summary>背景工作限制</summary><p className="subtle">切換目錄不會停止工作。每份最多 16 項；ZIP 不壓縮，產物保留至顯示的期限。</p></details>{state.error&&<Alert type="warning" showIcon title={`無法更新工作，保留最後狀態。${state.error}`}/>}
      {!state.jobs.length&&!state.unknown.length?<EmptyState description={state.loading?'正在取得工作':'目前沒有工作。'}/>:<ul className="operation-list" tabIndex={0} aria-label="捲動工作清單">{state.unknown.map(id=><li className="operation-item" key={id}><Tag color="warning">結果待確認</Tag><p className="operation-id">工作編號：<code>{id}</code></p><p>尚未取得結果，請保留編號並回查，勿重複送出。</p><Button size="small" onClick={()=>{void controller.refresh();}} disabled={state.loading}>回查工作編號</Button></li>)}{state.jobs.map(job=><Item key={job.id} job={job} controller={controller} busy={state.actions.includes(job.id)}/>)}</ul>}
    </section>}
  </>;
}
