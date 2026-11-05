import { randomUUID } from 'node:crypto';
import { mkdir,writeFile,readFile,lstat,readdir,symlink,open } from 'node:fs/promises';
import { join } from 'node:path';
import { expect,onTestFinished,test } from 'vitest';
import type { OperationCreate } from '@filehub/contracts';
import { databaseFixture } from '../helpers/database.js';
import { EntryService } from '../../src/modules/entries/service.js';
import { FileService } from '../../src/modules/files/service.js';
import { MutationService,type MutationDependencies } from '../../src/modules/files/mutations.js';
import { TrashService } from '../../src/modules/trash/service.js';
import { OperationCatalog } from '../../src/modules/operations/catalog.js';
import { OperationService } from '../../src/modules/operations/service.js';
import { OperationExecutor } from '../../src/modules/operations/executor.js';
import { TransferHandler,type TransferDependencies } from '../../src/modules/operations/transfers.js';
import { createTemporaryDirectory } from '../../../../tests/helpers/temporary-directory.js';
async function fixture(cross=false,dependencies:TransferDependencies={},mutationDependencies:MutationDependencies={}){
  const f=await databaseFixture();f.migrate();const db=f.open(),user=randomUUID(),entries=new EntryService(db),files=new FileService(entries),catalog=new OperationCatalog(db);
  db.sqlite.prepare("INSERT INTO users VALUES (?,'fixture','synthetic-hash','admin',1,1)").run(user);
  const root=join(f.directory,'source');await mkdir(root);let destination=join(f.directory,'destination');
  if(cross){const temp=await createTemporaryDirectory('filehub-p52-cross-','/dev/shm');destination=temp.directory;onTestFinished(()=>temp.dispose());}else await mkdir(destination);
  const source=await entries.register('managed','來源',root),target=await entries.register('external','目的地',destination);
  if(process.platform==='linux'){await entries.setWritable(source.id,true);await entries.setWritable(target.id,true);}
  const mutations=new MutationService(db,entries,mutationDependencies),handler=new TransferHandler(entries,mutations,dependencies);onTestFinished(()=>handler.close());
  const service=new OperationService(catalog,entries,files,new Set(['copy','move']));let executor:OperationExecutor|undefined;
  const start=()=>{executor=new OperationExecutor(catalog,new Map([['copy',handler.handle],['move',handler.handle]]),50);onTestFinished(()=>executor?.close());};
  const input=async(kind:'copy'|'move',paths:string[],conflict:'stop'|'skip'='stop'):Promise<OperationCreate>=>({id:randomUUID(),kind,sources:await Promise.all(paths.map(async path=>({entryId:source.id,path,version:(await files.metadata(user,source.id,path)).resource.version}))),destination:{entryId:target.id,path:'',version:(await files.metadata(user,target.id,'')).resource.version},conflict});
  const wait=async(id:string)=>{await expect.poll(()=>catalog.get(user,id).state,{timeout:8000}).not.toMatch(/^(queued|running|cancelling)$/);return catalog.get(user,id);};
  return{...f,db,user,entries,files,catalog,root,destination,source,target,mutations,handler,service,start,input,wait};
}
test('遞迴 copy 保留原檔、空資料夾及二進位內容；發布後無 staging payload',async()=>{
  const f=await fixture();await mkdir(join(f.root,'tree','empty'),{recursive:true});await writeFile(join(f.root,'tree','data.bin'),Buffer.from([0,255,1,10]));const input=await f.input('copy',['tree']);
  if(process.platform!=='linux'){await expect(f.service.create(f.user,input)).rejects.toMatchObject({code:'WRITE_UNSUPPORTED'});return;}
  await f.service.create(f.user,input);f.start();expect((await f.wait(input.id)).state).toBe('succeeded');expect((await f.service.create(f.user,input)).state).toBe('succeeded');expect(f.db.sqlite.prepare('SELECT count(*) AS n FROM operations').get()).toEqual({n:1});expect((await readFile(join(f.destination,'tree','data.bin'))).equals(Buffer.from([0,255,1,10]))).toBe(true);expect(await readdir(join(f.destination,'tree','empty'))).toEqual([]);expect(await readdir(join(f.destination,'.filehub','staging'))).toEqual([]);expect(await readFile(join(f.root,'tree','data.bin'))).toHaveLength(4);
});
test('同 device 跨入口 move 保留 inode，不建立不必要副本；跨 device move 先驗副本再回收來源',async()=>{
  if(process.platform!=='linux')return;
  for(const cross of [false,true]){const f=await fixture(cross);await mkdir(join(f.root,'folder'));await writeFile(join(f.root,'folder','file'),'move-fixture');const original=await lstat(join(f.root,'folder'),{bigint:true});const input=await f.input('move',['folder']);await f.service.create(f.user,input);f.start();expect((await f.wait(input.id)).state).toBe('succeeded');await expect(lstat(join(f.root,'folder'))).rejects.toMatchObject({code:'ENOENT'});expect(await readFile(join(f.destination,'folder','file'),'utf8')).toBe('move-fixture');const after=await lstat(join(f.destination,'folder'),{bigint:true});expect(original.dev===after.dev).toBe(!cross);expect(original.ino===after.ino).toBe(!cross);
    const trash=await new TrashService(f.db,f.entries,f.mutations).list(f.user,f.source.id);expect(trash.items).toHaveLength(cross?1:0);if(cross)expect(trash.items[0]).toMatchObject({originalPath:'folder',status:'available',canRestore:true});}
});
test('衝突不覆寫；skip 續做其他來源，結果 partial 與逐項 CONFLICT',async()=>{
  if(process.platform!=='linux')return;const f=await fixture();await writeFile(join(f.root,'a'),'source-a');await writeFile(join(f.root,'b'),'source-b');await writeFile(join(f.destination,'a'),'existing');const input=await f.input('copy',['a','b'],'skip');await f.service.create(f.user,input);f.start();const result=await f.wait(input.id);expect(result.state).toBe('partial');expect(result.items.map(item=>[item.state,item.errorCode])).toEqual([['failed','CONFLICT'],['succeeded',undefined]]);expect(await readFile(join(f.destination,'a'),'utf8')).toBe('existing');expect(await readFile(join(f.destination,'b'),'utf8')).toBe('source-b');expect(await readdir(join(f.destination,'.filehub','staging'))).toEqual([]);
});
test('來源變更／撤權／取消在發布前阻擋，已知 staging 安全清理，不影響原檔',async()=>{
  if(process.platform!=='linux')return;
  for(const action of ['change','revoke','cancel']){const f=await fixture(false,{checkpoint:async(phase,ctx)=>{if(phase!=='planned')return;if(action==='change')await writeFile(join(f.root,'a'),'changed');if(action==='revoke')ctx.catalog.database.sqlite.prepare('UPDATE users SET enabled=0 WHERE id=?').run(ctx.user);if(action==='cancel')ctx.catalog.cancel(ctx.user,ctx.claim.id);}});await writeFile(join(f.root,'a'),'source');const input=await f.input('copy',['a']);await f.service.create(f.user,input);f.start();await expect.poll(()=>f.catalog.record(input.id).state,{timeout:8000}).not.toMatch(/^(queued|running|cancelling)$/);expect(f.catalog.record(input.id).state).toBe(action==='cancel'?'cancelled':'failed');await expect(lstat(join(f.destination,'a'))).rejects.toMatchObject({code:'ENOENT'});expect(await readdir(join(f.destination,'.filehub','staging'))).toEqual([]);}
});
test('完整 staging 後來源換檔／目的地撤權／取消，仍不得發布或誤報成功',async()=>{
  if(process.platform!=='linux')return;
  for(const action of ['change','revoke','cancel']){const f=await fixture(false,{checkpoint:async(phase,ctx)=>{if(phase!=='publishing')return;if(action==='change')await writeFile(join(f.root,'a'),'changed-after-copy');if(action==='revoke')ctx.catalog.database.sqlite.prepare('UPDATE entries SET writable=0 WHERE id=?').run(f.target.id);if(action==='cancel')ctx.catalog.cancel(ctx.user,ctx.claim.id);}});await writeFile(join(f.root,'a'),'source');const input=await f.input('copy',['a']);await f.service.create(f.user,input);f.start();const result=await f.wait(input.id);expect(result.state).toBe(action==='cancel'?'cancelled':'failed');await expect(lstat(join(f.destination,'a'))).rejects.toMatchObject({code:'ENOENT'});expect(await readdir(join(f.destination,'.filehub','staging'))).toEqual([]);expect(await readFile(join(f.root,'a'),'utf8')).toBe(action==='change'?'changed-after-copy':'source');}
});
test('拒絕自身子樹、重疊來源與 symlink；同 UUID 重查不建立第二份副本',async()=>{
  const f=await fixture();await mkdir(join(f.root,'tree','child'),{recursive:true});await writeFile(join(f.root,'tree','a'),'fixture');if(process.platform!=='linux')return;
  let input=await f.input('copy',['tree']);input.destination={entryId:f.source.id,path:'tree/child',version:(await f.files.metadata(f.user,f.source.id,'tree/child')).resource.version};await expect(f.service.create(f.user,input)).rejects.toMatchObject({code:'BAD_REQUEST'});
  input=await f.input('copy',['tree','tree/a']);await expect(f.service.create(f.user,input)).rejects.toMatchObject({code:'BAD_REQUEST'});
  await symlink(join(f.root,'tree','a'),join(f.root,'tree','link'));input=await f.input('copy',['tree']);await f.service.create(f.user,input);f.start();expect((await f.wait(input.id)).state).toBe('failed');await expect(lstat(join(f.destination,'tree'))).rejects.toMatchObject({code:'ENOENT'});
});
test('發布後的額外檔案與跨裝置回收前的來源變更保留現場，不冒充完整成功',async()=>{
  if(process.platform!=='linux')return;
  for(const cross of [false,true]){const f=await fixture(cross,{checkpoint:async(phase)=>{if(!cross&&phase==='published')await writeFile(join(f.destination,'tree','foreign'),'external');if(cross&&phase==='retiring')await writeFile(join(f.root,'tree','a'),'external-change');}});await mkdir(join(f.root,'tree'));await writeFile(join(f.root,'tree','a'),'original');const input=await f.input(cross?'move':'copy',['tree']);await f.service.create(f.user,input);f.start();expect((await f.wait(input.id)).state).toBe('needs_review');expect(await readFile(join(f.root,'tree','a'),'utf8')).toBe(cross?'external-change':'original');expect(await readFile(join(f.destination,'tree','a'),'utf8')).toBe('original');if(!cross)expect(await readFile(join(f.destination,'tree','foreign'),'utf8')).toBe('external');expect(f.db.sqlite.prepare('SELECT count(*) AS n FROM trash_items').get()).toEqual({n:0});}
});
test('超過單檔上限或遞迴深度時，發布前拒絕且沒有暫存容量遺留',async()=>{
  if(process.platform!=='linux')return;
  for(const deep of [false,true]){const f=await fixture();if(deep)await mkdir(join(f.root,'tree',...Array.from({length:17},()=> 'child')),{recursive:true});else{const file=await open(join(f.root,'file'),'wx');try{await file.truncate(1073741825);}finally{await file.close();}}const path=deep?'tree':'file',input=await f.input('copy',[path]);await f.service.create(f.user,input);f.start();const result=await f.wait(input.id);expect(result.state).toBe('failed');expect(result.items[0]?.errorCode).toBe('RESOURCE_LIMIT');expect(await readdir(join(f.destination,'.filehub/staging'))).toEqual([]);}
});
test('來源在原子回收期間被外部改寫：保留新內容於回收區，工作需處置',async()=>{
  if(process.platform!=='linux')return;
  const f=await fixture(true,{}, {checkpoint:async(phase,id)=>{if(phase==='effect')await writeFile(join(f.root,'.filehub','trash',id,'a'),'changed-during-retirement');}});
  await mkdir(join(f.root,'tree'));await writeFile(join(f.root,'tree','a'),'original');const input=await f.input('move',['tree']);await f.service.create(f.user,input);f.start();expect((await f.wait(input.id)).state).toBe('needs_review');expect(await readFile(join(f.destination,'tree','a'),'utf8')).toBe('original');await expect(lstat(join(f.root,'tree'))).rejects.toMatchObject({code:'ENOENT'});
  const trash=await new TrashService(f.db,f.entries,f.mutations).list(f.user,f.source.id);expect(trash.items).toHaveLength(1);const item=trash.items[0];if(!item)throw new Error();expect(await readFile(join(f.root,'.filehub','trash',item.id,'a'),'utf8')).toBe('changed-during-retirement');expect(item.canRestore).toBe(true);
});
