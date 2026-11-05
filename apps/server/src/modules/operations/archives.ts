import { constants } from 'node:fs';
import { open,type FileHandle } from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import { ARCHIVE_LIMITS } from '@filehub/contracts';
import { operationArtifacts } from '../../persistence/schema.js';
import { openScoped,relativePath } from '../../storage/scoped.js';
import { nativeError,witness } from '../../storage/native.js';
import { PublicError } from '../../plugins/errors.js';
import { fingerprint } from '../files/service.js';
import { ArtifactStore } from './artifacts.js';
import { OperationFiles,treePath,type ManifestNode } from './manifest.js';
import { archiveIo,type ZipEntry } from './archive-io.js';
import { operationIo } from './io.js';
import type { OperationContext } from './executor.js';
export interface ArchiveDependencies{checkpoint?(phase:string,ctx:OperationContext):Promise<void>|void}
export class ArchiveHandler{
  readonly files:OperationFiles;
  constructor(readonly store:ArtifactStore,private readonly dependencies:ArchiveDependencies={}){this.files=new OperationFiles(store.entries);}
  readonly handle=async(ctx:OperationContext)=>{
    if(ctx.input.kind!=='archive'||ctx.input.destination||ctx.input.conflict!=='stop')throw new PublicError('BAD_REQUEST');
    let reserved=false,uncertain=false,created=false,handle:FileHandle|undefined;
    const plans:{index:number;nodes:ManifestNode[];names:string[]}[]=[],keys=new Set<string>();
    try{
      let estimate=22;
      for(const [index,source]of ctx.input.sources.entries()){
        ctx.check();ctx.catalog.item(ctx.claim,index,'running',{phase:'archive_scan'});const access=this.files.access(ctx,source),root=await openScoped(access.root,source.path);try{if(fingerprint(source.entryId,source.path,root.stat)!==source.version)throw new PublicError('CONFLICT');}finally{await root.close();}
        const nodes=await this.files.scan(ctx,index,source),base=source.name??source.path.split('/').at(-1)??'',names=nodes.map(node=>{const path=relativePath(treePath(base,node.path)),key=path.normalize('NFC').toLowerCase();if(keys.has(key))throw new PublicError('CONFLICT');keys.add(key);return `${path}${node.kind==='directory'?'/':''}`;});
        for(const [position,node]of nodes.entries()){const name=names[position];if(!name)throw new PublicError('BAD_REQUEST');estimate+=76+Buffer.byteLength(name)*2+(node.kind==='file'?node.bytes+16:0);}plans.push({index,nodes,names});
      }
      if(estimate>ARCHIVE_LIMITS.bytes)throw new PublicError('RESOURCE_LIMIT');await this.dependencies.checkpoint?.('planned',ctx);this.store.reserve(ctx,estimate);reserved=true;
      const parent=await this.store.parent();
      try{uncertain=true;const result=await operationIo(ctx,'create',`archive-${ctx.claim.id}.zip`,ctx.guard.fd,parent.handle.fd);created=result.created;uncertain=result.code===70;if(created){if(!result.witness)throw new PublicError('MUTATION_UNCERTAIN');this.store.record(ctx,result.witness,0);}if(result.code!==0)throw nativeError(result.code);handle=await open(`${parent.ioPath}/archive-${ctx.claim.id}.zip`,constants.O_RDWR|constants.O_NOFOLLOW|constants.O_NONBLOCK);if(witness(await handle.stat({bigint:true}))!==result.witness)throw new PublicError('MUTATION_UNCERTAIN');}finally{await parent.close();}
      let offset=0;const entries:ZipEntry[]=[];
      for(const plan of plans){const source=ctx.input.sources[plan.index];if(!source)throw new PublicError('BAD_REQUEST');const total=plan.nodes.reduce((sum,node)=>sum+node.bytes,0);ctx.catalog.progress(ctx.claim,plan.index,0,total,true);let done=0;
        for(const [position,node]of plan.nodes.entries()){
          const name=plan.names[position];if(!name)throw new PublicError('BAD_REQUEST');const path=treePath(source.path,node.path),access=this.files.access(ctx,source,path),input=await openScoped(access.root,path);
          try{
            if(witness(input.stat)!==node.sourceWitness)throw new PublicError('CONFLICT');const current=this.store.row(ctx.claim.id);if(!current?.witness)throw new PublicError('MUTATION_UNCERTAIN');
            const mtimeMs=Number(BigInt(node.sourceWitness.split(':')[3]??'0')/1000000n);uncertain=true;
            await this.dependencies.checkpoint?.('entry',ctx);
            const result=await archiveIo(ctx,'entry',{name,kind:node.kind,offset,bytes:node.bytes,sha256:node.sha256,mtimeMs,sourceWitness:node.sourceWitness,witness:current.witness},input.handle.fd,handle.fd,bytes=>ctx.catalog.progress(ctx.claim,plan.index,done+bytes,total));
            uncertain=!result.owned||result.code===70;if(result.owned&&result.code!==70&&result.witness)this.store.record(ctx,result.witness,result.size);if(result.code!==0)throw result.code===20?new PublicError('RESOURCE_LIMIT'):nativeError(result.code);if(!result.witness||result.crc32===undefined||result.bytes!==node.bytes)throw new PublicError('MUTATION_UNCERTAIN');
            entries.push({name,kind:node.kind,offset,bytes:node.bytes,crc32:result.crc32,mtimeMs});offset=result.size;done+=node.bytes;ctx.catalog.progress(ctx.claim,plan.index,done,total);
            await this.dependencies.checkpoint?.('entry_written',ctx);
          }finally{await input.close();}
        }
      }
      const current=this.store.row(ctx.claim.id);if(!current?.witness)throw new PublicError('MUTATION_UNCERTAIN');uncertain=true;const result=await archiveIo(ctx,'finish',{entries,offset,witness:current.witness},ctx.guard.fd,handle.fd);
      uncertain=!result.owned||result.code===70;if(result.owned&&result.code!==70&&result.witness)this.store.record(ctx,result.witness,result.size);if(result.code!==0)throw result.code===20?new PublicError('RESOURCE_LIMIT'):nativeError(result.code);if(!result.sha256||!result.witness||result.size!==estimate)throw new PublicError('MUTATION_UNCERTAIN');
      await this.dependencies.checkpoint?.('written',ctx);for(const plan of plans){const source=ctx.input.sources[plan.index];if(!source)throw new PublicError('BAD_REQUEST');await this.files.verifySource(ctx,source,plan.nodes);}const named=await this.store.parent();try{const file=await open(`${named.ioPath}/archive-${ctx.claim.id}.zip`,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);try{if(witness(await file.stat({bigint:true}))!==result.witness)throw new PublicError('MUTATION_UNCERTAIN');}finally{await file.close();}await named.handle.sync();}finally{await named.close();}
      await this.dependencies.checkpoint?.('publishing',ctx);for(const plan of plans){const source=ctx.input.sources[plan.index];if(!source)throw new PublicError('BAD_REQUEST');await this.files.verifySource(ctx,source,plan.nodes);}ctx.check();for(const source of ctx.input.sources)this.files.access(ctx,source);
      if(witness(await handle.stat({bigint:true}))!==result.witness)throw new PublicError('MUTATION_UNCERTAIN');
      const finalParent=await this.store.parent();try{const finalFile=await open(`${finalParent.ioPath}/archive-${ctx.claim.id}.zip`,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);try{if(witness(await finalFile.stat({bigint:true}))!==result.witness)throw new PublicError('MUTATION_UNCERTAIN');}finally{await finalFile.close();}await finalParent.handle.sync();}finally{await finalParent.close();}ctx.check();for(const source of ctx.input.sources)this.files.access(ctx,source);
      this.store.database.sqlite.transaction(()=>{
        ctx.check();const row=this.store.row(ctx.claim.id);if(!row||row.owner!==ctx.claim.owner||row.state!=='building'||row.witness!==result.witness||row.expiresAt<=Date.now())throw new PublicError('CONFLICT');
        this.store.database.db.update(operationArtifacts).set({state:'available',sha256:result.sha256,bytes:result.size,reservedBytes:result.size}).where(eq(operationArtifacts.operationId,ctx.claim.id)).run();
        for(const plan of plans){const total=plan.nodes.reduce((sum,node)=>sum+node.bytes,0);ctx.catalog.progress(ctx.claim,plan.index,total,total,true);ctx.catalog.item(ctx.claim,plan.index,'succeeded',{phase:'archive_complete'});}
        ctx.catalog.finish(ctx.claim);
      }).immediate();
    }catch(error){
      const failure=error instanceof PublicError?error:new PublicError('SERVICE_UNAVAILABLE'),cancel=ctx.catalog.record(ctx.claim.id).cancelRequested||ctx.signal.aborted;let cleaned=!created&&!uncertain;
      if(reserved){const row=this.store.row(ctx.claim.id);if(row){if(!uncertain){try{cleaned=await this.store.clean(row,ctx.guard);}catch{cleaned=false;}}this.store.database.sqlite.transaction(()=>{ctx.catalog.owned(ctx.claim);this.store.database.db.update(operationArtifacts).set({state:cleaned?cancel?'cancelled':'failed':'needs_review',cleaned,...(cleaned?{reservedBytes:0}:{})}).where(eq(operationArtifacts.operationId,ctx.claim.id)).run();}).immediate();}}
      for(const item of ctx.catalog.items(ctx.claim.id))if(item.state==='running')ctx.catalog.item(ctx.claim,item.index,cleaned?cancel?'cancelled':'failed':'needs_review',undefined,cleaned?cancel?undefined:failure.code:'MUTATION_UNCERTAIN');throw failure;
    }finally{await handle?.close();}
  };
}
