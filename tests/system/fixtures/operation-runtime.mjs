import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir,mkdtemp,writeFile,readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
// Pipe this fixture into the production image's Node entrypoint. No test runtime
// or source tree is installed in the image; every byte of state is in own /tmp.
import { migrateDatabase,openDatabase,parseDatabaseConfig } from './apps/server/dist/index.js';
import { EntryService } from './apps/server/dist/modules/entries/service.js';
import { FileService } from './apps/server/dist/modules/files/service.js';
import { OperationCatalog } from './apps/server/dist/modules/operations/catalog.js';
import { OperationService } from './apps/server/dist/modules/operations/service.js';
assert.equal(process.getuid(),1000);const root=await mkdtemp('/tmp/filehub-runtime-'),config=parseDatabaseConfig({FILEHUB_STATE_DIR:join(root,'state')});migrateDatabase(config);const database=openDatabase(config);let worker,exit;
try{
  const user=randomUUID(),entries=new EntryService(database),files=new FileService(entries),catalog=new OperationCatalog(database);database.sqlite.prepare("INSERT INTO users VALUES (?,'fixture','synthetic-hash','admin',1,1)").run(user);
  const sourcePath=join(root,'source'),targetPath=join(root,'destination');await mkdir(sourcePath);await mkdir(targetPath);const content=Buffer.from([1,0,128,255]);await writeFile(join(sourcePath,'file.bin'),content);
  const source=await entries.register('external','來源',sourcePath),destination=await entries.register('managed','目的地',targetPath);await entries.setWritable(destination.id,true);
  const input={id:randomUUID(),kind:'copy',sources:[{entryId:source.id,path:'file.bin',version:(await files.metadata(user,source.id,'file.bin')).resource.version}],destination:{entryId:destination.id,path:'',version:(await files.metadata(user,destination.id,'')).resource.version},conflict:'stop'};await new OperationService(catalog,entries,files,new Set(['copy'])).create(user,input);
  worker=spawn(process.execPath,['apps/server/dist/worker.js'],{env:{...process.env,FILEHUB_STATE_DIR:config.stateDirectory,FILEHUB_LOG_LEVEL:'silent',FILEHUB_WORKER_POLL_INTERVAL_MS:'50'},stdio:'ignore'});exit=new Promise(resolve=>worker.once('close',(code,signal)=>resolve({code,signal})));const deadline=Date.now()+15000;
  while(['queued','running','cancelling'].includes(catalog.record(input.id).state)&&Date.now()<deadline)await delay(10);assert.equal(catalog.record(input.id).state,'succeeded',JSON.stringify(catalog.get(user,input.id)));assert.ok((await readFile(join(targetPath,'file.bin'))).equals(content));assert.equal((await new OperationService(catalog,entries,files,new Set(['copy'])).create(user,input)).state,'succeeded');
  await mkdir(join(sourcePath,'tree','empty'),{recursive:true});await writeFile(join(sourcePath,'tree','資料.txt'),'Hello 檔案\n');await writeFile(join(sourcePath,'tree','data.bin'),content);await writeFile(join(sourcePath,'tree','zero'),'');
  const archive={id:randomUUID(),kind:'archive',sources:[{entryId:source.id,path:'tree',version:(await files.metadata(user,source.id,'tree')).resource.version}],conflict:'stop'};await new OperationService(catalog,entries,files,new Set(['archive'])).create(user,archive);const archiveDeadline=Date.now()+15000;while(['queued','running','cancelling'].includes(catalog.record(archive.id).state)&&Date.now()<archiveDeadline)await delay(10);assert.equal(catalog.record(archive.id).state,'succeeded');const zip=await readFile(join(config.stateDirectory,`archive-${archive.id}.zip`));
  worker.kill('SIGTERM');const timeout=new globalThis.AbortController();let result;try{result=await Promise.race([exit,delay(8000,undefined,{signal:timeout.signal}).then(()=>{throw new Error('Worker shutdown timeout');})]);}finally{timeout.abort();}assert.deepEqual(result,{code:0,signal:null});worker=undefined;console.info(JSON.stringify({measurement:'packaged-operation-worker',uid:process.getuid(),kind:'copy+archive',state:'succeeded',bytesVerified:content.length,workerExit:result.code,archive:catalog.get(user,archive.id).artifact,zipBase64:zip.toString('base64')}));
}finally{if(worker){worker.kill('SIGKILL');await exit;}database.close();}
