import { createHash } from 'node:crypto';
import { opendir } from 'node:fs/promises';
import { and,eq } from 'drizzle-orm';
import { OPERATION_LIMITS, type OperationCreate } from '@filehub/contracts';
import { operationNodes } from '../../persistence/schema.js';
import { openScoped, relativePath, type ScopedResource, type RootIdentity } from '../../storage/scoped.js';
import { witness } from '../../storage/native.js';
import { fileName } from '../../storage/names.js';
import { PublicError } from '../../plugins/errors.js';
import type { EntryService } from '../entries/service.js';
import type { OperationContext } from './executor.js';
import { joinPath,parentOf } from '../files/mutations.js';
export type ManifestNode=typeof operationNodes.$inferSelect;
export const treePath=(base:string,path:string)=>path?joinPath(base,path):base;
export const nodeRows=(ctx:OperationContext,index:number)=>ctx.catalog.database.db.select().from(operationNodes).where(and(eq(operationNodes.operationId,ctx.claim.id),eq(operationNodes.item,index))).all().sort((a,b)=>a.path.split('/').length-b.path.split('/').length||(a.path<b.path?-1:a.path>b.path?1:0));
export async function hashResource(resource:ScopedResource,check:()=>void):Promise<string>{
  const before=witness(await resource.handle.stat({bigint:true})),hash=createHash('sha256'),buffer=Buffer.alloc(65536);let position=0;
  if(before!==witness(resource.stat))throw new PublicError('CONFLICT');
  if(resource.stat.size>BigInt(OPERATION_LIMITS.fileBytes))throw new PublicError('RESOURCE_LIMIT');
  while(position<Number(resource.stat.size)){check();const result=await resource.handle.read(buffer,0,Math.min(buffer.length,Number(resource.stat.size)-position),position);if(!result.bytesRead)throw new PublicError('CONFLICT');hash.update(buffer.subarray(0,result.bytesRead));position+=result.bytesRead;}
  check();if(before!==witness(await resource.handle.stat({bigint:true})))throw new PublicError('CONFLICT');return hash.digest('hex');
}
export class OperationFiles {
  constructor(readonly entries:EntryService){}
  access(ctx:OperationContext,source:OperationCreate['sources'][number],path=source.path){ctx.check();const access=this.entries.authorize(ctx.user,source.entryId,path,'download');if(ctx.input.kind==='move')this.entries.authorize(ctx.user,source.entryId,path,'write');return access;}
  async scan(ctx:OperationContext,index:number,source:OperationCreate['sources'][number]):Promise<ManifestNode[]>{
    const nodes:ManifestNode[]=[],database=ctx.catalog.database;
    const previous=database.sqlite.prepare<[string],{n:number;bytes:number}>('SELECT count(*) AS n, coalesce(sum(bytes),0) AS bytes FROM operation_nodes WHERE operation_id=?').get(ctx.claim.id);
    let bytes=previous?.bytes??0;
    const visit=async(path:string,relative:string,depth:number):Promise<void>=>{
      ctx.check();if(depth>OPERATION_LIMITS.depth||(previous?.n??0)+nodes.length>=OPERATION_LIMITS.nodes)throw new PublicError('RESOURCE_LIMIT');
      relativePath(path);const access=this.access(ctx,source,path),resource=await openScoped(access.root,path);
      try{
        const kind=resource.stat.isDirectory()?'directory':'file',size=kind==='file'?Number(resource.stat.size):0;bytes+=size;
        if(size>OPERATION_LIMITS.fileBytes||bytes>OPERATION_LIMITS.bytes)throw new PublicError('RESOURCE_LIMIT');
        const node:ManifestNode={operationId:ctx.claim.id,item:index,path:relative,kind,sourceWitness:witness(resource.stat),bytes:size,sha256:kind==='file'?await hashResource(resource,()=>{this.access(ctx,source,path);}):null,destinationWitness:null};nodes.push(node);
        if(kind==='directory'){
          const names:string[]=[];const directory=await opendir(resource.ioPath);
          for await(const child of directory){ctx.check();if(names.length>=OPERATION_LIMITS.nodes)throw new PublicError('RESOURCE_LIMIT');names.push(fileName(child.name));}
          for(const name of names.sort())await visit(joinPath(path,name),joinPath(relative,name),depth+1);
          if(witness(await resource.handle.stat({bigint:true}))!==node.sourceWitness)throw new PublicError('CONFLICT');
        }
        this.access(ctx,source,path);await resource.verify();
      }finally{await resource.close();}
    };
    await visit(source.path,'',0);ctx.check();
    database.sqlite.transaction(()=>{ctx.catalog.owned(ctx.claim);for(const node of nodes)database.db.insert(operationNodes).values(node).run();}).immediate();return nodes;
  }
  async verifySource(ctx:OperationContext,source:OperationCreate['sources'][number],nodes:readonly ManifestNode[]):Promise<void>{
    for(const node of nodes){const path=treePath(source.path,node.path),access=this.access(ctx,source,path),resource=await openScoped(access.root,path);try{if(witness(resource.stat)!==node.sourceWitness||node.kind==='file'&&await hashResource(resource,()=>{this.access(ctx,source,path);})!==node.sha256)throw new PublicError('CONFLICT');}finally{await resource.close();}}
  }
  async verifyTree(root:RootIdentity,path:string,nodes:readonly ManifestNode[],check:()=>void,original=false,internal=false):Promise<void>{
    for(const node of nodes){check();const current=await openScoped(root,treePath(path,node.path),internal);try{
      const expected=original?node.sourceWitness:node.destinationWitness;if(!expected)throw new PublicError('MUTATION_UNCERTAIN');const parts=expected.split(':');
      if(`${current.stat.dev}:${current.stat.ino}`!==parts.slice(0,2).join(':')||current.stat.isDirectory()!==(node.kind==='directory')||node.kind==='file'&&(Number(current.stat.size)!==node.bytes||!original&&current.stat.nlink!==1n||await hashResource(current,check)!==node.sha256))throw new PublicError('MUTATION_UNCERTAIN');
      if(node.kind==='directory'){
        const names:string[]=[],directory=await opendir(current.ioPath);
        for await(const child of directory){check();if(names.length>=OPERATION_LIMITS.nodes)throw new PublicError('RESOURCE_LIMIT');names.push(fileName(child.name));}
        const expectedNames=nodes.filter(child=>child.path&&parentOf(child.path)===node.path).map(child=>child.path.split('/').at(-1)??'').sort();
        if(JSON.stringify(names.sort())!==JSON.stringify(expectedNames)||witness(await current.handle.stat({bigint:true}))!==witness(current.stat))throw new PublicError('MUTATION_UNCERTAIN');
      }
    }finally{await current.close();}}
  }
}
