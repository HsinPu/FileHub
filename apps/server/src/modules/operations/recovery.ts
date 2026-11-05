import { and,eq } from 'drizzle-orm';
import { Check } from 'typebox/value';
import { OperationCreateSchema,OPERATION_LIMITS } from '@filehub/contracts';
import type { FileHubDatabase } from '../../persistence/database.js';
import { operationItems,operationNodes,operations,trashItems,writeIntents } from '../../persistence/schema.js';
import { EntryService } from '../entries/service.js';
import { joinPath,parentOf } from '../files/mutations.js';
import { openScoped,relativePath } from '../../storage/scoped.js';
import { proveOwner } from '../../storage/native.js';
import { PublicError } from '../../plugins/errors.js';
import { OperationCatalog,bounded,operationResources } from './catalog.js';
import { OperationFiles } from './manifest.js';
export async function recoverOperations(database:FileHubDatabase):Promise<{items:{id:string;outcome:string}[]}>{
  if(process.platform!=='linux')throw new PublicError('WRITE_UNSUPPORTED');
  const catalog=new OperationCatalog(database),entries=new EntryService(database),files=new OperationFiles(entries),result: {id:string;outcome:string}[]=[];
  await catalog.recoverExpired();
  const rows=database.db.select().from(operations).where(eq(operations.state,'needs_review')).orderBy(operations.updatedAt).limit(4).all();
  for(const row of rows){
    if(!row.owner){result.push({id:row.id,outcome:'owner_unknown'});continue;}
    let proof;try{proof=await proveOwner(database.sqlite.name,row.owner);}catch{result.push({id:row.id,outcome:'busy'});continue;}
    try{
      const input:unknown=JSON.parse(row.request);
      if(!Check(OperationCreateSchema,input)||input.id!==row.id||input.kind==='archive'||!input.destination||bounded(operationResources(input))!==row.resources)throw new PublicError('MUTATION_UNCERTAIN');
      const destination=input.destination,updates:number[]=[];
      const check=()=>{const current=catalog.record(row.id);if(current.owner!==row.owner||current.attempt!==row.attempt||current.state!=='needs_review')throw new PublicError('CONFLICT');entries.authorize(row.userId,destination.entryId,destination.path,'write');};
      for(const item of catalog.items(row.id)){
        if(item.state!=='needs_review')continue;
        const source=input.sources[item.index];if(!source)continue;
        const evidence:unknown=JSON.parse(item.evidence);if(!evidence||typeof evidence!=='object'||!('phase'in evidence)||!['rename_pending','publish_pending','published','retire_source_pending'].includes(String(evidence.phase)))continue;
        const target=relativePath(joinPath(destination.path,source.name??source.path.split('/').at(-1)??''));if(!('target'in evidence)||evidence.target!==target)continue;
        const nodes=database.db.select().from(operationNodes).where(and(eq(operationNodes.operationId,row.id),eq(operationNodes.item,item.index))).limit(OPERATION_LIMITS.nodes+1).all();
        if(!nodes.length||nodes.length>OPERATION_LIMITS.nodes||!nodes.some(node=>node.path===''))continue;
        const out=entries.authorize(row.userId,destination.entryId,target,'write');entries.authorize(row.userId,source.entryId,source.path,'download');
        const sameDevice='sameDevice'in evidence&&evidence.sameDevice===true;
        await files.verifyTree(out.root,target,nodes,check,sameDevice);
        if(input.kind==='move'){
          const access=entries.authorize(row.userId,source.entryId,source.path,'write');let absent=false;
          try{const present=await openScoped(access.root,source.path);await present.close();}catch(error){absent=error instanceof PublicError&&error.code==='NOT_FOUND';}if(!absent)continue;
          if(!sameDevice){
            if(!('trashId'in evidence)||typeof evidence.trashId!=='string')continue;
            const trash=database.db.select().from(trashItems).where(and(eq(trashItems.id,evidence.trashId),eq(trashItems.entryId,source.entryId),eq(trashItems.userId,row.userId),eq(trashItems.originalPath,source.path),eq(trashItems.status,'available'))).get();
            if(!trash||database.db.select().from(writeIntents).where(and(eq(writeIntents.id,trash.mutationId),eq(writeIntents.status,'succeeded'))).get()===undefined)continue;
            await files.verifyTree(access.root,`.filehub/trash/${trash.id}`,nodes,check,true,true);
          }
        }
        const resource=await openScoped(out.root,target),parent=await openScoped(out.root,parentOf(target));try{await resource.handle.sync();await parent.handle.sync();}finally{await resource.close();await parent.close();}check();updates.push(item.index);
      }
      database.sqlite.transaction(()=>{
        check();for(const index of updates)database.db.update(operationItems).set({state:'succeeded',errorCode:null,bytesDone:operationItems.bytesTotal,updatedAt:Date.now()}).where(and(eq(operationItems.operationId,row.id),eq(operationItems.index,index))).run();
        database.db.update(operationItems).set({state:row.cancelRequested?'cancelled':'failed',errorCode:row.cancelRequested?null:'SERVICE_UNAVAILABLE',updatedAt:Date.now()}).where(and(eq(operationItems.operationId,row.id),eq(operationItems.state,'pending'))).run();
        const items=catalog.items(row.id),succeeded=items.filter(item=>item.state==='succeeded').length,state=items.some(item=>['needs_review','running'].includes(item.state))?'needs_review':succeeded===items.length?'succeeded':succeeded?'partial':row.cancelRequested?'cancelled':'failed';
        database.db.update(operations).set({state,attempt:row.attempt+1,leaseUntil:null,updatedAt:Date.now()}).where(eq(operations.id,row.id)).run();result.push({id:row.id,outcome:state});
      }).immediate();
    }catch{result.push({id:row.id,outcome:'needs_review'});}finally{await proof.close();}
  }
  return{items:result};
}
