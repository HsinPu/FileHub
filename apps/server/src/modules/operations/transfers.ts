import { randomUUID } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import { and,eq } from 'drizzle-orm';
import { operationNodes } from '../../persistence/schema.js';
import { PublicError } from '../../plugins/errors.js';
import { openScoped, type RootIdentity } from '../../storage/scoped.js';
import { native,nativeError,stableWitness,witness } from '../../storage/native.js';
import type { EntryService } from '../entries/service.js';
import { MutationService,joinPath,parentOf } from '../files/mutations.js';
import { fingerprint } from '../files/service.js';
import { TrashService } from '../trash/service.js';
import type { OperationContext } from './executor.js';
import { OperationFiles,nodeRows,treePath } from './manifest.js';
import { operationIo } from './io.js';

export interface TransferDependencies { checkpoint?(phase:string,ctx:OperationContext,index:number):Promise<void>|void }
export class TransferHandler {
  readonly files:OperationFiles;
  constructor(readonly entries:EntryService,readonly mutations:MutationService,private readonly dependencies:TransferDependencies={}){this.files=new OperationFiles(entries);}
  async close(){await this.mutations.close();}
  private async control(ctx:OperationContext,entry:string){
    ctx.check();const destination=ctx.input.destination;if(!destination||destination.entryId!==entry)throw new PublicError('BAD_REQUEST');const access=this.entries.authorize(ctx.user,entry,destination.path,'write'),control=await openScoped(access.root,'.filehub',true);
    try{if(`${control.stat.dev}:${control.stat.ino}`!==access.controlIdentity)throw new PublicError('CONFLICT');}finally{await control.close();}return access;
  }
  private async cleanup(ctx:OperationContext,index:number,root:RootIdentity,stage:string):Promise<boolean>{
    const nodes=nodeRows(ctx,index).filter(node=>node.destinationWitness).reverse();
    for(const node of nodes){
      const path=treePath(stage,node.path),parent=await openScoped(root,parentOf(path),true);
      try{const code=await native([node.kind==='directory'?'rmdir':'unlink',Buffer.from(path.split('/').at(-1)??'').toString('hex'),node.kind==='directory'?(node.destinationWitness??'').split(':').slice(0,2).join(':'):node.destinationWitness??''],[ctx.guard.fd,parent.handle.fd]);if(code!==0)return false;}finally{await parent.close();}
    }
    try{await lstat(joinPath(root.path,stage));return false;}catch(error){return !!error&&typeof error==='object'&&'code'in error&&error.code==='ENOENT';}
  }
  readonly handle=async(ctx:OperationContext):Promise<void>=>{
    const destination=ctx.input.destination;if(!destination||ctx.input.kind==='archive')throw new PublicError('BAD_REQUEST');
    let parentVersion=destination.version;
    for(const [index,source] of ctx.input.sources.entries()){
      ctx.check();ctx.catalog.item(ctx.claim,index,'running',{phase:'scanning'});
      const stage=`.filehub/staging/o-${ctx.claim.id}-${index}`,name=source.name??source.path.split('/').at(-1)??'',target=joinPath(destination.path,name);
      let staged=false,published=false,uncertain=false,destinationRoot:RootIdentity|undefined;
      const evidence=(phase:string,extra:Record<string,unknown>={})=>ctx.catalog.item(ctx.claim,index,'running',{phase,stage,target,...extra});
      try{
        const access=this.files.access(ctx,source),original=await openScoped(access.root,source.path);try{if(fingerprint(source.entryId,source.path,original.stat)!==source.version)throw new PublicError('CONFLICT');}finally{await original.close();}
        const out=await this.control(ctx,destination.entryId);destinationRoot=out.root;
        const directory=await openScoped(out.root,destination.path);
        try{
          if(!directory.stat.isDirectory()||fingerprint(destination.entryId,destination.path,directory.stat)!==parentVersion)throw new PublicError('CONFLICT');
          const nodes=await this.files.scan(ctx,index,source);const total=nodes.reduce((sum,node)=>sum+node.bytes,0);ctx.catalog.progress(ctx.claim,index,0,total,true);
          await this.dependencies.checkpoint?.('planned',ctx,index);
          const rootNode=nodes.find(node=>node.path==='');if(!rootNode)throw new PublicError('SERVICE_UNAVAILABLE');
          const sameDevice=ctx.input.kind==='move'&&rootNode.sourceWitness.split(':')[0]===String(directory.stat.dev);
          if(sameDevice){
            await this.files.verifySource(ctx,source,nodes);this.entries.authorize(ctx.user,source.entryId,parentOf(source.path),'write');
            const sourceParent=await openScoped(access.root,parentOf(source.path));
            try{
              await this.control(ctx,destination.entryId);ctx.check();if(fingerprint(destination.entryId,destination.path,await directory.handle.stat({bigint:true}))!==parentVersion)throw new PublicError('CONFLICT');
              evidence('rename_pending',{sameDevice:true});await this.dependencies.checkpoint?.('publishing',ctx,index);ctx.check();this.files.access(ctx,source);this.entries.authorize(ctx.user,source.entryId,parentOf(source.path),'write');await this.control(ctx,destination.entryId);
              const latest=await openScoped(out.root,destination.path);try{if(latest.stat.dev!==directory.stat.dev||latest.stat.ino!==directory.stat.ino||fingerprint(destination.entryId,destination.path,latest.stat)!==parentVersion)throw new PublicError('CONFLICT');}finally{await latest.close();}
              await this.files.verifySource(ctx,source,nodes);ctx.check();this.entries.authorize(ctx.user,destination.entryId,destination.path,'write');this.entries.authorize(ctx.user,source.entryId,parentOf(source.path),'write');uncertain=true;
              const code=await native(['rename',Buffer.from(source.path.split('/').at(-1)??'').toString('hex'),Buffer.from(name).toString('hex'),rootNode.sourceWitness],[ctx.guard.fd,sourceParent.handle.fd,directory.handle.fd]);
              if(code!==0){uncertain=code<10||code>18;throw nativeError(code);}published=true;uncertain=false;
            }finally{await sourceParent.close();}
            await this.dependencies.checkpoint?.('published',ctx,index);await this.files.verifyTree(out.root,target,nodes,()=>{ctx.check();this.entries.authorize(ctx.user,destination.entryId,target,'write');},true);
          }else{
            evidence('staging');let done=0;
            for(const node of nodes){
              const privatePath=treePath(stage,node.path),parent=await openScoped(out.root,parentOf(privatePath),true),input=await openScoped(access.root,treePath(source.path,node.path));
              try{
                this.files.access(ctx,source,treePath(source.path,node.path));if(witness(input.stat)!==node.sourceWitness)throw new PublicError('CONFLICT');await this.control(ctx,destination.entryId);
                uncertain=true;const result=await operationIo(ctx,node.kind==='directory'?'mkdir':'copy',privatePath.split('/').at(-1)??'',input.handle.fd,parent.handle.fd,node.sourceWitness,bytes=>ctx.catalog.progress(ctx.claim,index,done+bytes,total));
                if(result.created){staged=true;if(!result.witness)throw new PublicError('MUTATION_UNCERTAIN');ctx.catalog.database.sqlite.transaction(()=>{ctx.catalog.owned(ctx.claim);ctx.catalog.database.db.update(operationNodes).set({destinationWitness:result.witness}).where(and(eq(operationNodes.operationId,ctx.claim.id),eq(operationNodes.item,index),eq(operationNodes.path,node.path))).run();}).immediate();node.destinationWitness=result.witness;}
                uncertain=result.code===70;if(result.code!==0)throw nativeError(result.code);if(node.kind==='file'&&(result.sha256!==node.sha256||result.bytes!==node.bytes))throw new PublicError('CONFLICT');
                done+=node.bytes;ctx.catalog.progress(ctx.claim,index,done,total);
              }finally{await input.close();await parent.close();}
            }
            await this.files.verifySource(ctx,source,nodes);await this.files.verifyTree(out.root,stage,nodes,()=>ctx.check(),false,true);await this.control(ctx,destination.entryId);
            const currentParent=await openScoped(out.root,destination.path),staging=await openScoped(out.root,'.filehub/staging',true),root=await openScoped(out.root,stage,true);
            try{
              if(currentParent.stat.dev!==directory.stat.dev||currentParent.stat.ino!==directory.stat.ino||fingerprint(destination.entryId,destination.path,currentParent.stat)!==parentVersion)throw new PublicError('CONFLICT');
              ctx.check();evidence('publish_pending',{witness:stableWitness(root.stat)});await this.dependencies.checkpoint?.('publishing',ctx,index);ctx.check();this.files.access(ctx,source);await this.control(ctx,destination.entryId);
              const latest=await openScoped(out.root,destination.path);try{if(latest.stat.dev!==currentParent.stat.dev||latest.stat.ino!==currentParent.stat.ino||fingerprint(destination.entryId,destination.path,latest.stat)!==parentVersion)throw new PublicError('CONFLICT');}finally{await latest.close();}
              await this.files.verifySource(ctx,source,nodes);ctx.check();this.entries.authorize(ctx.user,destination.entryId,destination.path,'write');uncertain=true;
              const code=await native(['rename',Buffer.from(stage.split('/').at(-1)??'').toString('hex'),Buffer.from(name).toString('hex'),witness(root.stat)],[ctx.guard.fd,staging.handle.fd,currentParent.handle.fd]);
              if(code!==0){uncertain=code<10||code>18;throw nativeError(code);}published=true;staged=false;uncertain=false;
            }finally{await root.close();await staging.close();await currentParent.close();}
            evidence('published');await this.dependencies.checkpoint?.('published',ctx,index);await this.files.verifyTree(out.root,target,nodes,()=>{ctx.check();this.entries.authorize(ctx.user,destination.entryId,target,'write');});
            if(ctx.input.kind==='move'){
              await this.files.verifySource(ctx,source,nodes);const current=await openScoped(access.root,source.path);let version:string;try{version=fingerprint(source.entryId,source.path,current.stat);}finally{await current.close();}
              const trashId=randomUUID();evidence('retire_source_pending',{trashId});await this.dependencies.checkpoint?.('retiring',ctx,index);
              await this.files.verifySource(ctx,source,nodes);ctx.check();
              const trash=new TrashService(ctx.catalog.database,this.entries,this.mutations);await trash.put(ctx.user,source.entryId,{id:trashId,path:source.path,version},()=>ctx.check(),{...ctx.claim,guardFd:ctx.guard.fd});
              await this.files.verifyTree(access.root,`.filehub/trash/${trashId}`,nodes,()=>{ctx.check();this.entries.authorize(ctx.user,source.entryId,source.path,'write');this.entries.authorize(ctx.user,source.entryId,source.path,'download');},true,true);
            }
          }
          parentVersion=fingerprint(destination.entryId,destination.path,await directory.handle.stat({bigint:true}));ctx.catalog.progress(ctx.claim,index,total,total,true);ctx.catalog.item(ctx.claim,index,'succeeded',{phase:'complete',stage,target,sameDevice});
        }finally{await directory.close();}
      }catch(error){
        const failure=error instanceof PublicError?error:new PublicError('SERVICE_UNAVAILABLE');let clean=!staged;
        if(staged&&!uncertain&&!published&&destinationRoot){try{clean=await this.cleanup(ctx,index,destinationRoot,stage);}catch{clean=false;}}
        const review=published||uncertain||!clean,cancel=ctx.catalog.record(ctx.claim.id).cancelRequested||ctx.signal.aborted;
        ctx.catalog.item(ctx.claim,index,review?'needs_review':cancel?'cancelled':'failed',undefined,review?'MUTATION_UNCERTAIN':cancel?undefined:failure.code);
        if(review||cancel||ctx.input.conflict==='stop')throw failure;
      }
    }
  };
}
