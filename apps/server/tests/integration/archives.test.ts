import { randomUUID,createHash } from 'node:crypto';
import { mkdir,writeFile,readFile,lstat,symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { expect,onTestFinished,test } from 'vitest';
import { ARCHIVE_LIMITS,type OperationCreate } from '@filehub/contracts';
import { databaseFixture } from '../helpers/database.js';
import { readStoredZip } from '../helpers/zip.js';
import { EntryService } from '../../src/modules/entries/service.js';
import { FileService } from '../../src/modules/files/service.js';
import { IdentityService } from '../../src/modules/identity/service.js';
import { OperationCatalog,operationResources } from '../../src/modules/operations/catalog.js';
import { OperationService } from '../../src/modules/operations/service.js';
import { OperationExecutor } from '../../src/modules/operations/executor.js';
import { ArtifactStore,artifactName } from '../../src/modules/operations/artifacts.js';
import { ArchiveHandler,type ArchiveDependencies } from '../../src/modules/operations/archives.js';
import { buildApp } from '../../src/app.js';
import { parseConfig } from '../../src/config/index.js';

async function fixture(dependencies:ArchiveDependencies={},auth=false){
  const f=await databaseFixture();f.migrate();const db=f.open(),identity=new IdentityService(db),entries=new EntryService(db),files=new FileService(entries),catalog=new OperationCatalog(db),root=join(f.directory,'source'),password='Synthetic-archive-password-2026!';let user:string,other:string;
  if(auth){user=(await identity.bootstrap('owner',password)).id;other=(await identity.createUser('other',password)).id;db.sqlite.prepare("UPDATE users SET role='member' WHERE id=?").run(user);}else{user=randomUUID();other=randomUUID();db.sqlite.prepare("INSERT INTO users VALUES (?,'owner','synthetic-hash','member',1,1)").run(user);db.sqlite.prepare("INSERT INTO users VALUES (?,'other','synthetic-hash','admin',1,1)").run(other);}
  await mkdir(join(root,'tree','empty'),{recursive:true});await writeFile(join(root,'tree','data.bin'),Buffer.from([0,255,1,10]));await writeFile(join(root,'tree','資料.txt'),'Hello 檔案\n');await writeFile(join(root,'tree','zero'),'');const entry=await entries.register('external','唯讀來源',root);await entries.grant('owner',entry.id,'',true,false);
  const store=new ArtifactStore(db,entries,files),handler=new ArchiveHandler(store,dependencies),service=new OperationService(catalog,entries,files,new Set(['archive']));let executor:OperationExecutor|undefined;
  const start=()=>{executor=new OperationExecutor(catalog,new Map([['archive',handler.handle]]),50);onTestFinished(()=>executor?.close());};const stop=async()=>{await executor?.close();};
  const input=async(paths=['tree']):Promise<OperationCreate>=>({id:randomUUID(),kind:'archive',sources:await Promise.all(paths.map(async path=>({entryId:entry.id,path,version:(await files.metadata(user,entry.id,path)).resource.version}))),conflict:'stop'});
  const wait=async(id:string)=>{await expect.poll(()=>catalog.get(user,id).state,{timeout:8000}).not.toMatch(/^(queued|running|cancelling)$/);return catalog.get(user,id);};
  return{...f,db,user,other,identity,entries,files,catalog,root,entry,store,handler,service,start,stop,input,wait,password};
}
test('真實 ZIP 的 Unicode／空目錄／零長度／binary、CRC／中央目錄與 SHA-256 一致；來源唯讀且 UUID 去重',async()=>{
  const f=await fixture(),input=await f.input();input.id=input.id.toUpperCase();if(process.platform!=='linux'){await expect(f.service.create(f.user,input)).rejects.toMatchObject({code:'WRITE_UNSUPPORTED'});return;}
  await f.service.create(f.user,input);f.start();const view=await f.wait(input.id);expect(view.state).toBe('succeeded');expect(view.artifact?.expiresAt).toBeTruthy();const payload=await readFile(join(f.config.stateDirectory,artifactName(input.id))),zip=readStoredZip(payload);expect([...zip.keys()].sort()).toEqual(['tree/','tree/data.bin','tree/empty/','tree/zero','tree/資料.txt'].sort());expect(zip.get('tree/data.bin')?.equals(Buffer.from([0,255,1,10]))).toBe(true);expect(zip.get('tree/資料.txt')?.toString()).toBe('Hello 檔案\n');expect(zip.get('tree/zero')).toHaveLength(0);expect(view.artifact).toMatchObject({bytes:payload.length,sha256:createHash('sha256').update(payload).digest('hex')});expect((await f.service.create(f.user,input)).id).toBe(input.id);expect(await readFile(join(f.root,'tree','data.bin'))).toHaveLength(4);expect(f.entries.list(f.user)[0]?.readOnly).toBe(true);
});
test.each(['change','revoke','cancel'] as const)('完整 ZIP 後 %s：不提供半成品，已知 artifact 清理',async(action)=>{
  if(process.platform!=='linux')return;
  const f=await fixture({checkpoint:async(phase,ctx)=>{if(phase!=='publishing')return;if(action==='change')await writeFile(join(f.root,'tree','data.bin'),'changed');if(action==='revoke')await f.entries.grant('owner',f.entry.id,'',false,false);if(action==='cancel')ctx.catalog.cancel(ctx.user,ctx.claim.id);}}),input=await f.input();await f.service.create(f.user,input);f.start();const view=await f.wait(input.id);expect(view.state).toBe(action==='cancel'?'cancelled':'failed');expect(view.artifact).toBeUndefined();expect(f.store.row(input.id)).toMatchObject({cleaned:true,reservedBytes:0});await expect(lstat(join(f.config.stateDirectory,artifactName(input.id)))).rejects.toMatchObject({code:'ENOENT'});
});
test('另一來源有 symlink 或檔名大小寫衝突時全份封存失敗，不交付不完整產物',async()=>{
  if(process.platform!=='linux')return;const f=await fixture();await mkdir(join(f.root,'bad'));await symlink(join(f.root,'tree','data.bin'),join(f.root,'bad','link'));const input=await f.input(['tree','bad']);await f.service.create(f.user,input);f.start();expect((await f.wait(input.id)).state).toBe('failed');expect(f.store.row(input.id)).toBeUndefined();await f.stop();
  const second=await fixture();await writeFile(join(second.root,'a'),'a');await writeFile(join(second.root,'A'),'A');const collision=await second.input(['a','A']);await second.service.create(second.user,collision);second.start();expect((await second.wait(collision.id)).items.every(item=>item.state==='failed')).toBe(true);expect(second.store.row(collision.id)).toBeUndefined();
});
test('封存寫入中途取消或後續來源換檔，未完成中央目錄亦會精確清理',async()=>{
  if(process.platform!=='linux')return;
  for(const cancel of [false,true]){let written=0;const f=await fixture({checkpoint:async(phase,ctx)=>{if(phase==='entry_written'&&++written===2){if(cancel)ctx.catalog.cancel(ctx.user,ctx.claim.id);else await writeFile(join(f.root,'tree','資料.txt'),'modified-mid-archive');}}}),input=await f.input();await f.service.create(f.user,input);f.start();expect((await f.wait(input.id)).state).toBe(cancel?'cancelled':'failed');expect(f.store.row(input.id)).toMatchObject({cleaned:true,reservedBytes:0});await expect(lstat(join(f.config.stateDirectory,artifactName(input.id)))).rejects.toMatchObject({code:'ENOENT'});}
});
test('8 GiB quota 計入未知及未清理保留，拒絕新的產物而不配置 bytes',async()=>{
  if(process.platform!=='linux')return;const f=await fixture();
  for(let i=0;i<4;i++){const input=await f.input();input.sources[0]={entryId:f.entry.id,path:`unrelated-${i}`,version:'a'.repeat(64)};f.catalog.enqueue(f.user,input,operationResources(input));const owner=randomUUID();f.db.sqlite.prepare("UPDATE operations SET state='needs_review',owner=?,attempt=1 WHERE id=?").run(owner,input.id);f.db.sqlite.prepare("INSERT INTO operation_artifacts(operation_id,owner,state,reserved_bytes,created_at,expires_at) VALUES (?,?,'needs_review',?,1,9999999999999)").run(input.id,owner,ARCHIVE_LIMITS.totalBytes/4);}
  const input=await f.input();await f.service.create(f.user,input);f.start();const view=await f.wait(input.id);expect(view.state).toBe('failed');expect(view.items[0]?.errorCode).toBe('RESOURCE_LIMIT');expect(f.store.row(input.id)).toBeUndefined();expect(f.db.sqlite.prepare('SELECT sum(reserved_bytes) AS bytes FROM operation_artifacts').get()).toEqual({bytes:ARCHIVE_LIMITS.totalBytes});
});
test('Artifact 與一般讀取共用四份 admission；到期清理後無 bytes／quota 遺留',async()=>{
  if(process.platform!=='linux')return;const f=await fixture(),input=await f.input();await f.service.create(f.user,input);f.start();await f.wait(input.id);await f.stop();
  const opened=await Promise.all(Array.from({length:4},()=>f.store.openDownload(f.user,input.id,()=>{},new AbortController().signal)));onTestFinished(async()=>{await Promise.all(opened.map(item=>item.close()));});expect(f.files.activeRequests).toBe(4);await expect(f.files.metadata(f.user,f.entry.id,'tree')).rejects.toMatchObject({code:'SERVICE_UNAVAILABLE'});await Promise.all(opened.map(item=>item.close()));expect(f.files.activeRequests).toBe(0);
  f.db.sqlite.prepare('UPDATE operation_artifacts SET expires_at=0 WHERE operation_id=?').run(input.id);await expect(f.store.openDownload(f.user,input.id,()=>{},new AbortController().signal)).rejects.toMatchObject({code:'NOT_FOUND'});expect(await f.store.maintain()).toEqual([{id:input.id,outcome:'expired'}]);expect(f.store.row(input.id)).toMatchObject({state:'expired',cleaned:true,reservedBytes:0});await expect(lstat(join(f.config.stateDirectory,artifactName(input.id)))).rejects.toMatchObject({code:'ENOENT'});expect(f.catalog.get(f.user,input.id).artifact).toBeUndefined();
});
test('artifact 被外部改寫時拒絕下載與刪除，不將未知 payload 冒充已清理',async()=>{
  if(process.platform!=='linux')return;const f=await fixture(),input=await f.input();await f.service.create(f.user,input);f.start();await f.wait(input.id);await f.stop();const path=join(f.config.stateDirectory,artifactName(input.id));await writeFile(path,'external-artifact-content');await expect(f.store.openDownload(f.user,input.id,()=>{},new AbortController().signal)).rejects.toMatchObject({code:'CONFLICT'});expect(f.files.activeRequests).toBe(0);f.db.sqlite.prepare('UPDATE operation_artifacts SET expires_at=0 WHERE operation_id=?').run(input.id);expect(await f.store.maintain()).toEqual([{id:input.id,outcome:'needs_review'}]);expect(f.store.row(input.id)?.reservedBytes).toBeGreaterThan(0);expect(await readFile(path,'utf8')).toBe('external-artifact-content');
});
test('HTTP owner／目前 grant／HEAD／Range／If-Range／到期使用真正 ZIP，無 session 或另一帳號均拒絕',async()=>{
  if(process.platform!=='linux')return;const f=await fixture({},true),input=await f.input();await f.service.create(f.user,input);f.start();const view=await f.wait(input.id);await f.stop();const app=buildApp({config:parseConfig({FILEHUB_LOG_LEVEL:'silent'}),dependencies:{identity:f.identity,entries:f.entries,files:f.files,operations:f.service,artifacts:f.store}});onTestFinished(()=>app.close());
  const login=async(username:string)=>{const response=await app.inject({method:'POST',url:'/api/session',headers:{origin:'http://127.0.0.1:3000'},payload:{username,password:f.password}});expect(response.statusCode).toBe(200);return `filehub_session=${response.cookies[0]?.value}`;};const cookie=await login('owner'),other=await login('other'),url=`/api/operations/${input.id}/artifact`;
  expect((await app.inject({url})).statusCode).toBe(401);expect((await app.inject({url,headers:{cookie:other}})).statusCode).toBe(404);const head=await app.inject({method:'HEAD',url,headers:{cookie}});expect(head.statusCode).toBe(200);expect(head.body).toBe('');expect(head.headers['content-type']).toContain('application/zip');expect(head.headers['content-disposition']).toContain('attachment;');expect(Number(head.headers['content-length'])).toBe(view.artifact?.bytes);
  const partial=await app.inject({url,headers:{cookie,range:'bytes=0-3','if-range':String(head.headers.etag)}});expect(partial.statusCode).toBe(206);expect(partial.rawPayload.equals(Buffer.from([0x50,0x4b,3,4]))).toBe(true);expect((await app.inject({url,headers:{cookie,range:'bytes=0-3','if-range':'"stale"'}})).statusCode).toBe(200);expect((await app.inject({url,headers:{cookie,range:'bytes=99999999-'}})).statusCode).toBe(416);
  await f.entries.grant('owner',f.entry.id,'',false,false);expect((await app.inject({url,headers:{cookie}})).statusCode).toBe(403);await f.entries.grant('owner',f.entry.id,'',true,false);const full=await app.inject({url,headers:{cookie}});expect(full.statusCode).toBe(200);expect(readStoredZip(full.rawPayload).size).toBe(5);f.db.sqlite.prepare('UPDATE operation_artifacts SET expires_at=0 WHERE operation_id=?').run(input.id);expect((await app.inject({url,headers:{cookie}})).statusCode).toBe(404);expect(f.files.activeRequests).toBe(0);
},30000);
