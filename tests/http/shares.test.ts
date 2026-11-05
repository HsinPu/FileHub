import { randomBytes,randomUUID } from 'node:crypto';
import { mkdir,open } from 'node:fs/promises';
import { join } from 'node:path';
import { request } from 'node:http';
import { expect,onTestFinished,test } from 'vitest';
import { buildApp,listenApp,closeApp,parseConfig,migrateDatabase,openDatabase,IdentityService,EntryService,FileService,ShareService } from '@filehub/server';
import { temporaryDirectory } from './fixtures.js';
test('真實 TCP 公開串流在撤銷後中止，釋放讀取容量與檔案 handle',async()=>{
  const directory=await temporaryDirectory(),config=parseConfig({FILEHUB_STATE_DIR:join(directory,'state'),FILEHUB_PORT:'0',FILEHUB_LOG_LEVEL:'silent'});migrateDatabase(config);const db=openDatabase(config);onTestFinished(()=>db.close());const identity=new IdentityService(db),admin=await identity.bootstrap('admin','Synthetic-public-tcp-password!'),root=join(directory,'files');await mkdir(root);const data=await open(join(root,'large.bin'),'w');try{await data.truncate(128*1024*1024);}finally{await data.close();}
  const entries=new EntryService(db),entry=await entries.register('managed','TCP',root),files=new FileService(entries),shares=new ShareService(db,entries,files),resource=await files.metadata(admin.id,entry.id,'large.bin'),secret=randomBytes(32).toString('base64url'),id=randomUUID();await shares.create(admin.id,{id,entryId:entry.id,path:'large.bin',version:resource.resource.version,secret,expiresAt:new Date(Date.now()+86400000).toISOString()});const grant=await shares.access(id,secret,undefined,'127.0.0.1');
  const app=buildApp({config,dependencies:{identity,entries,files,shares}});onTestFinished(()=>closeApp(app,2000));const address=await listenApp(app,config);let received=0;
  await new Promise<void>((resolve,reject)=>{const call=request(`${address}/public/shares/${id}/download`,{headers:{cookie:`filehub_public_${id.replaceAll('-','')}=${grant.token}`}},response=>{if(response.statusCode!==200){response.resume();reject(new Error('公開串流未開啟'));return;}response.on('data',(chunk:Buffer)=>{received+=chunk.length;if(received===chunk.length)shares.revoke(admin.id,id);});response.once('aborted',resolve);response.once('end',()=>reject(new Error('撤銷後仍傳完整內容')));response.once('error',(error:NodeJS.ErrnoException)=>{if(error.code!=='ECONNRESET')reject(error);});});call.once('error',reject);call.setTimeout(8000,()=>call.destroy(new Error('公開 TCP fixture timeout')));call.end();});
  expect(received).toBeGreaterThan(0);expect(received).toBeLessThan(128*1024*1024);await expect.poll(()=>files.activeRequests,{timeout:5000}).toBe(0);
});
