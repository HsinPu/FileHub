import { OperationCapabilitiesSchema,OperationListSchema,OperationResponseSchema,OPERATION_LIMITS,type OperationCapabilities,type OperationCreate,type OperationResponse,type PublicEntry,type ResourceMetadata,type ListingResponse } from '@filehub/contracts';
import { ApiClientError } from '../../lib/api.js';
import { api,errorText } from '../../lib/client.js';
export interface Clipboard {kind:'copy'|'move';label:string;parent:string;sources:OperationCreate['sources']}
export interface OperationSnapshot {jobs:readonly OperationResponse[];unknown:readonly string[];actions:readonly string[];loading:boolean;creating:boolean;open:boolean;clipboard?:Clipboard|undefined;capabilities?:OperationCapabilities|undefined;notice?:string|undefined;error?:string|undefined}
type StorageAccess=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export const terminal=(state:OperationResponse['state'])=>['succeeded','partial','failed','cancelled'].includes(state);
const under=(scope:string,path:string)=>!scope||scope===path||path.startsWith(`${scope}/`);
const uuid=(id:unknown):id is string=>typeof id==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id);
export class OperationController {
  private snapshot:OperationSnapshot={jobs:[],unknown:[],actions:[],loading:false,creating:false,open:false};
  private listeners=new Set<()=>void>();private lifetime=new AbortController();private reader:AbortController|undefined;private generation=0;private timer:ReturnType<typeof setTimeout>|undefined;private started=false;private ids:string[]=[];private readonly key:string;private readonly storage:StorageAccess|undefined;
  private known=new Set<string>();
  constructor(user:string,private csrf:string,private readonly expired:()=>void,private readonly completed:()=>void,storage?:StorageAccess,private readonly request:typeof api=api){
    this.key=`filehub.operations.v1.${user}`;try{this.storage=storage??(typeof window==='undefined'?undefined:window.localStorage);const value:unknown=JSON.parse(this.storage?.getItem(this.key)??'[]');if(Array.isArray(value))this.ids=[...new Set(value.filter(uuid))].slice(-50);}catch{this.ids=[];}
  }
  getSnapshot=()=>this.snapshot;
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
  private emit(patch:Partial<OperationSnapshot>){if(this.lifetime.signal.aborted)return;this.snapshot={...this.snapshot,...patch};for(const listener of this.listeners)listener();}
  private save(){try{if(this.ids.length)this.storage?.setItem(this.key,JSON.stringify(this.ids));else this.storage?.removeItem(this.key);}catch{/* 伺服器 catalog 仍為真實資料來源。 */}}
  private remember(id:string){this.ids=[...this.ids.filter(value=>value!==id),id].slice(-50);this.known=new Set([...this.known].filter(value=>this.ids.includes(value)));this.save();}
  private forget(id:string){this.ids=this.ids.filter(value=>value!==id);this.known.delete(id);this.save();this.emit({unknown:this.snapshot.unknown.filter(value=>value!==id)});}
  private merge(row:OperationResponse,explicit=false){
    if(this.lifetime.signal.aborted)return;const previous=this.snapshot.jobs.find(job=>job.id===row.id);
    if(this.ids.includes(row.id))this.known.add(row.id);
    if(!explicit&&previous&&(row.attempt<previous.attempt||row.attempt===previous.attempt&&(Date.parse(row.updatedAt)<Date.parse(previous.updatedAt)||(terminal(previous.state)||previous.state==='needs_review')&&['queued','running','cancelling'].includes(row.state)||previous.state==='cancelling'&&row.state==='running')))return;
    const jobs=[row,...this.snapshot.jobs.filter(job=>job.id!==row.id)].sort((a,b)=>Number(terminal(a.state))-Number(terminal(b.state))||Date.parse(b.createdAt)-Date.parse(a.createdAt)).slice(0,50);
    this.emit({jobs,unknown:this.snapshot.unknown.filter(value=>value!==row.id)});
    if((terminal(row.state)||row.state==='needs_review')&&(previous?previous.state!==row.state:explicit))this.completed();
  }
  private fail(error:unknown){if(this.lifetime.signal.aborted)return;if(error instanceof ApiClientError&&error.status===401){this.dispose();this.expired();}else if(!(error instanceof ApiClientError&&error.kind==='cancelled'))this.emit({notice:errorText(error)});}
  private invalidateReads(){this.generation++;this.reader?.abort();if(this.timer)clearTimeout(this.timer);this.timer=undefined;}
  start(){if(this.started||this.lifetime.signal.aborted)return;this.started=true;void this.refresh();}
  setOpen(open:boolean){this.emit({open});if(open)void this.refresh();}
  clearClipboard(){this.emit({clipboard:undefined});}
  private sources(kind:'copy'|'move'|'archive',entry:PublicEntry,resources:readonly ResourceMetadata[]){
    const max=this.snapshot.capabilities?.maxSources??OPERATION_LIMITS.sources;
    if(!this.snapshot.capabilities?.kinds.includes(kind)||!resources.length||resources.length>max||resources.some(row=>!row.canCopy||kind==='move'&&!row.canWrite)){this.emit({notice:`請選擇最多 ${max} 個有權限的檔案或資料夾。`});return undefined;}
    return resources.map(({path,version})=>({entryId:entry.id,path,version}));
  }
  capture(kind:'copy'|'move',entry:PublicEntry,parent:string,resources:readonly ResourceMetadata[]){const sources=this.sources(kind,entry,resources);if(sources)this.emit({clipboard:{kind,label:entry.label,parent,sources},notice:undefined});}
  validateEntries(entries:readonly PublicEntry[]){const clip=this.snapshot.clipboard;if(clip&&clip.sources.some(source=>!entries.some(entry=>entry.id===source.entryId&&entry.scopes.some(scope=>scope.canDownload&&under(scope.path,source.path))&&(clip.kind!=='move'||entry.scopes.some(scope=>scope.canWrite&&under(scope.path,source.path))))))this.emit({clipboard:undefined,notice:'剪貼簿的來源授權已變更，請重新選取。'});}
  validateListing(entry:string,value:ListingResponse,complete:boolean){const clip=this.snapshot.clipboard;if(!clip||clip.parent!==value.path)return;const invalid=clip.sources.some(source=>{if(source.entryId!==entry)return false;const row=value.items.find(item=>item.path===source.path);return row?row.version!==source.version||!row.canCopy||clip.kind==='move'&&!row.canWrite:complete;});if(invalid)this.emit({clipboard:undefined,notice:'剪貼簿的來源已變更，請重新選取。'});}
  async refresh(){
    if(this.lifetime.signal.aborted)return;this.invalidateReads();const generation=this.generation,reader=new AbortController();this.reader=reader;const signal=AbortSignal.any([this.lifetime.signal,reader.signal]);this.emit({loading:true});
    try{
      const [caps,list]=await Promise.all([this.request('/api/operations/capabilities',OperationCapabilitiesSchema,{signal}),this.request('/api/operations',OperationListSchema,{signal})]);
      if(signal.aborted||generation!==this.generation)return;this.emit({capabilities:caps,error:undefined});for(const row of list.items)this.merge(row);
      const missing=this.ids.filter(id=>!this.known.has(id)&&!list.items.some(row=>row.id===id)&&!this.snapshot.jobs.some(row=>row.id===id));if(missing.length)this.emit({unknown:[...new Set([...this.snapshot.unknown,...missing])].slice(-50)});
      for(const id of this.snapshot.unknown.slice(0,8)){try{const row=await this.request(`/api/operations/${encodeURIComponent(id)}`,OperationResponseSchema,{signal});if(signal.aborted||generation!==this.generation)return;this.merge(row);}catch(error){if(error instanceof ApiClientError&&error.status===404)continue;throw error;}}
    }catch(error){if(!signal.aborted&&generation===this.generation){if(error instanceof ApiClientError&&error.status===401)this.fail(error);else this.emit({error:errorText(error)});}}
    finally{if(!signal.aborted&&generation===this.generation){this.emit({loading:false});if(this.snapshot.unknown.length||this.snapshot.open||this.snapshot.jobs.some(job=>['queued','running','cancelling'].includes(job.state)))this.timer=setTimeout(()=>{void this.refresh();},this.snapshot.unknown.length?5000:2000);}}
  }
  private async send(input:Omit<OperationCreate,'id'>):Promise<'accepted'|'unknown'|'rejected'>{
    if(this.snapshot.creating||this.lifetime.signal.aborted)return'rejected';if(!globalThis.crypto?.randomUUID){this.emit({notice:'建立工作需要 HTTPS 或 localhost。'});return'rejected';}
    const id=crypto.randomUUID();this.invalidateReads();this.remember(id);this.emit({creating:true,notice:undefined,open:true});const signal=this.lifetime.signal;
    try{const row=await this.request('/api/operations',OperationResponseSchema,{method:'POST',body:{...input,id},csrf:this.csrf,signal});this.merge(row,true);if(input.kind==='move')this.clearClipboard();return'accepted';}
    catch(error){
      if(signal.aborted)return'rejected';if(error instanceof ApiClientError&&error.status===401){this.fail(error);return'rejected';}
      if(error instanceof ApiClientError&&error.kind==='http'&&[400,403,404,409,413,422].includes(error.status??0)){this.forget(id);this.fail(error);if(['CONFLICT','FORBIDDEN','NOT_FOUND'].includes(error.code??''))this.clearClipboard();return'rejected';}
      try{const row=await this.request(`/api/operations/${id}`,OperationResponseSchema,{signal});this.merge(row,true);if(input.kind==='move')this.clearClipboard();return'accepted';}catch(failure){if(failure instanceof ApiClientError&&failure.status===401){this.fail(failure);return'rejected';}}
      if(input.kind==='move')this.clearClipboard();this.emit({unknown:[...new Set([...this.snapshot.unknown,id])].slice(-50),notice:'建立結果尚未確認，已保留工作編號並回查；請勿重複送出。'});return'unknown';
    }finally{this.emit({creating:false});if(!signal.aborted)void this.refresh();}
  }
  paste(destination:NonNullable<OperationCreate['destination']>,name:string,conflict:'stop'|'skip'){
    const clip=this.snapshot.clipboard;if(!clip)return Promise.resolve('rejected' as const);const sources=clip.sources.map(source=>({...source,...(clip.sources.length===1&&name?{name}:{})}));return this.send({kind:clip.kind,sources,destination,conflict});
  }
  archive(entry:PublicEntry,resources:readonly ResourceMetadata[]){const sources=this.sources('archive',entry,resources);return sources?this.send({kind:'archive',sources,conflict:'stop'}):Promise.resolve('rejected' as const);}
  async action(id:string,action:'cancel'|'retry'){
    if(this.snapshot.actions.includes(id)||this.lifetime.signal.aborted)return;this.invalidateReads();this.emit({actions:[...this.snapshot.actions,id],notice:undefined});
    try{this.merge(await this.request(`/api/operations/${encodeURIComponent(id)}/${action}`,OperationResponseSchema,{method:'POST',csrf:this.csrf,signal:this.lifetime.signal}),true);}catch(error){this.fail(error);}finally{this.emit({actions:this.snapshot.actions.filter(value=>value!==id)});if(!this.lifetime.signal.aborted)void this.refresh();}
  }
  async recheck(id:string){if(this.lifetime.signal.aborted||this.snapshot.actions.includes(id))return;this.emit({actions:[...this.snapshot.actions,id]});try{this.merge(await this.request(`/api/operations/${encodeURIComponent(id)}`,OperationResponseSchema,{signal:this.lifetime.signal}));}catch(error){this.fail(error);}finally{this.emit({actions:this.snapshot.actions.filter(value=>value!==id)});}}
  dismissNotice(){this.emit({notice:undefined});}
  async download(id:string){
    const job=this.snapshot.jobs.find(row=>row.id===id);if(!job?.artifact||job.kind!=='archive')return;const url=`/api/operations/${encodeURIComponent(id)}/artifact`,controller=new AbortController(),signal=AbortSignal.any([controller.signal,this.lifetime.signal]),timer=setTimeout(()=>controller.abort(),10000);
    try{const response=await fetch(url,{method:'HEAD',credentials:'same-origin',mode:'same-origin',redirect:'error',cache:'no-store',signal});if(!response.ok)throw new ApiClientError('http',response.status,response.status===401?'UNAUTHORIZED':response.status===404?'NOT_FOUND':response.status===403?'FORBIDDEN':undefined);if(!/^application\/zip(?:;|$)/i.test(response.headers.get('content-type')??'')||Number(response.headers.get('content-length'))!==job.artifact.bytes||response.headers.get('etag')!==`"${job.artifact.sha256}"`)throw new ApiClientError('invalid_response');if(signal.aborted)return;const anchor=document.createElement('a');anchor.href=url;anchor.download=`FileHub-${id.slice(0,8)}.zip`;document.body.append(anchor);anchor.click();anchor.remove();this.emit({notice:'已交給瀏覽器下載，請在瀏覽器確認結果。'});}catch(error){if(!this.lifetime.signal.aborted)this.fail(error instanceof ApiClientError?error:new ApiClientError(controller.signal.aborted?'timeout':'network'));}finally{clearTimeout(timer);}
  }
  dispose(){if(this.lifetime.signal.aborted)return;this.invalidateReads();this.csrf='';this.emit({jobs:[],unknown:[],actions:[],loading:false,creating:false,open:false,clipboard:undefined,capabilities:undefined,notice:undefined,error:undefined});this.lifetime.abort();this.listeners.clear();}
}
