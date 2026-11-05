import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { mkdir,writeFile,readFile,readdir,statfs,lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createTemporaryDirectory } from '../../helpers/temporary-directory.ts';
import { migrateDatabase,openDatabase,parseDatabaseConfig } from '../../../apps/server/dist/index.js';
import { EntryService } from '../../../apps/server/dist/modules/entries/service.js';
import { FileService } from '../../../apps/server/dist/modules/files/service.js';
import { MutationService } from '../../../apps/server/dist/modules/files/mutations.js';
import { OperationCatalog } from '../../../apps/server/dist/modules/operations/catalog.js';
import { OperationService } from '../../../apps/server/dist/modules/operations/service.js';
import { OperationExecutor } from '../../../apps/server/dist/modules/operations/executor.js';
import { TransferHandler } from '../../../apps/server/dist/modules/operations/transfers.js';
const mount='/filehub-full-fixture',fs=await statfs(mount);assert.equal(fs.type,0x01021994);assert.ok(fs.bsize*fs.blocks<=1048576);
const f=await createTemporaryDirectory('filehub-p52-full-'),target=await createTemporaryDirectory('filehub-p52-full-',mount);let database,handler,executor;
try{
  const config=parseDatabaseConfig({FILEHUB_STATE_DIR:join(f.directory,'state')});migrateDatabase(config);database=openDatabase(config);const entries=new EntryService(database),files=new FileService(entries),catalog=new OperationCatalog(database),user=randomUUID(),root=join(f.directory,'source');
  database.sqlite.prepare("INSERT INTO users VALUES (?,'fixture','synthetic-hash','admin',1,1)").run(user);await mkdir(root);const content=Buffer.alloc(2*1024*1024,7);await writeFile(join(root,'file'),content);
  const source=await entries.register('managed','來源',root),destination=await entries.register('external','目的地',target.directory);await entries.setWritable(destination.id,true);
  const input={id:randomUUID(),kind:'copy',sources:[{entryId:source.id,path:'file',version:(await files.metadata(user,source.id,'file')).resource.version}],destination:{entryId:destination.id,path:'',version:(await files.metadata(user,destination.id,'')).resource.version},conflict:'stop'};
  await new OperationService(catalog,entries,files,new Set(['copy'])).create(user,input);handler=new TransferHandler(entries,new MutationService(database,entries));executor=new OperationExecutor(catalog,new Map([['copy',handler.handle]]),50);
  const deadline=Date.now()+20000;while(['queued','running','cancelling'].includes(catalog.record(input.id).state)&&Date.now()<deadline)await delay(10);
  const result=catalog.get(user,input.id);assert.equal(result.state,'failed');assert.equal(result.items[0].errorCode,'STORAGE_FULL');assert.ok((await readFile(join(root,'file'))).equals(content));assert.deepEqual(await readdir(join(target.directory,'.filehub/staging')),[]);await assert.rejects(lstat(join(target.directory,'file')),{code:'ENOENT'});
  const output={measurement:'transfer-enospc',filesystemType:fs.type,capacityBytes:fs.bsize*fs.blocks,state:result.state,error:result.items[0].errorCode,sourceUnchanged:true,stagingEntries:0};await executor.close();executor=undefined;await handler.close();handler=undefined;database.close();database=undefined;globalThis.console.info(JSON.stringify(output));
}finally{await executor?.close();await handler?.close();database?.close();await target.dispose();await f.dispose();}
