import { mkdir,writeFile,readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect,test } from 'vitest';
import { IdentityService,EntryService } from '@filehub/server';
import { systemFixture,type ManagedNode } from './fixtures.js';
const maintenance=fileURLToPath(new URL('../../apps/server/dist/maintenance.js',import.meta.url)),migrate=fileURLToPath(new URL('../../apps/server/dist/migrate.js',import.meta.url));
const started=(child:ManagedNode)=>child.waitForMessage(message=>message.type==='started');
async function stop(child:ManagedNode){expect((await child.request('stop')).databaseClosed).toBe(true);expect((await child.waitForExit()).code).toBe(0);}

async function seededSnapshot(){
  const f=await systemFixture();f.migrate();const db=f.open(),password='Synthetic-maintenance-123!',user=await new IdentityService(db).bootstrap('admin',password),entries=new EntryService(db),root=join(f.directory,'files'),config=join(f.directory,'configuration');await mkdir(root);await mkdir(config);await writeFile(join(root,'canary.txt'),'formal restore canary');await writeFile(join(config,'deployment.env'),'SYNTHETIC=private');const entry=await entries.register('external','external',root);db.close();
  return{f,password,user,root,config,entry,snapshot:join(f.directory,'snapshot')};
}

test('正式 API／worker 共同阻擋完整備份與 migration；兩服務皆停後才可備份',async()=>{
  if(process.platform!=='linux')return;const{f,config,snapshot}=await seededSnapshot();
  const api=await f.startService('api');await started(api);const worker=await f.startService('worker');await started(worker);
  const fail=await f.startNode([maintenance,'backup',snapshot,config,'--quiesced']);expect((await fail.waitForExit()).code).toBe(1);expect(fail.output().stderr).not.toContain(f.directory);const liveMigration=await f.startNode([migrate]);expect((await liveMigration.waitForExit()).code).toBe(1);
  await stop(api);const stillBusy=await f.startNode([maintenance,'backup',snapshot,config,'--quiesced']);expect((await stillBusy.waitForExit()).code).toBe(1);await stop(worker);
  const backup=await f.startNode([maintenance,'backup',snapshot,config,'--quiesced']);expect(await backup.waitForExit()).toEqual({code:0,signal:null});expect(JSON.parse(backup.output().stdout)).toMatchObject({schemaRevision:13,entries:1});
});

test('完整備份 CLI 驗證與新目標還原後，正式兩服務啟動並實際登入／下載',async()=>{
  if(process.platform!=='linux')return;const{f,config,snapshot,password,user,root,entry}=await seededSnapshot();
  const backup=await f.startNode([maintenance,'backup',snapshot,config,'--quiesced']);expect(await backup.waitForExit()).toEqual({code:0,signal:null});expect(JSON.parse(backup.output().stdout)).toMatchObject({schemaRevision:13,entries:1});const verify=await f.startNode([maintenance,'verify',snapshot]);expect((await verify.waitForExit()).code).toBe(0);
  const target=join(f.directory,'restored'),restore=await f.startNode([maintenance,'restore',snapshot,target,'--quiesced']);expect((await restore.waitForExit()).code).toBe(0);expect(await readFile(join(target,'config','deployment.env'),'utf8')).toBe('SYNTHETIC=private');
  const nextApi=await f.startService('api',{FILEHUB_STATE_DIR:join(target,'state')}),info=await started(nextApi);if(typeof info.address!=='string')throw new Error('missing API address');const address=info.address,nextWorker=await f.startService('worker',{FILEHUB_STATE_DIR:join(target,'state')});await started(nextWorker);
  const login=await fetch(`${address}/api/session`,{method:'POST',headers:{origin:address,'content-type':'application/json'},body:JSON.stringify({username:'admin',password}),signal:AbortSignal.timeout(5000)});expect(login.status).toBe(200);expect(await login.json()).toMatchObject({user:{id:user.id}});const cookie=login.headers.get('set-cookie')?.split(';')[0];if(!cookie)throw new Error('missing cookie');const download=await fetch(`${address}/api/entries/${entry.id}/download?path=canary.txt`,{headers:{cookie},signal:AbortSignal.timeout(1000)});expect(download.status).toBe(200);expect(await download.text()).toBe('formal restore canary');expect(await readFile(join(root,'canary.txt'),'utf8')).toBe('formal restore canary');await stop(nextWorker);await stop(nextApi);
});
