import { constants } from 'node:fs';
import { open,type FileHandle } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { and,eq,or,lte,gt,sql } from 'drizzle-orm';
import { Check } from 'typebox/value';
import { ARCHIVE_LIMITS,OperationCreateSchema } from '@filehub/contracts';
import type { FileHubDatabase } from '../../persistence/database.js';
import { operationArtifacts,operations,operationItems } from '../../persistence/schema.js';
import { PublicError } from '../../plugins/errors.js';
import { inspectRoot,openScoped } from '../../storage/scoped.js';
import { native,proveOwner,witness } from '../../storage/native.js';
import type { EntryService } from '../entries/service.js';
import type { FileService } from '../files/service.js';
import { OperationCatalog } from './catalog.js';
import type { OperationContext } from './executor.js';
export type Artifact=typeof operationArtifacts.$inferSelect;
export const artifactName=(id:string)=>{if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id))throw new PublicError('BAD_REQUEST');return `archive-${id}.zip`;};
export class ArtifactStore {
  private cursor='';
  constructor(readonly database:FileHubDatabase,readonly entries:EntryService,private readonly files?:FileService){}
  parent(){return inspectRoot(dirname(this.database.sqlite.name)).then(root=>openScoped(root,''));}
  row(id:string){return this.database.db.select().from(operationArtifacts).where(eq(operationArtifacts.operationId,id)).get();}
  reserve(ctx:OperationContext,size:number){
    if(!Number.isSafeInteger(size)||size<22||size>ARCHIVE_LIMITS.bytes)throw new PublicError('RESOURCE_LIMIT');
    this.database.sqlite.transaction(()=>{ctx.check();const total=this.database.sqlite.prepare<[],{bytes:number}>('SELECT coalesce(sum(reserved_bytes),0) AS bytes FROM operation_artifacts WHERE cleaned=0').get()?.bytes??0;if(total+size>ARCHIVE_LIMITS.totalBytes)throw new PublicError('RESOURCE_LIMIT');const now=Date.now();this.database.db.insert(operationArtifacts).values({operationId:ctx.claim.id,owner:ctx.claim.owner,state:'building',reservedBytes:size,createdAt:now,expiresAt:now+ARCHIVE_LIMITS.ttlMs}).run();}).immediate();
  }
  record(ctx:OperationContext,observed:string,size:number){
    this.database.sqlite.transaction(()=>{ctx.catalog.owned(ctx.claim);const row=this.row(ctx.claim.id);if(!row||row.owner!==ctx.claim.owner||row.state!=='building'||size>row.reservedBytes)throw new PublicError('CONFLICT');this.database.db.update(operationArtifacts).set({witness:observed,bytes:size}).where(eq(operationArtifacts.operationId,ctx.claim.id)).run();}).immediate();
  }
  async clean(row:Artifact,guard:FileHandle):Promise<boolean>{
    const parent=await this.parent();let file:FileHandle|undefined;
    try{
      try{file=await open(`${parent.ioPath}/${artifactName(row.operationId)}`,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);}
      catch(error){if(error&&typeof error==='object'&&'code'in error&&error.code==='ENOENT'){await parent.handle.sync();return true;}return false;}
      const stat=await file.stat({bigint:true});if(!stat.isFile()||stat.nlink!==1n||!row.witness||witness(stat)!==row.witness)return false;
      const code=await native(['unlink',Buffer.from(artifactName(row.operationId)).toString('hex'),row.witness],[guard.fd,parent.handle.fd]);return code===0;
    }finally{await file?.close();await parent.close();}
  }
  authorize(user:string,id:string){
    const catalog=new OperationCatalog(this.database);catalog.get(user,id);const job=catalog.record(id),row=this.row(id);if(job.kind!=='archive'||job.state!=='succeeded'||!row||row.state!=='available'||row.cleaned||row.expiresAt<=Date.now()||!row.witness||!row.sha256)throw new PublicError('NOT_FOUND');
    if(row.bytes<22||row.bytes>ARCHIVE_LIMITS.bytes||!/^[a-f0-9]{64}$/.test(row.sha256))throw new PublicError('SERVICE_UNAVAILABLE');
    const input:unknown=JSON.parse(job.request);if(!Check(OperationCreateSchema,input)||input.kind!=='archive'||input.id!==id)throw new PublicError('SERVICE_UNAVAILABLE');for(const source of input.sources)this.entries.authorize(user,source.entryId,source.path,'download');return row;
  }
  async openDownload(user:string,id:string,reauthorize:()=>void,signal:AbortSignal,verifyBytes=true){
    const release=this.files?.admitRead();if(!release)throw new PublicError('SERVICE_UNAVAILABLE');let file:FileHandle|undefined;
    try{
      const row=this.authorize(user,id);reauthorize();const parent=await this.parent();
      try{file=await open(`${parent.ioPath}/${artifactName(id)}`,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);}finally{await parent.close();}
      const handle=file,stat=await handle.stat({bigint:true});if(!stat.isFile()||stat.nlink!==1n||witness(stat)!==row.witness||Number(stat.size)!==row.bytes)throw new PublicError('CONFLICT');
      let checked=0;const check=(force=false)=>{if(signal.aborted)throw new PublicError('SERVICE_UNAVAILABLE');if(Date.now()>=row.expiresAt)throw new PublicError('NOT_FOUND');if(force||Date.now()-checked>=250){reauthorize();const current=this.authorize(user,id);if(current.witness!==row.witness||current.sha256!==row.sha256)throw new PublicError('CONFLICT');checked=Date.now();}};
      if(verifyBytes){const hash=createHash('sha256'),buffer=Buffer.alloc(65536);let offset=0;while(offset<row.bytes){check();const {bytesRead}=await handle.read(buffer,0,Math.min(buffer.length,row.bytes-offset),offset);if(!bytesRead)throw new PublicError('CONFLICT');hash.update(buffer.subarray(0,bytesRead));offset+=bytesRead;}if(hash.digest('hex')!==row.sha256||witness(await handle.stat({bigint:true}))!==row.witness)throw new PublicError('CONFLICT');}check(true);
      let closing:Promise<void>|undefined;return{handle,bytes:row.bytes,sha256:row.sha256,check,close:()=>closing??=handle.close().finally(release)};
    }catch(error){try{await file?.close();}finally{release();}throw error;}
  }
  async maintain(signal?:AbortSignal):Promise<{id:string;outcome:string}[]>{
    if(process.platform!=='linux')throw new PublicError('WRITE_UNSUPPORTED');const result:{id:string;outcome:string}[]=[];
    await new OperationCatalog(this.database).recoverExpired(['archive']);
    const eligible=and(eq(operationArtifacts.cleaned,false),or(lte(operationArtifacts.expiresAt,Date.now()),eq(operationArtifacts.state,'cancelled'),eq(operationArtifacts.state,'failed'),eq(operationArtifacts.state,'needs_review'),sql`${operationArtifacts.operationId} IN (SELECT id FROM operations WHERE kind='archive' AND state IN ('needs_review','cancelling'))`));
    const select=(after:string,limit:number)=>this.database.db.select().from(operationArtifacts).where(and(eligible,gt(operationArtifacts.operationId,after))).orderBy(operationArtifacts.operationId).limit(limit).all();
    const rows=select(this.cursor,4);if(rows.length<4)rows.push(...select('',4-rows.length).filter(row=>!rows.some(other=>other.operationId===row.operationId)));
    for(const row of rows){if(signal?.aborted)break;this.cursor=row.operationId;const jobBefore=this.database.db.select().from(operations).where(eq(operations.id,row.operationId)).get();if(!jobBefore||jobBefore.owner!==row.owner){result.push({id:row.operationId,outcome:'changed'});continue;}let proof;try{proof=await proveOwner(this.database.sqlite.name,row.owner);}catch{result.push({id:row.operationId,outcome:'busy'});continue;}
      try{
        const cleaned=await this.clean(row,proof);
        this.database.sqlite.transaction(()=>{
          const current=this.row(row.operationId);if(!current||current.owner!==row.owner||current.witness!==row.witness||current.cleaned)return;
          const job=this.database.db.select().from(operations).where(eq(operations.id,row.operationId)).get();if(!job)return;
          const state=cleaned?(row.expiresAt<=Date.now()?'expired':job.cancelRequested?'cancelled':'failed'):'needs_review';
          this.database.db.update(operationArtifacts).set({state,cleaned,...(cleaned?{reservedBytes:0}:{})}).where(eq(operationArtifacts.operationId,row.operationId)).run();
          if(cleaned&&['running','cancelling','needs_review'].includes(job.state)){
            this.database.db.update(operationItems).set({state:job.cancelRequested?'cancelled':'failed',errorCode:job.cancelRequested?null:'SERVICE_UNAVAILABLE',updatedAt:Date.now()}).where(and(eq(operationItems.operationId,job.id),or(eq(operationItems.state,'pending'),eq(operationItems.state,'running'),eq(operationItems.state,'needs_review')))).run();
            this.database.db.update(operations).set({state:job.cancelRequested?'cancelled':'failed',attempt:job.attempt+1,leaseUntil:null,updatedAt:Date.now()}).where(eq(operations.id,job.id)).run();
          }
          result.push({id:row.operationId,outcome:state});
        }).immediate();
      }finally{await proof.close();}
    }
    return result;
  }
}
