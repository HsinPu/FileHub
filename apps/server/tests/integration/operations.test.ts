import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { expect, onTestFinished, test } from 'vitest';
import { OPERATION_LIMITS, type OperationCreate } from '@filehub/contracts';
import { databaseFixture } from '../helpers/database.js';
import { OperationCatalog } from '../../src/modules/operations/catalog.js';
import { OperationService } from '../../src/modules/operations/service.js';
import { OperationExecutor } from '../../src/modules/operations/executor.js';
import { WriteCoordinator } from '../../src/storage/coordinator.js';
import { createOwner } from '../../src/storage/native.js';
import { IdentityService } from '../../src/modules/identity/service.js';
import { EntryService } from '../../src/modules/entries/service.js';
import { FileService } from '../../src/modules/files/service.js';
import { buildApp } from '../../src/app.js';
import { parseConfig } from '../../src/config/index.js';

async function fixture() {
  const f = await databaseFixture(); f.migrate(); const db = f.open(), user = randomUUID(), other = randomUUID(), entry = randomUUID();
  for (const id of [user,other]) db.sqlite.prepare("INSERT INTO users VALUES (?,?,'synthetic-hash','admin',1,1)").run(id,id);
  db.sqlite.prepare("INSERT INTO entries (id,label,kind,root_path,root_device,root_inode,root_ancestors,enabled) VALUES (?,'fixture','managed','synthetic-root','1','1','[]',1)").run(entry);
  const input = (path = 'source'): OperationCreate => ({ id: randomUUID(), kind: 'archive', sources: [{ entryId: entry, path, version: 'a'.repeat(64) }], conflict: 'stop' });
  return { ...f, db, user, other, entry, input, catalog: new OperationCatalog(db) };
}
test('持久 catalog／owner UUID 去重，重開狀態一致且 DTO 不含私有執行資訊', async () => {
  const f = await fixture(), input = f.input();
  const first = f.catalog.enqueue(f.user,input,[{ entryId:f.entry,path:'source' }]);
  expect(f.catalog.enqueue(f.user,input,[{ entryId:f.entry,path:'source' }])).toEqual(first);
  expect(f.catalog.enqueue(f.user,{conflict:input.conflict,sources:input.sources,kind:input.kind,id:input.id},[{entryId:f.entry,path:'source'}])).toEqual(first);
  expect(new OperationCatalog(f.open()).get(f.user,input.id)).toEqual(first);
  expect(JSON.stringify(first)).not.toMatch(/synthetic-root|owner|leaseUntil|resources|evidence/);
  expect(()=>f.catalog.get(f.other,input.id)).toThrow(expect.objectContaining({code:'NOT_FOUND'}));
  expect(()=>f.catalog.enqueue(f.user,{...input,conflict:'skip'},[{entryId:f.entry,path:'source'}])).toThrow(expect.objectContaining({code:'CONFLICT'}));
  expect(f.catalog.list(f.user).items).toHaveLength(1); expect(f.db.sqlite.inTransaction).toBe(false);
});
test('P2／P5 共用子樹 reservation，取消尚未領取工作才釋放', async () => {
  const f=await fixture(), input=f.input(); f.catalog.enqueue(f.user,input,[{entryId:f.entry,path:'source'}]); const writes=new WriteCoordinator(f.db);
  expect(()=>writes.begin(f.user,'mkdir',[{entryId:f.entry,path:'source/child'}],{})).toThrow(expect.objectContaining({code:'MUTATION_BUSY'}));
  expect(f.catalog.cancel(f.user,input.id).state).toBe('cancelled');
  writes.begin(f.user,'mkdir',[{entryId:f.entry,path:'source'}],{});
  expect(()=>f.catalog.enqueue(f.user,f.input('source/child'),[{entryId:f.entry,path:'source/child'}])).toThrow(expect.objectContaining({code:'MUTATION_BUSY'}));
});
test('原子 claim、lease 及 attempt fencing；進度節流／單調與 partial 不冒充成功', async () => {
  const f=await fixture();let now=1000;const catalog=new OperationCatalog(f.db,()=>now), input=f.input(); input.sources.push({entryId:f.entry,path:'second',version:'a'.repeat(64)});
  catalog.enqueue(f.user,input,[{entryId:f.entry,path:'source'},{entryId:f.entry,path:'second'}]);const claim=catalog.claim(input.id);if(!claim)throw new Error();
  expect(new OperationCatalog(f.open(),()=>now).claim(input.id)).toBeUndefined();
  catalog.item(claim,0,'running');expect(catalog.progress(claim,0,1,10)).toBe(false);now+=251;expect(catalog.progress(claim,0,5,10)).toBe(true);
  expect(()=>catalog.progress(claim,0,4,10,true)).toThrow();catalog.progress(claim,0,10,10,true);catalog.item(claim,0,'succeeded');catalog.item(claim,1,'failed',{},'CONFLICT');catalog.finish(claim);
  expect(catalog.get(f.user,input.id).state).toBe('partial');expect(()=>catalog.heartbeat(claim)).toThrow();
  const second=f.input('fresh');catalog.enqueue(f.user,second,[{entryId:f.entry,path:'fresh'}]);const old=catalog.claim(second.id);if(!old)throw new Error();now+=OPERATION_LIMITS.leaseMs+1;
  expect(()=>catalog.heartbeat(old)).toThrow(expect.objectContaining({code:'CONFLICT'}));expect(()=>catalog.item(old,0,'running')).toThrow();
  expect(catalog.record(second.id).state).toBe('running');
});
test('取消 running 是請求，未知 I/O 不釋放；只有取得 OFD proof 才 fencing／允許安全 retry', async () => {
  const f=await fixture();
  if(process.platform!=='linux'){await expect(createOwner(f.db.sqlite.name,randomUUID())).rejects.toMatchObject({code:'WRITE_UNSUPPORTED'});return;}
  let now=Date.now();const catalog=new OperationCatalog(f.db,()=>now), input=f.input(), owner=randomUUID(), guard=await createOwner(f.db.sqlite.name,owner);
  try {
    catalog.enqueue(f.user,input,[{entryId:f.entry,path:'source'}]);const claim=catalog.claim(input.id,owner);if(!claim)throw new Error();now+=5001;
    expect(await catalog.recoverExpired()).toEqual([{id:input.id,state:'owner_unproven'}]);expect(catalog.record(input.id).attempt).toBe(1);
    await guard.close();expect(await catalog.recoverExpired()).toEqual([{id:input.id,state:'interrupted'}]);expect(catalog.get(f.user,input.id).canRetry).toBe(true);
    catalog.retry(f.user,input.id);const nextOwner=randomUUID(),nextGuard=await createOwner(f.db.sqlite.name,nextOwner);
    try {const next=catalog.claim(input.id,nextOwner);if(!next)throw new Error();expect(next.attempt).toBe(3);expect(()=>catalog.item(claim,0,'running')).toThrow();catalog.item(next,0,'running',{phase:'effect_pending'});expect(catalog.cancel(f.user,input.id).state).toBe('cancelling');now+=5001;await nextGuard.close();await catalog.recoverExpired();expect(catalog.get(f.user,input.id)).toMatchObject({state:'needs_review',canRetry:false});expect(()=>catalog.retry(f.user,input.id)).toThrow();expect(()=>new WriteCoordinator(f.db).begin(f.user,'rename',[{entryId:f.entry,path:'source'}],{})).toThrow();}
    finally{await nextGuard.close();}
  }finally{await guard.close();}
});
test('每使用者 active quota 有界；列表不讓新完成紀錄擠掉舊進行中工作', async () => {
  const f=await fixture();let first='';
  for(let i=0;i<8;i++){const input=f.input(`item-${i}`);if(i===0)first=input.id;f.catalog.enqueue(f.user,input,[{entryId:f.entry,path:`item-${i}`}]);}
  expect(()=>f.catalog.enqueue(f.user,f.input('overflow'),[{entryId:f.entry,path:'overflow'}])).toThrow(expect.objectContaining({code:'RESOURCE_LIMIT'}));
  for(let i=0;i<60;i++){const input=f.input(`history-${i}`);f.catalog.enqueue(f.other,input,[{entryId:f.entry,path:`history-${i}`}]);f.catalog.cancel(f.other,input.id);}
  expect(f.catalog.list(f.user).items.some((item)=>item.id===first)).toBe(true);
});
test('HTTP 操作 metadata／Origin／CSRF／owner／busy；沒有 handler 不接受新工作', async () => {
  const f=await databaseFixture();f.migrate();const db=f.open(),identity=new IdentityService(db),user=await identity.bootstrap('admin','Synthetic-operation-password-123!');
  const root=join(f.directory,'files');await mkdir(root);await writeFile(join(root,'file.txt'),'fixture');const entries=new EntryService(db),entry=await entries.register('managed','來源',root),files=new FileService(entries),catalog=new OperationCatalog(db),service=new OperationService(catalog,entries,files);
  const app=buildApp({config:parseConfig({FILEHUB_LOG_LEVEL:'silent'}),dependencies:{identity,entries,files,operations:service}});onTestFinished(()=>app.close());
  const login=await app.inject({method:'POST',url:'/api/session',headers:{origin:'http://127.0.0.1:3000'},payload:{username:'admin',password:'Synthetic-operation-password-123!'}}), session=login.json<{csrfToken:string}>();
  const headers={cookie:`filehub_session=${login.cookies[0]?.value}`,origin:'http://127.0.0.1:3000','x-csrf-token':session.csrfToken};
  expect((await app.inject({url:'/api/operations/capabilities'})).statusCode).toBe(401);
  expect((await app.inject({url:'/api/operations/capabilities',headers})).json()).toEqual({kinds:[],maxSources:16});
  expect((await files.metadata(user.id,entry.id,'file.txt')).resource.canCopy).toBe(process.platform==='linux'?true:undefined);
  const input:OperationCreate={id:randomUUID(),kind:'archive',sources:[{entryId:entry.id,path:'file.txt',version:(await files.metadata(user.id,entry.id,'file.txt')).resource.version}],conflict:'stop'};
  expect((await app.inject({url:'/api/operations'})).statusCode).toBe(401);expect((await app.inject({method:'POST',url:'/api/operations',headers:{cookie:headers.cookie},payload:input})).statusCode).toBe(403);
  expect((await app.inject({method:'POST',url:'/api/operations',headers,payload:input})).statusCode).toBe(422);
  catalog.enqueue(user.id,input,[{entryId:entry.id,path:'file.txt'}]);expect((await app.inject({url:'/api/operations',headers})).json()).toMatchObject({items:[{id:input.id,state:'queued'}]});
  const other=f.open();other.sqlite.exec('BEGIN IMMEDIATE');try{expect((await app.inject({method:'POST',url:`/api/operations/${input.id}/cancel`,headers})).statusCode).toBe(503);expect(catalog.record(input.id).state).toBe('queued');}finally{other.sqlite.exec('ROLLBACK');}
  expect((await app.inject({method:'POST',url:`/api/operations/${input.id}/cancel`,headers})).statusCode).toBe(200);expect(catalog.get(user.id,input.id).state).toBe('cancelled');
});
test('Linux executor 在長工作期間維持 lease，取消後等待 handler 關閉', async () => {
  const f=await fixture();if(process.platform!=='linux'){expect(process.platform).toBe('win32');return;}
  const input=f.input();f.catalog.enqueue(f.user,input,[{entryId:f.entry,path:'source'}]);
  let entered=false,finished=false;
  const executor=new OperationExecutor(f.catalog,new Map([['archive',async(ctx)=>{ctx.catalog.item(ctx.claim,0,'running');entered=true;await delay(5500);const current=ctx.catalog.owned(ctx.claim);expect(current.leaseUntil).toBeGreaterThan(Date.now());while(!ctx.catalog.owned(ctx.claim).cancelRequested&&!ctx.signal.aborted)await delay(10);ctx.catalog.item(ctx.claim,0,'cancelled');finished=true;}]]),50);
  onTestFinished(()=>executor.close());await expect.poll(()=>entered).toBe(true);await delay(5100);expect(f.catalog.record(input.id).state).toBe('running');f.catalog.cancel(f.user,input.id);await expect.poll(()=>f.catalog.record(input.id).state,{timeout:3000}).toBe('cancelled');await executor.close();expect(finished).toBe(true);
},10000);
