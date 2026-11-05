import { createHash } from 'node:crypto';
import { readFile,unlink } from 'node:fs/promises';
import { join,dirname } from 'node:path';
import type Database from 'better-sqlite3';
import { Check } from 'typebox/value';
import { Type } from 'typebox';
import { validateDatabaseConfig,type DatabaseConfig } from '../config/index.js';
import { acquireStateLock,assertIdleOwners,STATE_LOCK_NAME,RESTORE_PENDING } from '../lifecycle/state-lock.js';
import { PublicError } from '../plugins/errors.js';
import { inspectRoot,openScoped,overlaps,type RootIdentity } from '../storage/scoped.js';
import { migrateDatabase } from '../persistence/migrate.js';
import { SCHEMA_REVISION } from '../persistence/schema.js';
import { absolute,assertAbsent,newPrivateDirectory,ensureDirectory,writePrivate,copyFile,hashFile,names,readSmall,origin } from './files.js';
import { SNAPSHOT_FORMAT,SNAPSHOT_LIMITS,parseManifest,itemKey,fullWitness,type SnapshotManifest,type SnapshotItem } from './manifest.js';
import { knownDatabase,checkKnownDatabase } from './database.js';
import { rebindSnapshot } from './rebind.js';

const completeSchema=Type.Object({format:Type.Literal(SNAPSHOT_FORMAT),manifestSha256:Type.String({pattern:'^[a-f0-9]{64}$'})},{additionalProperties:false});
const digest=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const prefix=(area:SnapshotItem['area'],id?:string)=>area==='entry'?`data/entries/${id}`:`data/${area}`;
const skipState=(path:string)=>[STATE_LOCK_NAME,RESTORE_PENDING,'filehub.db','filehub.db-wal','filehub.db-shm'].includes(path);
const areaKey=(area:SnapshotItem['area'],id?:string)=>`${area}:${id??''}`;
function linux(){if(process.platform!=='linux')throw new PublicError('WRITE_UNSUPPORTED');}
async function producerVersion(){const value:unknown=JSON.parse(await readFile(new URL('../../package.json',import.meta.url),'utf8'));if(!value||typeof value!=='object'||!('version'in value)||typeof value.version!=='string'||!/^\d+\.\d+\.\d+$/.test(value.version))throw new PublicError('SERVICE_UNAVAILABLE');return value.version;}
export interface SnapshotOptions { readonly quiesced:boolean;readonly signal?:AbortSignal;readonly checkpoint?:(item:SnapshotItem)=>Promise<void>|void }
type SourceArea={area:SnapshotItem['area'];entryId?:string;root:RootIdentity};
function dbEntries(sqlite:Database.Database){return sqlite.prepare<[],{id:string;root_path:string;root_device:string;root_inode:string;root_ancestors:string}>('SELECT id,root_path,root_device,root_inode,root_ancestors FROM entries ORDER BY id').all();}
async function areaRoot(root:RootIdentity,area:SnapshotItem['area'],id?:string){const opened=await openScoped(root,prefix(area,id),true);try{if(!opened.stat.isDirectory())throw new PublicError('BAD_REQUEST');return{path:join(root.path,...prefix(area,id).split('/')),device:String(opened.stat.dev),inode:String(opened.stat.ino),ancestors:[]} satisfies RootIdentity;}finally{await opened.close();}}
async function nonOverlappingDestination(path:string,roots:readonly Pick<RootIdentity,'device'|'inode'>[]){await assertAbsent(path);const parent=await inspectRoot(dirname(path));if(roots.some(root=>parent.device===root.device&&parent.inode===root.inode||parent.ancestors.includes(`${root.device}:${root.inode}`)))throw new PublicError('FORBIDDEN');}

export async function createSnapshot(config:DatabaseConfig,destination:string,configuration:string,options:SnapshotOptions){
  linux();if(options.quiesced!==true)throw new PublicError('BAD_REQUEST');config=validateDatabaseConfig(config);destination=absolute(destination);configuration=absolute(configuration);
  // 唯讀 provenance 預檢，未知／舊 Python DB 不被接管。
  const probe=knownDatabase(join(config.stateDirectory,'filehub.db'));probe.sqlite.close();
  const lock=await acquireStateLock(config.stateDirectory,'exclusive');let source:ReturnType<typeof knownDatabase>|undefined;
  try{
    await assertIdleOwners(config.stateDirectory);source=knownDatabase(join(config.stateDirectory,'filehub.db'));const sqlite=source.sqlite,dataVersion=sqlite.pragma('data_version',{simple:true}),state=await inspectRoot(config.stateDirectory),configurationRoot=await inspectRoot(configuration),rows=dbEntries(sqlite);if(rows.length>100)throw new PublicError('RESOURCE_LIMIT');
    const areas:SourceArea[]=[{area:'state',root:state},{area:'config',root:configurationRoot}],entryRoots:SnapshotManifest['entries']=[];
    for(const row of rows){const root=await inspectRoot(row.root_path);if(root.device!==row.root_device||root.inode!==row.root_inode||overlaps(root,state))throw new PublicError('CONFLICT');areas.push({area:'entry',entryId:row.id,root});entryRoots.push({id:row.id,...root,ancestors:[...root.ancestors]});}
    if(areas.some(area=>area.area!=='config'&&overlaps(area.root,configurationRoot)))throw new PublicError('FORBIDDEN');await nonOverlappingDestination(destination,areas.map(area=>area.root));
    const output=await newPrivateDirectory(destination);await writePrivate(output,'INCOMPLETE',Buffer.from('FileHub snapshot incomplete\n'));await ensureDirectory(output,'data/entries');for(const area of areas)await ensureDirectory(output,prefix(area.area,area.entryId));
    const targets=new Map<string,RootIdentity>();for(const area of areas)targets.set(areaKey(area.area,area.entryId),await areaRoot(output,area.area,area.entryId));const items:SnapshotItem[]=[];let bytes=0;
    const add=(item:SnapshotItem)=>{bytes+=item.bytes;if(items.length>=SNAPSHOT_LIMITS.items||bytes>SNAPSHOT_LIMITS.bytes)throw new PublicError('RESOURCE_LIMIT');items.push(item);};
    const stateTarget=targets.get(areaKey('state'));if(!stateTarget)throw new PublicError('SERVICE_UNAVAILABLE');
    await sqlite.backup(join(stateTarget.path,'filehub.db'),{progress:()=>{if(options.signal?.aborted)throw new PublicError('SERVICE_UNAVAILABLE');return 100;}});
    const snapshotDB=knownDatabase(join(stateTarget.path,'filehub.db'),false);try{snapshotDB.sqlite.pragma('journal_mode = DELETE');checkKnownDatabase(snapshotDB.sqlite);}finally{snapshotDB.sqlite.close();}
    const durableDB=await openScoped(stateTarget,'filehub.db',true);try{await durableDB.handle.chmod(0o600);await durableDB.handle.sync();}finally{await durableDB.close();}const durableState=await openScoped(stateTarget,'');try{await durableState.handle.sync();}finally{await durableState.close();}
    const copiedDB=await hashFile(stateTarget,'filehub.db',SNAPSHOT_LIMITS.bytes,options.signal);add({area:'state',path:'filehub.db',kind:'file',bytes:copiedDB.bytes,sha256:copiedDB.sha256,origin:null});
    const visit=async(area:SourceArea,path:string):Promise<void>=>{
      if(options.signal?.aborted)throw new PublicError('SERVICE_UNAVAILABLE');if(path.length>1024||path.split('/').length>SNAPSHOT_LIMITS.depth||items.length>=SNAPSHOT_LIMITS.items)throw new PublicError('RESOURCE_LIMIT');const opened=await openScoped(area.root,path,true);let item:SnapshotItem;try{if(String(opened.stat.dev)!==area.root.device)throw new PublicError('CROSS_DEVICE');if(opened.stat.isFile()&&opened.stat.size>BigInt(SNAPSHOT_LIMITS.bytes-bytes))throw new PublicError('RESOURCE_LIMIT');item={area:area.area,...(area.entryId?{entryId:area.entryId}:{}),path,kind:opened.stat.isDirectory()?'directory':'file',bytes:0,origin:origin(opened.stat)};}finally{await opened.close();}
      const target=targets.get(areaKey(area.area,area.entryId));if(!target)throw new PublicError('SERVICE_UNAVAILABLE');if(item.kind==='directory'){await ensureDirectory(target,path);add(item);for(const name of await names(area.root,path)){const child=path?`${path}/${name}`:name;if(area.area==='state'&&skipState(child))continue;await visit(area,child);}}else{const copied=await copyFile(area.root,path,target,options.signal);item={...item,...copied};add(item);await options.checkpoint?.(item);}
    };
    for(const area of areas)await visit(area,'');
    // 重讀來源全集（含內容 hash）及 data_version；不能以單次逐檔複製宣稱外部一致性。
    const expected=new Map(items.map(item=>[itemKey(item),item])),seen=new Set<string>();
    const verifySource=async(area:SourceArea,path:string):Promise<void>=>{const key=itemKey({...area,path}),item=expected.get(key);if(!item||!item.origin)throw new PublicError('CONFLICT');const opened=await openScoped(area.root,path,true);try{if(fullWitness(origin(opened.stat))!==fullWitness(item.origin))throw new PublicError('CONFLICT');}finally{await opened.close();}seen.add(key);if(item.kind==='file'){const current=await hashFile(area.root,path,SNAPSHOT_LIMITS.bytes,options.signal);if(current.sha256!==item.sha256)throw new PublicError('CONFLICT');}else for(const name of await names(area.root,path)){const child=path?`${path}/${name}`:name;if(area.area==='state'&&skipState(child))continue;await verifySource(area,child);}};
    for(const area of areas)await verifySource(area,'');if(seen.size!==items.length-1||sqlite.pragma('data_version',{simple:true})!==dataVersion)throw new PublicError('CONFLICT');
    const manifest=parseManifest({format:SNAPSHOT_FORMAT,producerVersion:await producerVersion(),schemaRevision:source.revision,createdAt:new Date().toISOString(),entries:entryRoots,items,bytes});await verifyData(output,manifest,options.signal);await assertIdleOwners(config.stateDirectory);if(sqlite.pragma('data_version',{simple:true})!==dataVersion)throw new PublicError('CONFLICT');
    const encoded=Buffer.from(JSON.stringify(manifest));if(encoded.length>SNAPSHOT_LIMITS.manifestBytes)throw new PublicError('RESOURCE_LIMIT');await writePrivate(output,'manifest.json',encoded);await writePrivate(output,'complete.json',Buffer.from(JSON.stringify({format:SNAPSHOT_FORMAT,manifestSha256:digest(encoded)})));await unlink(join(output.path,'INCOMPLETE'));const rootHandle=await openScoped(output,'');try{await rootHandle.handle.sync();}finally{await rootHandle.close();}
    return{format:SNAPSHOT_FORMAT,producerVersion:manifest.producerVersion,schemaRevision:manifest.schemaRevision,entries:entryRoots.length,items:items.length,bytes,manifestSha256:digest(encoded)};
  }finally{try{source?.sqlite.close();}finally{await lock.close();}}
}

async function verifyData(root:RootIdentity,manifest:SnapshotManifest,signal?:AbortSignal){
  const areas:SourceArea[]=[{area:'state',root:await areaRoot(root,'state')},{area:'config',root:await areaRoot(root,'config')},...await Promise.all(manifest.entries.map(async entry=>({area:'entry' as const,entryId:entry.id,root:await areaRoot(root,'entry',entry.id)})))],expected=new Map(manifest.items.map(item=>[itemKey(item),item]));let seen=0;
  const visit=async(area:SourceArea,path:string):Promise<void>=>{if(++seen>SNAPSHOT_LIMITS.items)throw new PublicError('RESOURCE_LIMIT');const item=expected.get(itemKey({...area,path}));if(!item)throw new PublicError('BAD_REQUEST');const opened=await openScoped(area.root,path,true);try{if(item.kind==='directory'?!opened.stat.isDirectory():!opened.stat.isFile()||opened.stat.nlink!==1n||Number(opened.stat.size)!==item.bytes)throw new PublicError('BAD_REQUEST');}finally{await opened.close();}if(item.kind==='file'){const found=await hashFile(area.root,path,SNAPSHOT_LIMITS.bytes,signal);if(found.sha256!==item.sha256)throw new PublicError('CONFLICT');}else for(const name of await names(area.root,path))await visit(area,path?`${path}/${name}`:name);};
  for(const area of areas)await visit(area,'');if(seen!==manifest.items.length)throw new PublicError('BAD_REQUEST');const state=areas[0];if(!state)throw new PublicError('BAD_REQUEST');const db=knownDatabase(join(state.root.path,'filehub.db'));try{if(db.revision!==manifest.schemaRevision||db.sqlite.pragma('journal_mode',{simple:true})!=='delete')throw new PublicError('BAD_REQUEST');const rows=dbEntries(db.sqlite);if(rows.length!==manifest.entries.length||rows.some(row=>!manifest.entries.some(entry=>entry.id===row.id&&entry.path===row.root_path&&entry.device===row.root_device&&entry.inode===row.root_inode)))throw new PublicError('BAD_REQUEST');}finally{db.sqlite.close();}
}
export async function verifySnapshot(path:string,signal?:AbortSignal){
  linux();const root=await inspectRoot(absolute(path)),top=await names(root,'');if(top.join(',')!==['complete.json','data','manifest.json'].sort().join(','))throw new PublicError('BAD_REQUEST');const completion=JSON.parse((await readSmall(root,'complete.json',1024)).text) as unknown;if(!Check(completeSchema,completion))throw new PublicError('BAD_REQUEST');const raw=await readSmall(root,'manifest.json',SNAPSHOT_LIMITS.manifestBytes);if(digest(raw.bytes)!==completion.manifestSha256)throw new PublicError('CONFLICT');const manifest=parseManifest(JSON.parse(raw.text));
  if((await names(root,'data')).join(',')!=='config,entries,state'||(await names(root,'data/entries')).join(',')!==manifest.entries.map(entry=>entry.id).sort().join(','))throw new PublicError('BAD_REQUEST');await verifyData(root,manifest,signal);return{root,manifest,manifestSha256:completion.manifestSha256};
}

export async function restoreSnapshot(source:string,destination:string,options:{quiesced:boolean;preserveSchema?:boolean;signal?:AbortSignal}){
  linux();if(options.quiesced!==true)throw new PublicError('BAD_REQUEST');destination=absolute(destination);const verified=await verifySnapshot(source,options.signal),originalRoots=verified.manifest.items.flatMap(item=>item.path===''&&item.origin?[item.origin]:[]);await nonOverlappingDestination(destination,[verified.root,...originalRoots]);const output=await newPrivateDirectory(destination);await writePrivate(output,'INCOMPLETE',Buffer.from('FileHub restore incomplete\n'));await ensureDirectory(output,'state');const statePath=join(output.path,'state'),lock=await acquireStateLock(statePath,'exclusive');
  try{
    const state=await inspectRoot(statePath);await writePrivate(state,RESTORE_PENDING,Buffer.from('FileHub restore incomplete\n'));await ensureDirectory(output,'storage');await ensureDirectory(output,'config');
    const restored=new Map<string,RootIdentity>([[areaKey('state'),state],[areaKey('config'),await inspectRoot(join(output.path,'config'))]]);for(const entry of verified.manifest.entries){await ensureDirectory(output,`storage/${entry.id}`);restored.set(areaKey('entry',entry.id),await inspectRoot(join(output.path,'storage',entry.id)));}
    const ordered=[...verified.manifest.items].sort((a,b)=>Number(b.kind==='directory')-Number(a.kind==='directory')||a.path.split('/').length-b.path.split('/').length);
    for(const item of ordered){const from=await areaRoot(verified.root,item.area,item.entryId),to=restored.get(areaKey(item.area,item.entryId));if(!to)throw new PublicError('BAD_REQUEST');if(item.kind==='directory')await ensureDirectory(to,item.path);else{const copied=await copyFile(from,item.path,to,options.signal);if(copied.bytes!==item.bytes||copied.sha256!==item.sha256)throw new PublicError('CONFLICT');}}
    for(const item of [...verified.manifest.items].sort((a,b)=>b.path.split('/').length-a.path.split('/').length)){if(!item.origin||item.area==='state')continue;const root=restored.get(areaKey(item.area,item.entryId));if(!root)throw new PublicError('BAD_REQUEST');const file=await openScoped(root,item.path,true);try{const seconds=Number(BigInt(item.origin.mtimeNs))/1e9;await file.handle.utimes(seconds,seconds);await file.handle.sync();}finally{await file.close();}}
    if(!options.preserveSchema)migrateDatabase({stateDirectory:statePath,sqliteBusyTimeoutMs:100});
    const result=await rebindSnapshot(statePath,restored,verified.manifest);const db=knownDatabase(join(statePath,'filehub.db'),false);try{db.sqlite.pragma('journal_mode = WAL');checkKnownDatabase(db.sqlite);if(db.revision!==(options.preserveSchema?verified.manifest.schemaRevision:SCHEMA_REVISION))throw new PublicError('CONFLICT');}finally{db.sqlite.close();}
    const receipt={format:SNAPSHOT_FORMAT,sourceSchema:verified.manifest.schemaRevision,schemaRevision:options.preserveSchema?verified.manifest.schemaRevision:SCHEMA_REVISION,manifestSha256:verified.manifestSha256,stateDirectory:statePath,...result};await writePrivate(output,'restore.json',Buffer.from(JSON.stringify(receipt)));await unlink(join(output.path,'INCOMPLETE'));await unlink(join(state.path,RESTORE_PENDING));const opened=await openScoped(output,'');try{await opened.handle.sync();const stateHandle=await openScoped(state,'');try{await stateHandle.handle.sync();}finally{await stateHandle.close();}}finally{await opened.close();}return receipt;
  }finally{await lock.close();}
}
